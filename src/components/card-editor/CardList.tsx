import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  GripVertical,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button, EmptyState, Panel } from "../../components/ui";

import type { CardResponse } from "../../lib/types";

import QueueBadge from "../QueueBadge";

interface CardListProps {
  cards?: CardResponse[];
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
  onAdd: () => void;
  onDelete?: (cardId: string) => void | Promise<void>;

  /**
   * Mantido para compatibilidade com o restante da aplicação.
   */
  onAddChild?: (parentCardId: string) => void;

  onMoveInto?: (cardId: string, parentCardId: string | null) => void | Promise<void>;

  onReorder?: (orderedIds: string[]) => void | Promise<void>;
}

/* ============================================================
 * TIPOS
 * ============================================================ */

type CardWithParent = CardResponse & {
  parent_card_id?: string | null;
  parent_id?: string | null;
};

type DeleteTarget = {
  id: string;
  title: string;
  childrenCount: number;
} | null;

/* ============================================================
 * UTILITÁRIOS
 * ============================================================ */

function cleanHtml(value?: string) {
  if (!value) return "";

  if (typeof document === "undefined") {
    return value
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const div = document.createElement("div");
  div.innerHTML = value;

  return div.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getParentId(card: CardResponse): string | null {
  const typedCard = card as CardWithParent;

  if (typedCard.parent_card_id !== undefined) {
    return typedCard.parent_card_id ?? null;
  }

  return typedCard.parent_id ?? null;
}

/* ============================================================
 * COMPONENTE
 * ============================================================ */

export default function CardList({
  cards = [],
  error,
  loading = false,
  onRetry,
  onAdd,
  onDelete,
  onAddChild,
  onMoveInto,
  onReorder,
}: CardListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [dropRoot, setDropRoot] = useState(false);

  const [menuCardId, setMenuCardId] = useState<string | null>(null);

  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  /* ==========================================================
   * MODAL DE EXCLUSÃO
   * ========================================================== */

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);

  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  /* ==========================================================
   * FECHAR MODAL COM ESC
   * ========================================================== */

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !deleteLoading) {
        setDeleteTarget(null);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTarget, deleteLoading]);

  /* ==========================================================
   * HIERARQUIA
   * ========================================================== */

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, CardResponse[]>();

    for (const card of cards) {
      const parentId = getParentId(card);

      const current = map.get(parentId) ?? [];

      current.push(card);
      map.set(parentId, current);
    }

    return map;
  }, [cards]);

  const rootCards = childrenMap.get(null) ?? [];

  const getChildren = useCallback((cardId: string) => childrenMap.get(cardId) ?? [], [childrenMap]);

  /* ==========================================================
   * EXPANDIR / RECOLHER
   * ========================================================== */

  const toggleExpanded = useCallback((cardId: string) => {
    setExpanded((current) => ({
      ...current,
      [cardId]: !(current[cardId] ?? true),
    }));
  }, []);

  /* ==========================================================
   * ABRIR MODAL DE EXCLUSÃO
   * ========================================================== */

  const handleDelete = useCallback(
    (card: CardResponse) => {
      if (!card.id || !onDelete) {
        return;
      }

      if (busyCardId === card.id || deleteLoading) {
        return;
      }

      const children = getChildren(card.id);

      const title = cleanHtml(card.front) || "este card";

      setMenuCardId(null);

      setDeleteTarget({
        id: card.id,
        title,
        childrenCount: children.length,
      });
    },
    [getChildren, onDelete, busyCardId, deleteLoading],
  );

  /* ==========================================================
   * CONFIRMAR EXCLUSÃO
   * ========================================================== */

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !onDelete || deleteLoading) {
      return;
    }

    try {
      setDeleteLoading(true);
      setBusyCardId(deleteTarget.id);

      await onDelete(deleteTarget.id);

      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
      setBusyCardId(null);
    }
  }, [deleteTarget, onDelete, deleteLoading]);

  /* ==========================================================
   * REORDENAÇÃO
   * ========================================================== */

  async function reorderList(list: CardResponse[], from: number, to: number) {
    if (!onReorder) return;

    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
      return;
    }

    const ordered = [...list];

    const [item] = ordered.splice(from, 1);

    ordered.splice(to, 0, item);

    const ids = ordered.map((card) => card.id).filter((id): id is string => Boolean(id));

    await onReorder(ids);
  }

  async function moveUp(index: number, list: CardResponse[]) {
    if (index <= 0) return;

    await reorderList(list, index, index - 1);
  }

  async function moveDown(index: number, list: CardResponse[]) {
    if (index >= list.length - 1) {
      return;
    }

    await reorderList(list, index, index + 1);
  }

  /* ==========================================================
   * MOVER PARA OUTRO CARD
   * ========================================================== */

  async function handleMoveInto(cardId: string, parentId: string | null) {
    if (!onMoveInto) return;

    if (cardId === parentId) {
      return;
    }

    try {
      setBusyCardId(cardId);
      setMenuCardId(null);

      await onMoveInto(cardId, parentId);
    } finally {
      setBusyCardId(null);
    }
  }

  /* ==========================================================
   * DRAG START
   * ========================================================== */

  function handleDragStart(event: DragEvent<HTMLDivElement>, card: CardResponse) {
    if (!card.id) {
      event.preventDefault();
      return;
    }

    setDraggingId(card.id);
    setMenuCardId(null);

    event.dataTransfer.effectAllowed = "move";

    event.dataTransfer.setData("text/plain", card.id);
  }

  /* ==========================================================
   * DRAG END
   * ========================================================== */

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
    setDropRoot(false);
  }

  /* ==========================================================
   * DROP EM CARD
   * ========================================================== */

  async function handleDrop(event: DragEvent<HTMLDivElement>, target: CardResponse) {
    event.preventDefault();
    event.stopPropagation();

    const draggedId = event.dataTransfer.getData("text/plain");

    if (!draggedId || !target.id || draggedId === target.id) {
      handleDragEnd();
      return;
    }

    if (onMoveInto) {
      await onMoveInto(draggedId, target.id);
    }

    handleDragEnd();
  }

  /* ==========================================================
   * DROP NA RAIZ
   * ========================================================== */

  async function handleDropRoot(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const draggedId = event.dataTransfer.getData("text/plain");

    if (!draggedId) {
      handleDragEnd();
      return;
    }

    if (onMoveInto) {
      await onMoveInto(draggedId, null);
    }

    handleDragEnd();
  }

  /* ==========================================================
   * CLIQUES INTELIGENTES
   *
   * 1 clique:
   * foco
   *
   * 2 cliques:
   * abre card
   *
   * 3 cliques:
   * menu rápido
   * ========================================================== */

  function handleCardClick(card: CardResponse) {
    if (!card.id) return;

    const id = card.id;

    if (clickTimers.current[id]) {
      clearTimeout(clickTimers.current[id]);
    }

    clickTimers.current[id] = setTimeout(() => {
      setFocusedCardId(id);
    }, 180);
  }

  function handleCardDoubleClick(card: CardResponse) {
    if (!card.id) return;

    setFocusedCardId(card.id);
  }

  function handleCardTripleClick(card: CardResponse) {
    if (!card.id) return;

    setMenuCardId(card.id);
    setFocusedCardId(card.id);
  }

  /* ==========================================================
   * TECLADO
   * ========================================================== */

  async function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    card: CardResponse,
    index: number,
    list: CardResponse[],
  ) {
    if (!card.id) return;

    const modifier = event.ctrlKey || event.metaKey;

    /* ========================================================
     * ESC
     * ======================================================== */

    if (event.key === "Escape") {
      event.preventDefault();

      if (deleteTarget) {
        if (!deleteLoading) {
          setDeleteTarget(null);
        }

        return;
      }

      setMenuCardId(null);
      setFocusedCardId(null);
      setDraggingId(null);

      return;
    }

    /* ========================================================
     * DELETE
     * ======================================================== */

    if (event.key === "Delete" && onDelete) {
      event.preventDefault();

      handleDelete(card);

      return;
    }

    /* ========================================================
     * ESPAÇO
     * ======================================================== */

    if (event.key === " " && getChildren(card.id).length > 0) {
      event.preventDefault();

      toggleExpanded(card.id);

      return;
    }

    /* ========================================================
     * CTRL/CMD + ENTER
     * ======================================================== */

    if (modifier && event.key === "Enter" && onAddChild) {
      event.preventDefault();

      onAddChild(card.id);

      return;
    }

    /* ========================================================
     * CTRL/CMD + ↑
     * ======================================================== */

    if (modifier && event.key === "ArrowUp") {
      event.preventDefault();

      await moveUp(index, list);

      return;
    }

    /* ========================================================
     * CTRL/CMD + ↓
     * ======================================================== */

    if (modifier && event.key === "ArrowDown") {
      event.preventDefault();

      await moveDown(index, list);

      return;
    }

    /* ========================================================
     * M
     * ======================================================== */

    if (event.key.toLowerCase() === "m" && !modifier) {
      event.preventDefault();

      setMenuCardId(card.id);

      return;
    }

    /* ========================================================
     * E
     * ======================================================== */

    if (event.key.toLowerCase() === "e" && getChildren(card.id).length > 0) {
      event.preventDefault();

      toggleExpanded(card.id);
    }
  }

  /* ==========================================================
   * LIMPAR TIMERS
   * ========================================================== */

  useEffect(() => {
    return () => {
      Object.values(clickTimers.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  /* ==========================================================
   * RENDER CARD
   * ========================================================== */

  function renderCard(
    card: CardResponse,
    index: number,
    list: CardResponse[],
    level = 0,
  ): ReactNode {
    if (!card.id) return null;

    const cardId = card.id;

    const front = cleanHtml(card.front);

    const back = cleanHtml(card.back);

    const children = getChildren(cardId);

    const hasChildren = children.length > 0;

    const isExpanded = expanded[cardId] ?? true;

    const isDragging = draggingId === cardId;

    const isDropTarget = dropTarget === cardId;

    const isMenuOpen = menuCardId === cardId;

    const isBusy = busyCardId === cardId;

    const visualLevel = Math.min(level, 3);

    return (
      <div key={cardId} className="relative">
        {/* ==================================================
            CARD
        ================================================== */}

        <div
          tabIndex={0}
          onClick={() => handleCardClick(card)}
          onDoubleClick={() => handleCardDoubleClick(card)}
          onKeyDown={(event) => void handleKeyDown(event, card, index, list)}
          draggable={!isBusy}
          onDragStart={(event) => handleDragStart(event, card)}
          onDragEnd={handleDragEnd}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();

            if (draggingId && draggingId !== cardId) {
              setDropTarget(cardId);
            }
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => void handleDrop(event, card)}
          className={`
            group
            relative
            overflow-visible
            p-0
            transition-all
            duration-150
            outline-none
            focus:ring-1
            focus:ring-accent/40

            ${
              isDropTarget
                ? `
                  border-accent
                  bg-accent/[0.07]
                  shadow-lg
                  shadow-accent/10
                `
                : `
                  hover:border-white/15
                `
            }

            ${
              isDragging
                ? `
                  scale-[0.985]
                  opacity-35
                `
                : ""
            }
          `}
          style={{
            marginLeft: visualLevel > 0 ? `${visualLevel * 12}px` : undefined,
          }}
        >
          {/* ==================================================
              INDICADOR DE HIERARQUIA
          ================================================== */}

          {level > 0 && (
            <div
              className="
                pointer-events-none
                absolute
                -left-3
                top-0
                bottom-0
                w-px
                bg-white/[0.07]
              "
            />
          )}

          {/* ==================================================
              CONTEÚDO PRINCIPAL
          ================================================== */}

          <div
            className="
              flex
              min-h-[54px]
              items-start
              gap-1.5
              px-2.5
              py-2
            "
          >
            {/* ==================================================
                HANDLE
            ================================================== */}

            <div
              draggable
              onDragStart={(event) => handleDragStart(event, card)}
              className="
                mt-0.5
                flex
                h-5
                w-4
                shrink-0
                cursor-grab
                items-center
                justify-center
                rounded
                text-text-muted
                opacity-0
                transition
                group-hover:opacity-60
                hover:bg-white/10
                hover:opacity-100
                active:cursor-grabbing
              "
              title="Arrastar para organizar"
            >
              <GripVertical size={13} />
            </div>

            {/* ==================================================
                EXPANDIR
            ================================================== */}

            <div className="mt-0.5 shrink-0">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();

                    toggleExpanded(cardId);
                  }}
                  className="
                    flex
                    h-5
                    w-5
                    items-center
                    justify-center
                    rounded
                    text-text-muted
                    transition
                    hover:bg-white/10
                    hover:text-text
                  "
                  title={isExpanded ? "Recolher" : "Expandir"}
                >
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <div className="h-5 w-5" />
              )}
            </div>

            {/* ==================================================
                CONTEÚDO
            ================================================== */}

            <div className="min-w-0 flex-1">
              <div
                className="
                  flex
                  min-w-0
                  items-start
                  gap-2
                "
              >
                <h3
                  className="
                    min-w-0
                    flex-1
                    break-words
                    text-[13px]
                    font-semibold
                    leading-5
                    text-text
                  "
                >
                  {front || "Sem pergunta"}
                </h3>

                <QueueBadge queue={card.queue} />
              </div>

              {back && (
                <p
                  className="
                    mt-0.5
                    line-clamp-1
                    break-words
                    text-[11px]
                    leading-4
                    text-text-muted
                  "
                >
                  {back}
                </p>
              )}

              {/* ==================================================
                  CONTEXTO DOS FILHOS
              ================================================== */}

              {hasChildren && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();

                    toggleExpanded(cardId);
                  }}
                  className="
                    mt-1
                    inline-flex
                    items-center
                    gap-1
                    rounded
                    text-[10px]
                    font-medium
                    text-text-muted
                    transition
                    hover:text-accent
                  "
                >
                  <CornerDownRight size={10} />

                  {children.length}

                  <span>{children.length === 1 ? "filho" : "filhos"}</span>

                  {isExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                </button>
              )}

              {/* ==================================================
                  DROP FEEDBACK
              ================================================== */}

              {isDropTarget && (
                <div
                  className="
                    mt-1
                    flex
                    items-center
                    gap-1.5
                    rounded
                    bg-accent/[0.06]
                    px-2
                    py-1
                    text-[10px]
                    font-medium
                    text-accent
                  "
                >
                  <CornerDownRight size={10} />
                  Solte aqui para organizar
                </div>
              )}
            </div>

            {/* ==================================================
                MENU INTELIGENTE
            ================================================== */}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();

                  setMenuCardId(isMenuOpen ? null : cardId);
                }}
                className="
                  flex
                  h-7
                  w-7
                  items-center
                  justify-center
                  rounded-lg
                  text-text-muted
                  opacity-0
                  transition
                  group-hover:opacity-100
                  hover:bg-white/10
                  hover:text-text
                  focus:opacity-100
                "
                title="Mais ações"
                aria-label="Mais ações"
              >
                <MoreHorizontal size={16} />
              </button>

              {isMenuOpen && (
                <div
                  onClick={(event) => event.stopPropagation()}
                  className="
                    absolute
                    right-0
                    top-8
                    z-50
                    min-w-[180px]
                    overflow-hidden
                    rounded-xl
                    border
                    border-white/10
                    bg-[#151515]
                    p-1
                    shadow-2xl
                    shadow-black/30
                  "
                >
                  {/* NOVO FILHO */}

                  {onAddChild && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setMenuCardId(null);

                        onAddChild(cardId);
                      }}
                      className="
                        flex
                        w-full
                        items-center
                        gap-2
                        rounded-lg
                        px-2.5
                        py-2
                        text-left
                        text-xs
                        text-text
                        transition
                        hover:bg-white/[0.06]
                      "
                    >
                      <Plus size={13} />
                      Criar card filho
                      <span className="ml-auto text-[9px] text-text-muted">Ctrl ↵</span>
                    </button>
                  )}

                  {/* RECOLHER */}

                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => {
                        toggleExpanded(cardId);

                        setMenuCardId(null);
                      }}
                      className="
                        flex
                        w-full
                        items-center
                        gap-2
                        rounded-lg
                        px-2.5
                        py-2
                        text-left
                        text-xs
                        text-text
                        transition
                        hover:bg-white/[0.06]
                      "
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}

                      {isExpanded ? "Recolher" : "Expandir"}

                      <span className="ml-auto text-[9px] text-text-muted">Espaço</span>
                    </button>
                  )}

                  {/* VOLTAR PARA RAIZ */}

                  {onMoveInto && getParentId(card) !== null && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleMoveInto(cardId, null)}
                      className="
                          flex
                          w-full
                          items-center
                          gap-2
                          rounded-lg
                          px-2.5
                          py-2
                          text-left
                          text-xs
                          text-text
                          transition
                          hover:bg-white/[0.06]
                        "
                    >
                      <CornerDownRight size={13} />
                      Mover para principal
                    </button>
                  )}

                  {/* SUBIR */}

                  {onReorder && index > 0 && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setMenuCardId(null);

                        void moveUp(index, list);
                      }}
                      className="
                          flex
                          w-full
                          items-center
                          gap-2
                          rounded-lg
                          px-2.5
                          py-2
                          text-left
                          text-xs
                          text-text
                          transition
                          hover:bg-white/[0.06]
                        "
                    >
                      Mover para cima
                      <span className="ml-auto text-[9px] text-text-muted">Ctrl ↑</span>
                    </button>
                  )}

                  {/* DESCER */}

                  {onReorder && index < list.length - 1 && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setMenuCardId(null);

                        void moveDown(index, list);
                      }}
                      className="
                          flex
                          w-full
                          items-center
                          gap-2
                          rounded-lg
                          px-2.5
                          py-2
                          text-left
                          text-xs
                          text-text
                          transition
                          hover:bg-white/[0.06]
                        "
                    >
                      Mover para baixo
                      <span className="ml-auto text-[9px] text-text-muted">Ctrl ↓</span>
                    </button>
                  )}

                  {/* DIVISOR */}

                  {onDelete && <div className="my-1 border-t border-white/[0.06]" />}

                  {/* EXCLUIR */}

                  {onDelete && (
                    <button
                      type="button"
                      disabled={isBusy || deleteLoading}
                      onClick={() => handleDelete(card)}
                      className="
                        flex
                        w-full
                        items-center
                        gap-2
                        rounded-lg
                        px-2.5
                        py-2
                        text-left
                        text-xs
                        text-red-400
                        transition
                        hover:bg-red-500/10
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      {isBusy ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Excluir
                      <span className="ml-auto text-[9px]">Del</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================================================
            FILHOS
        ================================================== */}

        {isExpanded && children.length > 0 && (
          <div
            className="
                relative
                ml-2
                mt-1
                space-y-1
                pl-2
              "
          >
            {children.map((child, childIndex) =>
              renderCard(child, childIndex, children, level + 1),
            )}
          </div>
        )}
      </div>
    );
  }

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <Panel className="p-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <RefreshCw size={14} className="animate-spin text-accent" />

          <p className="text-xs text-text-muted">Carregando flashcards...</p>
        </div>
      </Panel>
    );
  }

  /* ==========================================================
   * ERROR
   * ========================================================== */

  if (error) {
    return (
      <Panel className="p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-500" />

          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Erro ao carregar cards</h3>

            <p className="mt-1 text-xs text-text-muted">{error}</p>
          </div>
        </div>

        {onRetry && (
          <Button variant="secondary" className="mt-3 h-7 text-xs" onClick={onRetry}>
            <RefreshCw size={12} />
            Atualizar
          </Button>
        )}
      </Panel>
    );
  }

  /* ==========================================================
   * PRINCIPAL
   * ========================================================== */

  return (
    <>
      <div
        className="space-y-3"
        onClick={() => {
          if (menuCardId) {
            setMenuCardId(null);
          }
        }}
      >
        {/* ======================================================
            CABEÇALHO
        ====================================================== */}

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="
                flex
                h-7
                w-7
                shrink-0
                items-center
                justify-center
                rounded-md
                bg-accent/10
                text-accent
              "
            >
              <Layers size={14} />
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text">Flashcards</h2>

              <p className="text-[10px] text-text-muted">
                {cards.length} {cards.length === 1 ? "card" : "cards"}
              </p>
            </div>
          </div>

          <Button
            onClick={onAdd}
            className="
              h-7
              px-2.5
              text-[11px]
            "
          >
            <Plus size={13} />
            Novo card
          </Button>
        </div>

        {/* ======================================================
            ÁREA PRINCIPAL
        ====================================================== */}

        {cards.length === 0 ? (
          <EmptyState
            title="Nenhum flashcard"
            description="Este deck ainda não possui cards."
            action={
              <Button onClick={onAdd} className="h-7 text-xs">
                <Plus size={13} />
                Criar card
              </Button>
            }
          />
        ) : (
          <div
            className="space-y-1.5"
            onDragOver={(event) => {
              event.preventDefault();

              if (draggingId) {
                setDropRoot(true);
              }
            }}
            onDragLeave={() => setDropRoot(false)}
            onDrop={(event) => void handleDropRoot(event)}
          >
            {rootCards.map((card, index) => renderCard(card, index, rootCards))}

            {/* ==================================================
                ÁREA DE RAIZ
            ================================================== */}

            {draggingId && (
              <div
                className={`
                  flex
                  min-h-[34px]
                  items-center
                  justify-center
                  rounded-lg
                  border
                  border-dashed
                  px-3
                  py-2
                  text-[10px]
                  transition-all

                  ${
                    dropRoot
                      ? `
                        border-accent/40
                        bg-accent/[0.06]
                        text-accent
                      `
                      : `
                        border-white/[0.08]
                        text-text-muted
                      `
                  }
                `}
              >
                <CornerDownRight size={11} className="mr-1.5" />
                Solte aqui para deixar no nível principal
              </div>
            )}
          </div>
        )}

        {/* ======================================================
            AJUDA MINIMALISTA
        ====================================================== */}

        {cards.length > 0 && (
          <div
            className="
              flex
              items-center
              justify-center
              gap-3
              pt-1
              text-[9px]
              text-text-muted/60
            "
          >
            <span>Arraste para organizar</span>

            <span>•</span>

            <span>Duplo clique para abrir</span>

            <span>•</span>

            <span>⋯ para ações</span>
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL DE EXCLUSÃO
      ======================================================== */}

      {deleteTarget && (
        <div
          className="
            fixed
            inset-0
            z-[200]
            flex
            items-center
            justify-center
            bg-black/60
            px-4
            backdrop-blur-sm
          "
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-card-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteLoading) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="
              w-full
              max-w-md
              overflow-hidden
              rounded-2xl
              border
              border-white/10
              bg-[#111318]
              shadow-2xl
            "
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* ==================================================
                CABEÇALHO
            ================================================== */}

            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="
                    flex
                    h-10
                    w-10
                    shrink-0
                    items-center
                    justify-center
                    rounded-xl
                    bg-red-500/10
                    text-red-400
                  "
                >
                  <Trash2 size={19} />
                </div>

                <div className="min-w-0">
                  <h2
                    id="delete-card-title"
                    className="
                      text-base
                      font-semibold
                      text-white
                    "
                  >
                    Excluir card?
                  </h2>

                  <p className="mt-1 text-sm text-white/50">Esta ação não poderá ser desfeita.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!deleteLoading) {
                    setDeleteTarget(null);
                  }
                }}
                disabled={deleteLoading}
                className="
                  shrink-0
                  rounded-lg
                  p-1.5
                  text-white/40
                  transition
                  hover:bg-white/5
                  hover:text-white
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* ==================================================
                CONTEÚDO
            ================================================== */}

            <div className="px-5 py-5">
              <p className="text-sm leading-6 text-white/70">
                Deseja realmente excluir o card{" "}
                <span className="font-semibold text-white">"{deleteTarget.title}"</span>?
              </p>

              {deleteTarget.childrenCount > 0 && (
                <div
                  className="
                    mt-4
                    rounded-xl
                    border
                    border-amber-500/20
                    bg-amber-500/[0.06]
                    px-3
                    py-2.5
                  "
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={15}
                      className="
                        mt-0.5
                        shrink-0
                        text-amber-400
                      "
                    />

                    <p className="text-xs leading-5 text-amber-300/80">
                      Este card possui{" "}
                      <span className="font-semibold text-amber-300">
                        {deleteTarget.childrenCount}
                      </span>{" "}
                      {deleteTarget.childrenCount === 1 ? "card filho" : "cards filhos"}.
                    </p>
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs leading-5 text-red-400/70">
                {deleteTarget.childrenCount > 0
                  ? "A exclusão também poderá remover a estrutura associada a esses cards."
                  : "Essa ação não poderá ser desfeita."}
              </p>
            </div>

            {/* ==================================================
                AÇÕES
            ================================================== */}

            <div
              className="
                flex
                flex-col-reverse
                gap-2
                border-t
                border-white/5
                bg-white/[0.015]
                px-5
                py-4
                sm:flex-row
                sm:justify-end
              "
            >
              <button
                type="button"
                onClick={() => {
                  if (!deleteLoading) {
                    setDeleteTarget(null);
                  }
                }}
                disabled={deleteLoading}
                className="
                  rounded-xl
                  border
                  border-white/10
                  px-4
                  py-2.5
                  text-sm
                  font-medium
                  text-white/70
                  transition
                  hover:bg-white/5
                  hover:text-white
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteLoading}
                className="
                  inline-flex
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-red-500
                  px-4
                  py-2.5
                  text-sm
                  font-semibold
                  text-white
                  transition
                  hover:bg-red-400
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                {deleteLoading ? (
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
                  <>
                    <Trash2 size={14} />
                    Excluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
