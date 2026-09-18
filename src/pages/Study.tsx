import { CheckCircle2, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button, ErrorBanner, Spinner } from "../components/ui";
import { StudyCard } from "../components/StudyCard";

import { extractErrorMessage, getQueue, listCards, listDecks, submitReview } from "../lib/api";

import { getStudyProgress, saveStudyProgress } from "../lib/study";

import type { CardResponse, Rating } from "../lib/types";

// =====================================================
// BOTÕES DE AVALIAÇÃO
// =====================================================

const ratingButtons: {
  rating: Rating;
  label: string;
  hint: string;
  className: string;
}[] = [
  {
    rating: "again",
    label: "Errei",
    hint: "< 1 min",
    className:
      "bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 dark:text-red-400",
  },
  {
    rating: "hard",
    label: "Difícil",
    hint: "6 min",
    className:
      "bg-orange-500/10 text-orange-600 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 dark:text-orange-400",
  },
  {
    rating: "good",
    label: "Bom",
    hint: "10 min",
    className:
      "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 dark:text-emerald-400",
  },
  {
    rating: "easy",
    label: "Fácil",
    hint: "4 dias",
    className:
      "bg-sky-500/10 text-sky-600 border border-sky-500/20 hover:bg-sky-500/20 hover:border-sky-500/30 dark:text-sky-400",
  },
];

// =====================================================
// STUDY
// =====================================================

export default function Study() {
  const [params, setParams] = useSearchParams();

  const requestedDeckId = params.get("deck") ?? undefined;

  // ===================================================
  // ESTADO
  // ===================================================

  const [deckId, setDeckId] = useState<string | undefined>(requestedDeckId);

  const [queue, setQueue] = useState<CardResponse[] | null>(null);

  const [index, setIndex] = useState(0);

  const [flipped, setFlipped] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [cardStartedAt, setCardStartedAt] = useState(Date.now());

  const [reviewedCount, setReviewedCount] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  // ===================================================
  // LOCALIZAR DECK AUTOMATICAMENTE
  // ===================================================

  useEffect(() => {
    let cancelled = false;

    async function resolveDeck() {
      if (requestedDeckId) {
        setDeckId(requestedDeckId);
        return;
      }

      try {
        setError(null);

        const decks = await listDecks();

        if (cancelled) {
          return;
        }

        if (!Array.isArray(decks) || decks.length === 0) {
          setError("Nenhum deck com conteúdo foi encontrado.");
          return;
        }

        // Procura o primeiro deck que possui cards.
        for (const deck of decks) {
          if (cancelled) {
            return;
          }

          try {
            const cards = await listCards(deck.id);

            if (Array.isArray(cards) && cards.length > 0) {
              setDeckId(deck.id);

              setParams(
                (current) => {
                  current.set("deck", deck.id);
                  return current;
                },
                { replace: true },
              );

              return;
            }
          } catch (deckError) {
            console.warn(`Não foi possível verificar o deck ${deck.id}:`, deckError);
          }
        }

        if (!cancelled) {
          setError("Nenhum deck possui cartas para estudar.");
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Erro ao localizar deck para estudo:", err);

        setError(extractErrorMessage(err));
      }
    }

    void resolveDeck();

    return () => {
      cancelled = true;
    };
  }, [requestedDeckId, setParams]);

  // ===================================================
  // CARREGAR FILA + PROGRESSO
  // ===================================================

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!deckId) {
        return;
      }

      try {
        setError(null);
        setQueue(null);
        setIndex(0);
        setReviewedCount(0);

        // =================================================
        // FILA
        // =================================================

        const response = await getQueue(deckId, 50);

        if (cancelled) {
          return;
        }

        const cards = response.cards ?? [];

        setQueue(cards);

        // =================================================
        // PROGRESSO
        // =================================================

        if (cards.length > 0) {
          try {
            const progress = await getStudyProgress(deckId);

            if (cancelled) {
              return;
            }

            if (progress && progress.position >= 0 && progress.position < cards.length) {
              console.log("Continuando estudo:", progress.position);

              setIndex(progress.position);
            }
          } catch (progressError) {
            console.error("Erro ao carregar progresso:", progressError);
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Erro ao carregar fila de estudo:", err);

        setError(extractErrorMessage(err));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // ===================================================
  // CARTA ATUAL
  // ===================================================

  const current = queue?.[index];

  // ===================================================
  // RESET DA CARTA
  // ===================================================

  useEffect(() => {
    setCardStartedAt(Date.now());
    setFlipped(false);
  }, [current?.id]);

  // ===================================================
  // SALVAR POSIÇÃO
  // ===================================================

  async function savePosition(position: number) {
    if (!deckId || !current) {
      return;
    }

    try {
      await saveStudyProgress(deckId, current.id, position);
    } catch (err) {
      console.error("Erro salvando progresso:", err);
    }
  }

  // ===================================================
  // RESPONDER CARTA
  // ===================================================

  async function onRate(rating: Rating) {
    if (!current || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const timeTakenMs = Date.now() - cardStartedAt;

    try {
      await submitReview(current.id, rating, timeTakenMs);

      await savePosition(index + 1);

      setReviewedCount((value) => value + 1);

      setIndex((value) => value + 1);
    } catch (err) {
      console.error("Erro ao responder carta:", err);

      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ===================================================
  // ERRO
  // ===================================================

  if (error) {
    return (
      <div className="mx-auto max-w-md py-10">
        <ErrorBanner message={error} />
      </div>
    );
  }

  // ===================================================
  // CARREGANDO
  // ===================================================

  if (queue === null) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner />

        <p className="mt-4 text-sm text-text-muted">Preparando seu estudo...</p>
      </div>
    );
  }

  // ===================================================
  // TUDO EM DIA / ESTUDO CONCLUÍDO
  // ===================================================

  if (queue.length === 0 || !current) {
    return (
      <div
        className="
          flex
          min-h-[65vh]
          flex-col
          items-center
          justify-center
          px-4
          text-center
        "
      >
        {/* ÍCONE */}

        <div
          className="
            relative
            mb-7
            flex
            h-24
            w-24
            items-center
            justify-center
            rounded-[28px]
            border
            border-white/10
            bg-white/[0.04]
            shadow-[0_20px_70px_rgba(0,0,0,0.28)]
          "
        >
          <div
            className="
              absolute
              inset-0
              rounded-[28px]
              bg-white/[0.03]
              blur-xl
            "
          />

          {reviewedCount > 0 ? (
            <PartyPopper
              size={40}
              strokeWidth={1.6}
              className="
                relative
                text-white
              "
            />
          ) : (
            <CheckCircle2
              size={42}
              strokeWidth={1.6}
              className="
                relative
                text-white
              "
            />
          )}
        </div>

        {/* TEXTO */}

        <div className="max-w-lg">
          <h2
            className="
              text-3xl
              font-bold
              tracking-tight
              text-white
            "
          >
            {reviewedCount > 0 ? "Sessão concluída!" : "Tudo em dia"}
          </h2>

          <p
            className="
              mx-auto
              mt-3
              max-w-md
              text-sm
              leading-6
              text-zinc-400
            "
          >
            {reviewedCount > 0
              ? `Você revisou ${reviewedCount} ${
                  reviewedCount === 1 ? "carta" : "cartas"
                } nesta sessão.`
              : "Você não tem nenhuma carta pendente agora."}
          </p>
        </div>

        {/* STATUS */}

        <div
          className="
            mt-7
            flex
            items-center
            gap-2
            rounded-full
            border
            border-white/10
            bg-white/[0.04]
            px-4
            py-2
          "
        >
          <span
            className="
              h-1.5
              w-1.5
              rounded-full
              bg-white
            "
          />

          <span
            className="
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.18em]
              text-zinc-400
            "
          >
            Nenhuma revisão pendente
          </span>
        </div>
      </div>
    );
  }

  // ===================================================
  // PROGRESSO
  // ===================================================

  const remaining = Math.max(queue.length - index - 1, 0);

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="flex flex-col items-center">
      {/* =================================================
          INDICADORES
      ================================================== */}

      <div
        className="
          mb-8
          flex
          w-full
          max-w-xl
          justify-between
          text-xs
          text-text-muted
        "
      >
        <span>
          Card {index + 1}/{queue.length}
        </span>

        <span>
          {remaining} {remaining === 1 ? "restante" : "restantes"}
        </span>

        <span>
          {reviewedCount} {reviewedCount === 1 ? "revisada" : "revisadas"}
        </span>
      </div>

      {/* =================================================
          CARTÃO
      ================================================== */}

      <StudyCard
        front={current.front}
        back={current.back}
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
        cardType={"basic"}
      />

      {/* =================================================
          AÇÕES
      ================================================== */}

      <div className="mt-20 w-full max-w-xl">
        {!flipped ? (
          <Button className="w-full" onClick={() => setFlipped(true)}>
            Mostrar resposta
          </Button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {ratingButtons.map((button) => (
              <button
                key={button.rating}
                type="button"
                disabled={submitting}
                onClick={() => onRate(button.rating)}
                className={`
                    flex
                    flex-col
                    items-center
                    rounded-xl
                    py-3
                    text-sm
                    font-medium
                    transition
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                    ${button.className}
                  `}
              >
                <span>{button.label}</span>

                {button.hint && <span className="mt-0.5 text-xs opacity-70">{button.hint}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
