import {
  CalendarClock,
  Computer,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  LibraryBig,
  LogIn,
  LogOut,
  NotebookIcon,
  NotebookPen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";

import { listCards } from "../lib/api";

import { useSyncStatus } from "../lib/useSyncStatus";

import Theo, { type TheoState } from "./TheoState";

import LoginModal from "./LoginModal";

import SubscriptionModal from "./SubscriptionModal";

import TimerWidget from "./TimerWidget";

import { Tooltip } from "./ui";

import { CoachTour, useCoachTour, type TourStep } from "./onboarding/CoachTour";

// =====================================================
// TUTORIAL DA NAVEGAÇÃO
// =====================================================
//
// Primeiro tour que a pessoa vê no app inteiro — por isso fica aqui,
// na casca que envolve todas as páginas, em vez de espalhado em cada
// uma. Os `data-tour="..."` correspondentes estão marcados nos
// elementos abaixo, no JSX da sidebar.

const shellTourSteps: TourStep[] = [
  {
    target: '[data-tour="mascote"]',
    title: "Esse é o Theo",
    description:
      "Ele muda de expressão conforme onde você está no app — é um jeito rápido de saber se você está estudando, revisando ou só navegando.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-decks"]',
    title: "Seus decks",
    description: "Aqui ficam os grupos de cards que você cria para estudar cada assunto.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-organizar"]',
    title: "Planejamento",
    description: "Organize sua rotina de estudo — o que revisar e quando.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-estudar"]',
    title: "Estudar",
    description: "Quando você tiver cards prontos, é aqui que a revisão espaçada acontece.",
    placement: "right",
  },
  {
    target: '[data-tour="ajuda"]',
    title: "Precisa rever isso depois?",
    description: "Clique aqui a qualquer momento para assistir a este tutorial de novo.",
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
  {
    to: "/stats",
    label: "Theo AI",
    icon: Computer,
  },
  {
    to: "/erro",
    label: "Caderno de Erros",
    icon: NotebookIcon,
  },
  {
    to: "/notes",
    label: "Theo Notes",
    icon: NotebookPen,
  },
];

// =====================================================
// ESTADO DO THEO
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

  if (pathname.startsWith("/notes")) {
    return "focused";
  }

  if (pathname.startsWith("/admin")) {
    return "alert";
  }

  return "idle";
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

  // Liga a sincronização em tempo real (SSE) + periódica (polling a cada
  // 30s) para quem tem conta na nuvem. É isso que garante que uma
  // exclusão (feita aqui ou em outro dispositivo) chegue no IndexedDB
  // local sozinha, sem esperar o próximo login. `status` alimenta o
  // mesmo indicador giratório usado pelo botão "Sincronizar agora".
  const { status: realtimeSyncStatus } = useSyncStatus(!!user);

  const autoSyncing = realtimeSyncStatus === "syncing";

  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  const [loginOpen, setLoginOpen] = useState(false);

  const [hasStudyContent, setHasStudyContent] = useState(false);

  const [checkingStudyContent, setCheckingStudyContent] = useState(true);

  // ===================================================
  // LOADING DE NAVEGAÇÃO
  // ===================================================

  const [navigating, setNavigating] = useState(false);

  const navigationStartedAt = useRef<number | null>(null);

  // ===================================================
  // ESTADO DO THEO
  // ===================================================

  const theoState = useMemo(() => getTheoState(location.pathname), [location.pathname]);

  // ===================================================
  // TUTORIAL DA NAVEGAÇÃO (primeira visita ao app)
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
        label: "Admin",
        icon: ShieldCheck,
      },
    ];
  }, [user?.role]);

  // ===================================================
  // FINALIZAR LOADING QUANDO A ROTA MUDA
  // ===================================================
  //
  // O loading NÃO possui mais um timeout fixo de 350ms.
  //
  // Ele começa no clique e só é encerrado depois que
  // o React Router efetivamente muda a rota.
  //
  // Existe apenas um tempo mínimo visual de 180ms para
  // evitar uma piscada quando a navegação é instantânea.
  //
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
      const cards = await listCards();

      const hasCards = Array.isArray(cards) && cards.length > 0;

      setHasStudyContent(hasCards);
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
        const cards = await listCards();

        if (cancelled) {
          return;
        }

        setHasStudyContent(Array.isArray(cards) && cards.length > 0);
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
  // SINCRONIZAÇÃO
  // ===================================================

  const handleSync = useCallback(async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);

    try {
      await sync();

      await checkStudyContent();
    } catch (error) {
      console.error("[Theo] Erro ao sincronizar:", error);
    } finally {
      setSyncing(false);
    }
  }, [sync, syncing, checkStudyContent]);

  // ===================================================
  // RENDER
  // =====================================================

  return (
    <>
      <div
        className="
          relative
          flex
          h-full
          min-h-0
          w-full
          overflow-hidden
          bg-ink
          text-text
        "
      >
        {/* =================================================
            FUNDO
        ================================================== */}

        <div
          className="
            pointer-events-none
            absolute
            inset-0
            overflow-hidden
          "
          aria-hidden="true"
        >
          {/* Glow superior esquerdo */}

          <div
            className="
              absolute
              -left-32
              top-20
              h-96
              w-96
              rounded-full
              bg-[#556B2F]/[0.035]
              blur-[120px]
              animate-[sidebarGlow_9s_ease-in-out_infinite]
            "
          />

          {/* Glow inferior direito */}

          <div
            className="
              absolute
              -bottom-44
              -right-28
              h-[420px]
              w-[420px]
              rounded-full
              bg-[#8FA66B]/[0.025]
              blur-[120px]
              animate-[sidebarGlow_12s_ease-in-out_infinite_reverse]
            "
          />

          {/* Grid */}

          <div
            className="
              absolute
              inset-0
              opacity-[0.014]
              [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)]
              [background-size:72px_72px]
              [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]
            "
          />
        </div>

        {/* =================================================
            SIDEBAR
        ================================================== */}

        <aside
          className="
            relative
            z-20
            flex
            w-64
            shrink-0
            flex-col
            border-r
            border-white/[0.055]
            bg-ink-soft/75
            px-3.5
            py-4
            backdrop-blur-2xl
          "
        >
          {/* Linha superior */}

          <div
            className="
              pointer-events-none
              absolute
              left-1/2
              top-0
              h-px
              w-28
              -translate-x-1/2
              bg-gradient-to-r
              from-transparent
              via-[#A7C957]/35
              to-transparent
            "
          />

          {/* =================================================
              THEO
          ================================================== */}

          <div
            data-tour="mascote"
            className="
              mb-5
              flex
              flex-col
              items-center
            "
          >
            {/* Avatar */}

            <div
              className="
                relative
                flex
                items-center
                justify-center
              "
            >
              {/* Aura */}

              <div
                className="
                  pointer-events-none
                  absolute
                  h-36
                  w-36
                  rounded-full
                  bg-[#556B2F]/[0.075]
                  blur-[55px]
                  animate-[theoAura_5s_ease-in-out_infinite]
                "
              />

              {/* Anel */}

              <div
                className="
                  pointer-events-none
                  absolute
                  h-32
                  w-32
                  rounded-full
                  border
                  border-[#A7C957]/[0.055]
                  animate-[theoRing_14s_linear_infinite]
                "
              />

              <Theo
                state={theoState}
                className="
                  relative
                  z-10
                  h-28
                  w-28
                  transition-transform
                  duration-500
                  hover:scale-[1.04]
                "
              />
            </div>

            {/* Identidade */}

            <div className="-mt-1 text-center">
              <p
                className="
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.28em]
                  text-[#A7C957]
                "
              >
                UNIDADE THEO
              </p>

              <p
                className="
                  mt-1
                  text-[8px]
                  uppercase
                  tracking-[0.16em]
                  text-zinc-600
                "
              >
                Preparação & Estratégia
              </p>
            </div>

            {/* Estado */}

            <div
              className="
                mt-2.5
                inline-flex
                items-center
                gap-1.5
                rounded-full
                border
                border-[#8FA66B]/10
                bg-[#556B2F]/[0.04]
                px-2.5
                py-1
              "
            >
              <span
                className="
                  relative
                  flex
                  h-1.5
                  w-1.5
                "
              >
                <span
                  className="
                    absolute
                    inline-flex
                    h-full
                    w-full
                    animate-ping
                    rounded-full
                    bg-[#A7C957]/25
                  "
                />

                <span
                  className="
                    relative
                    inline-flex
                    h-1.5
                    w-1.5
                    rounded-full
                    bg-[#8FA66B]
                    shadow-[0_0_7px_rgba(143,166,107,0.7)]
                  "
                />
              </span>

              <span
                className="
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-zinc-500
                "
              >
                {theoState}
              </span>
            </div>
          </div>

          {/* =================================================
              MENU
          ================================================== */}

          <nav
            className="
              flex
              flex-1
              flex-col
              gap-0.5
            "
            aria-label="Navegação principal"
          >
            {/* Título */}

            <div className="mb-2 px-3">
              <span
                className="
                  text-[8px]
                  font-semibold
                  uppercase
                  tracking-[0.2em]
                  text-zinc-700
                "
              >
                Workspace
              </span>
            </div>

            {/* Itens */}

            {navItems.map(({ to, label, icon: Icon, end }) => {
              const isStudy = to === "/study";

              const studyDisabled = isStudy && !checkingStudyContent && !hasStudyContent;

              // =========================================
              // ESTUDAR BLOQUEADO
              // =========================================

              if (studyDisabled) {
                return (
                  <Tooltip
                    key={to}
                    label="Adicione cards a um deck para começar a estudar"
                    placement="bottom"
                  >
                    <div
                      className="
                          relative
                          flex
                          w-full
                          cursor-not-allowed
                          items-center
                          gap-3
                          rounded-xl
                          px-3
                          py-2.5
                          text-sm
                          font-medium
                          text-zinc-700
                          opacity-45
                        "
                    >
                      <Icon size={18} strokeWidth={1.7} />

                      <span>{label}</span>

                      <span
                        className="
                            ml-auto
                            rounded-md
                            border
                            border-white/[0.04]
                            bg-white/[0.02]
                            px-1.5
                            py-0.5
                            text-[7px]
                            font-medium
                            uppercase
                            tracking-wide
                            text-zinc-700
                          "
                      >
                        vazio
                      </span>
                    </div>
                  </Tooltip>
                );
              }

              // =========================================
              // ITEM NORMAL
              // =========================================

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
                  className={({ isActive }) =>
                    `
                        group
                        relative
                        flex
                        w-full
                        items-center
                        gap-3
                        rounded-xl
                        px-3
                        py-2.5
                        text-sm
                        font-medium
                        transition-all
                        duration-200
                        ${
                          isActive
                            ? `
                              bg-[#556B2F]/[0.15]
                              text-[#B7CC82]
                              shadow-[inset_0_0_0_1px_rgba(167,201,87,0.04)]
                            `
                            : `
                              text-zinc-500
                              hover:bg-white/[0.035]
                              hover:text-zinc-200
                            `
                        }
                      `
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Indicador lateral */}

                      <span
                        className={`
                            absolute
                            left-0
                            h-6
                            w-[2px]
                            rounded-r-full
                            bg-[#A7C957]
                            transition-all
                            duration-200
                            ${
                              isActive
                                ? `
                                  opacity-100
                                  shadow-[0_0_9px_rgba(167,201,87,0.4)]
                                `
                                : "opacity-0"
                            }
                          `}
                      />

                      {/* Glow */}

                      {isActive && (
                        <span
                          className="
                              pointer-events-none
                              absolute
                              inset-0
                              rounded-xl
                              bg-gradient-to-r
                              from-[#A7C957]/[0.02]
                              to-transparent
                            "
                        />
                      )}

                      {/* Ícone */}

                      <Icon
                        size={18}
                        strokeWidth={1.7}
                        className="
                            relative
                            z-10
                            shrink-0
                            transition-transform
                            duration-200
                            group-hover:scale-105
                          "
                      />

                      {/* Texto */}

                      <span
                        className="
                            relative
                            z-10
                            truncate
                          "
                      >
                        {label}
                      </span>

                      {/* Ponto ativo */}

                      {isActive && (
                        <span
                          className="
                              relative
                              z-10
                              ml-auto
                              h-1.5
                              w-1.5
                              shrink-0
                              rounded-full
                              bg-[#A7C957]
                              shadow-[0_0_8px_rgba(167,201,87,0.75)]
                              animate-[activeDot_2s_ease-in-out_infinite]
                            "
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
                relative
                mb-3
                overflow-hidden
                rounded-xl
                border
                border-[#8FA66B]/[0.07]
                bg-[#556B2F]/[0.045]
                px-2.5
                py-2
              "
            >
              {/* Glow */}

              <div
                className="
                  pointer-events-none
                  absolute
                  -right-6
                  -top-6
                  h-16
                  w-16
                  rounded-full
                  bg-[#A7C957]/[0.045]
                  blur-2xl
                "
              />

              <div className="relative flex items-center gap-2">
                {/* Informações */}

                <div className="min-w-0 flex-1">
                  <p
                    className="
                      text-[7px]
                      font-medium
                      uppercase
                      tracking-[0.14em]
                      text-zinc-600
                    "
                  >
                    Plano
                  </p>

                  <p
                    className="
                      mt-0.5
                      truncate
                      text-[11px]
                      font-semibold
                      text-[#B7CC82]
                    "
                  >
                    Gratuito
                  </p>
                </div>

                {/* Upgrade */}

                <button
                  type="button"
                  onClick={() => setSubscriptionOpen(true)}
                  className="
                    shrink-0
                    rounded-md
                    bg-[#556B2F]
                    px-2
                    py-1
                    text-[9px]
                    font-semibold
                    text-white
                    transition-all
                    duration-200
                    hover:bg-[#6B8E23]
                    hover:shadow-[0_4px_14px_rgba(85,107,47,0.2)]
                    active:scale-95
                  "
                >
                  Upgrade
                </button>
              </div>
            </div>
          )}

          {/* =================================================
              PERFIL / LOGIN
          ================================================== */}

          <div
            className="
              mt-auto
              border-t
              border-white/[0.055]
              pt-3
            "
          >
            {user ? (
              <>
                {/* USUÁRIO */}

                <div
                  className="
                    mb-1.5
                    rounded-xl
                    px-2
                    py-2
                  "
                >
                  <div className="flex items-center gap-2.5">
                    {/* Avatar */}

                    <div
                      className="
                        flex
                        h-8
                        w-8
                        shrink-0
                        items-center
                        justify-center
                        rounded-lg
                        border
                        border-[#A7C957]/10
                        bg-[#556B2F]/10
                        text-xs
                        font-semibold
                        uppercase
                        text-[#B7CC82]
                      "
                    >
                      {user.first_name?.slice(0, 1)?.toUpperCase() ?? "T"}
                    </div>

                    {/* Nome */}

                    <div className="min-w-0">
                      <p
                        className="
                          truncate
                          text-sm
                          font-medium
                          text-text
                        "
                      >
                        {user.first_name}
                      </p>

                      <p
                        className="
                          truncate
                          text-[9px]
                          text-text-faint
                        "
                      >
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SINCRONIZAR */}

                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing || autoSyncing}
                  aria-label={syncing || autoSyncing ? "Sincronizando" : "Sincronizar agora"}
                  className="
                    group
                    flex
                    w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3
                    py-2.5
                    text-sm
                    font-medium
                    text-text-muted
                    transition-all
                    duration-200
                    hover:bg-white/[0.035]
                    hover:text-white
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  <RefreshCw
                    size={17}
                    strokeWidth={1.7}
                    className={
                      syncing || autoSyncing
                        ? `
                          animate-spin
                          text-[#A7C957]
                        `
                        : `
                          transition-transform
                          duration-200
                          group-hover:rotate-90
                        `
                    }
                  />

                  <span>{syncing || autoSyncing ? "Sincronizando..." : "Sincronizar agora"}</span>

                  {!syncing && !autoSyncing && (
                    <span
                      className="
                        ml-auto
                        h-1.5
                        w-1.5
                        rounded-full
                        bg-[#8FA66B]/60
                        shadow-[0_0_7px_rgba(143,166,107,0.4)]
                      "
                    />
                  )}
                </button>

                {/* SAIR */}

                <button
                  type="button"
                  onClick={() => void logout()}
                  className="
                    group
                    flex
                    w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3
                    py-2.5
                    text-sm
                    font-medium
                    text-text-muted
                    transition-all
                    duration-200
                    hover:bg-white/[0.035]
                    hover:text-white
                  "
                >
                  <LogOut
                    size={17}
                    strokeWidth={1.7}
                    className="
                      transition-transform
                      duration-200
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
                    mb-1.5
                    rounded-xl
                    border
                    border-white/[0.035]
                    bg-white/[0.012]
                    px-3
                    py-2
                  "
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="
                        h-1.5
                        w-1.5
                        rounded-full
                        bg-zinc-600
                      "
                    />

                    <p
                      className="
                        text-sm
                        font-medium
                        text-text
                      "
                    >
                      Modo local
                    </p>
                  </div>

                  <p
                    className="
                      mt-0.5
                      pl-3.5
                      text-[9px]
                      leading-4
                      text-text-faint
                    "
                  >
                    Seus dados ficam neste dispositivo.
                  </p>
                </div>

                {/* ENTRAR */}

                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className="
                    group
                    flex
                    w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-3
                    py-2.5
                    text-sm
                    font-medium
                    text-text-muted
                    transition-all
                    duration-200
                    hover:bg-white/[0.035]
                    hover:text-white
                  "
                >
                  <LogIn
                    size={17}
                    strokeWidth={1.7}
                    className="
                      transition-transform
                      duration-200
                      group-hover:translate-x-0.5
                    "
                  />

                  <span>Entrar / Sincronizar</span>

                  <span
                    className="
                      ml-auto
                      h-1.5
                      w-1.5
                      rounded-full
                      bg-[#8FA66B]/50
                      shadow-[0_0_7px_rgba(143,166,107,0.25)]
                    "
                  />
                </button>
              </>
            )}

            {/* AJUDA / REABRIR TUTORIAL */}

            <button
              type="button"
              data-tour="ajuda"
              onClick={shellTour.restart}
              className="
                group
                mt-0.5
                flex
                w-full
                items-center
                gap-3
                rounded-xl
                px-3
                py-2.5
                text-sm
                font-medium
                text-text-muted
                transition-all
                duration-200
                hover:bg-white/[0.035]
                hover:text-white
              "
            >
              <HelpCircle
                size={17}
                strokeWidth={1.7}
                className="transition-transform duration-200 group-hover:scale-110"
              />

              <span>Ver tutorial</span>
            </button>
          </div>
        </aside>

        {/* =================================================
            CONTEÚDO
        ================================================== */}

        <main
          className="
    relative
    z-10
    min-h-0
    min-w-0
    flex-1
    overflow-y-auto
    overscroll-contain
  "
        >
          {navigating && (
            <div
              className="
        pointer-events-none
        absolute
        inset-0
        z-[80]
        flex
        items-start
        justify-center
        bg-ink/25
        pt-16
        backdrop-blur-[1px]
      "
              aria-live="polite"
              aria-label="Carregando página"
            >
              <div
                className="
          flex
          items-center
          gap-2.5
          rounded-full
          border
          border-white/[0.07]
          bg-ink-soft/90
          px-4
          py-2.5
          shadow-2xl
          backdrop-blur-xl
        "
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.8}
                  className="
            animate-spin
            text-[#A7C957]
          "
                />

                <span
                  className="
            text-xs
            font-medium
            text-text-muted
          "
                >
                  Carregando...
                </span>
              </div>
            </div>
          )}

          {isStatsPage ? (
            <div className="min-h-full w-full">
              <Outlet />
            </div>
          ) : (
            <div
              className="
        mx-auto
        w-full
        max-w-6xl
        min-h-full
        px-5
        py-7
        sm:px-8
        sm:py-9
      "
            >
              <Outlet />
            </div>
          )}
        </main>
      </div>

      {/* =====================================================
          MODAL LOGIN
      ====================================================== */}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* =====================================================
          MODAL ASSINATURA
      ====================================================== */}

      <SubscriptionModal open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} />

      {/* =====================================================
          CRONÔMETRO
      ====================================================== */}

      <TimerWidget />

      {/* =====================================================
          TUTORIAL DA NAVEGAÇÃO
      ====================================================== */}

      <CoachTour {...shellTour} />

      {/* =====================================================
          ANIMAÇÕES
      ====================================================== */}

      <style>{`
        /* =====================================================
           AURA DO THEO
        ===================================================== */

        @keyframes theoAura {
          0%, 100% {
            opacity: .5;
            transform: scale(.94);
          }

          50% {
            opacity: .85;
            transform: scale(1.06);
          }
        }

        /* =====================================================
           ANEL
        ===================================================== */

        @keyframes theoRing {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        /* =====================================================
           INDICADOR ATIVO
        ===================================================== */

        @keyframes activeDot {
          0%, 100% {
            opacity: .55;
            transform: scale(.85);
          }

          50% {
            opacity: 1;
            transform: scale(1.12);
          }
        }

        /* =====================================================
           GLOW DA SIDEBAR
        ===================================================== */

        @keyframes sidebarGlow {
          0%, 100% {
            transform:
              translate3d(0, 0, 0)
              scale(1);

            opacity: .6;
          }

          50% {
            transform:
              translate3d(15px, -10px, 0)
              scale(1.08);

            opacity: 1;
          }
        }

        /* =====================================================
           REDUZIR ANIMAÇÕES
        ===================================================== */

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* =====================================================
           TELAS MENORES
        ===================================================== */

        @media (max-width: 900px) {
          aside {
            width: 220px;
          }
        }
      `}</style>
    </>
  );
}
