import { useState } from "react";
import { useNavigate } from "react-router-dom";

import CardList from "../components/card-editor/CardList";
import DeckHeader from "../components/card-editor/DeckHeader";
import PublishModal from "../components/card-editor/PublishModal";
import AddCardModal from "../components/card-editor/AddCardModal";
import { Spinner } from "../components/ui";

import {
  deleteDeck,
  extractErrorMessage,
  updateDeck,
  deleteCard,
  reorderCards,
  moveCard,
} from "../lib/api";

import { useAuth } from "../lib/auth-context";
import { useDeck } from "../hooks/useDeck";

type ConfirmAction =
  | {
      type: "delete-deck";
    }
  | {
      type: "delete-card";
      cardId: string;
    }
  | null;

export default function DeckDetail() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { deck, cards, loading, error, reload } = useDeck();

  const [showAddCard, setShowAddCard] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /**
   * Confirmações internas do Theo.
   *
   * Não usamos window.confirm(), evitando
   * qualquer modal nativo do Windows/Electron.
   */
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  /**
   * ============================================================
   * LOADING
   * ============================================================
   */
  if (loading && !deck) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  /**
   * ============================================================
   * DECK NÃO ENCONTRADO
   * ============================================================
   */
  if (!deck) {
    return (
      <div className="flex min-h-[240px] w-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-text-muted">{error || "Deck não encontrado."}</p>

        <button
          type="button"
          onClick={() => navigate("/decks")}
          className="
            mt-4
            rounded-xl
            border border-white/10
            bg-white/[0.04]
            px-4
            py-2
            text-sm
            text-text
            transition
            hover:bg-white/[0.08]
          "
        >
          Voltar para os decks
        </button>
      </div>
    );
  }

  /**
   * ============================================================
   * PROPRIETÁRIO
   * ============================================================
   */
  const ownerId = deck.owner_id ?? deck.user_id;

  const isOwned = !ownerId || ownerId === user?.id;

  /**
   * ============================================================
   * ESTUDAR
   * ============================================================
   */
  function handleStudy() {
    setActionError(null);

    if (!deck.id) {
      setActionError("Não foi possível iniciar o estudo: deck sem ID.");
      return;
    }

    navigate(`/study?deck=${encodeURIComponent(deck.id)}`);
  }

  /**
   * ============================================================
   * ABRIR CONFIRMAÇÃO DE EXCLUSÃO DO DECK
   * ============================================================
   */
  function requestDeleteDeck() {
    if (actionLoading) {
      return;
    }

    setActionError(null);

    setConfirmAction({
      type: "delete-deck",
    });
  }

  /**
   * ============================================================
   * EXCLUIR DECK
   * ============================================================
   */
  async function handleDeleteDeck() {
    if (actionLoading) {
      return;
    }

    try {
      setActionError(null);
      setActionLoading(true);
      setConfirmAction(null);

      await deleteDeck(deck.id);

      navigate("/decks");
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * ============================================================
   * RENOMEAR DECK
   * ============================================================
   */
  async function handleRenameDeck(name?: string) {
    if (actionLoading) {
      return;
    }

    if (!name) {
      return;
    }

    const title = name.trim();

    if (!title) {
      setActionError("O nome do deck não pode ficar vazio.");
      return;
    }

    if (title === deck.name) {
      return;
    }

    try {
      setActionError(null);
      setActionLoading(true);

      await updateDeck(deck.id, {
        name: title,
      });

      await reload();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * ============================================================
   * ABRIR CONFIRMAÇÃO DE EXCLUSÃO DO CARD
   * ============================================================
   */
  function requestDeleteCard(cardId: string) {
    if (actionLoading) {
      return;
    }

    if (!cardId) {
      setActionError("Não foi possível excluir o card: ID inválido.");
      return;
    }

    setActionError(null);

    setConfirmAction({
      type: "delete-card",
      cardId,
    });
  }

  /**
   * ============================================================
   * EXCLUIR CARD
   * ============================================================
   */
  async function handleDeleteCard(cardId: string) {
    if (actionLoading) {
      return;
    }

    if (!cardId) {
      setActionError("Não foi possível excluir o card: ID inválido.");
      return;
    }

    try {
      setActionError(null);
      setActionLoading(true);
      setConfirmAction(null);

      await deleteCard(cardId);

      await reload();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * ============================================================
   * CARD CRIADO
   * ============================================================
   */
  async function handleCardCreated() {
    setShowAddCard(false);

    try {
      setActionError(null);
      await reload();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  /**
   * ============================================================
   * REORDENAR CARDS
   * ============================================================
   */
  async function handleReorderCards(orderedIds: string[]) {
    if (actionLoading) {
      return;
    }

    if (!Array.isArray(orderedIds)) {
      return;
    }

    try {
      setActionError(null);
      setActionLoading(true);

      await reorderCards(orderedIds);

      await reload();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * ============================================================
   * MOVER CARD
   * ============================================================
   */
  async function handleMoveCard(cardId: string, parentCardId: string | null) {
    if (actionLoading) {
      return;
    }

    if (!cardId) {
      setActionError("Não foi possível mover o card: ID inválido.");
      return;
    }

    try {
      setActionError(null);
      setActionLoading(true);

      await moveCard(cardId, parentCardId);

      await reload();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * ============================================================
   * CONFIRMAÇÃO
   * ============================================================
   */
  const isConfirmOpen = confirmAction !== null;

  const confirmTitle = confirmAction?.type === "delete-deck" ? "Excluir deck?" : "Excluir card?";

  const confirmDescription =
    confirmAction?.type === "delete-deck"
      ? `O deck "${deck.name}" e todos os cartões associados serão removidos.`
      : "Essa ação não poderá ser desfeita.";

  async function handleConfirmAction() {
    if (!confirmAction || actionLoading) {
      return;
    }

    if (confirmAction.type === "delete-deck") {
      await handleDeleteDeck();
      return;
    }

    await handleDeleteCard(confirmAction.cardId);
  }

  /**
   * ============================================================
   * RENDER
   * ============================================================
   */
  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
        {/* ======================================================
            ERRO DA AÇÃO
            ====================================================== */}
        {actionError && (
          <div
            role="alert"
            className="
              flex
              items-start
              justify-between
              gap-3
              rounded-xl
              border
              border-red-500/20
              bg-red-500/[0.06]
              px-3
              py-2.5
              text-xs
              text-red-400
            "
          >
            <div className="min-w-0">
              <p className="font-medium">Não foi possível concluir a ação.</p>

              <p className="mt-0.5 break-words text-red-400/80">{actionError}</p>
            </div>

            <button
              type="button"
              onClick={() => setActionError(null)}
              className="
                shrink-0
                rounded-md
                px-1.5
                py-0.5
                text-sm
                text-red-400
                transition
                hover:bg-red-500/10
                hover:text-red-300
              "
              aria-label="Fechar erro"
            >
              ×
            </button>
          </div>
        )}

        {/* ======================================================
            CABEÇALHO DO DECK
            ====================================================== */}
        <DeckHeader
          deck={deck}
          cardsCount={cards.length}
          onPublish={isOwned ? () => setShowPublish(true) : undefined}
          onDelete={isOwned && !actionLoading ? requestDeleteDeck : undefined}
          onEdit={isOwned && !actionLoading ? handleRenameDeck : undefined}
          onStudy={handleStudy}
        />

        {/* ======================================================
            LISTA DE CARDS
            ====================================================== */}
        <CardList
          cards={cards}
          loading={loading || actionLoading}
          error={error}
          onRetry={reload}
          onAdd={() => setShowAddCard(true)}
          onDelete={requestDeleteCard}
          onReorder={handleReorderCards}
          onMoveInto={handleMoveCard}
        />

        {/* ======================================================
            ADICIONAR CARD
            ====================================================== */}
        <AddCardModal
          open={showAddCard}
          deckId={deck.id}
          onClose={() => setShowAddCard(false)}
          onCreated={handleCardCreated}
        />

        {/* ======================================================
            PUBLICAR
            ====================================================== */}
        <PublishModal open={showPublish} deckId={deck.id} onClose={() => setShowPublish(false)} />

        {/* ======================================================
            CONFIRMAÇÃO CUSTOMIZADA
            ====================================================== */}
        {isConfirmOpen && (
          <div
            className="
              fixed
              inset-0
              z-[100]
              flex
              items-center
              justify-center
              bg-black/60
              px-4
              backdrop-blur-sm
            "
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !actionLoading) {
                setConfirmAction(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="deck-detail-confirm-title"
              className="
                w-full
                max-w-sm
                overflow-hidden
                rounded-2xl
                border
                border-white/10
                bg-[#202124]
                shadow-2xl
              "
            >
              {/* Cabeçalho */}
              <div className="px-5 pt-5">
                <div
                  className="
                    flex
                    h-10
                    w-10
                    items-center
                    justify-center
                    rounded-xl
                    bg-red-500/10
                    text-red-400
                  "
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0 .7 12.1A1.9 1.9 0 0 0 10.6 21h2.8a1.9 1.9 0 0 0 1.9-1.9L16 7M10 11v6M14 11v6"
                    />
                  </svg>
                </div>

                <h2
                  id="deck-detail-confirm-title"
                  className="
                    mt-4
                    text-base
                    font-semibold
                    text-white
                  "
                >
                  {confirmTitle}
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-5
                    text-[#bdc1c6]
                  "
                >
                  {confirmDescription}
                </p>
              </div>

              {/* Ações */}
              <div
                className="
                  flex
                  justify-end
                  gap-2
                  px-5
                  py-5
                "
              >
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setConfirmAction(null)}
                  className="
                    rounded-xl
                    px-4
                    py-2
                    text-sm
                    font-medium
                    text-[#e8eaed]
                    transition
                    hover:bg-white/[0.06]
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmAction}
                  className="
                    inline-flex
                    min-w-[88px]
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-red-500/90
                    px-4
                    py-2
                    text-sm
                    font-medium
                    text-white
                    transition
                    hover:bg-red-500
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  {actionLoading ? (
                    <>
                      <span
                        className="
                          h-4
                          w-4
                          animate-spin
                          rounded-full
                          border-2
                          border-white/30
                          border-t-white
                        "
                      />
                      Excluindo...
                    </>
                  ) : (
                    "Excluir"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
