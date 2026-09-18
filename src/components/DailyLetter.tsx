import React, { useEffect, useMemo, useState } from "react";

export type TheoLetter = {
  id: string;
  date: string;
  title: string;
  message: string;
  signature: string;
};

const STORAGE_KEY = "theo.daily-letter.v1";

const LETTERS: Array<Omit<TheoLetter, "id" | "date">> = [
  {
    title: "Um passo de cada vez",
    message:
      "Você não precisa vencer tudo hoje. Só precisa dar mais um passo na direção do que deseja construir.",
    signature: "Theo",
  },
  {
    title: "Constância",
    message:
      "Nem todo dia será perfeito. Mesmo assim, alguns minutos de estudo continuam sendo melhores do que desistir.",
    signature: "Theo",
  },
  {
    title: "Continue",
    message:
      "O resultado que você procura está sendo construído justamente nos dias em que ninguém está vendo.",
    signature: "Theo",
  },
  {
    title: "Hoje importa",
    message:
      "Não espere sentir vontade para começar. Comece pequeno, mantenha o foco e deixe a constância fazer o resto.",
    signature: "Theo",
  },
  {
    title: "Seu futuro",
    message:
      "Cada página lida, cada questão resolvida e cada revisão fazem parte da pessoa que você está construindo.",
    signature: "Theo",
  },
  {
    title: "Não pare agora",
    message:
      "Você já chegou até aqui. Faça a próxima sessão. Depois, a próxima. É assim que grandes objetivos são construídos.",
    signature: "Theo",
  },
  {
    title: "Confie no processo",
    message: "Você não precisa enxergar todo o caminho. Só precisa continuar caminhando.",
    signature: "Theo",
  },
];

function getLocalDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDayIndex(date: string): number {
  const digits = date.replace(/-/g, "");
  const numericDate = parseInt(digits, 10);

  if (!Number.isFinite(numericDate)) {
    return 0;
  }

  return Math.abs(numericDate) % LETTERS.length;
}

function createTodayLetter(date: string): TheoLetter {
  const content = LETTERS[getDayIndex(date)];

  return {
    id: `theo-letter-${date}`,
    date,
    title: content.title,
    message: content.message,
    signature: content.signature,
  };
}

function readStoredLetter(): TheoLetter | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || typeof parsed.letter !== "object") {
      return null;
    }

    return parsed.letter as TheoLetter;
  } catch {
    return null;
  }
}

function saveStoredLetter(letter: TheoLetter): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        letter,
      }),
    );
  } catch {
    // O recurso continua funcionando mesmo se o armazenamento estiver indisponível.
  }
}

export interface DailyLetterProps {
  onAvailableChange?: (available: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  onTheoStateChange?: (state: "idle" | "letter" | "success") => void;
  className?: string;
}

export default function DailyLetter({
  onAvailableChange,
  onOpenChange,
  onTheoStateChange,
  className = "",
}: DailyLetterProps) {
  const today = useMemo(() => getLocalDate(), []);

  const [letter, setLetter] = useState<TheoLetter | null>(null);
  const [hasLetter, setHasLetter] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    const stored = readStoredLetter();

    if (!stored || stored.date !== today) {
      const newLetter = createTodayLetter(today);

      saveStoredLetter(newLetter);

      setLetter(newLetter);
      setHasLetter(true);

      onAvailableChange?.(true);
      onTheoStateChange?.("letter");

      return;
    }

    setLetter(stored);

    const alreadyOpened = localStorage.getItem(`${STORAGE_KEY}.opened.${today}`);

    const available = alreadyOpened !== "true";

    setHasLetter(available);

    onAvailableChange?.(available);
    onTheoStateChange?.(available ? "letter" : "idle");
  }, [today, onAvailableChange, onTheoStateChange]);

  const openLetter = () => {
    if (!letter || !hasLetter || isOpening) {
      return;
    }

    setIsOpening(true);

    window.setTimeout(() => {
      setIsOpening(false);
      setIsModalOpen(true);

      onOpenChange?.(true);
      onTheoStateChange?.("success");
    }, 280);
  };

  const closeLetter = () => {
    if (!letter) {
      return;
    }

    setIsModalOpen(false);
    onOpenChange?.(false);

    try {
      localStorage.setItem(`${STORAGE_KEY}.opened.${letter.date}`, "true");
    } catch {
      // Ignora falha do storage.
    }

    setHasLetter(false);
    onAvailableChange?.(false);

    window.setTimeout(() => {
      onTheoStateChange?.("idle");
    }, 500);
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLetter();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen, letter]);

  if (!letter) {
    return null;
  }

  return (
    <>
      {hasLetter && (
        <button
          type="button"
          onClick={openLetter}
          aria-label="Abrir Carta do Dia"
          className={[
            "group relative flex h-24 w-32 items-center justify-center",
            "rounded-2xl border border-white/10",
            "bg-white/[0.035] backdrop-blur-xl",
            "transition-all duration-300",
            "hover:-translate-y-1 hover:border-white/20",
            "hover:bg-white/[0.06]",
            "active:scale-[0.97]",
            "focus:outline-none focus:ring-2 focus:ring-white/20",
            className,
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-0 rounded-2xl",
              "bg-white/[0.025]",
              "opacity-0 blur-xl transition-opacity",
              "group-hover:opacity-100",
            ].join(" ")}
          />

          <div className="relative flex flex-col items-center gap-1">
            <div
              className={[
                "relative flex h-12 w-16 items-center justify-center",
                "rounded-lg border border-white/15",
                "bg-[#f4eee1]",
                "shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
                "transition-transform duration-300",
                "group-hover:rotate-[-3deg] group-hover:scale-105",
              ].join(" ")}
            >
              <div
                className={[
                  "absolute left-0 right-0 top-0 h-6",
                  "origin-top",
                  "bg-[#e6dcc8]",
                  "[clip-path:polygon(0_0,100%_0,50%_75%)]",
                ].join(" ")}
              />

              <span className="relative z-10 mt-2 text-lg">✉</span>

              <span
                className={[
                  "absolute -right-2 -top-2",
                  "flex h-5 min-w-5 items-center justify-center",
                  "rounded-full border border-black/10",
                  "bg-white px-1 text-[9px] font-bold text-neutral-700",
                  "shadow-lg",
                  "animate-pulse",
                ].join(" ")}
              >
                1
              </span>
            </div>

            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Carta do dia
            </span>
          </div>
        </button>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="theo-daily-letter-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLetter();
            }
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

          <div
            className={["relative w-full max-w-lg", "animate-[theoLetterIn_300ms_ease-out]"].join(
              " ",
            )}
          >
            <div
              className={[
                "relative overflow-hidden rounded-[28px]",
                "border border-black/10",
                "bg-[#f4eee1]",
                "text-[#29251f]",
                "shadow-[0_30px_100px_rgba(0,0,0,0.5)]",
              ].join(" ")}
            >
              <div
                className="absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage: "radial-gradient(#000 0.7px, transparent 0.7px)",
                  backgroundSize: "7px 7px",
                }}
              />

              <div className="relative p-7 sm:p-10">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#756b5b]">
                      Carta do Dia
                    </div>

                    <h2
                      id="theo-daily-letter-title"
                      className="font-serif text-3xl font-semibold tracking-tight"
                    >
                      {letter.title}
                    </h2>
                  </div>

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/40 text-xl shadow-sm">
                    ✉
                  </div>
                </div>

                <div className="mb-8 h-px bg-black/10" />

                <p className="font-serif text-lg leading-8 text-[#3e382f] sm:text-xl sm:leading-9">
                  {letter.message}
                </p>

                <div className="mt-10">
                  <div className="mb-1 font-serif text-lg italic">— {letter.signature}</div>

                  <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a7e6d]">
                    {letter.date.split("-").reverse().join("/")}
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    type="button"
                    onClick={closeLetter}
                    className={[
                      "rounded-xl px-5 py-2.5",
                      "bg-[#29251f] text-sm font-semibold text-white",
                      "transition-all duration-200",
                      "hover:bg-[#3b352d]",
                      "active:scale-[0.97]",
                      "focus:outline-none focus:ring-2 focus:ring-black/20",
                    ].join(" ")}
                  >
                    Guardar carta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes theoLetterIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96) rotate(-1deg);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-\\[theoLetterIn_300ms_ease-out\\] {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
