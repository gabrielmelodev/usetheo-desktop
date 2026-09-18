import {
  Layers,
  RotateCcw,
  Maximize2,
  X,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Keyboard,
  Eye,
  Brain,
  Sparkles,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { createPortal } from "react-dom";

// =====================================================
// TIPOS
// =====================================================

export type CardType = "basic" | "cloze" | "multiple_choice" | "true_false";

export type Rating = 1 | 2 | 3 | 4;

interface StudyCardProps {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  remaining?: number;
  cardType: CardType;
  onRate?: (rating: Rating) => void;
}

type TextSize = "small" | "medium" | "large" | "very-large";

type TutorialStep = 0 | 1 | 2 | 3;

interface TutorialItem {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  hint: string;
}

// =====================================================
// LIMPEZA HTML
// =====================================================

function cleanHtml(value?: string): string {
  if (!value) return "";

  let result = String(value);

  result = result
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#123;/gi, "{")
    .replace(/&#125;/gi, "}")
    .replace(/&#x7b;/gi, "{")
    .replace(/&#x7d;/gi, "}")
    .replace(/&amp;/gi, "&");

  result = result.replace(
    /color\s*:\s*(white|#fff|#ffffff|rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi,
    "color:inherit",
  );

  result = result.replace(/background(?:-color)?\s*:\s*(white|#fff|#ffffff)/gi, "");

  return result.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "<br />").trim();
}

// =====================================================
// CLOZE
// =====================================================

const CLOZE_REGEX = /\{\{\s*c\d+\s*::\s*([\s\S]*?)(?:\s*::\s*([\s\S]*?))?\s*\}\}/gi;

function hasCloze(html: string): boolean {
  if (!html) return false;

  return /\{\{\s*c\d+\s*::[\s\S]*?\}\}/i.test(html);
}

function escapeAttribute(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =====================================================
// CLOZE — FRENTE
// =====================================================

function renderClozeQuestion(html: string): string {
  if (!html) return "";

  return html.replace(CLOZE_REGEX, (_match: string, _answer: string, hint?: string) => {
    const cleanHint = typeof hint === "string" ? hint.trim() : "";

    const displayText = cleanHint || "•••";

    return `
        <span
          class="cloze-hidden"
          title="${escapeAttribute(cleanHint)}"
          style="
            display:inline-flex;
            align-items:center;
            justify-content:center;
            vertical-align:baseline;
            min-width:80px;
            min-height:1.4em;
            margin:0 5px;
            padding:2px 12px;
            border-bottom:2px dotted currentColor;
            border-radius:6px;
            background:rgba(0,0,0,.05);
            font-weight:800;
            color:inherit;
            white-space:nowrap;
          "
        >
          ${displayText}
        </span>
      `;
  });
}

// =====================================================
// CLOZE — VERSO
// =====================================================

function renderClozeAnswer(html: string): string {
  if (!html) return "";

  return html.replace(CLOZE_REGEX, (_match: string, answer: string) => {
    return `
        <span
          class="cloze-answer"
          style="
            font-weight:800;
            color:inherit;
            text-decoration:underline;
            text-decoration-thickness:2px;
            text-decoration-color:currentColor;
            text-underline-offset:3px;
          "
        >
          ${answer}
        </span>
      `;
  });
}

// =====================================================
// TEXTO
// =====================================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenHtml(html: string, limit: number): string {
  const text = stripHtml(html);

  if (text.length <= limit) {
    return html;
  }

  return text.substring(0, limit).trim() + "…";
}

function getTextSize(html: string): TextSize {
  const length = stripHtml(html).length;

  if (length > 1500) return "very-large";
  if (length > 700) return "large";
  if (length > 300) return "medium";

  return "small";
}

// =====================================================
// TIPO DO CARD
// =====================================================

function getCardTypeLabel(cardType: CardType): string {
  switch (cardType) {
    case "basic":
      return "Básico";

    case "cloze":
      return "Cloze";

    case "multiple_choice":
      return "Múltipla escolha";

    case "true_false":
      return "Verdadeiro ou falso";

    default:
      return "Pergunta";
  }
}

// =====================================================
// AVALIAÇÕES
// =====================================================

const ratingItems: {
  rating: Rating;
  label: string;
  description: string;
}[] = [
  {
    rating: 1,
    label: "Errei",
    description: "Preciso revisar",
  },
  {
    rating: 2,
    label: "Difícil",
    description: "Quase consegui",
  },
  {
    rating: 3,
    label: "Bom",
    description: "Lembrei",
  },
  {
    rating: 4,
    label: "Fácil",
    description: "Dominei",
  },
];

// =====================================================
// COMPONENTE
// =====================================================

export function StudyCard({
  front,
  back,
  flipped,
  onFlip,
  remaining = 0,
  cardType,
  onRate,
}: StudyCardProps) {
  // ===================================================
  // ESTADOS
  // ===================================================

  const [showModal, setShowModal] = useState(false);

  const [showTutorial, setShowTutorial] = useState(false);

  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(0);

  const [ratingAnimation, setRatingAnimation] = useState<Rating | null>(null);

  const [isFlipping, setIsFlipping] = useState(false);

  const [previousFlipped, setPreviousFlipped] = useState(flipped);

  // ===================================================
  // CONTEÚDO
  // ===================================================

  const cleanedFront = useMemo(() => cleanHtml(front), [front]);

  const cleanedBack = useMemo(() => cleanHtml(back), [back]);

  const isClozeCard = useMemo(() => {
    return cardType === "cloze" || hasCloze(cleanedFront) || hasCloze(cleanedBack);
  }, [cardType, cleanedFront, cleanedBack]);

  const clozeSource = useMemo(() => {
    if (!isClozeCard) {
      return "";
    }

    if (hasCloze(cleanedFront)) {
      return cleanedFront;
    }

    if (hasCloze(cleanedBack)) {
      return cleanedBack;
    }

    return cleanedFront;
  }, [isClozeCard, cleanedFront, cleanedBack]);

  const question = useMemo(() => {
    if (isClozeCard) {
      return renderClozeQuestion(clozeSource);
    }

    return cleanedFront;
  }, [isClozeCard, clozeSource, cleanedFront]);

  const answer = useMemo(() => {
    if (isClozeCard) {
      return renderClozeAnswer(clozeSource);
    }

    return cleanedBack;
  }, [isClozeCard, clozeSource, cleanedBack]);

  // ===================================================
  // TAMANHO
  // ===================================================

  const questionSize = useMemo(() => getTextSize(question), [question]);

  const answerSize = useMemo(() => getTextSize(answer), [answer]);

  const previewQuestion = useMemo(
    () => (questionSize === "very-large" ? shortenHtml(question, 420) : question),
    [question, questionSize],
  );

  const previewAnswer = useMemo(
    () => (answerSize === "very-large" ? shortenHtml(answer, 500) : answer),
    [answer, answerSize],
  );

  const effectiveCardType: CardType = isClozeCard ? "cloze" : cardType;

  const cardTypeLabel = getCardTypeLabel(effectiveCardType);

  // ===================================================
  // TUTORIAL — ABERTURA
  // ===================================================

  useEffect(() => {
    const completed = localStorage.getItem("theo.study.tutorial.completed");

    if (!completed) {
      const timer = window.setTimeout(() => {
        setShowTutorial(true);
      }, 500);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, []);

  // ===================================================
  // ANIMAÇÃO DA CARTA
  // ===================================================

  useEffect(() => {
    if (previousFlipped !== flipped) {
      setIsFlipping(true);

      const timer = window.setTimeout(() => {
        setIsFlipping(false);
      }, 650);

      setPreviousFlipped(flipped);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [flipped, previousFlipped]);

  // ===================================================
  // MODAL
  // ===================================================

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  // ===================================================
  // TUTORIAL
  // ===================================================

  const completeTutorial = useCallback(() => {
    localStorage.setItem("theo.study.tutorial.completed", "true");

    setShowTutorial(false);
    setTutorialStep(0);
  }, []);

  const skipTutorial = useCallback(() => {
    localStorage.setItem("theo.study.tutorial.completed", "true");

    setShowTutorial(false);
    setTutorialStep(0);
  }, []);

  const openTutorial = useCallback(() => {
    setTutorialStep(0);
    setShowTutorial(true);
  }, []);

  // ===================================================
  // AVALIAÇÃO
  // ===================================================

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!onRate || !flipped) {
        return;
      }

      setRatingAnimation(rating);

      window.setTimeout(() => {
        onRate(rating);
      }, 220);

      window.setTimeout(() => {
        setRatingAnimation(null);
      }, 500);
    },
    [flipped, onRate],
  );

  // ===================================================
  // CLIQUE NA CARTA
  // ===================================================

  const handleCardClick = useCallback(() => {
    if (showTutorial || showModal || isFlipping) {
      return;
    }

    onFlip();
  }, [showTutorial, showModal, isFlipping, onFlip]);

  // ===================================================
  // TECLADO
  // ===================================================

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tag = target.tagName.toLowerCase();

      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    }

    function keyboard(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) {
        return;
      }

      // -----------------------------------------------
      // TUTORIAL
      // -----------------------------------------------

      if (showTutorial) {
        if (event.key === "Escape") {
          event.preventDefault();
          skipTutorial();
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();

          setTutorialStep((current) => (current < 3 ? ((current + 1) as TutorialStep) : current));

          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();

          setTutorialStep((current) => (current > 0 ? ((current - 1) as TutorialStep) : current));

          return;
        }

        if (event.key === "Enter" || event.code === "Space") {
          event.preventDefault();

          if (tutorialStep === 3) {
            completeTutorial();
          } else {
            setTutorialStep((tutorialStep + 1) as TutorialStep);
          }

          return;
        }

        return;
      }

      // -----------------------------------------------
      // MODAL
      // -----------------------------------------------

      if (showModal) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal();
        }

        return;
      }

      // -----------------------------------------------
      // ESPAÇO
      // -----------------------------------------------

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();

        if (!isFlipping) {
          onFlip();
        }

        return;
      }

      // -----------------------------------------------
      // 1–4
      // -----------------------------------------------

      if (!flipped || !onRate) {
        return;
      }

      const key = event.key;

      if (key === "1" || key === "2" || key === "3" || key === "4") {
        event.preventDefault();

        const rating = Number(key) as Rating;

        handleRate(rating);
      }
    }

    window.addEventListener("keydown", keyboard);

    return () => {
      window.removeEventListener("keydown", keyboard);
    };
  }, [
    showTutorial,
    tutorialStep,
    showModal,
    flipped,
    onRate,
    onFlip,
    isFlipping,
    handleRate,
    skipTutorial,
    completeTutorial,
    closeModal,
  ]);

  // ===================================================
  // TUTORIAL — CONTEÚDO
  // ===================================================

  const tutorialContent: TutorialItem[] = [
    {
      icon: <Eye size={28} strokeWidth={1.8} />,
      eyebrow: "PASSO 01",
      title: "Tente lembrar antes de virar",
      description:
        "Leia a pergunta e tente recuperar a resposta de memória. Não tenha pressa para revelar o verso.",
      hint: "O objetivo é lembrar sozinho, não apenas reconhecer a resposta.",
    },
    {
      icon: <RotateCcw size={28} strokeWidth={1.8} />,
      eyebrow: "PASSO 02",
      title: "Revele a resposta",
      description:
        "Quando terminar de pensar, clique na carta ou pressione Espaço para revelar o outro lado.",
      hint: "Espaço → virar a carta",
    },
    {
      icon: <Keyboard size={28} strokeWidth={1.8} />,
      eyebrow: "PASSO 03",
      title: "Diga como você se saiu",
      description:
        "Depois de conferir o verso, escolha a avaliação que representa o seu desempenho.",
      hint: "1 Errei · 2 Difícil · 3 Bom · 4 Fácil",
    },
    {
      icon: <Sparkles size={28} strokeWidth={1.8} />,
      eyebrow: "PASSO 04",
      title: "O Theo programa a próxima revisão",
      description:
        "Sua avaliação determina quando o conteúdo deverá voltar. Quanto melhor o domínio, maior tende a ser o intervalo.",
      hint: "Você só precisa estudar, lembrar e avaliar.",
    },
  ];

  const currentTutorial = tutorialContent[tutorialStep];

  // ===================================================
  // MODAL DE CONTEÚDO
  // RENDERIZADO NO BODY
  // ===================================================

  const contentModal =
    showModal && typeof document !== "undefined"
      ? createPortal(
          <div
            className="
              fixed
              inset-0
              z-[99999]
              flex
              items-center
              justify-center
              overflow-hidden
              bg-black/55
              px-6
              py-5
              backdrop-blur-md
              animate-in
              fade-in
              duration-200
            "
            onClick={closeModal}
          >
            <div
              className="
                relative
                m-0
                flex
                w-full
                max-w-4xl
                max-h-[88vh]
                flex-col
                overflow-hidden
                rounded-[28px]
                border
                border-black/[0.07]
                bg-white
                shadow-[0_30px_100px_rgba(0,0,0,.25)]
                animate-in
                zoom-in-95
                slide-in-from-bottom-3
                duration-300
              "
              onClick={(event) => event.stopPropagation()}
            >
              {/* HEADER */}
              <header
                className="
                  flex
                  shrink-0
                  items-center
                  justify-between
                  border-b
                  border-black/[0.06]
                  px-5
                  py-4
                  sm:px-7
                "
              >
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex
                      h-10
                      w-10
                      items-center
                      justify-center
                      rounded-xl
                      bg-accent/[0.09]
                      text-accent
                    "
                  >
                    {flipped ? <CheckCircle2 size={19} /> : <Brain size={19} />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2
                        className="
                          text-sm
                          font-bold
                          text-gray-950
                          sm:text-base
                        "
                      >
                        {flipped ? "Resposta completa" : "Pergunta completa"}
                      </h2>

                      <span
                        className="
                          hidden
                          rounded-full
                          bg-black/[0.045]
                          px-2
                          py-1
                          text-[9px]
                          font-medium
                          text-gray-500
                          sm:inline-flex
                        "
                      >
                        {cardTypeLabel}
                      </span>
                    </div>

                    <p
                      className="
                        mt-0.5
                        text-[10px]
                        text-gray-400
                      "
                    >
                      Conteúdo completo do card
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Fechar"
                  className="
                    flex
                    h-9
                    w-9
                    items-center
                    justify-center
                    rounded-xl
                    bg-black/[0.045]
                    text-gray-500
                    transition
                    hover:bg-black/[0.08]
                    hover:text-gray-900
                  "
                >
                  <X size={17} />
                </button>
              </header>

              {/* CONTEÚDO */}
              <div
                className="
                  min-h-0
                  flex-1
                  overflow-y-auto
                  px-5
                  py-7
                  sm:px-9
                  sm:py-9
                "
              >
                <div
                  className="
                    prose
                    mx-auto
                    max-w-3xl
                    text-base
                    leading-7
                    text-gray-950
                    prose-headings:font-bold
                    prose-p:my-3
                    prose-li:my-1
                    [&_img]:mx-auto
                    [&_img]:max-w-full
                    [&_img]:rounded-2xl
                    [&_table]:w-full
                    [&_table]:overflow-hidden
                    [&_table]:rounded-xl
                    [&_table]:border-collapse
                    [&_td]:border
                    [&_td]:border-gray-200
                    [&_td]:p-3
                    [&_th]:border
                    [&_th]:border-gray-200
                    [&_th]:bg-gray-50
                    [&_th]:p-3
                    [&_.cloze-hidden]:font-bold
                    [&_.cloze-answer]:font-bold
                  "
                  dangerouslySetInnerHTML={{
                    __html: flipped ? answer || "Sem resposta" : question || "Sem pergunta",
                  }}
                />
              </div>

              {/* FOOTER */}
              <footer
                className="
                  flex
                  shrink-0
                  items-center
                  justify-between
                  gap-3
                  border-t
                  border-black/[0.06]
                  bg-gray-50/60
                  px-5
                  py-3
                  sm:px-7
                "
              >
                <span
                  className="
                    hidden
                    text-[10px]
                    text-gray-400
                    sm:block
                  "
                >
                  Pressione Esc para fechar
                </span>

                <button
                  type="button"
                  onClick={closeModal}
                  className="
                    ml-auto
                    rounded-xl
                    bg-gray-950
                    px-4
                    py-2
                    text-xs
                    font-semibold
                    text-white
                    transition
                    hover:bg-gray-800
                    active:scale-[0.98]
                  "
                >
                  Fechar
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
      : null;

  // ===================================================
  // TUTORIAL
  // RENDERIZADO NO BODY
  // ===================================================

  const tutorialModal =
    showTutorial && typeof document !== "undefined"
      ? createPortal(
          <div
            className="
              fixed
              inset-0
              z-[100000]
              flex
              items-center
              justify-center
              overflow-hidden
              bg-gray-950/70
              px-6
              py-5
              backdrop-blur-lg
              animate-in
              fade-in
              duration-300
            "
            onClick={skipTutorial}
          >
            <div
              className="
                relative
                m-0
                w-full
                max-w-xl
                max-h-[calc(100vh-40px)]
                overflow-y-auto
                rounded-[30px]
                border
                border-white/10
                bg-white
                shadow-[0_35px_120px_rgba(0,0,0,.35)]
                animate-in
                zoom-in-95
                slide-in-from-bottom-4
                duration-500
              "
              onClick={(event) => event.stopPropagation()}
            >
              {/* HEADER */}
              <div
                className="
                  relative
                  overflow-hidden
                  bg-gray-950
                  px-6
                  pb-6
                  pt-6
                  text-white
                  sm:px-8
                  sm:pt-7
                "
              >
                <div
                  className="
                    pointer-events-none
                    absolute
                    -right-24
                    -top-24
                    h-64
                    w-64
                    rounded-full
                    bg-white/[0.035]
                  "
                />

                <div
                  className="
                    pointer-events-none
                    absolute
                    -bottom-28
                    -left-20
                    h-56
                    w-56
                    rounded-full
                    bg-accent/[0.10]
                    blur-3xl
                  "
                />

                <div
                  className="
                    relative
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                >
                  <div>
                    <div
                      className="
                        mb-3
                        inline-flex
                        items-center
                        gap-2
                        rounded-full
                        border
                        border-white/10
                        bg-white/[0.06]
                        px-3
                        py-1.5
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.14em]
                        text-white/60
                      "
                    >
                      <Sparkles size={12} />
                      Primeiros passos
                    </div>

                    <h2
                      className="
                        text-[23px]
                        font-bold
                        tracking-tight
                        sm:text-[25px]
                      "
                    >
                      Estude com o Theo
                    </h2>

                    <p
                      className="
                        mt-1.5
                        max-w-sm
                        text-xs
                        leading-5
                        text-white/45
                      "
                    >
                      Aprenda o fluxo de revisão em quatro passos simples.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={skipTutorial}
                    aria-label="Fechar tutorial"
                    className="
                      flex
                      h-9
                      w-9
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      text-white/45
                      transition
                      hover:bg-white/[0.07]
                      hover:text-white
                    "
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* PROGRESSO */}
                <div
                  className="
                    relative
                    mt-7
                    flex
                    gap-1.5
                  "
                >
                  {[0, 1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className="
                        relative
                        h-1
                        flex-1
                        overflow-hidden
                        rounded-full
                        bg-white/[0.12]
                      "
                    >
                      <div
                        className={`
                          absolute
                          inset-y-0
                          left-0
                          rounded-full
                          bg-white
                          transition-all
                          duration-500
                          ${step <= tutorialStep ? "w-full" : "w-0"}
                        `}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* CONTEÚDO */}
              <div className="px-6 py-7 sm:px-8">
                <div
                  key={tutorialStep}
                  className="
                    flex
                    min-h-[285px]
                    flex-col
                    items-center
                    justify-center
                    text-center
                    animate-in
                    fade-in
                    slide-in-from-right-3
                    duration-300
                  "
                >
                  {/* ÍCONE */}
                  <div
                    className="
                      relative
                      mb-5
                      flex
                      h-[68px]
                      w-[68px]
                      items-center
                      justify-center
                      rounded-[22px]
                      bg-accent/[0.08]
                      text-accent
                    "
                  >
                    <div
                      className="
                        absolute
                        inset-0
                        rounded-[22px]
                        ring-1
                        ring-inset
                        ring-accent/[0.08]
                      "
                    />

                    {currentTutorial.icon}
                  </div>

                  {/* EYEBROW */}
                  <span
                    className="
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.16em]
                      text-gray-400
                    "
                  >
                    {currentTutorial.eyebrow}
                  </span>

                  {/* TÍTULO */}
                  <h3
                    className="
                      mt-2
                      text-[21px]
                      font-bold
                      tracking-tight
                      text-gray-950
                    "
                  >
                    {currentTutorial.title}
                  </h3>

                  {/* DESCRIÇÃO */}
                  <p
                    className="
                      mt-3
                      max-w-md
                      text-[13px]
                      leading-6
                      text-gray-500
                    "
                  >
                    {currentTutorial.description}
                  </p>

                  {/* PASSO 2 */}
                  {tutorialStep === 1 && (
                    <div
                      className="
                        mt-5
                        flex
                        items-center
                        gap-3
                        rounded-2xl
                        border
                        border-gray-100
                        bg-gray-50
                        px-5
                        py-3
                      "
                    >
                      <kbd
                        className="
                          flex
                          h-9
                          min-w-[62px]
                          items-center
                          justify-center
                          rounded-xl
                          border
                          border-gray-200
                          bg-white
                          px-3
                          font-mono
                          text-[10px]
                          font-bold
                          text-gray-600
                          shadow-sm
                        "
                      >
                        Espaço
                      </kbd>

                      <ChevronRight size={15} className="text-gray-300" />

                      <span
                        className="
                          text-[10px]
                          font-semibold
                          text-gray-500
                        "
                      >
                        Revelar
                      </span>
                    </div>
                  )}

                  {/* PASSO 3 */}
                  {tutorialStep === 2 && (
                    <div
                      className="
                        mt-5
                        grid
                        grid-cols-4
                        gap-1.5
                        sm:gap-2
                      "
                    >
                      {ratingItems.map(({ rating, label }) => (
                        <div
                          key={rating}
                          className="
                              flex
                              min-w-[62px]
                              flex-col
                              items-center
                              gap-1
                              rounded-xl
                              border
                              border-gray-100
                              bg-gray-50
                              px-2
                              py-2
                            "
                        >
                          <kbd
                            className="
                                flex
                                h-7
                                w-7
                                items-center
                                justify-center
                                rounded-lg
                                bg-white
                                font-mono
                                text-[10px]
                                font-bold
                                text-gray-600
                                shadow-sm
                              "
                          >
                            {rating}
                          </kbd>

                          <span
                            className="
                                text-[8px]
                                font-semibold
                                text-gray-500
                              "
                          >
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PASSO FINAL */}
                  {tutorialStep === 3 && (
                    <div
                      className="
                        mt-5
                        flex
                        items-center
                        gap-2
                        rounded-2xl
                        border
                        border-emerald-100
                        bg-emerald-50
                        px-4
                        py-3
                      "
                    >
                      <CheckCircle2 size={16} className="text-emerald-600" />

                      <span
                        className="
                          text-[10px]
                          font-semibold
                          text-emerald-700
                        "
                      >
                        O Theo cuida do intervalo da revisão.
                      </span>
                    </div>
                  )}

                  {/* DICA */}
                  {tutorialStep === 0 && (
                    <div
                      className="
                        mt-5
                        max-w-md
                        rounded-xl
                        bg-gray-50
                        px-4
                        py-3
                        text-[10px]
                        font-medium
                        leading-5
                        text-gray-500
                      "
                    >
                      {currentTutorial.hint}
                    </div>
                  )}
                </div>

                {/* NAVEGAÇÃO */}
                <div
                  className="
                    mt-2
                    flex
                    items-center
                    justify-between
                    gap-3
                  "
                >
                  <button
                    type="button"
                    onClick={skipTutorial}
                    className="
                      rounded-lg
                      px-2
                      py-2
                      text-[10px]
                      font-semibold
                      text-gray-400
                      transition
                      hover:text-gray-700
                    "
                  >
                    Pular
                  </button>

                  <div className="flex items-center gap-2">
                    {tutorialStep > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setTutorialStep((current) => Math.max(0, current - 1) as TutorialStep)
                        }
                        className="
                          flex
                          h-10
                          items-center
                          gap-1
                          rounded-xl
                          border
                          border-gray-200
                          px-3.5
                          text-[10px]
                          font-bold
                          text-gray-600
                          transition
                          hover:bg-gray-50
                          active:scale-95
                        "
                      >
                        <ChevronLeft size={14} />
                        Voltar
                      </button>
                    )}

                    {tutorialStep < 3 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setTutorialStep((current) => Math.min(3, current + 1) as TutorialStep)
                        }
                        className="
                          flex
                          h-10
                          items-center
                          gap-1.5
                          rounded-xl
                          bg-gray-950
                          px-5
                          text-[10px]
                          font-bold
                          text-white
                          shadow-[0_5px_15px_rgba(0,0,0,.12)]
                          transition
                          hover:bg-gray-800
                          active:scale-95
                        "
                      >
                        Próximo
                        <ChevronRight size={14} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={completeTutorial}
                        className="
                          flex
                          h-10
                          items-center
                          gap-1.5
                          rounded-xl
                          bg-gray-950
                          px-5
                          text-[10px]
                          font-bold
                          text-white
                          shadow-[0_5px_15px_rgba(0,0,0,.12)]
                          transition
                          hover:bg-gray-800
                          active:scale-95
                        "
                      >
                        <CheckCircle2 size={14} />
                        Começar a estudar
                      </button>
                    )}
                  </div>
                </div>

                {/* TECLADO */}
                <div
                  className="
                    mt-5
                    flex
                    items-center
                    justify-center
                    gap-2
                    text-[9px]
                    text-gray-400
                  "
                >
                  <kbd
                    className="
                      rounded
                      border
                      border-gray-200
                      bg-gray-50
                      px-1.5
                      py-0.5
                      font-mono
                    "
                  >
                    ←
                  </kbd>

                  <kbd
                    className="
                      rounded
                      border
                      border-gray-200
                      bg-gray-50
                      px-1.5
                      py-0.5
                      font-mono
                    "
                  >
                    →
                  </kbd>

                  <span>navegar</span>

                  <span className="text-gray-200">•</span>

                  <kbd
                    className="
                      rounded
                      border
                      border-gray-200
                      bg-gray-50
                      px-1.5
                      py-0.5
                      font-mono
                    "
                  >
                    Enter
                  </kbd>

                  <span>continuar</span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <>
      {/* =================================================
          ÁREA DA CARTA
      ================================================= */}

      <div
        className="
          relative
          mx-auto
          w-full
          max-w-2xl
          px-2
          pb-2
        "
      >
        {/* PROFUNDIDADE */}
        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute
            inset-x-6
            bottom-0
            top-4
            rounded-[28px]
            bg-black/[0.025]
            shadow-[0_14px_35px_rgba(0,0,0,0.06)]
          "
          style={{
            transform: "translateY(16px) scale(.96)",
          }}
        />

        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute
            inset-x-3
            bottom-0
            top-2
            rounded-[28px]
            bg-black/[0.018]
            shadow-[0_10px_25px_rgba(0,0,0,0.04)]
          "
          style={{
            transform: "translateY(9px) scale(.98)",
          }}
        />

        {/* CARTA */}
        <div
          className={`
            relative
            z-10
            aspect-[5/3.2]
            w-full
            [perspective:1600px]
            ${isFlipping ? "card-flipping" : ""}
          `}
        >
          {/* CONTAINER 3D */}
          <div
            className={`
              relative
              h-full
              w-full
              cursor-pointer
              [transform-style:preserve-3d]
              transition-[transform]
              duration-[650ms]
              ease-[cubic-bezier(.22,.61,.36,1)]
              ${flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]"}
            `}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            aria-label={
              flipped
                ? "Resposta. Clique para voltar à pergunta."
                : "Pergunta. Clique para revelar a resposta."
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();

                if (!isFlipping) {
                  onFlip();
                }
              }
            }}
          >
            {/* FRENTE */}
            <section
              className="
                absolute
                inset-0
                flex
                h-full
                w-full
                flex-col
                overflow-hidden
                rounded-[28px]
                border
                border-black/[0.07]
                bg-paper
                shadow-[0_18px_45px_rgba(0,0,0,0.10),0_3px_10px_rgba(0,0,0,0.06)]
                [backface-visibility:hidden]
              "
            >
              <div
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  bg-gradient-to-br
                  from-white/30
                  via-transparent
                  to-black/[0.025]
                "
              />

              {/* HEADER */}
              <div
                className="
                  relative
                  flex
                  items-center
                  justify-between
                  px-6
                  pb-2
                  pt-5
                  sm:px-7
                  sm:pt-6
                "
              >
                <div className="flex items-center gap-2">
                  <span
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      rounded-full
                      bg-accent/[0.09]
                      px-3
                      py-1.5
                      text-[10px]
                      font-bold
                      uppercase
                      tracking-[0.08em]
                      text-accent
                    "
                  >
                    <Brain size={12} />
                    Pergunta
                  </span>

                  <span
                    className="
                      hidden
                      rounded-full
                      bg-black/[0.045]
                      px-3
                      py-1.5
                      text-[10px]
                      font-medium
                      text-gray-500
                      sm:inline-flex
                    "
                  >
                    {cardTypeLabel}
                  </span>
                </div>

                <div
                  className="
                    flex
                    items-center
                    gap-1.5
                    rounded-full
                    bg-black/[0.045]
                    px-3
                    py-1.5
                    text-[10px]
                    font-medium
                    text-gray-500
                  "
                >
                  <Layers size={12} />
                  <span>{remaining}</span>
                </div>
              </div>

              {/* CONTEÚDO */}
              <div
                className="
                  relative
                  flex
                  min-h-0
                  flex-1
                  items-center
                  justify-center
                  overflow-hidden
                  px-7
                  py-3
                  sm:px-12
                "
              >
                <div
                  className={`
                    prose
                    max-w-2xl
                    text-center
                    text-gray-950
                    prose-p:my-1
                    prose-headings:my-2
                    prose-li:my-0
                    prose-strong:font-bold
                    ${
                      questionSize === "large"
                        ? "prose-sm"
                        : questionSize === "very-large"
                          ? "prose-xs"
                          : ""
                    }
                    [&_img]:mx-auto
                    [&_img]:max-h-44
                    [&_img]:rounded-xl
                    [&_video]:mx-auto
                    [&_table]:mx-auto
                    [&_table]:max-w-full
                    [&_table]:text-sm
                    [&_.cloze-hidden]:font-bold
                  `}
                  dangerouslySetInnerHTML={{
                    __html: previewQuestion || "Sem pergunta",
                  }}
                />
              </div>

              {/* LINK */}
              {questionSize !== "small" && (
                <div className="relative px-6" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="
                      mx-auto
                      flex
                      items-center
                      gap-1.5
                      rounded-lg
                      px-3
                      py-1.5
                      text-[11px]
                      font-semibold
                      text-accent
                      transition
                      hover:bg-accent/[0.07]
                    "
                  >
                    <Maximize2 size={13} />
                    Ver conteúdo completo
                  </button>
                </div>
              )}

              {/* FOOTER */}
              <div
                className="
                  relative
                  mt-auto
                  flex
                  items-center
                  justify-center
                  gap-2
                  px-6
                  pb-5
                  pt-3
                  text-[10px]
                  font-medium
                  text-gray-400
                  sm:pb-6
                "
              >
                <span
                  className="
                    flex
                    items-center
                    gap-1.5
                    rounded-full
                    bg-black/[0.035]
                    px-3
                    py-1.5
                  "
                >
                  <RotateCcw size={11} />
                  Clique ou pressione
                  <kbd
                    className="
                      rounded
                      border
                      border-black/[0.08]
                      bg-white/70
                      px-1.5
                      py-0.5
                      font-mono
                      text-[9px]
                      text-gray-500
                    "
                  >
                    Espaço
                  </kbd>
                </span>
              </div>
            </section>

            {/* VERSO */}
            <section
              className="
                absolute
                inset-0
                flex
                h-full
                w-full
                flex-col
                overflow-hidden
                rounded-[28px]
                border
                border-black/[0.07]
                bg-paper-alt
                shadow-[0_18px_45px_rgba(0,0,0,0.10),0_3px_10px_rgba(0,0,0,0.06)]
                [backface-visibility:hidden]
                [transform:rotateY(180deg)]
              "
            >
              <div
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  bg-gradient-to-br
                  from-white/30
                  via-transparent
                  to-black/[0.025]
                "
              />

              {/* HEADER */}
              <div
                className="
                  relative
                  flex
                  items-center
                  justify-between
                  px-6
                  pb-2
                  pt-5
                  sm:px-7
                  sm:pt-6
                "
              >
                <div className="flex items-center gap-2">
                  <span
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      rounded-full
                      bg-emerald-500/[0.09]
                      px-3
                      py-1.5
                      text-[10px]
                      font-bold
                      uppercase
                      tracking-[0.08em]
                      text-emerald-600
                    "
                  >
                    <CheckCircle2 size={12} />
                    Resposta
                  </span>

                  <span
                    className="
                      hidden
                      rounded-full
                      bg-black/[0.045]
                      px-3
                      py-1.5
                      text-[10px]
                      font-medium
                      text-gray-500
                      sm:inline-flex
                    "
                  >
                    {cardTypeLabel}
                  </span>
                </div>
              </div>

              {/* RESPOSTA */}
              <div
                className="
                  relative
                  flex
                  min-h-0
                  flex-1
                  items-center
                  justify-center
                  overflow-hidden
                  px-7
                  py-3
                  sm:px-12
                "
              >
                <div
                  className={`
                    prose
                    max-w-2xl
                    text-center
                    text-gray-950
                    prose-p:my-1
                    prose-headings:my-2
                    prose-li:my-0
                    prose-strong:font-bold
                    ${
                      answerSize === "large"
                        ? "prose-sm"
                        : answerSize === "very-large"
                          ? "prose-xs"
                          : ""
                    }
                    [&_img]:mx-auto
                    [&_img]:max-h-44
                    [&_img]:rounded-xl
                    [&_table]:mx-auto
                    [&_table]:max-w-full
                    [&_table]:text-sm
                    [&_.cloze-answer]:font-bold
                  `}
                  dangerouslySetInnerHTML={{
                    __html: previewAnswer || "Sem resposta",
                  }}
                />
              </div>

              {/* LINK */}
              {answerSize !== "small" && (
                <div className="relative px-6" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="
                      mx-auto
                      flex
                      items-center
                      gap-1.5
                      rounded-lg
                      px-3
                      py-1.5
                      text-[11px]
                      font-semibold
                      text-accent
                      transition
                      hover:bg-accent/[0.07]
                    "
                  >
                    <Maximize2 size={13} />
                    Ver conteúdo completo
                  </button>
                </div>
              )}

              {/* AVALIAÇÕES */}
              {onRate && (
                <div
                  className="
                    relative
                    mx-5
                    mt-2
                    grid
                    grid-cols-4
                    gap-1.5
                    sm:mx-7
                    sm:gap-2
                  "
                  onClick={(event) => event.stopPropagation()}
                >
                  {ratingItems.map(({ rating, label, description }) => {
                    const active = ratingAnimation === rating;

                    return (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => handleRate(rating)}
                        className={`
                            group
                            relative
                            flex
                            min-h-[54px]
                            flex-col
                            items-center
                            justify-center
                            gap-0.5
                            overflow-hidden
                            rounded-xl
                            border
                            border-black/[0.07]
                            bg-white/55
                            px-1
                            py-1.5
                            transition-all
                            duration-200
                            hover:-translate-y-0.5
                            hover:bg-white
                            hover:shadow-[0_5px_15px_rgba(0,0,0,.07)]
                            active:scale-95
                            ${active ? "scale-95 bg-black text-white shadow-lg" : ""}
                          `}
                        title={description}
                      >
                        <span
                          className={`
                              flex
                              h-6
                              w-6
                              items-center
                              justify-center
                              rounded-full
                              font-mono
                              text-[10px]
                              font-bold
                              ${
                                active ? "bg-white/15 text-white" : "bg-black/[0.045] text-gray-600"
                              }
                            `}
                        >
                          {rating}
                        </span>

                        <span
                          className={`
                              text-[9px]
                              font-bold
                              ${active ? "text-white" : "text-gray-700"}
                            `}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* FOOTER */}
              <div
                className="
                  relative
                  mt-auto
                  flex
                  items-center
                  justify-center
                  gap-2
                  px-6
                  pb-5
                  pt-3
                  text-[10px]
                  font-medium
                  text-gray-400
                  sm:pb-6
                "
              >
                {onRate ? (
                  <span
                    className="
                      flex
                      items-center
                      gap-1.5
                      rounded-full
                      bg-black/[0.035]
                      px-3
                      py-1.5
                    "
                  >
                    <Keyboard size={11} />
                    Use
                    <kbd
                      className="
                        rounded
                        border
                        border-black/[0.08]
                        bg-white/70
                        px-1.5
                        py-0.5
                        font-mono
                        text-[9px]
                        text-gray-500
                      "
                    >
                      1–4
                    </kbd>
                    para avaliar
                  </span>
                ) : (
                  <span>Confira sua resposta</span>
                )}
              </div>
            </section>
          </div>

          {/* BRILHO */}
          {isFlipping && (
            <div
              className="
                pointer-events-none
                absolute
                inset-0
                z-30
                overflow-hidden
                rounded-[28px]
              "
            >
              <div
                className="
                  absolute
                  -left-1/2
                  top-0
                  h-full
                  w-1/2
                  rotate-[15deg]
                  bg-gradient-to-r
                  from-transparent
                  via-white/35
                  to-transparent
                  blur-sm
                  animate-[cardShine_.65s_ease-in-out]
                "
              />
            </div>
          )}
        </div>

        {/* BOTÃO TUTORIAL */}
        <button
          type="button"
          onClick={openTutorial}
          aria-label="Como usar o Theo"
          title="Como usar"
          className="
            absolute
            -right-1
            -top-3
            z-40
            flex
            h-9
            w-9
            items-center
            justify-center
            rounded-full
            border
            border-black/[0.07]
            bg-white
            text-gray-400
            shadow-[0_5px_15px_rgba(0,0,0,.10)]
            transition-all
            duration-200
            hover:scale-105
            hover:text-accent
            hover:shadow-[0_7px_20px_rgba(0,0,0,.14)]
            sm:-right-2
          "
        >
          <HelpCircle size={17} />
        </button>
      </div>

      {/* =================================================
          MODAIS FORA DA ÁRVORE DO STUDYCARD
      ================================================= */}

      {contentModal}

      {tutorialModal}

      {/* =================================================
          ANIMAÇÕES
      ================================================= */}

      <style>{`
        @keyframes cardShine {
          0% {
            transform: translateX(-140%) rotate(15deg);
            opacity: 0;
          }

          25% {
            opacity: 1;
          }

          70% {
            opacity: .7;
          }

          100% {
            transform: translateX(420%) rotate(15deg);
            opacity: 0;
          }
        }

        .card-flipping {
          animation:
            cardDepth .65s
            cubic-bezier(.22,.61,.36,1);
        }

        @keyframes cardDepth {
          0% {
            transform: scale(1) translateY(0);
            filter: brightness(1);
          }

          35% {
            transform: scale(.985) translateY(-2px);
            filter: brightness(1.025);
          }

          55% {
            transform: scale(.975) translateY(0);
            filter: brightness(1.04);
          }

          100% {
            transform: scale(1) translateY(0);
            filter: brightness(1);
          }
        }
      `}</style>
    </>
  );
}

export default StudyCard;
