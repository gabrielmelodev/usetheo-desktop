import { useState, type FormEvent } from "react";

import { Link } from "react-router-dom";

import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import { Button, ErrorBanner, Input, Label } from "../components/ui";
import { extractErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth-context";

// ============================================================
// CPF
// ============================================================

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");

  if (cpf.length !== 11) {
    return false;
  }

  // Rejeita CPFs com todos os dígitos iguais.
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  // Primeiro dígito verificador.
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i);
  }

  let remainder = (sum * 10) % 11;

  if (remainder === 10) {
    remainder = 0;
  }

  if (remainder !== Number(cpf[9])) {
    return false;
  }

  // Segundo dígito verificador.
  sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i);
  }

  remainder = (sum * 10) % 11;

  if (remainder === 10) {
    remainder = 0;
  }

  return remainder === Number(cpf[10]);
}

// ============================================================
// REGISTER
// ============================================================

export default function Register() {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ==========================================================
  // SUBMIT
  // ==========================================================

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);
    setCpfError(null);

    // Validação do CPF antes de enviar.
    if (!isValidCpf(cpf)) {
      setCpfError("Digite um CPF válido.");
      return;
    }

    setLoading(true);

    try {
      const message = await register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        cpf: cpf.replace(/\D/g, ""),
        country: country.trim(),
        city: city.trim(),
        password,
      });

      setSuccessMessage(message);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // CADASTRO REALIZADO
  // ==========================================================

  if (successMessage) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-5 py-10 font-sans text-text sm:px-6">
        {/* Fundo */}
        <div className="absolute inset-0 bg-ink" />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(138,154,91,0.14),transparent_38%)]" />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_90%,rgba(75,83,32,0.14),transparent_35%)]" />

        {/* Textura */}
        <div className="pointer-events-none absolute inset-0 bg-grain bg-[length:4px_4px] opacity-30" />

        {/* Grade */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Vinheta */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(20,23,27,0.75)_100%)]" />

        {/* Linha superior */}
        <div className="absolute left-0 right-0 top-0 h-px bg-accent/30" />

        {/* Conteúdo */}
        <div className="relative w-full max-w-md">
          <div className="overflow-hidden border border-ink-softer bg-ink-soft/95 shadow-card backdrop-blur-xl">
            {/* Barra */}
            <div className="flex items-center justify-between border-b border-ink-softer px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />

                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-text-muted">
                  Cadastro
                </span>
              </div>

              <span className="font-mono text-[9px] text-text-faint">THEO / 02</span>
            </div>

            <div className="p-7 text-center sm:p-9">
              {/* Ícone */}
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-good/30 bg-good/10">
                <CheckCircle2 size={30} strokeWidth={1.6} className="text-good" />
              </div>

              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.25em] text-accent-bright">
                Cadastro concluído
              </div>

              <h1 className="font-display text-2xl font-semibold tracking-tight text-paper">
                Quase lá.
              </h1>

              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-text-muted">
                {successMessage}
              </p>

              {/* Status */}
              <div className="mt-7 border border-ink-softer bg-ink px-4 py-4 text-left">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={17} strokeWidth={1.7} className="text-accent-bright" />

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper">
                      Próximo passo
                    </div>

                    <div className="mt-1 text-xs text-text-faint">
                      Acesse sua conta para começar seus estudos.
                    </div>
                  </div>
                </div>
              </div>

              <Link
                to="/login"
                className="group mt-7 flex h-12 w-full items-center justify-center gap-3 bg-accent text-xs font-bold uppercase tracking-[0.18em] text-paper transition-all hover:bg-accent-bright hover:text-ink"
              >
                Ir para o login
                <ArrowRight
                  size={15}
                  strokeWidth={1.8}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>

          <p className="mt-5 text-center font-mono text-[8px] uppercase tracking-[0.18em] text-text-faint">
            THEO · STUDY SYSTEM
          </p>
        </div>
      </main>
    );
  }

  // ==========================================================
  // CADASTRO
  // ==========================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink px-5 py-8 font-sans text-text sm:px-8">
      {/* ======================================================
          FUNDO
      ====================================================== */}

      <div className="absolute inset-0 bg-ink" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(138,154,91,0.14),transparent_38%)]" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_5%_95%,rgba(75,83,32,0.15),transparent_38%)]" />

      {/* Textura */}
      <div className="pointer-events-none absolute inset-0 bg-grain bg-[length:4px_4px] opacity-30" />

      {/* Grade */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Vinheta */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(20,23,27,0.78)_100%)]" />

      {/* Linha */}
      <div className="absolute left-0 right-0 top-0 h-px bg-accent/30" />

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between py-3">
        <Link to="/login" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-accent/40 bg-ink-soft">
            <Sparkles size={17} strokeWidth={1.7} className="text-accent-bright" />
          </div>

          <div>
            <div className="font-display text-sm font-bold tracking-[0.28em] text-paper">THEO</div>

            <div className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.2em] text-text-faint">
              Sistema de estudos
            </div>
          </div>
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />

          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-faint">
            Novo acesso
          </span>
        </div>
      </header>

      {/* ======================================================
          CONTEÚDO
      ====================================================== */}

      <section className="relative z-10 flex min-h-[calc(100vh-80px)] items-center justify-center py-6">
        <div className="grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_520px] lg:gap-20">
          {/* ==================================================
              LADO ESQUERDO
          ================================================== */}

          <div className="hidden lg:block">
            <div className="max-w-xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-accent-bright/60" />

                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent-bright">
                  Comece sua preparação
                </span>
              </div>

              <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-paper xl:text-6xl">
                Estude com
                <br />
                <span className="text-accent-bright">propósito.</span>
              </h1>

              <p className="mt-7 max-w-lg text-base leading-7 text-text-muted">
                Crie seu espaço no Theo e organize sua preparação, revisões e progresso em um único
                lugar.
              </p>

              {/* Benefícios */}
              <div className="mt-10 space-y-3">
                <Feature
                  number="01"
                  title="Organização"
                  description="Seus conteúdos estruturados para você."
                />

                <Feature
                  number="02"
                  title="Revisão"
                  description="Revisões guiadas para consolidar conhecimento."
                />

                <Feature
                  number="03"
                  title="Progresso"
                  description="Acompanhe sua evolução ao longo da preparação."
                />
              </div>
            </div>
          </div>

          {/* ==================================================
              CARD
          ================================================== */}

          <div className="w-full max-w-[520px] justify-self-center">
            <div className="overflow-hidden border border-ink-softer bg-ink-soft/95 shadow-card backdrop-blur-xl">
              {/* Barra superior */}
              <div className="flex items-center justify-between border-b border-ink-softer px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />

                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-text-muted">
                    Criar conta
                  </span>
                </div>

                <span className="font-mono text-[9px] text-text-faint">THEO / 02</span>
              </div>

              <div className="p-6 sm:p-8">
                {/* Cabeçalho */}
                <div className="mb-7">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center border border-accent/40 bg-accent-dim">
                    <User size={21} strokeWidth={1.6} className="text-accent-bright" />
                  </div>

                  <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
                    Criar sua conta
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Configure seu acesso ao Theo para começar sua preparação.
                  </p>
                </div>

                {/* Formulário */}
                <form onSubmit={onSubmit} className="space-y-5">
                  {error && <ErrorBanner message={error} />}

                  {/* Nome */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Nome</Label>

                      <div className="relative">
                        <User
                          size={16}
                          strokeWidth={1.7}
                          className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint"
                        />

                        <Input
                          className="pl-11"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                          autoFocus
                          placeholder="Gabriel"
                          autoComplete="given-name"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Sobrenome</Label>

                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        placeholder="Silva"
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <Label>Email</Label>

                    <div className="relative">
                      <Mail
                        size={16}
                        strokeWidth={1.7}
                        className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint"
                      />

                      <Input
                        className="pl-11"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="voce@email.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* CPF */}
                  <div>
                    <Label>CPF</Label>

                    <div className="relative">
                      <CreditCard
                        size={16}
                        strokeWidth={1.7}
                        className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint"
                      />

                      <Input
                        className={`pl-11 ${cpfError ? "border-danger focus:border-danger" : ""}`}
                        value={cpf}
                        onChange={(e) => {
                          const formatted = formatCpf(e.target.value);

                          setCpf(formatted);

                          if (cpfError) {
                            setCpfError(null);
                          }
                        }}
                        onBlur={() => {
                          if (cpf && !isValidCpf(cpf)) {
                            setCpfError("Digite um CPF válido.");
                          }
                        }}
                        required
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        maxLength={14}
                        autoComplete="off"
                        aria-invalid={!!cpfError}
                        aria-describedby={cpfError ? "cpf-error" : undefined}
                      />
                    </div>

                    {cpfError ? (
                      <p id="cpf-error" className="mt-2 text-[10px] font-medium text-danger">
                        {cpfError}
                      </p>
                    ) : (
                      <p className="mt-2 text-[10px] text-text-faint">
                        Informe um CPF válido para continuar.
                      </p>
                    )}
                  </div>

                  {/* Localização */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>País</Label>

                      <div className="relative">
                        <MapPin
                          size={16}
                          strokeWidth={1.7}
                          className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint"
                        />

                        <Input
                          className="pl-11"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          required
                          placeholder="Brasil"
                          autoComplete="country-name"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Cidade</Label>

                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        placeholder="São Paulo"
                        autoComplete="address-level2"
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div>
                    <Label>Senha</Label>

                    <div className="relative">
                      <Lock
                        size={16}
                        strokeWidth={1.7}
                        className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint"
                      />

                      <Input
                        className="pl-11"
                        type="password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>

                    <p className="mt-2 text-[10px] leading-5 text-text-faint">
                      A senha deve ter pelo menos 8 caracteres.
                    </p>
                  </div>

                  {/* Botão */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="group h-12 w-full border-0 bg-accent text-paper shadow-none transition-all hover:bg-accent-bright hover:text-ink hover:shadow-card"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-3">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />

                        <span className="text-xs font-bold uppercase tracking-[0.16em]">
                          Criando conta...
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.16em]">
                          Criar conta
                        </span>

                        <ArrowRight
                          size={15}
                          strokeWidth={1.8}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </div>
                    )}
                  </Button>

                  {/* Login */}
                  <div className="border-t border-ink-softer pt-5 text-center">
                    <span className="text-xs text-text-faint">Já possui uma conta?</span>{" "}
                    <Link
                      to="/login"
                      className="text-xs font-semibold text-accent-bright transition-colors hover:text-paper"
                    >
                      Entrar
                    </Link>
                  </div>
                </form>

                {/* Status */}
                <div className="mt-6 flex items-center justify-between border-t border-ink-softer pt-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={13} strokeWidth={1.7} className="text-accent-bright" />

                    <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-text-faint">
                      Cadastro seguro
                    </span>
                  </div>

                  <span className="font-mono text-[8px] text-text-faint">THEO</span>
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-[8px] uppercase tracking-[0.16em] text-text-faint">
              THEO · STUDY SYSTEM · v1.0
            </p>
          </div>
        </div>
      </section>

      {/* Detalhes decorativos */}
      <div className="pointer-events-none absolute bottom-8 left-8 hidden h-16 w-16 border-b border-l border-accent/20 lg:block" />

      <div className="pointer-events-none absolute right-8 top-24 hidden h-16 w-16 border-r border-t border-accent/20 lg:block" />
    </main>
  );
}

// ============================================================
// FEATURE
// ============================================================

function Feature({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 border border-ink-softer bg-ink-soft/60 px-4 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-accent/30 bg-accent-dim font-mono text-[10px] text-accent-bright">
        {number}
      </div>

      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-paper">{title}</div>

        <div className="mt-1 text-xs leading-5 text-text-faint">{description}</div>
      </div>
    </div>
  );
}
