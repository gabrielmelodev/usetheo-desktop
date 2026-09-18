import { Eye, EyeOff, RotateCcw, Keyboard, Sparkles } from "lucide-react";

import { useEffect, useState } from "react";

interface CardPreviewProps {
  front?: string;
  back?: string;

  visible?: boolean;

  onToggleVisible?: () => void;
}

// Remove HTML do Tiptap
function cleanHtml(value?: string) {
  if (!value) return "";

  const div = document.createElement("div");

  div.innerHTML = value;

  return div.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export default function CardPreview({
  front = "",
  back = "",
  visible = true,
  onToggleVisible,
}: CardPreviewProps) {
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setShowAnswer(false);
  }, [front, back]);

  useEffect(() => {
    function handleSpace(event: KeyboardEvent) {
      if (
        event.code === "Space" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();

        setShowAnswer((value) => !value);
      }
    }

    window.addEventListener("keydown", handleSpace);

    return () => window.removeEventListener("keydown", handleSpace);
  }, []);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={onToggleVisible}
        className="
          flex
          w-full
          items-center
          justify-center
          gap-2
          rounded-xl
          border
          border-white/10
          bg-white/[0.02]
          p-6
          text-sm
          text-text-muted
          transition
          hover:bg-white/5
        "
      >
        <Eye size={16} />
        Mostrar preview
      </button>
    );
  }

  const question = cleanHtml(front);

  const answer = cleanHtml(back);

  const content = showAnswer ? answer : question;

  return (
    <div className="space-y-4">
      {/* HEADER */}

      <div
        className="
          flex
          items-center
          justify-between
        "
      >
        <div>
          <div
            className="
              flex
              items-center
              gap-2
            "
          >
            <Sparkles size={16} className="text-accent" />

            <h3
              className="
                text-sm
                font-semibold
                text-text
              "
            >
              Preview Anki
            </h3>
          </div>

          <p
            className="
              mt-1
              text-xs
              text-text-muted
            "
          >
            Simulação de revisão
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleVisible}
            className="
              rounded-lg
              p-2
              text-text-muted
              transition
              hover:bg-white/5
            "
          >
            <EyeOff size={16} />
          </button>

          <button
            type="button"
            onClick={() => setShowAnswer((value) => !value)}
            className="
              flex
              items-center
              gap-2
              rounded-lg
              border
              border-white/10
              px-3
              py-2
              text-xs
              text-text-muted
              transition
              hover:bg-white/5
            "
          >
            {showAnswer ? (
              <>
                <RotateCcw size={14} />
                Frente
              </>
            ) : (
              <>
                <Eye size={14} />
                Resposta
              </>
            )}
          </button>
        </div>
      </div>

      {/* CARD */}

      <div
        onClick={() => setShowAnswer((value) => !value)}
        className="
          group
          relative
          flex
          min-h-[360px]
          cursor-pointer
          items-center
          justify-center
          overflow-hidden
          rounded-2xl
          border
          border-white/10
          bg-gradient-to-br
          from-white/[0.08]
          to-white/[0.02]
          p-10
          shadow-xl
          transition
          hover:border-accent/40
        "
      >
        <div
          className="
            max-w-3xl
            text-center
          "
        >
          <span
            className="
              mb-8
              block
              text-[11px]
              font-bold
              uppercase
              tracking-[0.3em]
              text-text-muted
            "
          >
            {showAnswer ? "Resposta" : "Frente"}
          </span>

          <p
            className="
              whitespace-pre-wrap
              text-xl
              leading-relaxed
              text-text
            "
          >
            {content || (showAnswer ? "Digite a resposta..." : "Digite a pergunta...")}
          </p>
        </div>
      </div>

      <div
        className="
          flex
          justify-center
          gap-2
          text-xs
          text-text-muted
        "
      >
        <Keyboard size={14} />
        Clique ou pressione espaço para virar
      </div>
    </div>
  );
}
