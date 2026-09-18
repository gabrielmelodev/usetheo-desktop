import { useEffect, useState } from "react";
import { KeyRound, Monitor, RefreshCw, ShieldCheck, Smartphone, UserRound, X, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorBanner, Input, Label, Panel } from "../components/ui";
import {
  changePassword,
  disable2FA,
  enable2FA,
  extractErrorMessage,
  getSrsSettings,
  listSessions,
  revokeSession,
  setup2FA,
  updateMe,
  updateSrsSettings,
  type SessionInfo,
  type SrsSettings,
} from "../lib/api";
import { useAuth } from "../lib/auth-context";

export default function Account() {
  const { user, sync } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.totp_enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [srsSettings, setSrsSettings] = useState<SrsSettings | null>(null);

  useEffect(() => {
    void getSrsSettings().then(setSrsSettings);
  }, []);

  async function refreshSessions() {
    try {
      setSessions(await listSessions());
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }
  useEffect(() => {
    // Sessões ativas só existem para uma conta na nuvem — sem login, não há o que listar.
    if (user) void refreshSessions();
  }, [user]);

  async function updateAlgorithm(patch: Partial<SrsSettings>) {
    const next = await updateSrsSettings(patch);
    setSrsSettings(next);
  }

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      const { pulled, pushed } = await sync();
      if (pulled > 0 || pushed > 0) {
        const parts: string[] = [];
        if (pushed > 0) parts.push(`${pushed} enviado${pushed === 1 ? "" : "s"}`);
        if (pulled > 0) parts.push(`${pulled} recebido${pulled === 1 ? "" : "s"}`);
        setMessage(`Sincronizado: ${parts.join(", ")}.`);
      } else {
        setMessage("Tudo já estava sincronizado.");
      }
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  }
  async function saveProfile() {
    try {
      setSaving(true);
      setError(null);
      const next = await updateMe({ first_name: firstName, last_name: lastName });
      setFirstName(next.first_name);
      setLastName(next.last_name);
      setCity(next.city);
      setCountry(next.country);
      setMessage("Perfil atualizado.");
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function savePassword() {
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Senha alterada com sucesso.");
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function start2fa() {
    try {
      setError(null);
      setSetup(await setup2FA());
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }
  async function confirm2fa() {
    try {
      setSaving(true);
      setError(null);
      await enable2FA(code);
      setTwoFactorEnabled(true);
      setSetup(null);
      setCode("");
      setMessage("2FA habilitado.");
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove2fa() {
    try {
      setSaving(true);
      setError(null);
      await disable2FA(code);
      setTwoFactorEnabled(false);
      setCode("");
      setMessage("2FA desabilitado.");
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function revoke(id: string) {
    try {
      await revokeSession(id);
      setSessions((v) => v.filter((s) => s.id !== id));
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="font-display text-2xl text-text">Conta e preferências</h1>
        <p className="mt-1 text-sm text-text-muted">
          {user
            ? "Perfil, senha, autenticação em dois fatores e sessões ativas."
            : "Você está no modo local: seus dados ficam neste dispositivo."}
        </p>
      </div>
      {error && <ErrorBanner message={error} />}{" "}
      {message && (
        <div className="rounded-xl border border-good/20 bg-good/10 px-4 py-3 text-sm text-good">
          {message}
        </div>
      )}

      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <RefreshCw className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">{user ? "Sincronização" : "Modo local"}</h2>
            <p className="text-xs text-text-muted">
              {user
                ? "Sua conta puxa os dados salvos na nuvem para este dispositivo."
                : "O app funciona sem internet. Entre numa conta só quando quiser sincronizar."}
            </p>
          </div>
        </div>
        {user ? (
          <Button disabled={syncing} onClick={runSync}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
        ) : (
          <Button onClick={() => navigate("/login")}>Entrar / Sincronizar</Button>
        )}
      </Panel>

      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <Zap className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">Repetição espaçada</h2>
            <p className="text-xs text-text-muted">
              FSRS se adapta ao seu histórico de acertos e erros; SM-2 é o clássico do Anki, com
              intervalos mais previsíveis.
            </p>
          </div>
        </div>
        {srsSettings && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={srsSettings.algorithm === "fsrs" ? "primary" : "secondary"}
                onClick={() => void updateAlgorithm({ algorithm: "fsrs" })}
              >
                FSRS (recomendado)
              </Button>
              <Button
                variant={srsSettings.algorithm === "sm2" ? "primary" : "secondary"}
                onClick={() => void updateAlgorithm({ algorithm: "sm2" })}
              >
                SM-2 (clássico)
              </Button>
            </div>
            {srsSettings.algorithm === "fsrs" && (
              <div>
                <Label>Retenção desejada: {Math.round(srsSettings.desired_retention * 100)}%</Label>
                <input
                  type="range"
                  min={0.7}
                  max={0.97}
                  step={0.01}
                  value={srsSettings.desired_retention}
                  onChange={(e) => void updateAlgorithm({ desired_retention: Number(e.target.value) })}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Mais alto = revisa com mais frequência e esquece menos. Mais baixo = intervalos
                  maiores, mas mais risco de esquecer.
                </p>
              </div>
            )}
          </div>
        )}
      </Panel>

      {!user && (
        <Panel>
          <p className="text-sm text-text-muted">
            Faça login para ver perfil, senha, autenticação em dois fatores e sessões — esses
            recursos dependem de uma conta na nuvem.
          </p>
        </Panel>
      )}

      {user && (
        <>
      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <UserRound className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">Perfil</h2>
            <p className="text-xs text-text-muted">Seu e-mail permanece vinculado à conta.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Sobrenome</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>País</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-text-muted">{user.email}</span>
          <Button disabled={saving} onClick={saveProfile}>
            Salvar perfil
          </Button>
        </div>
      </Panel>
      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <KeyRound className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">Senha</h2>
            <p className="text-xs text-text-muted">Use uma senha forte e exclusiva.</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Senha atual</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <Button
            disabled={saving || !currentPassword || newPassword.length < 8}
            onClick={savePassword}
          >
            Alterar senha
          </Button>
        </div>
      </Panel>
      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">Autenticação em dois fatores</h2>
            <p className="text-xs text-text-muted">Proteja o login com um código TOTP.</p>
          </div>
        </div>
        {twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-good">2FA está ativo nesta conta.</p>
            <Input
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button variant="danger" disabled={saving || code.length < 6} onClick={remove2fa}>
              Desabilitar 2FA
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Abra seu autenticador, adicione a conta Theo e confirme o código.
            </p>
            <code className="block rounded-lg bg-black/20 p-3 text-xs break-all">
              {setup.secret}
            </code>
            <Input
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button disabled={saving || code.length < 6} onClick={confirm2fa}>
              Confirmar e ativar
            </Button>
          </div>
        ) : (
          <Button onClick={start2fa}>
            <Smartphone className="h-4 w-4" />
            Configurar 2FA
          </Button>
        )}
      </Panel>
      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <Monitor className="h-5 w-5" />
          <div>
            <h2 className="font-semibold text-text">Sessões ativas</h2>
            <p className="text-xs text-text-muted">Revogue dispositivos que você não reconhece.</p>
          </div>
        </div>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{s.device_label || "Dispositivo"}</p>
                <p className="truncate text-xs text-text-muted">
                  {s.user_agent || "Agente desconhecido"}
                </p>
              </div>
              <Button variant="danger" onClick={() => void revoke(s.id)}>
                <X className="h-4 w-4" />
                Revogar
              </Button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-text-muted">Nenhuma sessão ativa encontrada.</p>
          )}
        </div>
      </Panel>
        </>
      )}
    </div>
  );
}
