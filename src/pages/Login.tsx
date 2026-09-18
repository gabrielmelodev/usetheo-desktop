import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { TheoLogo } from "../components/TheoLogo";
import { extractErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type Period = "dawn" | "morning" | "afternoon" | "evening" | "night";

function getPeriod(hour: number): Period {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

function getPeriodLabel(period: Period) {
  switch (period) {
    case "dawn":
      return "Amanhecer";

    case "morning":
      return "Manhã";

    case "afternoon":
      return "Tarde";

    case "evening":
      return "Noite";

    default:
      return "Madrugada";
  }
}

function getPeriodIcon(period: Period) {
  switch (period) {
    case "dawn":
      return Sunrise;

    case "morning":
      return Sun;

    case "afternoon":
      return Sun;

    case "evening":
      return Sunset;

    default:
      return Moon;
  }
}

function getPeriodDescription(period: Period) {
  switch (period) {
    case "dawn":
      return "Comece o dia preparando o que realmente importa.";

    case "morning":
      return "Um novo ciclo de estudos começa agora.";

    case "afternoon":
      return "Mantenha o ritmo. Constância vence intensidade.";

    case "evening":
      return "Feche o dia consolidando o que você aprendeu.";

    default:
      return "Pouco ruído. Foco no próximo passo.";
  }
}

function getFormattedTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFormattedDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export default function Login() {
  const navigate = useNavigate();

  /*
   * ============================================================
   * AUTENTICAÇÃO REAL DO THEO
   * ============================================================
   */

  const { login, verifyTwoFactor } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /*
   * ============================================================
   * 2FA
   * ============================================================
   */

  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const [code, setCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [date, setDate] = useState(new Date());

  /*
   * ============================================================
   * RELÓGIO
   * ============================================================
   */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDate(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const hour = date.getHours();

  const period = useMemo(() => {
    return getPeriod(hour);
  }, [hour]);

  const PeriodIcon = getPeriodIcon(period);

  /*
   * ============================================================
   * ATMOSFERA
   * ============================================================
   */

  const atmosphere = useMemo(() => {
    switch (period) {
      case "dawn":
        return {
          glow: "bg-[radial-gradient(circle_at_75%_15%,rgba(138,154,91,0.13),transparent_35%)]",

          secondary:
            "bg-[radial-gradient(circle_at_10%_80%,rgba(232,163,61,0.06),transparent_30%)]",
        };

      case "morning":
        return {
          glow: "bg-[radial-gradient(circle_at_80%_10%,rgba(138,154,91,0.16),transparent_38%)]",

          secondary: "bg-[radial-gradient(circle_at_0%_100%,rgba(75,83,32,0.14),transparent_35%)]",
        };

      case "afternoon":
        return {
          glow: "bg-[radial-gradient(circle_at_85%_20%,rgba(138,154,91,0.12),transparent_35%)]",

          secondary:
            "bg-[radial-gradient(circle_at_15%_85%,rgba(216,154,62,0.06),transparent_32%)]",
        };

      case "evening":
        return {
          glow: "bg-[radial-gradient(circle_at_80%_15%,rgba(75,83,32,0.18),transparent_36%)]",

          secondary: "bg-[radial-gradient(circle_at_10%_90%,rgba(52,58,22,0.24),transparent_38%)]",
        };

      default:
        return {
          glow: "bg-[radial-gradient(circle_at_75%_10%,rgba(75,83,32,0.12),transparent_32%)]",

          secondary: "bg-[radial-gradient(circle_at_15%_90%,rgba(52,58,22,0.18),transparent_35%)]",
        };
    }
  }, [period]);

  /*
   * ============================================================
   * LOGIN REAL
   * ============================================================
   */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Informe seu e-mail.");
      return;
    }

    if (!password) {
      setError("Informe sua senha.");
      return;
    }

    try {
      setLoading(true);

      /*
       * Chama o backend através do AuthContext.
       */

      const challenge = await login(email.trim(), password);

      /*
       * Se o backend exigir 2FA,
       * guarda o challenge e muda a tela.
       */

      if (challenge) {
        setChallengeToken(challenge.challenge_token);

        setCode("");
        setSuccess("");

        return;
      }

      /*
       * Login normal concluído.
       */

      navigate("/");
    } catch (err) {
      console.error(err);

      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /*
   * ============================================================
   * VERIFICAÇÃO 2FA REAL
   * ============================================================
   */

  async function handleTwoFactorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!challengeToken) {
      setError("A sessão de autenticação expirou. Faça login novamente.");

      setChallengeToken(null);

      return;
    }

    if (!code.trim()) {
      setError("Informe o código de verificação.");

      return;
    }

    try {
      setLoading(true);

      await verifyTwoFactor(challengeToken, code.trim());

      /*
       * 2FA validado.
       */

      navigate("/");
    } catch (err) {
      console.error(err);

      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /*
   * ============================================================
   * VOLTAR DO 2FA
   * ============================================================
   */

  function handleBackToLogin() {
    if (loading) return;

    setChallengeToken(null);
    setCode("");
    setError("");
    setSuccess("");
  }

  /*
   * ============================================================
   * INTERFACE
   * ============================================================
   */

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink font-sans text-text">
      {/* ======================================================
          FUNDO
      ====================================================== */}

      <div className="absolute inset-0 bg-ink" />

      <div
        className={`pointer-events-none absolute inset-0 transition-all duration-1000 ${atmosphere.glow}`}
      />

      <div
        className={`pointer-events-none absolute inset-0 transition-all duration-1000 ${atmosphere.secondary}`}
      />

      {/* ======================================================
          TEXTURA
      ====================================================== */}

      <div className="pointer-events-none absolute inset-0 bg-grain bg-[length:4px_4px] opacity-30" />

      {/* ======================================================
          GRADE
      ====================================================== */}

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ======================================================
          VINHETA
      ====================================================== */}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(20,23,27,0.72)_100%)]" />

      {/* ======================================================
          LINHA SUPERIOR
      ====================================================== */}

      <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-accent/30" />

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          {/* THEO LOGO */}

          <div className="flex h-9 w-9 items-center justify-center border border-accent/40 bg-ink-soft shadow-sm">
            <TheoLogo className="h-6 w-6 text-accent-bright" />
          </div>

          <div>
            <div className="font-display text-sm font-bold tracking-[0.28em] text-paper">THEO</div>

            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-text-faint">
              Sistema de estudos
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-2 border border-ink-softer bg-ink-soft/70 px-3 py-2">
            <PeriodIcon size={14} className="text-accent-bright" strokeWidth={1.8} />

            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {getPeriodLabel(period)}
            </span>
          </div>

          <div className="flex items-center gap-2 border border-ink-softer bg-ink-soft/70 px-3 py-2">
            <Clock3 size={13} className="text-text-muted" strokeWidth={1.8} />

            <span className="font-mono text-xs text-text">{getFormattedTime(date)}</span>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTEÚDO
      ====================================================== */}

      <section className="relative z-10 flex min-h-[calc(100vh-89px)] items-center justify-center px-5 pb-10 pt-4 sm:px-8">
        <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_460px] lg:gap-20">
          {/* ==================================================
              LADO ESQUERDO
          ================================================== */}

          <div className="hidden lg:block">
            <div className="max-w-xl">
              <div className="mb-6 flex items-center gap-3">
                <span className="h-px w-10 bg-accent-bright/60" />

                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent-bright">
                  {getPeriodLabel(period)} · Theo
                </span>
              </div>

              <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-paper xl:text-6xl">
                Seu estudo.
                <br />
                <span className="text-accent-bright">No lugar certo.</span>
              </h1>

              <p className="mt-7 max-w-lg text-base leading-7 text-text-muted">
                {getPeriodDescription(period)}
              </p>

              <div className="mt-10 grid max-w-md grid-cols-3 gap-px overflow-hidden border border-ink-softer bg-ink-softer">
                <div className="bg-ink-soft/90 px-4 py-4">
                  <div className="font-mono text-lg text-paper">01</div>

                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                    Foco
                  </div>
                </div>

                <div className="bg-ink-soft/90 px-4 py-4">
                  <div className="font-mono text-lg text-paper">02</div>

                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                    Revisão
                  </div>
                </div>

                <div className="bg-ink-soft/90 px-4 py-4">
                  <div className="font-mono text-lg text-paper">03</div>

                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                    Constância
                  </div>
                </div>
              </div>

              <div className="mt-9 flex items-center gap-2 text-xs text-text-faint">
                <CheckCircle2 size={14} className="text-accent-bright" strokeWidth={1.8} />

                <span>O próximo passo começa quando você decide estudar.</span>
              </div>
            </div>
          </div>

          {/* ==================================================
              CARD
          ================================================== */}

          <div className="w-full max-w-[460px] justify-self-center">
            <div className="relative overflow-hidden border border-ink-softer bg-ink-soft/95 shadow-card backdrop-blur-xl">
              {/* ==================================================
                  BARRA
              ================================================== */}

              <div className="flex items-center justify-between border-b border-ink-softer px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />

                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-text-muted">
                    {challengeToken ? "Verificação" : "Acesso"}
                  </span>
                </div>

                <span className="font-mono text-[9px] text-text-faint">
                  THEO / {challengeToken ? "02" : "01"}
                </span>
              </div>

              <div className="p-6 sm:p-8">
                {/* ==================================================
                    2FA
                ================================================== */}

                {challengeToken ? (
                  <>
                    <div className="mb-8">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center border border-accent/50 bg-accent-dim">
                        <ShieldCheck size={24} strokeWidth={1.6} className="text-accent-bright" />
                      </div>

                      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-accent-bright">
                        Segunda etapa
                      </div>

                      <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
                        Confirme seu acesso.
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        Digite o código de verificação para continuar.
                      </p>
                    </div>

                    {error && (
                      <div className="mb-5 border border-again/30 bg-again/10 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-again" />

                          <p className="text-xs leading-5 text-again">{error}</p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
                      <div>
                        <label
                          htmlFor="two-factor-code"
                          className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted"
                        >
                          Código de verificação
                        </label>

                        <input
                          id="two-factor-code"
                          name="code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          autoFocus
                          maxLength={6}
                          value={code}
                          onChange={(event) =>
                            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          placeholder="000000"
                          disabled={loading}
                          className="h-14 w-full border border-ink-softer bg-ink px-4 text-center font-mono text-xl tracking-[0.35em] text-paper outline-none transition-all placeholder:text-text-faint hover:border-text-faint focus:border-accent-bright focus:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="group flex h-12 w-full items-center justify-center gap-3 bg-accent px-5 text-xs font-bold uppercase tracking-[0.18em] text-paper transition-all hover:bg-accent-bright hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent-bright/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />

                            <span>Verificando...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={16} strokeWidth={1.8} />

                            <span>Confirmar acesso</span>

                            <ArrowRight
                              size={15}
                              strokeWidth={1.8}
                              className="transition-transform duration-200 group-hover:translate-x-1"
                            />
                          </>
                        )}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      disabled={loading}
                      className="mt-5 flex w-full items-center justify-center text-xs text-text-faint transition-colors hover:text-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Voltar para o login
                    </button>
                  </>
                ) : (
                  /* =================================================
                     LOGIN
                  ================================================= */

                  <>
                    <div className="mb-8">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center border border-accent/50 bg-accent-dim">
                        <TheoLogo className="h-7 w-7 text-accent-bright" />
                      </div>

                      <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
                        Bem-vindo de volta.
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        Entre para continuar sua preparação no Theo.
                      </p>
                    </div>

                    {error && (
                      <div className="mb-5 border border-again/30 bg-again/10 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-again" />

                          <p className="text-xs leading-5 text-again">{error}</p>
                        </div>
                      </div>
                    )}

                    {success && (
                      <div className="mb-5 border border-good/30 bg-good/10 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2
                            size={15}
                            className="mt-0.5 shrink-0 text-good"
                            strokeWidth={1.8}
                          />

                          <p className="text-xs leading-5 text-good">{success}</p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                      {/* ==================================================
                          EMAIL
                      ================================================== */}

                      <div>
                        <label
                          htmlFor="email"
                          className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted"
                        >
                          E-mail
                        </label>

                        <div className="group relative">
                          <Mail
                            size={16}
                            strokeWidth={1.7}
                            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint transition-colors group-focus-within:text-accent-bright"
                          />

                          <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            autoFocus
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="seu@email.com"
                            disabled={loading}
                            className="h-12 w-full border border-ink-softer bg-ink px-11 text-sm text-paper outline-none transition-all placeholder:text-text-faint hover:border-text-faint focus:border-accent-bright focus:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                      </div>

                      {/* ==================================================
                          SENHA
                      ================================================== */}

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label
                            htmlFor="password"
                            className="block text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted"
                          >
                            Senha
                          </label>

                          <Link
                            to="/forgot-password"
                            className="text-[10px] font-medium text-text-faint transition-colors hover:text-accent-bright"
                          >
                            Esqueci minha senha
                          </Link>
                        </div>

                        <div className="group relative">
                          <LockKeyhole
                            size={16}
                            strokeWidth={1.7}
                            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-faint transition-colors group-focus-within:text-accent-bright"
                          />

                          <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Sua senha"
                            disabled={loading}
                            className="h-12 w-full border border-ink-softer bg-ink px-11 pr-12 text-sm text-paper outline-none transition-all placeholder:text-text-faint hover:border-text-faint focus:border-accent-bright focus:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
                          />

                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            disabled={loading}
                            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                            className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-text-faint transition-colors hover:text-accent-bright disabled:opacity-50"
                          >
                            {showPassword ? (
                              <EyeOff size={16} strokeWidth={1.7} />
                            ) : (
                              <Eye size={16} strokeWidth={1.7} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* ==================================================
                          BOTÃO LOGIN
                      ================================================== */}

                      <button
                        type="submit"
                        disabled={loading}
                        className="group flex h-12 w-full items-center justify-center gap-3 bg-accent px-5 text-xs font-bold uppercase tracking-[0.18em] text-paper transition-all hover:bg-accent-bright hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent-bright/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />

                            <span>Entrando...</span>
                          </>
                        ) : (
                          <>
                            <LogIn size={16} strokeWidth={1.8} />

                            <span>Entrar no Theo</span>

                            <ArrowRight
                              size={15}
                              strokeWidth={1.8}
                              className="transition-transform duration-200 group-hover:translate-x-1"
                            />
                          </>
                        )}
                      </button>
                    </form>

                    {/* ==================================================
                        SEPARADOR
                    ================================================== */}

                    <div className="my-7 flex items-center gap-4">
                      <div className="h-px flex-1 bg-ink-softer" />

                      <span className="text-[9px] uppercase tracking-[0.18em] text-text-faint">
                        ou
                      </span>

                      <div className="h-px flex-1 bg-ink-softer" />
                    </div>

                    {/* ==================================================
                        CADASTRO
                    ================================================== */}

                    <Link
                      to="/register"
                      className="group flex h-11 w-full items-center justify-center gap-2 border border-ink-softer bg-transparent text-xs font-semibold text-text-muted transition-all hover:border-accent/50 hover:bg-accent-dim hover:text-paper"
                    >
                      <span>Ainda não tenho uma conta</span>

                      <ArrowRight
                        size={14}
                        strokeWidth={1.8}
                        className="transition-transform group-hover:translate-x-1 group-hover:text-accent-bright"
                      />
                    </Link>
                  </>
                )}

                {/* ==================================================
                    RODAPÉ CARD
                ================================================== */}

                <div className="mt-7 flex items-center justify-between border-t border-ink-softer pt-5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent-bright" />

                    <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-text-faint">
                      Sistema ativo
                    </span>
                  </div>

                  <span className="font-mono text-[8px] text-text-faint">
                    {getFormattedTime(date)}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-[9px] leading-5 text-text-faint">
              Ao continuar, você concorda com os termos de uso e a política de privacidade do Theo.
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer className="absolute bottom-0 left-0 right-0 z-10 hidden items-center justify-between px-8 py-4 lg:flex">
        <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-text-faint">
          THEO · STUDY SYSTEM
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[8px] uppercase tracking-[0.18em] text-text-faint">
            {getFormattedDate(date)}
          </span>

          <span className="h-1 w-1 rounded-full bg-accent-bright/60" />

          <span className="text-[8px] uppercase tracking-[0.18em] text-text-faint">v1.0</span>
        </div>
      </footer>

      {/* ======================================================
          DETALHES
      ====================================================== */}

      <div className="pointer-events-none absolute bottom-8 left-8 hidden h-16 w-16 border-b border-l border-accent/20 lg:block" />

      <div className="pointer-events-none absolute right-8 top-24 hidden h-16 w-16 border-r border-t border-accent/20 lg:block" />
    </main>
  );
}
