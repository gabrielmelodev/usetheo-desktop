import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { ChevronLeft, ChevronRight, X } from "lucide-react";

// =====================================================================
// COMO USAR
// =====================================================================
//
// 1. Marque os elementos que você quer explicar:
//
//      <button data-tour="criar-deck">Criar deck</button>
//
// 2. Declare os passos:
//
//      const tour = useCoachTour("decks-intro", [
//        {
//          target: '[data-tour="criar-deck"]',
//          title: "Crie seu primeiro deck",
//          description:
//            "Um deck agrupa os cards de um mesmo assunto.",
//        },
//      ]);
//
// 3. Renderize:
//
//      <CoachTour {...tour} />
//
// =====================================================================

// =====================================================================
// TIPOS
// =====================================================================

export interface TourStep {
  /** Seletor CSS do elemento a destacar. */
  target: string;

  /** Título do passo. */
  title: string;

  /** Texto explicativo. */
  description: string;

  /** Posição preferencial do balão. */
  placement?: "top" | "bottom" | "left" | "right";
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Placement = "top" | "bottom" | "left" | "right";

interface TooltipPosition {
  top: number;
  left: number;
  placement: Placement;
}

// =====================================================================
// STORAGE
// =====================================================================

function storageKey(tourId: string) {
  return `theo:tour:${tourId}:done`;
}

// =====================================================================
// HOOK
// =====================================================================

export function useCoachTour(
  tourId: string,
  steps: TourStep[],
  options?: {
    autoStart?: boolean;
  },
) {
  const autoStart = options?.autoStart ?? true;

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!autoStart || steps.length === 0) {
      return;
    }

    const alreadyDone = window.localStorage.getItem(storageKey(tourId)) === "1";

    if (alreadyDone) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoStart, steps.length, tourId]);

  const finish = useCallback(() => {
    setActive(false);

    window.localStorage.setItem(storageKey(tourId), "1");
  }, [tourId]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const restart = useCallback(() => {
    window.localStorage.removeItem(storageKey(tourId));

    setStepIndex(0);
    setActive(true);
  }, [tourId]);

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current >= steps.length - 1) {
        finish();
        return current;
      }

      return current + 1;
    });
  }, [finish, steps.length]);

  const previous = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  return {
    tourId,
    steps,
    active,
    stepIndex,
    setStepIndex,
    finish,
    skip,
    restart,
    next,
    previous,
  };
}

export type CoachTourController = ReturnType<typeof useCoachTour>;

// =====================================================================
// COMPONENTE VISUAL
// =====================================================================

export function CoachTour({
  steps,
  active,
  stepIndex,
  setStepIndex,
  finish,
  skip,
}: CoachTourController) {
  const [rect, setRect] = useState<Rect | null>(null);

  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  const [isVisible, setIsVisible] = useState(false);

  const [isChangingStep, setIsChangingStep] = useState(false);

  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const measureFrameRef = useRef<number | null>(null);

  const lastTargetRef = useRef<string | null>(null);

  const scrollTimeoutRef = useRef<number | null>(null);

  const step = steps[stepIndex];

  const isLast = stepIndex === steps.length - 1;

  const isFirst = stepIndex === 0;

  // ===================================================================
  // ANIMAÇÃO ENTRE PASSOS
  // ===================================================================

  useEffect(() => {
    if (!active || !step) {
      setIsVisible(false);
      setIsChangingStep(false);
      return;
    }

    setIsVisible(false);
    setIsChangingStep(true);

    const timeout = window.setTimeout(() => {
      setIsVisible(true);
      setIsChangingStep(false);
    }, 40);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active, stepIndex, step]);

  // ===================================================================
  // MEDIR ELEMENTO-ALVO
  // ===================================================================

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      setTooltipPosition(null);
      return;
    }

    let disposed = false;

    const updateRect = () => {
      if (disposed) {
        return;
      }

      const element = document.querySelector(step.target);

      if (!element) {
        setRect(null);
        return;
      }

      const box = element.getBoundingClientRect();

      setRect({
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      });
    };

    const measure = () => {
      if (measureFrameRef.current !== null) {
        cancelAnimationFrame(measureFrameRef.current);
      }

      measureFrameRef.current = requestAnimationFrame(() => {
        updateRect();

        measureFrameRef.current = null;
      });
    };

    const targetChanged = lastTargetRef.current !== step.target;

    if (targetChanged) {
      lastTargetRef.current = step.target;

      const element = document.querySelector(step.target);

      if (element instanceof HTMLElement) {
        element.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: "smooth",
        });

        if (scrollTimeoutRef.current !== null) {
          window.clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = window.setTimeout(() => {
          updateRect();
          measure();
        }, 450);
      }
    }

    updateRect();
    measure();

    window.addEventListener("resize", measure);

    window.addEventListener("scroll", measure, true);

    return () => {
      disposed = true;

      if (measureFrameRef.current !== null) {
        cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }

      window.removeEventListener("resize", measure);

      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  // ===================================================================
  // CALCULAR POSIÇÃO DO BALÃO
  //
  // Aqui está a principal correção:
  //
  // - mede o balão de verdade;
  // - verifica espaço disponível;
  // - troca a posição se necessário;
  // - limita dentro da viewport;
  // - nunca deixa o conteúdo cortado.
  // ===================================================================

  useLayoutEffect(() => {
    if (!active || !step || !rect) {
      setTooltipPosition(null);
      return;
    }

    const tooltip = tooltipRef.current;

    if (!tooltip) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;

    const gap = 16;
    const edge = 16;

    const available = {
      top: rect.top,
      bottom: viewportHeight - (rect.top + rect.height),
      left: rect.left,
      right: viewportWidth - (rect.left + rect.width),
    };

    const preferred = step.placement ?? "bottom";

    let placement: Placement = preferred;

    // ---------------------------------------------------------------
    // Verifica se existe espaço suficiente na direção escolhida.
    // ---------------------------------------------------------------

    const fits = (candidate: Placement) => {
      switch (candidate) {
        case "top":
          return available.top >= tooltipHeight + gap;

        case "bottom":
          return available.bottom >= tooltipHeight + gap;

        case "left":
          return available.left >= tooltipWidth + gap;

        case "right":
          return available.right >= tooltipWidth + gap;

        default:
          return true;
      }
    };

    // ---------------------------------------------------------------
    // Se não couber, tenta a direção oposta.
    // ---------------------------------------------------------------

    if (!fits(placement)) {
      const opposites: Record<Placement, Placement> = {
        top: "bottom",
        bottom: "top",
        left: "right",
        right: "left",
      };

      const opposite = opposites[placement];

      if (fits(opposite)) {
        placement = opposite;
      } else {
        // -----------------------------------------------------------
        // Se nenhuma das duas couber, escolhe a direção com mais
        // espaço disponível.
        // -----------------------------------------------------------

        if (preferred === "top" || preferred === "bottom") {
          placement = available.bottom >= available.top ? "bottom" : "top";
        } else {
          placement = available.right >= available.left ? "right" : "left";
        }
      }
    }

    let top = 0;
    let left = 0;

    // ---------------------------------------------------------------
    // POSICIONAMENTO INICIAL
    // ---------------------------------------------------------------

    switch (placement) {
      case "top":
        top = rect.top - tooltipHeight - gap;

        left = rect.left + rect.width / 2 - tooltipWidth / 2;

        break;

      case "bottom":
        top = rect.top + rect.height + gap;

        left = rect.left + rect.width / 2 - tooltipWidth / 2;

        break;

      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;

        left = rect.left - tooltipWidth - gap;

        break;

      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;

        left = rect.left + rect.width + gap;

        break;
    }

    // ---------------------------------------------------------------
    // CORREÇÃO HORIZONTAL
    //
    // Mesmo quando o balão está em cima/baixo, centralizamos dentro
    // da viewport caso o alvo esteja perto de uma borda.
    // ---------------------------------------------------------------

    left = Math.max(edge, Math.min(left, viewportWidth - tooltipWidth - edge));

    // ---------------------------------------------------------------
    // CORREÇÃO VERTICAL
    // ---------------------------------------------------------------

    top = Math.max(edge, Math.min(top, viewportHeight - tooltipHeight - edge));

    setTooltipPosition({
      top,
      left,
      placement,
    });
  }, [active, rect, step, stepIndex, isVisible]);

  // ===================================================================
  // NOVA MEDIÇÃO QUANDO O BALÃO FICA VISÍVEL
  // ===================================================================

  useLayoutEffect(() => {
    if (!active || !isVisible) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (!tooltipRef.current || !rect || !step) {
        return;
      }

      const tooltip = tooltipRef.current;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;

      const edge = 16;
      const gap = 16;

      const preferred = step.placement ?? "bottom";

      const available = {
        top: rect.top,
        bottom: viewportHeight - (rect.top + rect.height),
        left: rect.left,
        right: viewportWidth - (rect.left + rect.width),
      };

      const fits = (placement: Placement) => {
        switch (placement) {
          case "top":
            return available.top >= tooltipHeight + gap;

          case "bottom":
            return available.bottom >= tooltipHeight + gap;

          case "left":
            return available.left >= tooltipWidth + gap;

          case "right":
            return available.right >= tooltipWidth + gap;

          default:
            return true;
        }
      };

      let placement: Placement = preferred;

      if (!fits(placement)) {
        const fallbackOrder: Placement[] = [
          preferred === "bottom"
            ? "top"
            : preferred === "top"
              ? "bottom"
              : preferred === "right"
                ? "left"
                : "right",

          "bottom",
          "top",
          "right",
          "left",
        ];

        const valid = fallbackOrder.find(fits);

        if (valid) {
          placement = valid;
        }
      }

      let top = 0;
      let left = 0;

      switch (placement) {
        case "top":
          top = rect.top - tooltipHeight - gap;

          left = rect.left + rect.width / 2 - tooltipWidth / 2;

          break;

        case "bottom":
          top = rect.top + rect.height + gap;

          left = rect.left + rect.width / 2 - tooltipWidth / 2;

          break;

        case "left":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;

          left = rect.left - tooltipWidth - gap;

          break;

        case "right":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;

          left = rect.left + rect.width + gap;

          break;
      }

      left = Math.max(edge, Math.min(left, viewportWidth - tooltipWidth - edge));

      top = Math.max(edge, Math.min(top, viewportHeight - tooltipHeight - edge));

      setTooltipPosition({
        top,
        left,
        placement,
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [active, isVisible, rect, step, stepIndex]);

  // ===================================================================
  // TECLADO
  // ===================================================================

  useEffect(() => {
    if (!active) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();

        if (isLast) {
          finish();
        } else {
          setStepIndex((current) => current + 1);
        }

        return;
      }

      if (event.key === "ArrowLeft" && !isFirst) {
        event.preventDefault();

        setStepIndex((current) => Math.max(0, current - 1));
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, finish, isFirst, isLast, setStepIndex, skip]);

  // ===================================================================
  // TEXTO DO POSICIONAMENTO
  // ===================================================================

  const currentPlacement = tooltipPosition?.placement ?? step?.placement ?? "bottom";

  const tooltipArrowClass = useMemo(() => {
    switch (currentPlacement) {
      case "top":
        return "bottom-[-6px] left-1/2 -translate-x-1/2 rotate-45";

      case "bottom":
        return "top-[-6px] left-1/2 -translate-x-1/2 rotate-45";

      case "left":
        return "right-[-6px] top-1/2 -translate-y-1/2 rotate-45";

      case "right":
        return "left-[-6px] top-1/2 -translate-y-1/2 rotate-45";

      default:
        return "top-[-6px] left-1/2 -translate-x-1/2 rotate-45";
    }
  }, [currentPlacement]);

  // ===================================================================
  // NÃO RENDERIZAR
  // ===================================================================

  if (!active || !step) {
    return null;
  }

  // ===================================================================
  // RENDER
  // ===================================================================

  return createPortal(
    <>
      <style>
        {`
          @keyframes theo-tour-backdrop-in {
            from {
              opacity: 0;
            }

            to {
              opacity: 1;
            }
          }

          @keyframes theo-tour-tooltip-in {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.96);
            }

            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes theo-tour-tooltip-out {
            from {
              opacity: 1;
            }

            to {
              opacity: 0;
            }
          }

          @keyframes theo-tour-highlight-pulse {
            0%,
            100% {
              opacity: 0.72;
            }

            50% {
              opacity: 1;
            }
          }

          @keyframes theo-tour-dot-pulse {
            0%,
            100% {
              transform: scale(1);
              opacity: 1;
            }

            50% {
              transform: scale(1.12);
              opacity: 0.78;
            }
          }

          .theo-tour-backdrop {
            animation:
              theo-tour-backdrop-in
              180ms
              ease-out
              both;
          }

          .theo-tour-tooltip-enter {
            animation:
              theo-tour-tooltip-in
              220ms
              cubic-bezier(.2,.8,.2,1)
              both;
          }

          .theo-tour-tooltip-changing {
            animation:
              theo-tour-tooltip-out
              100ms
              ease-in
              both;
          }

          .theo-tour-highlight {
            animation:
              theo-tour-highlight-pulse
              2s
              ease-in-out
              infinite;
          }

          .theo-tour-current-dot {
            animation:
              theo-tour-dot-pulse
              1.8s
              ease-in-out
              infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .theo-tour-backdrop,
            .theo-tour-tooltip-enter,
            .theo-tour-tooltip-changing,
            .theo-tour-highlight,
            .theo-tour-current-dot {
              animation: none !important;
            }
          }

          @media (max-width: 640px) {
            .theo-tour-tooltip {
              width: min(
                340px,
                calc(100vw - 24px)
              ) !important;
            }
          }
        `}
      </style>

      {/* ============================================================
          CAMADA DO TUTORIAL
      ============================================================ */}

      <div
        className="fixed inset-0 z-[200]"
        role="dialog"
        aria-modal="true"
        aria-label={`Tutorial: ${step.title}`}
      >
        {/* ==========================================================
            FUNDO ESCURECIDO
        ========================================================== */}

        <div
          className="theo-tour-backdrop pointer-events-none absolute inset-0"
          style={
            rect
              ? {
                  boxShadow: "0 0 0 9999px rgba(5, 6, 4, 0.74)",

                  top: rect.top - 7,

                  left: rect.left - 7,

                  width: rect.width + 14,

                  height: rect.height + 14,

                  position: "absolute",

                  borderRadius: 16,

                  border: "2px solid rgba(167, 201, 87, 0.82)",

                  background: "transparent",
                }
              : {
                  boxShadow: "0 0 0 9999px rgba(5, 6, 4, 0.74)",
                }
          }
        />

        {/* ==========================================================
            BRILHO DO ELEMENTO DESTACADO
        ========================================================== */}

        {rect && (
          <div
            className="theo-tour-highlight pointer-events-none fixed rounded-2xl border border-accent/50"
            style={{
              top: rect.top - 10,
              left: rect.left - 10,
              width: rect.width + 20,
              height: rect.height + 20,

              boxShadow: "0 0 0 1px rgba(167, 201, 87, 0.16), 0 0 24px rgba(167, 201, 87, 0.18)",
            }}
          />
        )}

        {/* ==========================================================
            BLOQUEIA CLIQUES NO FUNDO
        ========================================================== */}

        <div
          className="absolute inset-0"
          onClick={(event) => {
            event.stopPropagation();
          }}
        />

        {/* ==========================================================
            BALÃO
        ========================================================== */}

        <div
          ref={tooltipRef}
          key={`${step.target}-${stepIndex}`}
          className={[
            "theo-tour-tooltip",
            "fixed z-[210]",
            "w-[min(340px,calc(100vw-32px))]",
            "max-h-[calc(100vh-32px)]",
            "overflow-y-auto",
            "rounded-2xl",
            "border border-white/10",
            "bg-ink-soft",
            "p-4",
            "shadow-[0_25px_70px_rgba(0,0,0,.55)]",
            "transition-[top,left,opacity] duration-200 ease-out",
            isChangingStep
              ? "theo-tour-tooltip-changing"
              : isVisible
                ? "theo-tour-tooltip-enter"
                : "opacity-0",
          ].join(" ")}
          style={
            tooltipPosition
              ? {
                  top: tooltipPosition.top,
                  left: tooltipPosition.left,

                  /*
                   * IMPORTANTE:
                   * não usamos transform aqui.
                   *
                   * Antes o transform era usado para centralizar
                   * o tooltip, mas isso podia fazer o balão sair
                   * da viewport.
                   *
                   * Agora top/left já são calculados exatamente.
                   */
                  transform: "none",
                }
              : {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }
          }
        >
          {/* ========================================================
              SETA DO BALÃO
          ======================================================== */}

          <span
            aria-hidden="true"
            className={[
              "pointer-events-none absolute",
              "h-3 w-3",
              "border-l border-t border-white/10",
              "bg-ink-soft",
              tooltipArrowClass,
            ].join(" ")}
          />

          {/* ========================================================
              CABEÇALHO
          ======================================================== */}

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="font-display text-sm font-semibold leading-5 text-text">
                {step.title}
              </h4>

              <p className="mt-1.5 break-words text-xs leading-5 text-text-muted">
                {step.description}
              </p>
            </div>

            {/* ======================================================
                FECHAR
            ====================================================== */}

            <button
              type="button"
              onClick={skip}
              aria-label="Pular tutorial"
              className={[
                "flex h-7 w-7 shrink-0",
                "items-center justify-center",
                "rounded-lg",
                "text-text-faint",
                "transition-all duration-150",
                "hover:bg-white/10",
                "hover:text-text",
                "active:scale-90",
              ].join(" ")}
            >
              <X size={14} />
            </button>
          </div>

          {/* ========================================================
              RODAPÉ / NAVEGAÇÃO
          ======================================================== */}

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* ======================================================
                INDICADORES
            ====================================================== */}

            <div
              className="flex min-w-0 max-w-[45%] items-center gap-1 overflow-hidden"
              aria-label={`Passo ${stepIndex + 1} de ${steps.length}`}
            >
              {steps.map((_, index) => {
                const isCurrent = index === stepIndex;

                const isCompleted = index < stepIndex;

                return (
                  <span
                    key={index}
                    className={[
                      "block shrink-0 rounded-full",
                      "transition-all duration-300",

                      isCurrent
                        ? "theo-tour-current-dot h-1.5 w-5 bg-accent"
                        : isCompleted
                          ? "h-1.5 w-2 bg-accent/60"
                          : "h-1.5 w-1.5 bg-white/15",
                    ].join(" ")}
                  />
                );
              })}
            </div>

            {/* ======================================================
                BOTÕES
            ====================================================== */}

            <div className="flex shrink-0 items-center gap-1.5">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => {
                    setStepIndex((current) => Math.max(0, current - 1));
                  }}
                  className={[
                    "flex h-8 w-8",
                    "items-center justify-center",
                    "rounded-lg",
                    "text-text-muted",
                    "transition-all duration-150",
                    "hover:bg-white/10",
                    "hover:text-text",
                    "active:scale-90",
                  ].join(" ")}
                  aria-label="Passo anterior"
                >
                  <ChevronLeft size={15} />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isLast) {
                    finish();
                    return;
                  }

                  setStepIndex((current) => current + 1);
                }}
                className={[
                  "flex h-8",
                  "items-center gap-1",
                  "rounded-lg",
                  "bg-accent",
                  "px-3",
                  "text-[11px]",
                  "font-semibold",
                  "text-ink",
                  "transition-all duration-150",
                  "hover:bg-accent-bright",
                  "active:scale-95",
                ].join(" ")}
              >
                {isLast ? "Concluir" : "Próximo"}

                {!isLast && <ChevronRight size={13} />}
              </button>
            </div>
          </div>

          {/* ========================================================
              ATALHOS
          ======================================================== */}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-text-faint">
            <span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">←</kbd>{" "}
              <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">→</kbd> navegar
            </span>

            <span className="text-white/10">•</span>

            <span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5">Esc</kbd> sair
            </span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
