import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { D1SubscriptionService } from "./subscription";

export interface Env {
  DB: D1Database;

  JWT_SECRET: string;

  WEBHOOK_SECRET?: string;

  ACCESS_TOKEN_TTL_SECONDS?: string;

  REFRESH_TOKEN_TTL_SECONDS?: string;

  TRIAL_DAYS?: string;

  ALLOWED_ORIGIN?: string;
}

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  country: string;
  role: string;
  totp_secret: string | null;
  totp_enabled: number;
  email_verified_at: string | null;
  subscription_status: string;
  trial_started_at: string;
  trial_expires_at: string;
  subscription_expires_at: string | null;
};

type AuthClaims = {
  sub: string;
  sid: string;
  type: "access";
  exp: number;
  iat: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonResponse(body: unknown, status = 200, env?: Env): Response {
  const origin = env?.ALLOWED_ORIGIN ?? "*";

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    },
  });
}

function now(): Date {
  return new Date();
}

function iso(date = now()): string {
  return date.toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function b64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlText(text: string): string {
  return b64url(encoder.encode(text));
}

function fromB64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  const binary = atob(normalized + padding);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

async function signJwt(claims: AuthClaims, secret: string): Promise<string> {
  const header = b64urlText(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    }),
  );

  const payload = b64urlText(JSON.stringify(claims));

  const signature = b64url(await hmac(secret, `${header}.${payload}`));

  return `${header}.${payload}.${signature}`;
}

async function verifyJwt(token: string, secret: string): Promise<AuthClaims | null> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;

  const expected = b64url(await hmac(secret, `${header}.${payload}`));

  if (expected !== signature) {
    return null;
  }

  try {
    const claims = JSON.parse(decoder.decode(fromB64url(payload))) as AuthClaims;

    if (
      claims.type !== "access" ||
      !claims.sub ||
      !claims.sid ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

async function randomToken(): Promise<string> {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Cloudflare Workers suporta PBKDF2, mas o runtime rejeita
 * (NotSupportedError) iteration counts acima de 100.000.
 *
 * Esta é a ÚNICA constante que define o número de iterações.
 * Nunca use um número literal em outro lugar do código — se
 * alguém subir esse valor por engano, o Math.min abaixo evita
 * que a aplicação quebre em produção (o pior cenário: senhas
 * ficam com um pouco menos de iterações do que o pretendido,
 * em vez de o cadastro/login inteiro falhar com 500).
 */
const PBKDF2_MAX_ITERATIONS = 100_000;
const PBKDF2_ITERATIONS = Math.min(100_000, PBKDF2_MAX_ITERATIONS);

async function hashPassword(password: string): Promise<string> {
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));

  const iterations = PBKDF2_ITERATIONS;

  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations,
        hash: "SHA-256",
      },
      key,
      256,
    );

    return ["pbkdf2-sha256", iterations, salt, b64url(new Uint8Array(bits))].join("$");
  } catch (error) {
    // Nunca deixa uma exceção de crypto.subtle vazar como um erro
    // "cru" do runtime (que pode não carregar os headers de CORS).
    // Ela vira uma Error normal do JS, tratada pelo try/catch do
    // fetch() handler, que sempre responde via jsonResponse(...).
    throw new Error(
      `Falha ao gerar hash de senha (PBKDF2, ${iterations} iterações): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, salt, expected] = stored.split("$");

  if (scheme !== "pbkdf2-sha256" || !iterationsText || !salt || !expected) {
    return false;
  }

  const iterations = Number(iterationsText);

  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations,
        hash: "SHA-256",
      },
      key,
      256,
    );

    return b64url(new Uint8Array(bits)) === expected;
  } catch {
    return false;
  }
}

function accessFor(env: Env, user: UserRow) {
  return new D1SubscriptionService(env.DB).getAccess(user);
}

async function getUser(env: Env, userId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        city,
        country,
        role,
        email_verified_at,
        totp_secret,
        totp_enabled,
        subscription_status,
        trial_started_at,
        trial_expires_at,
        subscription_expires_at
      FROM users
      WHERE id = ?
    `,
  )
    .bind(userId)
    .first<UserRow>();
}

function publicUser(env: Env, user: UserRow) {
  const access = accessFor(env, user);

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    city: user.city,
    country: user.country,

    email_verified: Boolean(user.email_verified_at),

    totp_enabled: Boolean(user.totp_enabled),

    role: user.role,

    subscription_status: access.status,

    subscription_expires_at: access.expires_at,

    trial_started_at: user.trial_started_at,

    trial_expires_at: user.trial_expires_at,

    access_allowed: access.allowed,
  };
}

async function requireAuth(request: Request, env: Env): Promise<UserRow | null> {
  const header = request.headers.get("authorization") ?? "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const claims = await verifyJwt(header.slice(7), env.JWT_SECRET);

  if (!claims) {
    return null;
  }

  const session = await env.DB.prepare(
    `
        SELECT
          id,
          user_id
        FROM sessions
        WHERE
          id = ?
          AND user_id = ?
          AND revoked_at IS NULL
          AND expires_at > ?
      `,
  )
    .bind(claims.sid, claims.sub, iso())
    .first<{
      id: string;
      user_id: string;
    }>();

  if (!session) {
    return null;
  }

  return getUser(env, claims.sub);
}

/* =========================================================
   TOTP / 2FA
   ========================================================= */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;

    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];

      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();

  let bits = 0;
  let value = 0;

  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index < 0) {
      throw new Error("Invalid base32");
    }

    value = (value << 5) | index;

    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);

      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

async function totpCode(secret: string, counter: number): Promise<string> {
  const secretBytes = base32Decode(secret);

  const secretBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(secretBuffer).set(secretBytes);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    {
      name: "HMAC",
      hash: "SHA-1",
    },
    false,
    ["sign"],
  );

  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);

  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;

  counterView.setUint32(0, high);
  counterView.setUint32(4, low);

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));

  const offset = signature[signature.length - 1] & 0x0f;

  const binaryCode =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  const code = binaryCode % 1_000_000;

  return code.toString().padStart(6, "0");
}

async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const normalized = code.replace(/\D/g, "");

  if (normalized.length !== 6) {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / 30);

  for (const delta of [-1, 0, 1]) {
    if ((await totpCode(secret, counter + delta)) === normalized) {
      return true;
    }
  }

  return false;
}

function totpUri(secret: string, email: string): string {
  return (
    `otpauth://totp/Theo:${encodeURIComponent(email)}` +
    `?secret=${secret}` +
    `&issuer=Theo` +
    `&algorithm=SHA1` +
    `&digits=6` +
    `&period=30`
  );
}

/* =========================================================
   SESSÃO
   ========================================================= */

async function issueSession(
  env: Env,
  user: UserRow,
  deviceId: string | null,
  deviceLabel: string | null,
) {
  const sessionId = uuid();

  const refreshToken = await randomToken();

  const refreshHash = await sha256Hex(refreshToken);

  const nowDate = now();

  const parsedAccessTtl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);

  const parsedRefreshTtl = Number(env.REFRESH_TOKEN_TTL_SECONDS ?? 2_592_000);

  const accessTtl =
    Number.isFinite(parsedAccessTtl) && parsedAccessTtl > 0 ? Math.floor(parsedAccessTtl) : 900;

  const refreshTtl =
    Number.isFinite(parsedRefreshTtl) && parsedRefreshTtl > 0
      ? Math.floor(parsedRefreshTtl)
      : 2_592_000;

  await env.DB.prepare(
    `
      INSERT INTO sessions
        (
          id,
          user_id,
          refresh_token_hash,
          device_id,
          device_label,
          expires_at,
          last_used_at,
          created_at
        )
      VALUES (?,?,?,?,?,?,?,?)
    `,
  )
    .bind(
      sessionId,
      user.id,
      refreshHash,
      deviceId,
      deviceLabel,
      iso(new Date(nowDate.getTime() + refreshTtl * 1000)),
      iso(nowDate),
      iso(nowDate),
    )
    .run();

  if (deviceId) {
    await env.DB.prepare(
      `
        INSERT INTO devices
          (
            id,
            user_id,
            label,
            last_seen_at,
            created_at
          )
        VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,id)
        DO UPDATE SET
          label =
            excluded.label,
          last_seen_at =
            excluded.last_seen_at
      `,
    )
      .bind(deviceId, user.id, deviceLabel, iso(), iso())
      .run();
  }

  const issued = Math.floor(Date.now() / 1000);

  const accessToken = await signJwt(
    {
      sub: user.id,
      sid: sessionId,
      type: "access",
      iat: issued,
      exp: issued + accessTtl,
    },
    env.JWT_SECRET,
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

/* =========================================================
   JSON
   ========================================================= */

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* =========================================================
   AUTH REGISTER
   ========================================================= */

async function authRegister(request: Request, env: Env) {
  const body = await readJson(request);

  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();

  const password = String(body?.password ?? "");

  const firstName = String(body?.first_name ?? "").trim();

  const lastName = String(body?.last_name ?? "").trim();

  const cpf = String(body?.cpf ?? "").trim();

  const city = String(body?.city ?? "").trim();

  const country = String(body?.country ?? "").trim();

  if (!email || password.length < 8 || !firstName || !lastName || !cpf || !city || !country) {
    return jsonResponse(
      {
        message: "Dados de cadastro inválidos.",
      },
      422,
      env,
    );
  }

  const existing = await env.DB.prepare(
    `
        SELECT id
        FROM users
        WHERE email = ?
           OR cpf = ?
      `,
  )
    .bind(email, cpf)
    .first();

  if (existing) {
    return jsonResponse(
      {
        message: "E-mail ou CPF já cadastrado.",
      },
      409,
      env,
    );
  }

  const id = uuid();

  const started = now();

  const parsedTrialDays = Number(env.TRIAL_DAYS ?? 7);

  const days =
    Number.isFinite(parsedTrialDays) && parsedTrialDays > 0 ? Math.floor(parsedTrialDays) : 7;

  const expires = new Date(started.getTime() + days * 86_400_000);

  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    `
      INSERT INTO users
        (
          id,
          first_name,
          last_name,
          email,
          cpf,
          country,
          city,
          password_hash,
          trial_started_at,
          trial_expires_at,
          subscription_status,
          created_at,
          updated_at
        )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
  )
    .bind(
      id,
      firstName,
      lastName,
      email,
      cpf,
      country,
      city,
      passwordHash,
      iso(started),
      iso(expires),
      "trial",
      iso(started),
      iso(started),
    )
    .run();

  const user = await getUser(env, id);

  return jsonResponse(
    {
      message: `Conta criada. Seu período gratuito de ${days} dias começou.`,

      user: user ? publicUser(env, user) : null,
    },
    201,
    env,
  );
}

/* =========================================================
   AUTH LOGIN
   ========================================================= */

async function authLogin(request: Request, env: Env) {
  const body = await readJson(request);

  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();

  const password = String(body?.password ?? "");

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<any>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return jsonResponse(
      {
        message: "E-mail ou senha inválidos.",
      },
      401,
      env,
    );
  }

  const publicRow = await getUser(env, user.id);

  if (!publicRow) {
    return jsonResponse(
      {
        message: "Conta não encontrada.",
      },
      404,
      env,
    );
  }

  if (Boolean(user.totp_enabled) && user.totp_secret) {
    const challengeToken = await randomToken();

    const challengeHash = await sha256Hex(challengeToken);

    await env.DB.prepare(
      `
        INSERT INTO twofa_challenges
          (
            id,
            user_id,
            token_hash,
            expires_at,
            created_at
          )
        VALUES(?,?,?,?,?)
      `,
    )
      .bind(uuid(), publicRow.id, challengeHash, iso(new Date(Date.now() + 5 * 60_000)), iso())
      .run();

    return jsonResponse(
      {
        requires_2fa: true,
        challenge_token: challengeToken,
      },
      200,
      env,
    );
  }

  const tokens = await issueSession(
    env,
    publicRow,
    body?.device_id ? String(body.device_id) : null,
    body?.device_label ? String(body.device_label) : null,
  );

  return jsonResponse(
    {
      ...tokens,
      must_change_password: false,
      user: publicUser(env, publicRow),
    },
    200,
    env,
  );
}

/* =========================================================
   AUTH REFRESH
   ========================================================= */

async function authRefresh(request: Request, env: Env) {
  const body = await readJson(request);

  const token = String(body?.refresh_token ?? "");

  if (!token) {
    return jsonResponse(
      {
        message: "Refresh token ausente.",
      },
      401,
      env,
    );
  }

  const hash = await sha256Hex(token);

  const session = await env.DB.prepare(
    `
        SELECT
          s.*,
          u.id AS uid
        FROM sessions s
        JOIN users u
          ON u.id = s.user_id
        WHERE
          s.refresh_token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
      `,
  )
    .bind(hash, iso())
    .first<any>();

  if (!session) {
    return jsonResponse(
      {
        message: "Sessão expirada.",
      },
      401,
      env,
    );
  }

  const user = await getUser(env, session.uid);

  if (!user) {
    return jsonResponse(
      {
        message: "Conta não encontrada.",
      },
      404,
      env,
    );
  }

  const newRefresh = await randomToken();

  const newHash = await sha256Hex(newRefresh);

  await env.DB.prepare(
    `
      UPDATE sessions
      SET
        refresh_token_hash = ?,
        last_used_at = ?
      WHERE id = ?
    `,
  )
    .bind(newHash, iso(), session.id)
    .run();

  const issued = Math.floor(Date.now() / 1000);

  const accessToken = await signJwt(
    {
      sub: user.id,
      sid: session.id,
      type: "access",
      iat: issued,
      exp: issued + Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
    },
    env.JWT_SECRET,
  );

  return jsonResponse(
    {
      access_token: accessToken,

      refresh_token: newRefresh,

      must_change_password: false,

      user: publicUser(env, user),
    },
    200,
    env,
  );
}

/* =========================================================
   AUTH ME
   ========================================================= */

async function authMe(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  return jsonResponse(publicUser(env, user), 200, env);
}

/* =========================================================
   2FA SETUP
   ========================================================= */

async function auth2faSetup(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));

  await env.DB.prepare(
    `
      UPDATE users
      SET
        totp_secret = ?,
        totp_enabled = 0,
        updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(secret, iso(), user.id)
    .run();

  return jsonResponse(
    {
      secret,
      otpauth_uri: totpUri(secret, user.email),
    },
    200,
    env,
  );
}

/* =========================================================
   2FA ENABLE
   ========================================================= */

async function auth2faEnable(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const body = await readJson(request);

  const code = String(body?.code ?? "");

  if (!user.totp_secret || !(await verifyTotp(user.totp_secret, code))) {
    return jsonResponse(
      {
        message: "Código inválido.",
      },
      422,
      env,
    );
  }

  await env.DB.prepare(
    `
      UPDATE users
      SET
        totp_enabled = 1,
        updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(iso(), user.id)
    .run();

  return jsonResponse(
    {
      message: "2FA ativado.",
    },
    200,
    env,
  );
}

/* =========================================================
   2FA DISABLE
   ========================================================= */

async function auth2faDisable(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const body = await readJson(request);

  const code = String(body?.code ?? "");

  if (!user.totp_secret || !(await verifyTotp(user.totp_secret, code))) {
    return jsonResponse(
      {
        message: "Código inválido.",
      },
      422,
      env,
    );
  }

  await env.DB.prepare(
    `
      UPDATE users
      SET
        totp_secret = NULL,
        totp_enabled = 0,
        updated_at = ?
      WHERE id = ?
    `,
  )
    .bind(iso(), user.id)
    .run();

  return jsonResponse(
    {
      message: "2FA desativado.",
    },
    200,
    env,
  );
}

/* =========================================================
   2FA VERIFY
   ========================================================= */

async function auth2faVerify(request: Request, env: Env) {
  const body = await readJson(request);

  const challengeToken = String(body?.challenge_token ?? "");

  const code = String(body?.code ?? "");

  if (!challengeToken || !code) {
    return jsonResponse(
      {
        message: "Desafio ou código ausente.",
      },
      422,
      env,
    );
  }

  const hash = await sha256Hex(challengeToken);

  const challenge = await env.DB.prepare(
    `
        SELECT
          id,
          user_id
        FROM twofa_challenges
        WHERE
          token_hash = ?
          AND consumed_at IS NULL
          AND expires_at > ?
      `,
  )
    .bind(hash, iso())
    .first<{
      id: string;
      user_id: string;
    }>();

  if (!challenge) {
    return jsonResponse(
      {
        message: "Desafio inválido ou expirado.",
      },
      401,
      env,
    );
  }

  const user = await getUser(env, challenge.user_id);

  if (!user?.totp_enabled || !user.totp_secret || !(await verifyTotp(user.totp_secret, code))) {
    return jsonResponse(
      {
        message: "Código inválido.",
      },
      401,
      env,
    );
  }

  await env.DB.prepare(
    `
      UPDATE twofa_challenges
      SET consumed_at = ?
      WHERE id = ?
    `,
  )
    .bind(iso(), challenge.id)
    .run();

  const tokens = await issueSession(
    env,
    user,
    body?.device_id ? String(body.device_id) : null,
    body?.device_label ? String(body.device_label) : null,
  );

  return jsonResponse(
    {
      ...tokens,
      must_change_password: false,
      user: publicUser(env, user),
    },
    200,
    env,
  );
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function authLogout(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const header = request.headers.get("authorization");

  if (header) {
    const claims = await verifyJwt(header.slice(7), env.JWT_SECRET);

    if (claims) {
      await env.DB.prepare(
        `
          UPDATE sessions
          SET revoked_at = ?
          WHERE id = ?
        `,
      )
        .bind(iso(), claims.sid)
        .run();
    }
  }

  return jsonResponse(
    {
      message: "Sessão encerrada.",
    },
    200,
    env,
  );
}

/* =========================================================
   SUBSCRIPTION
   ========================================================= */

async function subscriptionStatus(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  return jsonResponse(
    {
      ...publicUser(env, user),

      access: accessFor(env, user),
    },
    200,
    env,
  );
}

/* =========================================================
   PATH
   ========================================================= */

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "").replace(/^\/api/, "") || "/";
}

/* =========================================================
   SYNC PUSH
   ========================================================= */

async function syncPush(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const access = accessFor(env, user);

  if (!access.allowed) {
    return jsonResponse(
      {
        message: "Assinatura ou período gratuito expirado.",

        code: "SUBSCRIPTION_REQUIRED",

        access,
      },
      403,
      env,
    );
  }

  const body = await readJson(request);

  const events = Array.isArray(body?.events) ? body.events : [];

  if (events.length === 0) {
    return jsonResponse(
      {
        accepted: 0,
        ignored: 0,
      },
      200,
      env,
    );
  }

  if (events.length > 100) {
    return jsonResponse(
      {
        message: "Máximo de 100 eventos por lote.",
      },
      413,
      env,
    );
  }

  const deviceId = String(body?.device_id ?? "").trim();

  if (!deviceId) {
    return jsonResponse(
      {
        message: "device_id é obrigatório.",
      },
      422,
      env,
    );
  }

  const allowedOps = new Set(["CREATE", "UPDATE", "DELETE"]);

  const allowedEntities = new Set([
    "folders",
    "decks",
    "note_types",
    "notes",
    "cards",
    "review_log",
    "exams",
    "exam_subjects",
    "exam_topics",
    "study_logs",
    "topic_reviews",
    "manual_schedule",
    "goals",
    "questions",
    "question_attempts",
  ]);

  const accepted: string[] = [];
  const ignored: string[] = [];

  const created = iso();

  const stmt = env.DB.prepare(
    `
        INSERT OR IGNORE INTO sync_events
          (
            event_id,
            user_id,
            device_id,
            entity_type,
            entity_id,
            operation,
            version,
            payload_json,
            created_at
          )
        VALUES (?,?,?,?,?,?,?,?,?)
      `,
  );

  const prepared: {
    eventId: string;
    statement: D1PreparedStatement;
  }[] = [];

  for (const event of events) {
    const eventId = String(event?.event_id ?? "");

    const entityType = String(event?.entity_type ?? "");

    const entityId = String(event?.entity_id ?? "");

    const operation = String(event?.operation ?? "");

    const version = Number(event?.version ?? 0);

    if (
      !eventId ||
      eventId.length > 100 ||
      !allowedEntities.has(entityType) ||
      entityId.length > 200 ||
      !allowedOps.has(operation) ||
      !Number.isSafeInteger(version) ||
      version < 0
    ) {
      return jsonResponse(
        {
          message: "Evento inválido.",
        },
        422,
        env,
      );
    }

    const payload = operation === "DELETE" ? null : JSON.stringify(event.payload ?? null);

    prepared.push({
      eventId,

      statement: stmt.bind(
        eventId,
        user.id,
        deviceId,
        entityType,
        entityId,
        operation,
        version,
        payload,
        created,
      ),
    });
  }

  const deviceStatement = env.DB.prepare(
    `
        INSERT INTO devices
          (
            id,
            user_id,
            label,
            last_seen_at,
            created_at
          )
        VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,id)
        DO UPDATE SET
          last_seen_at =
            excluded.last_seen_at
      `,
  ).bind(deviceId, user.id, body?.device_label ?? null, iso(), iso());

  const results = await env.DB.batch([...prepared.map((item) => item.statement), deviceStatement]);

  results.slice(0, prepared.length).forEach((result, index) => {
    if (result.meta.changes === 1) {
      accepted.push(prepared[index].eventId);
    } else {
      ignored.push(prepared[index].eventId);
    }
  });

  return jsonResponse(
    {
      accepted: accepted.length,

      ignored: ignored.length,

      event_ids: accepted,
    },
    200,
    env,
  );
}

/* =========================================================
   SYNC PULL
   ========================================================= */

async function syncPull(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const access = accessFor(env, user);

  if (!access.allowed) {
    return jsonResponse(
      {
        message: "Assinatura ou período gratuito expirado.",

        code: "SUBSCRIPTION_REQUIRED",

        access,
      },
      403,
      env,
    );
  }

  const url = new URL(request.url);

  const rawSince = Number(url.searchParams.get("since") ?? 0);

  const rawLimit = Number(url.searchParams.get("limit") ?? 200);

  const since = Number.isFinite(rawSince) ? Math.max(0, Math.floor(rawSince)) : 0;

  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 200;

  const rows = await env.DB.prepare(
    `
        SELECT
          seq,
          event_id,
          device_id,
          entity_type,
          entity_id,
          operation,
          version,
          payload_json,
          created_at
        FROM sync_events
        WHERE
          user_id = ?
          AND seq > ?
        ORDER BY seq ASC
        LIMIT ?
      `,
  )
    .bind(user.id, since, limit)
    .all();

  return jsonResponse(
    {
      events: rows.results.map((row: any) => ({
        seq: row.seq,
        event_id: row.event_id,
        device_id: row.device_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        operation: row.operation,
        version: row.version,

        payload: row.payload_json ? JSON.parse(row.payload_json) : null,

        created_at: row.created_at,
      })),

      next_cursor: rows.results.length
        ? Number((rows.results[rows.results.length - 1] as any).seq)
        : since,

      has_more: rows.results.length === limit,

      server_time: iso(),
    },
    200,
    env,
  );
}

/* =========================================================
   SYNC BOOTSTRAP
   ========================================================= */

async function syncBootstrap(request: Request, env: Env) {
  const user = await requireAuth(request, env);

  if (!user) {
    return jsonResponse(
      {
        message: "Não autenticado.",
      },
      401,
      env,
    );
  }

  const access = accessFor(env, user);

  if (!access.allowed) {
    return jsonResponse(
      {
        message: "Assinatura ou período gratuito expirado.",

        code: "SUBSCRIPTION_REQUIRED",

        access,
      },
      403,
      env,
    );
  }

  const url = new URL(request.url);

  const rawSince = Number(url.searchParams.get("since") ?? 0);

  const rawLimit = Number(url.searchParams.get("limit") ?? 1000);

  const since = Number.isFinite(rawSince) ? Math.max(0, Math.floor(rawSince)) : 0;

  const limit = Number.isFinite(rawLimit)
    ? Math.min(1000, Math.max(1, Math.floor(rawLimit)))
    : 1000;

  const rows = await env.DB.prepare(
    `
        SELECT
          seq,
          event_id,
          device_id,
          entity_type,
          entity_id,
          operation,
          version,
          payload_json,
          created_at
        FROM sync_events
        WHERE
          user_id = ?
          AND seq > ?
        ORDER BY seq ASC
        LIMIT ?
      `,
  )
    .bind(user.id, since, limit)
    .all();

  const lastSeq = await env.DB.prepare(
    `
        SELECT
          MAX(seq) AS max_seq
        FROM sync_events
        WHERE user_id = ?
      `,
  )
    .bind(user.id)
    .first<{
      max_seq: number | null;
    }>();

  return jsonResponse(
    {
      events: rows.results.map((row: any) => ({
        seq: row.seq,
        event_id: row.event_id,
        device_id: row.device_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        operation: row.operation,
        version: row.version,

        payload: row.payload_json ? JSON.parse(row.payload_json) : null,

        created_at: row.created_at,
      })),

      next_cursor: rows.results.length
        ? Number((rows.results[rows.results.length - 1] as any).seq)
        : since,

      server_cursor: Number(lastSeq?.max_seq ?? 0),

      has_more: rows.results.length === limit,

      server_time: iso(),
    },
    200,
    env,
  );
}

/* =========================================================
   WEBHOOK
   ========================================================= */

async function paymentWebhook(request: Request, env: Env) {
  const secret = request.headers.get("x-theo-webhook-secret");

  if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
    return jsonResponse(
      {
        message: "Webhook não autorizado.",
      },
      401,
      env,
    );
  }

  const body = await readJson(request);

  const userId = String(body?.user_id ?? "");

  const status = String(body?.subscription_status ?? "");

  const expiresAt = body?.subscription_expires_at ? String(body.subscription_expires_at) : null;

  if (!userId || !["active", "expired", "cancelled", "past_due"].includes(status)) {
    return jsonResponse(
      {
        message: "Evento de assinatura inválido.",
      },
      422,
      env,
    );
  }

  await new D1SubscriptionService(env.DB).applyWebhook({
    userId,

    status: status as "active" | "expired" | "cancelled" | "past_due",

    expiresAt,
  });

  return jsonResponse(
    {
      ok: true,
    },
    200,
    env,
  );
}

/* =========================================================
   WORKER
   ========================================================= */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
     * CORS / Preflight
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,

        headers: {
          "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",

          "access-control-allow-headers": "Authorization, Content-Type",

          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",

          "access-control-max-age": "86400",
        },
      });
    }

    // Segunda rede de segurança: se qualquer coisa (inclusive um erro
    // de runtime que o try/catch abaixo não consiga capturar) resultar
    // numa resposta sem os headers de CORS, isso os adiciona de volta
    // antes de devolver ao navegador. Evita que um 500 "cru" apareça
    // no browser como falso erro de CORS.
    const ensureCors = (response: Response): Response => {
      if (response.headers.has("access-control-allow-origin")) {
        return response;
      }

      const headers = new Headers(response.headers);

      headers.set("access-control-allow-origin", env.ALLOWED_ORIGIN ?? "*");
      headers.set("access-control-allow-headers", "Authorization, Content-Type");
      headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };

    const handle = async (): Promise<Response> => {
      const path = normalizePath(new URL(request.url).pathname);

      if (request.method === "POST" && path === "/auth/register") {
        return authRegister(request, env);
      }

      if (request.method === "POST" && path === "/auth/login") {
        return authLogin(request, env);
      }

      if (request.method === "POST" && path === "/auth/refresh") {
        return authRefresh(request, env);
      }

      if (request.method === "POST" && path === "/auth/logout") {
        return authLogout(request, env);
      }

      if (request.method === "POST" && path === "/auth/2fa/setup") {
        return auth2faSetup(request, env);
      }

      if (request.method === "POST" && path === "/auth/2fa/enable") {
        return auth2faEnable(request, env);
      }

      if (request.method === "POST" && path === "/auth/2fa/disable") {
        return auth2faDisable(request, env);
      }

      if (request.method === "POST" && path === "/auth/2fa/verify") {
        return auth2faVerify(request, env);
      }

      if (request.method === "GET" && (path === "/auth/me" || path === "/users/me")) {
        return authMe(request, env);
      }

      if (request.method === "GET" && path === "/subscription/status") {
        return subscriptionStatus(request, env);
      }

      if (request.method === "POST" && path === "/sync/push") {
        return syncPush(request, env);
      }

      if (request.method === "GET" && path === "/sync/pull") {
        return syncPull(request, env);
      }

      if (request.method === "GET" && path === "/sync/bootstrap") {
        return syncBootstrap(request, env);
      }

      if (request.method === "POST" && path === "/webhooks/subscription") {
        return paymentWebhook(request, env);
      }

      return jsonResponse(
        {
          message: "Rota não encontrada.",
        },
        404,
        env,
      );
    };

    try {
      return ensureCors(await handle());
    } catch (error) {
      console.error("[Theo Worker]", error);

      const message = error instanceof Error ? error.message : String(error);

      return ensureCors(
        jsonResponse(
          {
            message: "Erro interno no servidor.",

            error: message,
          },
          500,
          env,
        ),
      );
    }
  },
};
