import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import { Button, ErrorBanner, Input, Label } from "./ui";
import { extractErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth-context";

// ============================================================
// TIPOS
// ============================================================

type AuthMode = "login" | "register";

// ============================================================
// CPF
// ============================================================

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) return digits;

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

  if (cpf.length !== 11) return false;

  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

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
// AUTH MODAL
// ============================================================

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

export default function AuthModal({ open, onClose, initialMode = "login" }: AuthModalProps) {
  const navigate = useNavigate();
  const { login, verifyTwoFactor, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Cadastro
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Geral
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 2FA
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // ==========================================================
  // ABRIR / FECHAR
  // ==========================================================

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    setError(null);
    setCpfError(null);
    setSuccessMessage(null);
    setChallengeToken(null);
    setTwoFactorCode("");
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, loading, onClose]);

  if (!open) {
    return null;
  }

  // ==========================================================
  // LOGIN
  // ==========================================================

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);

    const cleanEmail = loginEmail.trim();

    if (!cleanEmail) {
      setError("Digite seu email.");
      return;
    }

    if (!loginPassword) {
      setError("Digite sua senha.");
      return;
    }

    setLoading(true);

    try {
      const challenge = await login(cleanEmail, loginPassword);

      if (challenge) {
        setChallengeToken(challenge.challenge_token);
        setTwoFactorCode("");
        return;
      }

      onClose();
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // 2FA
  // ==========================================================

  async function handleTwoFactor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!challengeToken) {
      setError("Sessão de autenticação inválida. Faça login novamente.");
      return;
    }

    const code = twoFactorCode.trim();

    if (!code) {
      setError("Digite o código de autenticação.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await verifyTwoFactor(challengeToken, code);

      onClose();
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // CADASTRO
  // ==========================================================

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);
    setCpfError(null);

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim();
    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanCountry = country.trim();
    const cleanCity = city.trim();

    if (!cleanFirstName) {
      setError("Digite seu nome.");
      return;
    }

    if (!cleanLastName) {
      setError("Digite seu sobrenome.");
      return;
    }

    if (!cleanEmail) {
      setError("Digite seu email.");
      return;
    }

    if (!isValidCpf(cleanCpf)) {
      setCpfError("Digite um CPF válido.");
      return;
    }

    if (!cleanCountry) {
      setError("Digite seu país.");
      return;
    }

    if (!cleanCity) {
      setError("Digite sua cidade.");
      return;
    }

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const message = await register({
        first_name: cleanFirstName,
        last_name: cleanLastName,
        email: cleanEmail,
        cpf: cleanCpf,
        country: cleanCountry,
        city: cleanCity,
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
  // TROCAR MODO
  // ==========================================================

  function switchMode(nextMode: AuthMode) {
    if (loading) return;

    setMode(nextMode);
    setError(null);
    setCpfError(null);
    setSuccessMessage(null);
    setChallengeToken(null);
    setTwoFactorCode("");
  }

  // ==========================================================
  // SUCESSO DO CADASTRO
  // ==========================================================

  if (successMessage) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !loading) {
            onClose();
          }
        }}
      >
        <div className="relative w-full max-w-md overflow-hidden border border-ink-softer bg-ink-soft shadow-card">
          <div className="absolute left-0 right-0 top-0 h-px bg-accent/50" />

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
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-good/30 bg-good/10">
              <CheckCircle2 size={30} strokeWidth={1.6} className="text-good" />
            </div>

            <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.25em] text-accent-bright">
              Cadastro concluído
            </div>

            <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
              Quase lá.
            </h2>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-text-muted">
              {successMessage}
            </p>

            <div className="mt-7 border border-ink-softer bg-ink px-4 py-4 text-left">
              <div className="flex items-center gap-3">
                <ShieldCheck size={17} strokeWidth={1.7} className="text-accent-bright" />

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper">
                    Próximo passo
                  </div>

                  <div className="mt-1 text-xs text-text-faint">
                    Entre na sua conta para começar seus estudos.
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccessMessage(null);
                setMode("login");
                setLoginEmail(email.trim());
                setLoginPassword("");
              }}
              className="group mt-7 flex h-12 w-full items-center justify-center gap-3 bg-accent text-xs font-bold uppercase tracking-[0.18em] text-paper transition-all hover:bg-accent-bright hover:text-ink"
            >
              Ir para o login
              <ArrowRight
                size={15}
                strokeWidth={1.8}
                className="transition-transform group-hover:translate-x-1"
              />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // MODAL
  // ==========================================================

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      {/* Fundo decorativo */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(138,154,91,0.12),transparent_35%)]" />

      <div className="relative my-auto w-full max-w-xl overflow-hidden border border-ink-softer bg-ink-soft/95 shadow-card backdrop-blur-xl">
        {/* Linha superior */}
        <div className="absolute left-0 right-0 top-0 h-px bg-accent/40" />

        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="flex items-center justify-between border-b border-ink-softer px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-accent/40 bg-ink">
              <Sparkles size={17} strokeWidth={1.7} className="text-accent-bright" />
            </div>

            <div>
              <div className="font-display text-sm font-bold tracking-[0.28em] text-paper">
                THEO
              </div>

              <div className="mt-0.5 text-[8px] uppercase tracking-[0.2em] text-text-faint">
                Sistema de estudos
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center text-text-faint transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {/* ====================================================
            TABS
        ==================================================== */}

        {!challengeToken && (
          <div className="grid grid-cols-2 border-b border-ink-softer">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`relative px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                mode === "login" ? "text-accent-bright" : "text-text-faint hover:text-paper"
              }`}
            >
              Entrar
              {mode === "login" && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-bright" />
              )}
            </button>

            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`relative px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                mode === "register" ? "text-accent-bright" : "text-text-faint hover:text-paper"
              }`}
            >
              Criar conta
              {mode === "register" && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-bright" />
              )}
            </button>
          </div>
        )}

        {/* ====================================================
            CONTEÚDO
        ==================================================== */}

        <div className="p-6 sm:p-8">
          {/* ==================================================
              2FA
          ================================================== */}

          {challengeToken ? (
            <form onSubmit={handleTwoFactor} className="space-y-6">
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center border border-accent/40 bg-accent-dim">
                  <ShieldCheck size={21} strokeWidth={1.6} className="text-accent-bright" />
                </div>

                <h2 className="font-display text-2xl font-semibold text-paper">
                  Confirme seu acesso
                </h2>

                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Digite o código de autenticação de dois fatores para continuar.
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              <div>
                <Label>Código de autenticação</Label>

                <Input
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-[0.35em]"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group h-12 w-full border-0 bg-accent text-paper shadow-none hover:bg-accent-bright hover:text-ink"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">
                      Verificando...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">
                      Confirmar acesso
                    </span>

                    <ArrowRight size={15} />
                  </div>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setTwoFactorCode("");
                  setError(null);
                }}
                className="w-full text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint hover:text-accent-bright"
              >
                Voltar para o login
              </button>
            </form>
          ) : mode === "login" ? (
            /* ==================================================
               LOGIN
            ================================================== */

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center border border-accent/40 bg-accent-dim">
                  <User size={21} strokeWidth={1.6} className="text-accent-bright" />
                </div>

                <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
                  Bem-vindo de volta.
                </h2>

                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Entre na sua conta para continuar sua preparação.
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

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
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="voce@email.com"
                    autoComplete="email"
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
                    className="pl-11 pr-11"
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((current) => !current)}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-text-faint transition-colors hover:text-paper"
                    aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group h-12 w-full border-0 bg-accent text-paper shadow-none transition-all hover:bg-accent-bright hover:text-ink hover:shadow-card"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />

                    <span className="text-xs font-bold uppercase tracking-[0.16em]">
                      Entrando...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">Entrar</span>

                    <ArrowRight
                      size={15}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                )}
              </Button>

              <div className="flex items-center gap-2 border-t border-ink-softer pt-5">
                <ShieldCheck size={13} strokeWidth={1.7} className="text-accent-bright" />

                <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Acesso seguro · Theo
                </span>
              </div>
            </form>
          ) : (
            /* ==================================================
               CADASTRO
            ================================================== */

            <form onSubmit={handleRegister} className="space-y-5">
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
                      setCpf(formatCpf(e.target.value));

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
                    aria-describedby={cpfError ? "auth-modal-cpf-error" : undefined}
                  />
                </div>

                {cpfError ? (
                  <p id="auth-modal-cpf-error" className="mt-2 text-[10px] font-medium text-danger">
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
                    className="pl-11 pr-11"
                    type={showRegisterPassword ? "text" : "password"}
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword((current) => !current)}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-text-faint transition-colors hover:text-paper"
                    aria-label={showRegisterPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showRegisterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
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
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                )}
              </Button>

              <div className="flex items-center gap-2 border-t border-ink-softer pt-5">
                <ShieldCheck size={13} strokeWidth={1.7} className="text-accent-bright" />

                <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Cadastro seguro · Theo
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
