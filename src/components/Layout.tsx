import {
  CalendarClock,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  LibraryBig,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";
import { dbCount } from "../lib/localdb";
import { useSyncStatus } from "../lib/useSyncStatus";

import Theo, { type TheoState } from "./TheoState";
import { useTheoMotion } from "../hooks/useTheoMotion";

import LoginModal from "./LoginModal";
import SubscriptionModal from "./SubscriptionModal";
import { SubscriptionGate } from "./SubscriptionGate";
import TimerWidget from "./TimerWidget";
import { Tooltip } from "./ui";

import { CoachTour, useCoachTour, type TourStep } from "./onboarding/CoachTour";

// =====================================================
// TUTORIAL DA NAVEGAÇÃO
// =====================================================

const shellTourSteps: TourStep[] = [
  {
    target: '[data-tour="mascote"]',
    title: "Conheça o Theo",
    description:
      "O Theo acompanha sua jornada e muda de expressão conforme você navega, estuda e revisa.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-decks"]',
    title: "Seus decks",
    description: "Crie e organize grupos de cards para cada disciplina ou assunto.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-organizar"]',
    title: "Planejamento",
    description: "Organize seus conteúdos e prepare sua rotina de estudos.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-estudar"]',
    title: "Estudar",
    description: "Acesse suas revisões e pratique com repetição espaçada.",
    placement: "right",
  },
  {
    target: '[data-tour="ajuda"]',
    title: "Precisa de ajuda?",
    description: "Você pode abrir este tutorial novamente sempre que quiser.",
    placement: "top",
  },
];

// =====================================================
// TIPOS
// =====================================================

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

// =====================================================
// NAVEGAÇÃO
// =====================================================

const baseNavItems: NavItem[] = [
  {
    to: "/",
    label: "Painel",
    icon: LayoutGrid,
    end: true,
  },
  {
    to: "/decks",
    label: "Decks",
    icon: LibraryBig,
  },
  {
    to: "/organizar",
    label: "Planejamento",
    icon: FolderKanban,
  },
  {
    to: "/editais",
    label: "Meu Plano",
    icon: CalendarClock,
  },
  {
    to: "/study",
    label: "Estudar",
    icon: Sparkles,
  },
];

// =====================================================
// ESTADO BASE DO THEO
// =====================================================

function getTheoState(pathname: string): TheoState {
  if (pathname === "/") {
    return "motivated";
  }

  if (pathname.startsWith("/study")) {
    return "studying";
  }

  if (pathname.startsWith("/stats")) {
    return "focused";
  }

  if (pathname.startsWith("/editais")) {
    return "thinking";
  }

  if (pathname.startsWith("/decks")) {
    return "focused";
  }

  if (pathname.startsWith("/organizar")) {
    return "thinking";
  }

  if (pathname.startsWith("/erro") || pathname.startsWith("/questions")) {
    return "thinking";
  }

  if (pathname.startsWith("/admin")) {
    return "alert";
  }

  return "idle";
}

// =====================================================
// COMPONENTES VISUAIS LOCAIS
// =====================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-3">
      <span className="text-[11px] font-medium tracking-wide text-text-faint">{children}</span>
    </div>
  );
}

function StatusDot({ color = "bg-green-400", pulse = false }: { color?: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 ${color}`}
        />
      )}

      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

// =====================================================
// LAYOUT
// =====================================================

export function Layout() {
  const { user, logout, sync } = useAuth();
  const location = useLocation();

  // ===================================================
  // ESTADOS
  // ===================================================

  const [syncing, setSyncing] = useState(false);

  const { status: realtimeSyncStatus } = useSyncStatus(!!user);
  const autoSyncing = realtimeSyncStatus === "syncing";

  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [hasStudyContent, setHasStudyContent] = useState(false);
  const [checkingStudyContent, setCheckingStudyContent] = useState(true);

  // ===================================================
  // CARTA DO THEO
  // ===================================================

  const [hasLetter, setHasLetter] = useState(true);
  const [letterOpen, setLetterOpen] = useState(false);

  // ===================================================
  // LOADING DE NAVEGAÇÃO
  // ===================================================

  const [navigating, setNavigating] = useState(false);
  const navigationStartedAt = useRef<number | null>(null);

  // ===================================================
  // ESTADO E MOVIMENTO DO THEO
  // ===================================================

  const theoState = useMemo(() => getTheoState(location.pathname), [location.pathname]);

  const {
    state: theoMotionState,
    motion: theoMotionType,
    reacting: theoReacting,
    react: reactTheo,
  } = useTheoMotion(theoState);

  // ===================================================
  // TUTORIAL
  // ===================================================

  const shellTour = useCoachTour("app-shell", shellTourSteps);

  // ===================================================
  // STATS FULLSCREEN
  // ===================================================

  const isStatsPage = location.pathname === "/stats" || location.pathname.startsWith("/stats/");

  // ===================================================
  // NAVEGAÇÃO
  // ===================================================

  const navItems = useMemo<NavItem[]>(() => {
    if (user?.role !== "admin") {
      return baseNavItems;
    }

    return [
      ...baseNavItems,
      {
        to: "/admin",
        label: "Administração",
        icon: ShieldCheck,
      },
    ];
  }, [user?.role]);

  // ===================================================
  // MODAL DA CARTA
  // ===================================================

  useEffect(() => {
    if (!letterOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLetterOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [letterOpen]);

  // ===================================================
  // FINALIZAR LOADING QUANDO A ROTA MUDA
  // ===================================================

  useEffect(() => {
    if (!navigating) {
      return;
    }

    const minimumLoadingTime = 180;
    const startedAt = navigationStartedAt.current ?? performance.now();

    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, minimumLoadingTime - elapsed);

    const timer = window.setTimeout(() => {
      setNavigating(false);
      navigationStartedAt.current = null;
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [location.pathname, navigating]);

  // ===================================================
  // VERIFICAR CARDS
  // ===================================================

  const checkStudyContent = useCallback(async () => {
    try {
      const cardCount = await dbCount("cards");
      setHasStudyContent(cardCount > 0);
    } catch (error) {
      console.error("[Theo] Erro ao verificar conteúdo de estudo:", error);

      setHasStudyContent(false);
    } finally {
      setCheckingStudyContent(false);
    }
  }, []);

  // ===================================================
  // CARREGAMENTO + TROCA DE ROTA
  // ===================================================

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cardCount = await dbCount("cards");

        if (cancelled) {
          return;
        }

        setHasStudyContent(cardCount > 0);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("[Theo] Erro ao verificar conteúdo de estudo:", error);

        setHasStudyContent(false);
      } finally {
        if (!cancelled) {
          setCheckingStudyContent(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  // ===================================================
  // ATUALIZAR QUANDO VOLTAR PARA O APP
  // ===================================================

  useEffect(() => {
    const handleFocus = () => {
      void checkStudyContent();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkStudyContent]);

  // ===================================================
  // REAÇÃO DO THEO À TROCA DE ROTA
  // ===================================================

  useEffect(() => {
    if (location.pathname.startsWith("/study")) {
      reactTheo(hasStudyContent ? "study_open" : "study_empty");
      return;
    }

    if (location.pathname.startsWith("/decks")) {
      reactTheo("deck_open");
      return;
    }

    if (location.pathname.startsWith("/organizar") || location.pathname.startsWith("/editais")) {
      reactTheo("planning_open");
      return;
    }

    if (location.pathname.startsWith("/stats")) {
      reactTheo("stats_open");
      return;
    }

    if (location.pathname.startsWith("/erro") || location.pathname.startsWith("/questions")) {
      reactTheo("error_open");
      return;
    }

    if (location.pathname.startsWith("/admin")) {
      reactTheo("admin_open");
      return;
    }

    reactTheo("navigation");
  }, [location.pathname, hasStudyContent, reactTheo]);

  // ===================================================
  // SINCRONIZAÇÃO
  // ===================================================

  const handleSync = useCallback(async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);
    reactTheo("sync_start");

    try {
      await sync();
      await checkStudyContent();
      reactTheo("sync_success");
    } catch (error) {
      console.error("[Theo] Erro ao sincronizar:", error);
      reactTheo("sync_error");
    } finally {
      setSyncing(false);
    }
  }, [sync, syncing, checkStudyContent, reactTheo]);

  // ===================================================
  // ABRIR CARTA
  // ===================================================

  const handleLetterOpen = useCallback(() => {
    if (!hasLetter) {
      return;
    }

    setHasLetter(false);
    setLetterOpen(true);
    reactTheo("letter_open");
  }, [hasLetter, reactTheo]);

  useEffect(() => {
    const openSubscription = () => setSubscriptionOpen(true);
    window.addEventListener("theo-open-subscription", openSubscription);
    return () => window.removeEventListener("theo-open-subscription", openSubscription);
  }, []);

  // ===================================================
  // RENDER
  // =====================================================

  return (
    <>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-ink text-text">
        {/* =================================================
            SIDEBAR
        ================================================== */}

        <aside
          className="
            relative z-20 flex w-[248px] shrink-0 flex-col
            border-r border-white/[0.08]
            bg-ink-soft
            px-3
            py-4
          "
        >
          {/* =================================================
              MARCA / THEO
          ================================================== */}

          <div data-tour="mascote" className="mb-7 flex flex-col items-center">
            {/* Avatar */}
            <div className="relative flex items-center justify-center">
              <Theo
                state={theoMotionState}
                motion={theoMotionType}
                reacting={theoReacting}
                autoMessage
                hasLetter={hasLetter}
                onLetterOpen={handleLetterOpen}
                performance={{
                  studyMinutes: 0,
                  goalMinutes: 120,
                  accuracy: 0,
                  streakDays: 0,
                  reviewsToday: 0,
                  pendingReviews: 0,
                  trend: "stable",
                }}
                weather={{
                  condition: "unknown",
                  temperature: undefined,
                  isDay: true,
                }}
                className="
                  relative z-10 h-[104px] w-[104px]
                  transition-transform duration-300
                  hover:scale-[1.02]
                "
              />
            </div>

            {/* Identidade */}
            <div className="mt-2 text-center">
              <p className="text-sm font-semibold tracking-tight text-text">Theo</p>

              <p className="mt-0.5 text-xs text-text-faint">Seu espaço de estudo</p>
            </div>

            {/* Estado */}
            <div
              className="
                mt-3 inline-flex items-center gap-2
                rounded-full border border-white/[0.08]
                bg-white/[0.035]
                px-2.5 py-1
              "
            >
              <StatusDot color="bg-green-400" pulse />

              <span className="text-[10px] font-medium text-text-muted">
                {theoMotionState === "studying"
                  ? "Estudando"
                  : theoMotionState === "focused"
                    ? "Focado"
                    : theoMotionState === "thinking"
                      ? "Organizando"
                      : "Pronto para ajudar"}
              </span>
            </div>
          </div>

          {/* =================================================
              MENU PRINCIPAL
          ================================================== */}

          <nav className="flex flex-1 flex-col gap-1" aria-label="Navegação principal">
            <SectionLabel>Espaço de trabalho</SectionLabel>

            {navItems.map(({ to, label, icon: Icon, end }) => {
              const isStudy = to === "/study";
              const studyDisabled = isStudy && !checkingStudyContent && !hasStudyContent;

              // ===========================================
              // ESTUDAR BLOQUEADO
              // ===========================================

              if (studyDisabled) {
                return (
                  <Tooltip
                    key={to}
                    label="Adicione cards a um deck para começar a estudar"
                    placement="bottom"
                  >
                    <div
                      className="
                        flex w-full cursor-not-allowed
                        items-center gap-3 rounded-xl
                        px-3 py-2.5
                        text-sm font-medium
                        text-text-faint opacity-60
                      "
                      aria-disabled="true"
                    >
                      <Icon size={20} strokeWidth={1.8} className="shrink-0" />

                      <span>{label}</span>

                      <span
                        className="
                          ml-auto rounded-md
                          bg-white/[0.04]
                          px-1.5 py-0.5
                          text-[10px] font-medium
                          text-text-faint
                        "
                      >
                        Vazio
                      </span>
                    </div>
                  </Tooltip>
                );
              }

              // ===========================================
              // ITEM NORMAL
              // ===========================================

              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  data-tour={
                    to === "/decks"
                      ? "nav-decks"
                      : to === "/organizar"
                        ? "nav-organizar"
                        : to === "/study"
                          ? "nav-estudar"
                          : undefined
                  }
                  onClick={() => {
                    if (to === location.pathname) {
                      return;
                    }

                    navigationStartedAt.current = performance.now();

                    setNavigating(true);
                  }}
                  className={({ isActive }) => `
                    group relative flex w-full items-center gap-3
                    rounded-xl px-3 py-2.5
                    text-sm font-medium
                    transition-colors duration-150
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/60

                    ${
                      isActive
                        ? `
                          bg-accent/[0.14]
                          text-accent
                        `
                        : `
                          text-text-muted
                          hover:bg-white/[0.06]
                          hover:text-text
                        `
                    }
                  `}
                >
                  {({ isActive }) => (
                    <>
                      {/* Ícone */}
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2 : 1.8}
                        className="
                          relative z-10 shrink-0
                          transition-colors duration-150
                        "
                      />

                      {/* Texto */}
                      <span className="relative z-10 truncate">{label}</span>

                      {/* Indicador discreto */}
                      {isActive && (
                        <span
                          className="
                            relative z-10 ml-auto
                            h-1.5 w-1.5 shrink-0
                            rounded-full bg-accent
                          "
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* =================================================
              PLANO
          ================================================== */}

          {user && (
            <div
              className="
                mb-4 rounded-xl
                border border-white/[0.08]
                bg-white/[0.035]
                p-3
              "
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-text-faint">Plano atual</p>

                  <p className="mt-1 text-sm font-medium text-text">Gratuito</p>
                </div>

                <button
                  type="button"
                  onClick={() => setSubscriptionOpen(true)}
                  className="
                    shrink-0 rounded-lg
                    bg-accent px-3 py-1.5
                    text-xs font-semibold
                    text-[#202124]
                    transition-colors duration-150
                    hover:bg-accent-bright
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/70
                    active:scale-[0.98]
                  "
                >
                  Conhecer planos
                </button>
              </div>
            </div>
          )}

          {/* =================================================
              PERFIL / LOGIN
          ================================================== */}

          <div className="border-t border-white/[0.08] pt-3">
            {user ? (
              <>
                {/* USUÁRIO */}
                <div className="mb-2 flex items-center gap-3 px-2 py-2">
                  <div
                    className="
                      flex h-9 w-9 shrink-0
                      items-center justify-center
                      rounded-full
                      bg-accent/[0.16]
                      text-sm font-semibold
                      text-accent
                    "
                  >
                    {user.first_name?.slice(0, 1)?.toUpperCase() ?? "T"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{user.first_name}</p>

                    <p className="truncate text-xs text-text-faint">{user.email}</p>
                  </div>
                </div>

                {/* SINCRONIZAR */}
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing || autoSyncing}
                  aria-label={syncing || autoSyncing ? "Sincronizando" : "Sincronizar agora"}
                  className="
                    group flex w-full items-center gap-3
                    rounded-xl px-3 py-2.5
                    text-sm font-medium text-text-muted
                    transition-colors duration-150
                    hover:bg-white/[0.06]
                    hover:text-text
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/60
                  "
                >
                  <RefreshCw
                    size={19}
                    strokeWidth={1.8}
                    className={
                      syncing || autoSyncing
                        ? "animate-spin text-accent"
                        : "transition-transform duration-200 group-hover:rotate-45"
                    }
                  />

                  <span>{syncing || autoSyncing ? "Sincronizando..." : "Sincronizar agora"}</span>

                  {!syncing && !autoSyncing && <StatusDot color="bg-green-400" />}
                </button>

                {/* SAIR */}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="
                    group flex w-full items-center gap-3
                    rounded-xl px-3 py-2.5
                    text-sm font-medium text-text-muted
                    transition-colors duration-150
                    hover:bg-white/[0.06]
                    hover:text-text
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/60
                  "
                >
                  <LogOut
                    size={19}
                    strokeWidth={1.8}
                    className="
                      transition-transform duration-200
                      group-hover:-translate-x-0.5
                    "
                  />

                  <span>Sair</span>
                </button>
              </>
            ) : (
              <>
                {/* MODO LOCAL */}
                <div
                  className="
                    mb-2 rounded-xl
                    border border-white/[0.08]
                    bg-white/[0.025]
                    p-3
                  "
                >
                  <div className="flex items-center gap-2">
                    <StatusDot color="bg-text-faint" />

                    <p className="text-sm font-medium text-text">Modo local</p>
                  </div>

                  <p className="mt-1 pl-4 text-xs leading-5 text-text-faint">
                    Seus dados ficam neste dispositivo.
                  </p>
                </div>

                {/* ENTRAR */}
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className="
                    group flex w-full items-center gap-3
                    rounded-xl px-3 py-2.5
                    text-sm font-medium text-text-muted
                    transition-colors duration-150
                    hover:bg-white/[0.06]
                    hover:text-text
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/60
                  "
                >
                  <LogIn
                    size={19}
                    strokeWidth={1.8}
                    className="
                      transition-transform duration-200
                      group-hover:translate-x-0.5
                    "
                  />

                  <span>Entrar / Sincronizar</span>

                  <StatusDot color="bg-accent" />
                </button>
              </>
            )}

            {/* AJUDA */}
            <button
              type="button"
              data-tour="ajuda"
              onClick={shellTour.restart}
              className="
                group mt-1 flex w-full items-center gap-3
                rounded-xl px-3 py-2.5
                text-sm font-medium text-text-muted
                transition-colors duration-150
                hover:bg-white/[0.06]
                hover:text-text
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-accent/60
              "
            >
              <HelpCircle
                size={19}
                strokeWidth={1.8}
                className="
                  transition-transform duration-200
                  group-hover:scale-105
                "
              />

              <span>Ajuda e tutorial</span>
            </button>
          </div>
        </aside>

        {/* =================================================
            CONTEÚDO PRINCIPAL
        ================================================== */}

        <main
          className="
            relative z-10 min-h-0 min-w-0 flex-1
            overflow-y-auto overscroll-contain
            bg-ink
          "
        >
          {/* Loading de navegação */}
          {navigating && (
            <div
              className="
                pointer-events-none absolute inset-x-0 top-0 z-[80]
                h-0.5 overflow-hidden bg-accent/20
              "
              aria-live="polite"
              aria-label="Carregando página"
            >
              <div
                className="
                  h-full w-1/3
                  animate-[navigationProgress_900ms_ease-in-out_infinite]
                  bg-accent
                "
              />
            </div>
          )}

          {isStatsPage ? (
            <div className="min-h-full w-full">
              <SubscriptionGate>
            <Outlet />
          </SubscriptionGate>
            </div>
          ) : (
            <div
              className="
                mx-auto min-h-full w-full max-w-7xl
                px-5 py-6
                sm:px-8 sm:py-8
                lg:px-10
              "
            >
              <Outlet />
            </div>
          )}
        </main>
      </div>

      {/* =====================================================
          MODAL DA CARTA DO THEO
      ====================================================== */}

      {letterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="theo-letter-title"
          className="
            fixed inset-0 z-[9999]
            flex items-center justify-center
            bg-black/60 p-4
            backdrop-blur-[2px]
          "
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setLetterOpen(false);
            }
          }}
        >
          <div
            className="
              relative w-full max-w-md
              overflow-hidden rounded-2xl
              border border-white/[0.10]
              bg-ink-soft
              shadow-dialog
            "
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="p-6 sm:p-7">
              {/* Cabeçalho */}
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="
                        flex h-8 w-8 items-center justify-center
                        rounded-lg bg-accent/[0.14]
                      "
                    >
                      <Sparkles size={16} strokeWidth={1.8} className="text-accent" />
                    </div>

                    <span className="text-xs font-medium text-text-faint">
                      Uma mensagem do Theo
                    </span>
                  </div>

                  <h2
                    id="theo-letter-title"
                    className="text-xl font-semibold tracking-tight text-text"
                  >
                    Uma carta para você
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setLetterOpen(false)}
                  aria-label="Fechar carta"
                  className="
                    flex h-8 w-8 shrink-0 items-center justify-center
                    rounded-full text-xl leading-none
                    text-text-faint
                    transition-colors
                    hover:bg-white/[0.08]
                    hover:text-text
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/60
                  "
                >
                  ×
                </button>
              </div>

              {/* Conteúdo */}
              <div
                className="
                  rounded-xl
                  border border-white/[0.08]
                  bg-white/[0.025]
                  p-5
                "
              >
                <p
                  className="
                    whitespace-pre-line
                    text-[15px]
                    leading-7
                    text-text
                  "
                >
                  Hoje não precisa ser perfeito.
                  {"\n\n"}
                  Só precisa acontecer.
                  {"\n\n"}
                  Continue construindo sua rotina, um dia de cada vez.
                </p>

                <div className="mt-6 text-sm font-medium text-accent">— Theo</div>
              </div>

              {/* Ação */}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLetterOpen(false)}
                  className="
                    rounded-lg bg-accent
                    px-4 py-2
                    text-sm font-semibold
                    text-[#202124]
                    transition-colors
                    hover:bg-accent-bright
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-accent/70
                  "
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAIS
      ====================================================== */}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />

      <SubscriptionModal open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} />

      {/* =====================================================
          CRONÔMETRO
      ====================================================== */}

      <TimerWidget />

      {/* =====================================================
          TUTORIAL
      ====================================================== */}

      <CoachTour {...shellTour} />

      {/* =====================================================
          ANIMAÇÕES
      ====================================================== */}

      <style>{`
        @keyframes navigationProgress {
          0% {
            transform: translateX(-100%);
          }

          50% {
            transform: translateX(180%);
          }

          100% {
            transform: translateX(320%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        @media (max-width: 900px) {
          aside {
            width: 220px;
          }
        }

        @media (max-width: 700px) {
          aside {
            width: 76px;
            padding-left: 8px;
            padding-right: 8px;
          }

          aside [data-tour="mascote"] > div + div,
          aside nav span,
          aside nav > div,
          aside > div:last-child span,
          aside > div:last-child p,
          aside > div:last-child button span,
          aside > div:nth-last-child(2) {
            display: none;
          }

          aside nav a,
          aside nav > div {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }

          aside nav a svg,
          aside nav > div svg {
            margin: 0;
          }

          aside > div:last-child button {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }
        }
      `}</style>
    </>
  );
}

export default Layout;
