import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileUp,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Library,
  LibraryBig,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Plus,
  RefreshCw,
  Sparkles,
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
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Link } from "react-router-dom";

import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  Panel,
  Spinner,
  Textarea,
} from "../components/ui";

import {
  createDeck,
  copyDeck,
  bulkDeleteDecks,
  bulkMoveDecks,
  deleteFolder,
  extractErrorMessage,
  listDecks,
  listDeckTemplates,
  listFolders,
  moveDeck,
} from "../lib/api";

import type { Deck, Folder } from "../lib/types";

import CreateFolderModal from "../components/decks/CreateFolderModal";
import ImportAnkiModal from "../components/decks/ImportAnkiModal";
import { useAuth } from "../lib/auth-context";

/* ==================================================================== */
/* NOTAS DE REDESIGN                                                     */
/* ==================================================================== */
/*
 * O que mudou em relação à versão anterior, e por quê:
 *
 * 1. Cabeçalho: havia 4 pontos de entrada concorrendo por atenção
 *    (Atualizar, Modelos, Ações, Criar). "Modelos" existia em 3 lugares
 *    diferentes (botão desktop, card mobile, menu). Consolidado em:
 *    ação primária (Criar deck) + menu único de "Mais ações".
 *    Modelos ganha destaque contextual só quando a biblioteca está vazia
 *    (é quando o usuário mais precisa de um ponto de partida).
 *
 * 2. Pastas: uma grade grande de cards competia visualmente com o
 *    conteúdo principal (os decks). Pastas são navegação, não conteúdo —
 *    viraram uma fita horizontal de chips, compacta e sempre visível,
 *    sem roubar a hierarquia da tela.
 *
 * 3. Seleção em massa: a barra de seleção ficava sempre visível
 *    ocupando ~58px mesmo sem nada selecionado. Agora existe um modo de
 *    seleção explícito (padrão em apps de arquivos/fotos), ativado por
 *    um botão "Selecionar" — interface limpa no caminho comum,
 *    ferramentas completas quando necessário.
 *
 * 4. Mover deck sem mouse: arrastar-e-soltar não funciona em telas
 *    touch (a API HTML5 DnD não cobre touch) nem é acessível via
 *    teclado. Cada card agora tem um menu "···" com "Mover para pasta",
 *    cobrindo mobile e teclado com o mesmo resultado do drag.
 *
 * 5. Formulário de criação: um wizard de 2 passos para um objeto simples
 *    (nome + descrição + pasta + meta + cor) adicionava cliques
 *    desnecessários. Agora é um formulário único, com descrição e
 *    personalização (meta/cor) como seções opcionais que só aparecem
 *    se o usuário quiser — criar um deck rápido agora leva 1 campo.
 *
 * 6. Texto do modal de exclusão de pasta era ambíguo ("não serão
 *    necessariamente excluídos"). Reescrito para dizer exatamente o
 *    que acontece.
 */

/* ==================================================================== */
/* TIPOS                                                                 */
/* ==================================================================== */

type DropFolderId = string | "no-folder" | null;

/* ==================================================================== */
/* CONSTANTES DE ESTILO                                                  */
/* ==================================================================== */

const ICON_BUTTON_CLASS = `
  flex h-9 w-9 shrink-0 items-center justify-center
  rounded-xl
  border border-border/60
  bg-surface
  text-text-muted
  transition-all duration-200
  hover:border-border
  hover:bg-panel
  hover:text-text
  active:scale-95
  disabled:pointer-events-none
  disabled:opacity-40
`;

const MODAL_BACKDROP_CLASS = `
  fixed inset-0 z-50
  flex items-center justify-center
  bg-black/70 p-4
  backdrop-blur-md
`;

const MODAL_CLASS = `
  w-full overflow-hidden
  rounded-3xl
  border border-border/80
  bg-ink-soft
  shadow-2xl
  shadow-black/30
`;

const SECTION_LABEL_CLASS = `
  text-[10px]
  font-bold
  uppercase
  tracking-[0.16em]
  text-text-faint
`;

/* ==================================================================== */
/* HELPERS DE COR                                                        */
/* ==================================================================== */

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim();

  if (normalized.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function colorWithAlpha(color: string, alpha: number) {
  if (color.includes("var(--accent)")) {
    return `rgb(var(--accent) / ${alpha})`;
  }

  if (color.startsWith("#")) {
    return hexToRgba(color, alpha);
  }

  if (color.startsWith("rgb(")) {
    return color.replace(/^rgb\((.*)\)$/i, `rgb($1 / ${alpha})`);
  }

  return color;
}

/* ==================================================================== */
/* HOOK: fechar ao clicar fora                                           */
/* ==================================================================== */

function useClickOutside(active: boolean, onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    function handlePointerDown(event: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [active, onOutside]);

  return ref;
}

/* ==================================================================== */
/* DECKS — PÁGINA PRINCIPAL                                              */
/* ==================================================================== */

export default function Decks() {
  const { user } = useAuth();

  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [templates, setTemplates] = useState<Deck[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  /* -------------------------------------------------------------- */
  /* DRAG                                                             */
  /* -------------------------------------------------------------- */

  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<DropFolderId>(null);

  const [movingDeck, setMovingDeck] = useState(false);
  const [movingDeckId, setMovingDeckId] = useState<string | null>(null);

  const didDragRef = useRef(false);
  const dragResetTimerRef = useRef<number | null>(null);

  /* -------------------------------------------------------------- */
  /* TEMPLATES                                                        */
  /* -------------------------------------------------------------- */

  const [copyingTemplate, setCopyingTemplate] = useState<string | null>(null);

  /* -------------------------------------------------------------- */
  /* SELEÇÃO                                                          */
  /* -------------------------------------------------------------- */

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState<Set<string>>(new Set());
  const lastSelectedDeckIdRef = useRef<string | null>(null);

  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTargetFolder, setBulkTargetFolder] = useState("");

  /* -------------------------------------------------------------- */
  /* MENU POR CARD (mover / selecionar)                               */
  /* -------------------------------------------------------------- */

  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);

  /* ==================================================================== */
  /* OWNERSHIP                                                             */
  /* ==================================================================== */

  const isOwnedDeck = useCallback(
    (deck: Deck) => {
      const ownerId = deck.owner_id ?? deck.user_id;

      if (!ownerId) return true;
      if (ownerId === "local") return true;
      if (!user?.id) return false;

      return ownerId === user.id;
    },
    [user?.id],
  );

  const isOwnedFolder = useCallback(
    (folder: Folder) => {
      const ownerId = folder.user_id;

      if (!ownerId) return true;
      if (ownerId === "local") return true;
      if (!user?.id) return false;

      return ownerId === user.id;
    },
    [user?.id],
  );

  const ownedFolders = useMemo(() => folders.filter(isOwnedFolder), [folders, isOwnedFolder]);

  const visibleDecks = useMemo(() => {
    if (!decks) return [];
    if (!selectedFolder) return decks;

    return decks.filter((deck) => deck.folder_id === selectedFolder);
  }, [decks, selectedFolder]);

  const selectedFolderName = useMemo(() => {
    if (!selectedFolder) return null;

    return folders.find((folder) => folder.id === selectedFolder)?.name ?? null;
  }, [folders, selectedFolder]);

  /* ==================================================================== */
  /* SELEÇÃO — helpers                                                     */
  /* ==================================================================== */

  const exitSelectionMode = useCallback(() => {
    if (bulkBusy) return;

    setSelectionMode(false);
    setSelectedDecks(new Set());
    setBulkTargetFolder("");
    lastSelectedDeckIdRef.current = null;
  }, [bulkBusy]);

  const enterSelectionMode = useCallback((firstDeckId?: string) => {
    setSelectionMode(true);
    setOpenCardMenuId(null);

    if (firstDeckId) {
      setSelectedDecks(new Set([firstDeckId]));
      lastSelectedDeckIdRef.current = firstDeckId;
    }
  }, []);

  const selectAllVisibleDecks = useCallback(() => {
    if (bulkBusy || movingDeck || visibleDecks.length === 0) return;

    setSelectionMode(true);
    setSelectedDecks(new Set(visibleDecks.map((deck) => deck.id)));
    lastSelectedDeckIdRef.current = visibleDecks[0]?.id ?? null;
  }, [bulkBusy, movingDeck, visibleDecks]);

  const selectDeck = useCallback(
    (deckId: string, options?: { shiftKey?: boolean }) => {
      if (bulkBusy || movingDeck) return;

      const shiftKey = options?.shiftKey ?? false;
      const anchorId = lastSelectedDeckIdRef.current;

      if (shiftKey && anchorId) {
        const startIndex = visibleDecks.findIndex((deck) => deck.id === anchorId);
        const endIndex = visibleDecks.findIndex((deck) => deck.id === deckId);

        if (startIndex !== -1 && endIndex !== -1) {
          const from = Math.min(startIndex, endIndex);
          const to = Math.max(startIndex, endIndex);

          setSelectedDecks((previous) => {
            const next = new Set(previous);

            for (let index = from; index <= to; index += 1) {
              next.add(visibleDecks[index].id);
            }

            return next;
          });

          return;
        }
      }

      setSelectedDecks((previous) => {
        const next = new Set(previous);

        if (next.has(deckId)) {
          next.delete(deckId);
        } else {
          next.add(deckId);
        }

        return next;
      });

      lastSelectedDeckIdRef.current = deckId;
    },
    [bulkBusy, movingDeck, visibleDecks],
  );

  const allVisibleDecksSelected =
    visibleDecks.length > 0 && visibleDecks.every((deck) => selectedDecks.has(deck.id));

  const toggleAllVisibleDecks = useCallback(() => {
    if (bulkBusy || movingDeck || visibleDecks.length === 0) return;

    if (allVisibleDecksSelected) {
      setSelectedDecks((previous) => {
        const next = new Set(previous);
        visibleDecks.forEach((deck) => next.delete(deck.id));
        return next;
      });
      return;
    }

    selectAllVisibleDecks();
  }, [allVisibleDecksSelected, bulkBusy, movingDeck, selectAllVisibleDecks, visibleDecks]);

  /* ==================================================================== */
  /* TECLADO                                                                */
  /* ==================================================================== */

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (openCardMenuId) {
          setOpenCardMenuId(null);
          return;
        }

        if (selectionMode) {
          event.preventDefault();
          exitSelectionMode();
        }

        return;
      }

      const target = event.target as HTMLElement | null;

      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllVisibleDecks();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [exitSelectionMode, openCardMenuId, selectAllVisibleDecks, selectionMode]);

  /* ==================================================================== */
  /* RELOAD                                                                */
  /* ==================================================================== */

  const reload = useCallback(async () => {
    try {
      setReloading(true);
      setError(null);

      const [decksData, foldersData, templatesData] = await Promise.all([
        listDecks(),
        listFolders(),
        listDeckTemplates(),
      ]);

      const safeDecks = Array.isArray(decksData) ? decksData : [];
      const safeFolders = Array.isArray(foldersData) ? foldersData : [];
      const safeTemplates = Array.isArray(templatesData) ? templatesData : [];

      const ownedDecks = safeDecks.filter(isOwnedDeck);
      const ownedFoldersData = safeFolders.filter(isOwnedFolder);

      setDecks(ownedDecks);
      setFolders(ownedFoldersData);
      setTemplates(safeTemplates);

      setSelectedDecks((previous) => {
        const availableIds = new Set(ownedDecks.map((deck) => deck.id));
        const next = new Set<string>();

        previous.forEach((id) => {
          if (availableIds.has(id)) next.add(id);
        });

        return next;
      });

      const anchorId = lastSelectedDeckIdRef.current;

      if (anchorId && !ownedDecks.some((deck) => deck.id === anchorId)) {
        lastSelectedDeckIdRef.current = null;
      }

      if (selectedFolder && !ownedFoldersData.some((folder) => folder.id === selectedFolder)) {
        setSelectedFolder(null);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setReloading(false);
    }
  }, [isOwnedDeck, isOwnedFolder, selectedFolder]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ==================================================================== */
  /* SINCRONIZAÇÃO — recarrega quando o banco local muda por push/pull    */
  /* (ex: um deck apagado em outro dispositivo chega aqui automaticamente) */
  /* ==================================================================== */

  useEffect(() => {
    function handleSyncFinished() {
      void reload();
    }

    window.addEventListener("theo-sync-finished", handleSyncFinished);

    return () => {
      window.removeEventListener("theo-sync-finished", handleSyncFinished);
    };
  }, [reload]);

  /* ==================================================================== */
  /* DRAG — reset                                                          */
  /* ==================================================================== */

  const resetDragState = useCallback(() => {
    setDraggedDeckId(null);
    setDragOverFolderId(null);

    if (dragResetTimerRef.current !== null) {
      window.clearTimeout(dragResetTimerRef.current);
    }

    dragResetTimerRef.current = window.setTimeout(() => {
      didDragRef.current = false;
      dragResetTimerRef.current = null;
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current !== null) {
        window.clearTimeout(dragResetTimerRef.current);
      }
    };
  }, []);

  /* ==================================================================== */
  /* MOVER DECK (usado por drag-and-drop E pelo menu "···")               */
  /* ==================================================================== */

  const moveDeckToFolder = useCallback(
    async (deckId: string, folderId: string | null) => {
      if (movingDeck || bulkBusy) return;

      const previousDecks = decks;

      try {
        setMovingDeck(true);
        setMovingDeckId(deckId);
        setError(null);

        if (folderId && !ownedFolders.some((folder) => folder.id === folderId)) {
          throw new Error("A pasta selecionada não pertence ao usuário.");
        }

        setDecks((current) => {
          if (!current) return current;

          return current.map((deck) =>
            deck.id === deckId ? { ...deck, folder_id: folderId } : deck,
          );
        });

        await moveDeck(deckId, { folder_id: folderId, parent_deck_id: null });
        await reload();
      } catch (err) {
        if (previousDecks) setDecks(previousDecks);
        setError(extractErrorMessage(err));
      } finally {
        setMovingDeck(false);
        setMovingDeckId(null);
        resetDragState();
      }
    },
    [bulkBusy, decks, movingDeck, ownedFolders, reload, resetDragState],
  );

  /* ==================================================================== */
  /* DRAG HANDLERS                                                         */
  /* ==================================================================== */

  function handleDeckDragStart(event: DragEvent<HTMLButtonElement>, deckId: string) {
    if (movingDeck || bulkBusy || selectionMode) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();

    if (dragResetTimerRef.current !== null) {
      window.clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = null;
    }

    didDragRef.current = true;
    setDraggedDeckId(deckId);
    setDragOverFolderId(null);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", deckId);

    const deck = decks?.find((item) => item.id === deckId);
    const dragImage = document.createElement("div");

    dragImage.style.position = "absolute";
    dragImage.style.top = "-1000px";
    dragImage.style.left = "-1000px";
    dragImage.style.padding = "10px 14px";
    dragImage.style.borderRadius = "12px";
    dragImage.style.background = "#18181b";
    dragImage.style.border = "1px solid rgba(148,163,184,.18)";
    dragImage.style.color = "#fff";
    dragImage.style.fontSize = "12px";
    dragImage.style.fontWeight = "600";
    dragImage.style.boxShadow = "0 20px 40px rgba(0,0,0,.35)";
    dragImage.style.pointerEvents = "none";
    dragImage.style.whiteSpace = "nowrap";
    dragImage.textContent = deck?.name ? `Movendo: ${deck.name}` : "Movendo deck";

    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 50, 20);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (document.body.contains(dragImage)) {
          document.body.removeChild(dragImage);
        }
      });
    });
  }

  function handleFolderDragOver(event: DragEvent<HTMLButtonElement>, folderId: DropFolderId) {
    if (!draggedDeckId || movingDeck || bulkBusy) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    if (dragOverFolderId !== folderId) setDragOverFolderId(folderId);
  }

  function handleFolderDragEnter(event: DragEvent<HTMLButtonElement>, folderId: DropFolderId) {
    if (!draggedDeckId || movingDeck || bulkBusy) return;

    event.preventDefault();
    event.stopPropagation();
    setDragOverFolderId(folderId);
  }

  function handleFolderDragLeave(event: DragEvent<HTMLButtonElement>, folderId: DropFolderId) {
    if (!draggedDeckId) return;

    event.stopPropagation();

    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (dragOverFolderId === folderId) setDragOverFolderId(null);
  }

  async function handleFolderDrop(event: DragEvent<HTMLButtonElement>, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedDeckId || movingDeck || bulkBusy) {
      resetDragState();
      return;
    }

    const deckId = event.dataTransfer.getData("text/plain") || draggedDeckId;

    if (!deckId) {
      resetDragState();
      return;
    }

    const currentDeck = decks?.find((deck) => deck.id === deckId);

    if (currentDeck && (currentDeck.folder_id ?? null) === folderId) {
      resetDragState();
      return;
    }

    await moveDeckToFolder(deckId, folderId);
  }

  /* ==================================================================== */
  /* MODELOS                                                                */
  /* ==================================================================== */

  async function handleCopyTemplate(templateId: string) {
    if (copyingTemplate) return;

    try {
      setCopyingTemplate(templateId);
      setError(null);

      await copyDeck(templateId);
      await reload();

      setShowTemplates(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCopyingTemplate(null);
    }
  }

  /* ==================================================================== */
  /* EXCLUIR PASTA                                                         */
  /* ==================================================================== */

  async function handleDeleteFolder() {
    if (!folderToDelete) return;

    try {
      setError(null);
      await deleteFolder(folderToDelete.id);

      if (selectedFolder === folderToDelete.id) {
        setSelectedFolder(null);
      }

      setFolderToDelete(null);
      await reload();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  /* ==================================================================== */
  /* AÇÕES EM MASSA                                                         */
  /* ==================================================================== */

  async function moveSelectedDecks() {
    if (selectedDecks.size === 0 || bulkBusy || movingDeck) return;

    const folderId = bulkTargetFolder || null;

    if (folderId && !ownedFolders.some((folder) => folder.id === folderId)) {
      setError("A pasta selecionada não pertence ao usuário.");
      return;
    }

    try {
      setBulkBusy(true);
      setError(null);

      await bulkMoveDecks(Array.from(selectedDecks), folderId);

      exitSelectionMode();
      await reload();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelectedDecks() {
    if (selectedDecks.size === 0 || bulkBusy || movingDeck) return;

    const quantity = selectedDecks.size;

    const confirmed = window.confirm(
      `Remover ${quantity} ${quantity === 1 ? "deck selecionado" : "decks selecionados"}?\n\nEssa ação não pode ser desfeita.`,
    );

    if (!confirmed) return;

    try {
      setBulkBusy(true);
      setError(null);

      await bulkDeleteDecks(Array.from(selectedDecks));

      exitSelectionMode();
      await reload();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  /* ==================================================================== */
  /* RESET ao trocar de pasta / sair do modo de seleção                    */
  /* ==================================================================== */

  useEffect(() => {
    if (!bulkBusy) exitSelectionMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder]);

  /* ==================================================================== */
  /* RENDER                                                                 */
  /* ==================================================================== */

  const showEmptyLibrary = decks !== null && decks.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ================================================================ */}
      {/* CABEÇALHO — uma única ação primária, resto agrupado em "Mais"     */}
      {/* ================================================================ */}

      <header className="mb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/15 bg-accent/10 text-accent">
              <LibraryBig size={21} strokeWidth={1.8} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-text sm:text-[27px]">
                  Meus decks
                </h1>

                {decks && (
                  <span className="shrink-0 rounded-md border border-border/60 bg-panel px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-text-muted">
                    {decks.length}
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-sm text-text-muted">Sua biblioteca de estudos.</p>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={reloading || bulkBusy || movingDeck}
              className={`${ICON_BUTTON_CLASS} hover:border-accent/30 hover:bg-accent/[0.04] hover:text-accent`}
              title="Atualizar biblioteca"
              aria-label="Atualizar biblioteca"
            >
              <RefreshCw size={16} className={reloading ? "animate-spin text-accent" : ""} />
            </button>

            <HeaderMenu
              templatesCount={templates.length}
              onOpenTemplates={() => setShowTemplates(true)}
              onOpenImport={() => setShowImport(true)}
              onOpenNewFolder={() => setShowFolderForm(true)}
              open={showActions}
              onOpenChange={setShowActions}
            />

            <Button
              onClick={() => setShowForm(true)}
              className="h-10 flex-1 shadow-lg shadow-accent/10 sm:flex-none"
            >
              <Plus size={17} />
              <span>Criar deck</span>
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* ================================================================ */}
      {/* CONVITE PARA MODELOS — só aparece quando a biblioteca está vazia  */}
      {/* (é o momento em que o usuário mais precisa de um ponto de partida)*/}
      {/* ================================================================ */}

      {showEmptyLibrary && templates.length > 0 && (
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="mb-8 flex w-full items-center justify-between rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 text-left transition hover:bg-accent/[0.07]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Sparkles size={18} />
            </div>

            <div>
              <p className="text-sm font-semibold text-text">Comece com um modelo do Theo</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {templates.length}{" "}
                {templates.length === 1 ? "estrutura pronta" : "estruturas prontas"} para você
                copiar e usar
              </p>
            </div>
          </div>

          <ChevronRight size={17} className="shrink-0 text-text-faint" />
        </button>
      )}

      {/* ================================================================ */}
      {/* STATUS DE ARRASTE                                                  */}
      {/* ================================================================ */}

      {draggedDeckId && (
        <div className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/25 bg-ink-soft px-4 py-2.5 text-xs font-semibold text-accent shadow-2xl backdrop-blur-xl">
          {movingDeck ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
          <span>{movingDeck ? "Movendo deck..." : "Solte em uma pasta"}</span>
        </div>
      )}

      {/* ================================================================ */}
      {/* PASTAS — fita horizontal compacta, não compete com os decks       */}
      {/* ================================================================ */}

      <section className="mb-6">
        <div className="mb-2.5 flex items-center justify-between">
          <p className={SECTION_LABEL_CLASS}>Pastas</p>

          {draggedDeckId && (
            <p className="text-[11px] text-text-faint">
              Solte em <strong className="text-text-muted">Todos</strong> para remover da pasta
            </p>
          )}
        </div>

        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
          <FolderChip
            name="Todos"
            count={decks?.length ?? 0}
            selected={selectedFolder === null}
            dropTarget={dragOverFolderId === "no-folder"}
            dragging={Boolean(draggedDeckId)}
            moving={movingDeck && dragOverFolderId === "no-folder"}
            icon={<Library size={14} />}
            onClick={() => {
              if (!draggedDeckId) setSelectedFolder(null);
            }}
            onDragEnter={(event) => handleFolderDragEnter(event, "no-folder")}
            onDragOver={(event) => handleFolderDragOver(event, "no-folder")}
            onDragLeave={(event) => handleFolderDragLeave(event, "no-folder")}
            onDrop={(event) => void handleFolderDrop(event, null)}
          />

          {ownedFolders.map((folder) => {
            const folderDeckCount =
              decks?.filter((deck) => deck.folder_id === folder.id).length ?? 0;

            return (
              <FolderChip
                key={folder.id}
                name={folder.name}
                count={folderDeckCount}
                selected={selectedFolder === folder.id}
                dropTarget={dragOverFolderId === folder.id}
                dragging={Boolean(draggedDeckId)}
                moving={movingDeck && dragOverFolderId === folder.id}
                icon={<FolderOpen size={14} />}
                onClick={() => {
                  if (!draggedDeckId) setSelectedFolder(folder.id);
                }}
                onContextMenu={(event) => {
                  if (draggedDeckId) return;
                  event.preventDefault();
                  setFolderToDelete(folder);
                }}
                onDragEnter={(event) => handleFolderDragEnter(event, folder.id)}
                onDragOver={(event) => handleFolderDragOver(event, folder.id)}
                onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                onDrop={(event) => void handleFolderDrop(event, folder.id)}
              />
            );
          })}

          <button
            type="button"
            onClick={() => setShowFolderForm(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3.5 text-xs font-semibold text-text-faint transition hover:border-accent/30 hover:text-accent"
          >
            <Plus size={13} />
            Nova pasta
          </button>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SEÇÃO DE DECKS                                                     */}
      {/* ================================================================ */}

      <section className="space-y-4">
        {/* CABEÇALHO DA SEÇÃO + SELEÇÃO */}

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate font-display text-xl font-semibold tracking-tight text-text">
                {selectionMode
                  ? selectedDecks.size > 0
                    ? `${selectedDecks.size} ${selectedDecks.size === 1 ? "selecionado" : "selecionados"}`
                    : "Toque para selecionar"
                  : (selectedFolderName ?? "Todos os decks")}
              </h2>

              {!selectionMode && (
                <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-panel px-1.5 text-[10px] font-bold tabular-nums text-text-muted">
                  {visibleDecks.length}
                </span>
              )}
            </div>

            {!selectionMode && (
              <p className="mt-1 text-xs text-text-muted">
                {selectedFolderName ? "Decks desta pasta." : "Todos os seus decks."}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {selectionMode ? (
              <>
                <button
                  type="button"
                  onClick={toggleAllVisibleDecks}
                  disabled={bulkBusy || visibleDecks.length === 0}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-panel hover:text-text disabled:opacity-40"
                >
                  {allVisibleDecksSelected ? "Desmarcar todos" : "Selecionar todos"}
                </button>

                <button
                  type="button"
                  onClick={exitSelectionMode}
                  disabled={bulkBusy}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-panel hover:text-text disabled:opacity-40"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {visibleDecks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => enterSelectionMode()}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-panel hover:text-text"
                  >
                    Selecionar
                  </button>
                )}

                {selectedFolder && (
                  <button
                    type="button"
                    onClick={() => setSelectedFolder(null)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-panel hover:text-text"
                  >
                    <ChevronRight size={13} className="rotate-180" />
                    Todos
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* BARRA DE AÇÕES EM MASSA — só quando há itens selecionados */}

        {selectionMode && selectedDecks.size > 0 && (
          <div className="rounded-2xl border border-accent/25 bg-surface/80 shadow-lg shadow-accent/5 backdrop-blur-xl">
            <div className="flex flex-col gap-2.5 p-3.5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <FolderOpen size={15} className="shrink-0 text-text-faint" />
                <BulkFolderPicker
                  value={bulkTargetFolder}
                  folders={ownedFolders}
                  disabled={bulkBusy || movingDeck}
                  onChange={setBulkTargetFolder}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={bulkBusy || movingDeck}
                  onClick={() => void moveSelectedDecks()}
                >
                  {bulkBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FolderOpen size={14} />
                  )}
                  Mover
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  disabled={bulkBusy || movingDeck}
                  onClick={() => void deleteSelectedDecks()}
                >
                  {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Remover
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CONTEÚDO */}

        {decks === null ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-border/50 bg-surface/40">
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-xs text-text-faint">Carregando biblioteca...</p>
            </div>
          </div>
        ) : visibleDecks.length === 0 ? (
          <Panel className="border-border/60">
            <EmptyState
              icon={<LibraryBig size={32} strokeWidth={1.5} />}
              title={selectedFolder ? "Esta pasta está vazia" : "Nenhum deck criado ainda"}
              description={
                selectedFolder
                  ? "Crie um deck ou mova um deck existente para esta pasta."
                  : "Crie seu primeiro deck para começar."
              }
              action={
                <Button onClick={() => setShowForm(true)}>
                  <Plus size={16} />
                  Criar deck
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDecks.map((deck) => {
              const totalCards = deck.total_cards ?? 0;
              const isEmpty = totalCards === 0;
              const isDragging = draggedDeckId === deck.id;
              const isMoving = movingDeckId === deck.id;
              const isSelected = selectedDecks.has(deck.id);

              const folderName = deck.folder_id
                ? (folders.find((folder) => folder.id === deck.folder_id)?.name ?? null)
                : null;

              const deckColor = deck.color || "rgb(var(--accent))";
              const deckColorSoft = colorWithAlpha(deckColor, 0.1);
              const deckColorGlow = colorWithAlpha(deckColor, 0.22);

              return (
                <div
                  key={deck.id}
                  className={`group relative min-w-0 transition-all duration-200 ${
                    isDragging ? "scale-[0.97] -rotate-[1deg] opacity-40" : ""
                  }`}
                >
                  <Panel
                    className={`relative h-full min-h-[200px] overflow-hidden rounded-2xl border p-5 transition-all duration-200 ${
                      isSelected
                        ? "border-accent/40 bg-accent/[0.035] shadow-lg shadow-accent/5"
                        : "border-border/70"
                    } ${
                      !isDragging
                        ? "group-hover:-translate-y-0.5 group-hover:border-accent/25 group-hover:shadow-lg group-hover:shadow-black/10"
                        : ""
                    }`}
                  >
                    <div
                      className="absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: deckColor }}
                    />

                    {/* CHECKBOX — só no modo de seleção, sempre visível (não depende de hover) */}

                    {selectionMode && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          selectDeck(deck.id, { shiftKey: event.shiftKey });
                        }}
                        disabled={bulkBusy}
                        aria-label={
                          isSelected ? `Desmarcar ${deck.name}` : `Selecionar ${deck.name}`
                        }
                        aria-pressed={isSelected}
                        className="absolute left-4 top-4 z-30 flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-150 disabled:opacity-40"
                        style={
                          isSelected
                            ? {
                                borderColor: deckColor,
                                backgroundColor: deckColor,
                                boxShadow: `0 4px 16px ${deckColorGlow}`,
                                color: "#fff",
                              }
                            : undefined
                        }
                      >
                        {isSelected ? (
                          <Check size={14} strokeWidth={3} />
                        ) : (
                          <span className="h-4 w-4 rounded-[4px] border border-border/70 bg-ink-soft" />
                        )}
                      </button>
                    )}

                    {/* CONTEÚDO */}

                    <Link
                      to={`/decks/${deck.id}`}
                      onClick={(event) => {
                        if (selectionMode) {
                          event.preventDefault();
                          selectDeck(deck.id, { shiftKey: event.shiftKey });
                          return;
                        }

                        if (didDragRef.current || draggedDeckId || movingDeck || bulkBusy) {
                          event.preventDefault();
                        }
                      }}
                      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <div className={`flex items-start gap-4 ${selectionMode ? "pl-9" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <h3
                            className="truncate font-display text-[17px] font-semibold tracking-tight text-text"
                            title={deck.name}
                          >
                            {deck.name}
                          </h3>

                          {deck.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted">
                              {deck.description}
                            </p>
                          )}

                          {folderName && (
                            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-text-faint">
                              <FolderOpen size={12} />
                              <span className="truncate" title={folderName}>
                                {folderName}
                              </span>
                            </div>
                          )}
                        </div>

                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: isEmpty ? "rgb(var(--panel))" : deckColorSoft,
                            color: isEmpty ? "rgb(var(--text-faint))" : deckColor,
                          }}
                        >
                          {isEmpty ? (
                            <Library size={20} strokeWidth={1.7} />
                          ) : (
                            <LibraryBig size={20} strokeWidth={1.7} />
                          )}
                        </div>
                      </div>

                      <div className="mt-7 flex items-center justify-between border-t border-border/50 pt-4">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-text">
                            {totalCards.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[11px] text-text-muted">
                            {totalCards === 1 ? "cartão" : "cartões"}
                          </span>
                        </div>

                        {deck.target_cards != null && (
                          <span className="rounded-lg border border-border/60 bg-panel px-2 py-1 text-[10px] font-semibold text-text-faint">
                            Meta {deck.target_cards}
                          </span>
                        )}
                      </div>
                    </Link>

                    {/* MENU "···" — alternativa ao arraste, funciona em touch e teclado */}

                    {!selectionMode && (
                      <DeckCardMenu
                        deck={deck}
                        folders={ownedFolders}
                        currentFolderId={deck.folder_id ?? null}
                        open={openCardMenuId === deck.id}
                        onOpenChange={(nextOpen) => setOpenCardMenuId(nextOpen ? deck.id : null)}
                        onSelect={() => enterSelectionMode(deck.id)}
                        onMoveToFolder={(folderId) => void moveDeckToFolder(deck.id, folderId)}
                        disabled={movingDeck || bulkBusy}
                        draggable={!movingDeck && !bulkBusy}
                        onDragStart={(event) => handleDeckDragStart(event, deck.id)}
                        onDragEnd={resetDragState}
                        isMoving={isMoving}
                        forceVisible={Boolean(draggedDeckId)}
                      />
                    )}

                    {isMoving && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-ink-soft/55 backdrop-blur-[3px]">
                        <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-ink-soft px-3 py-2 text-xs font-semibold text-accent shadow-xl">
                          <Loader2 size={14} className="animate-spin" />
                          Movendo...
                        </div>
                      </div>
                    )}
                  </Panel>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* MODAL DE MODELOS                                                   */}
      {/* ================================================================ */}

      {showTemplates && (
        <div
          className={MODAL_BACKDROP_CLASS}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowTemplates(false);
          }}
        >
          <div className={`${MODAL_CLASS} flex max-h-[85vh] max-w-3xl flex-col`}>
            <ModalHeader
              icon={<Sparkles size={19} className="text-accent" />}
              title="Modelos do Theo"
              description="Comece com uma estrutura pronta."
              onClose={() => setShowTemplates(false)}
            />

            <div className="overflow-y-auto p-5 sm:p-6">
              {templates.length === 0 ? (
                <EmptyTemplates />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {templates.map((template) => {
                    const templateColor = template.color || "rgb(var(--accent))";

                    return (
                      <div
                        key={template.id}
                        className="rounded-2xl border border-border/70 bg-surface p-4 transition hover:border-accent/25 hover:bg-panel"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: colorWithAlpha(templateColor, 0.1),
                              color: templateColor,
                            }}
                          >
                            <LibraryBig size={19} strokeWidth={1.7} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-text">
                              {template.name}
                            </h3>

                            {template.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                                {template.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={copyingTemplate !== null}
                          onClick={() => void handleCopyTemplate(template.id)}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-panel px-3 py-2.5 text-xs font-semibold text-text transition hover:border-accent/40 hover:bg-accent/[0.05] hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copyingTemplate === template.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Copy size={14} />
                          )}
                          {copyingTemplate === template.id ? "Copiando..." : "Usar este modelo"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border/50 px-5 py-4 sm:px-6">
              <p className="text-xs text-text-faint">
                {templates.length}{" "}
                {templates.length === 1 ? "modelo disponível" : "modelos disponíveis"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL DE EXCLUSÃO DE PASTA — copy reescrito para ser inequívoco    */}
      {/* ================================================================ */}

      {folderToDelete && (
        <div
          className={MODAL_BACKDROP_CLASS}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFolderToDelete(null);
          }}
        >
          <div className={`${MODAL_CLASS} max-w-md`}>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                    <Trash2 size={19} />
                  </div>

                  <h2 className="font-display text-xl font-semibold text-text">Excluir pasta</h2>

                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Tem certeza que deseja excluir a pasta{" "}
                    <strong className="font-semibold text-text">{folderToDelete.name}</strong>?
                  </p>

                  <div className="mt-4 rounded-xl border border-border/60 bg-panel px-3 py-2.5 text-xs leading-5 text-text-faint">
                    Os decks desta pasta não serão excluídos — eles passam a aparecer em{" "}
                    <strong className="text-text-muted">Todos</strong>, sem pasta.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFolderToDelete(null)}
                  className={ICON_BUTTON_CLASS}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-7 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setFolderToDelete(null)}>
                  Cancelar
                </Button>

                <Button variant="danger" onClick={() => void handleDeleteFolder()}>
                  <Trash2 size={15} />
                  Excluir pasta
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL DE CRIAÇÃO DE DECK — formulário único, sem wizard            */}
      {/* ================================================================ */}

      {showForm && (
        <div
          className={MODAL_BACKDROP_CLASS}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowForm(false);
          }}
        >
          <div className={`${MODAL_CLASS} max-h-[90vh] max-w-xl overflow-y-auto`}>
            <ModalHeader
              title="Criar novo deck"
              description="Dê um nome e comece a estudar — o resto é opcional."
              onClose={() => setShowForm(false)}
            />

            <div className="p-6">
              <NewDeckForm
                folders={ownedFolders}
                onCreated={async () => {
                  setShowForm(false);
                  await new Promise((resolve) => setTimeout(resolve, 0));
                  await reload();
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAIS EXTERNOS                                                    */}
      {/* ================================================================ */}

      <CreateFolderModal
        open={showFolderForm}
        onClose={() => setShowFolderForm(false)}
        onCreated={() => {
          setShowFolderForm(false);
          void reload();
        }}
      />

      <ImportAnkiModal
        open={showImport}
        onClose={() => setShowImport(false)}
        folders={ownedFolders}
        onImported={() => {
          void reload();
        }}
      />
    </div>
  );
}

/* ==================================================================== */
/* MENU DO CABEÇALHO ("Mais ações")                                      */
/* ==================================================================== */

function HeaderMenu({
  templatesCount,
  onOpenTemplates,
  onOpenImport,
  onOpenNewFolder,
  open,
  onOpenChange,
}: {
  templatesCount: number;
  onOpenTemplates: () => void;
  onOpenImport: () => void;
  onOpenNewFolder: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useClickOutside(open, () => onOpenChange(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 text-sm font-medium text-text transition-all duration-200 hover:border-accent/30 hover:bg-panel"
        aria-expanded={open}
        aria-label="Mais ações"
      >
        <MoreHorizontal size={17} />
        <ChevronDown
          size={14}
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-2xl border border-border/80 bg-ink-soft p-1.5 shadow-2xl shadow-black/30">
          <ActionMenuItem
            icon={<Sparkles size={17} className="text-accent" />}
            label="Modelos do Theo"
            description={`${templatesCount} ${templatesCount === 1 ? "estrutura" : "estruturas"} prontas`}
            onClick={() => {
              onOpenTemplates();
              onOpenChange(false);
            }}
          />

          <ActionMenuItem
            icon={<FileUp size={17} className="text-text-muted" />}
            label="Importar Anki"
            description="Importe seus decks"
            onClick={() => {
              onOpenImport();
              onOpenChange(false);
            }}
          />

          <ActionMenuItem
            icon={<FolderPlus size={17} className="text-text-muted" />}
            label="Nova pasta"
            description="Organize sua biblioteca"
            onClick={() => {
              onOpenNewFolder();
              onOpenChange(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ActionMenuItem({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-panel"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-text-faint">{description}</p>
      </div>
    </button>
  );
}

/* ==================================================================== */
/* MODAL HEADER                                                          */
/* ==================================================================== */

function ModalHeader({
  icon,
  title,
  description,
  onClose,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
            {icon}
          </div>
        )}

        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        </div>
      </div>

      <button type="button" onClick={onClose} className={ICON_BUTTON_CLASS} aria-label="Fechar">
        <X size={18} />
      </button>
    </div>
  );
}

function EmptyTemplates() {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-panel text-text-faint">
        <LibraryBig size={23} />
      </div>

      <p className="text-sm font-semibold text-text">Nenhum modelo disponível</p>
      <p className="mt-1 text-xs text-text-muted">Novos modelos aparecerão aqui.</p>
    </div>
  );
}

/* ==================================================================== */
/* CHIP DE PASTA — substitui o card grande de pasta                      */
/* ==================================================================== */

function FolderChip({
  name,
  count,
  selected,
  dropTarget,
  dragging,
  moving,
  icon,
  onClick,
  onContextMenu,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  name: string;
  count: number;
  selected: boolean;
  dropTarget: boolean;
  dragging: boolean;
  moving: boolean;
  icon: ReactNode;
  onClick: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragEnter?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={name}
      className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-all duration-150 ${
        dropTarget
          ? "scale-[1.04] border-accent/60 bg-accent/[0.12] text-accent shadow-lg shadow-accent/10"
          : selected
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border/60 bg-surface text-text-muted hover:border-border hover:bg-panel hover:text-text"
      } ${moving ? "cursor-wait" : dragging ? "cursor-copy" : "cursor-pointer"}`}
    >
      {moving ? (
        <Loader2 size={13} className="animate-spin" />
      ) : dropTarget ? (
        <Check size={13} />
      ) : (
        icon
      )}

      <span className="max-w-[140px] truncate">{name}</span>

      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
          selected || dropTarget ? "bg-accent/15" : "bg-panel text-text-faint"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ==================================================================== */
/* BULK FOLDER PICKER                                                    */
/* ==================================================================== */

function BulkFolderPicker({
  value,
  folders,
  disabled,
  onChange,
}: {
  value: string;
  folders: Folder[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useClickOutside(open, () => setOpen(false));

  const selectedFolder = folders.find((folder) => folder.id === value);

  return (
    <div ref={pickerRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-panel px-3 text-left text-xs font-medium text-text outline-none transition hover:border-border focus:border-accent/40 focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedFolder?.name ?? "Sem pasta"}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-ink-soft p-1 shadow-2xl shadow-black/30"
          role="listbox"
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${
              value === "" ? "bg-accent/10 text-accent" : "text-text hover:bg-panel"
            }`}
            role="option"
            aria-selected={value === ""}
          >
            <span>Sem pasta</span>
            {value === "" && <Check size={14} />}
          </button>

          {folders.map((folder) => {
            const selected = folder.id === value;

            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  onChange(folder.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${
                  selected ? "bg-accent/10 text-accent" : "text-text hover:bg-panel"
                }`}
                role="option"
                aria-selected={selected}
              >
                <span className="truncate">{folder.name}</span>
                {selected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/* MENU POR CARD — "···" com Selecionar / Mover para pasta               */
/* Alternativa ao drag-and-drop: funciona em touch e com teclado.        */
/* O botão continua arrastável (draggable) para quem prefere mouse.      */
/* ==================================================================== */

function DeckCardMenu({
  deck,
  folders,
  currentFolderId,
  open,
  onOpenChange,
  onSelect,
  onMoveToFolder,
  disabled,
  draggable,
  onDragStart,
  onDragEnd,
  isMoving,
  forceVisible,
}: {
  deck: Deck;
  folders: Folder[];
  currentFolderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  disabled?: boolean;
  draggable?: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  isMoving: boolean;
  forceVisible: boolean;
}) {
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  const ref = useClickOutside(open, () => {
    onOpenChange(false);
    setShowMoveSubmenu(false);
  });

  return (
    <div ref={ref} className="absolute bottom-4 right-4 z-30">
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(!open);
          setShowMoveSubmenu(false);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        disabled={disabled}
        className={`flex h-8 w-8 cursor-grab items-center justify-center rounded-lg border border-border/70 bg-surface text-text-faint shadow-sm transition-all duration-150 hover:border-accent/40 hover:bg-accent/10 hover:text-accent active:scale-95 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40 ${
          forceVisible || open
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
        title={`Mais opções — ${deck.name}`}
        aria-label={`Mais opções para ${deck.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {isMoving ? (
          <Loader2 size={15} className="animate-spin text-accent" />
        ) : (
          <MoreVertical size={16} />
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-9 right-0 z-40 w-52 overflow-hidden rounded-xl border border-border/80 bg-ink-soft p-1 shadow-2xl shadow-black/30"
          role="menu"
        >
          {!showMoveSubmenu ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-text transition hover:bg-panel"
              >
                <Check size={14} className="text-text-faint" />
                Selecionar
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowMoveSubmenu(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-text transition hover:bg-panel"
              >
                <FolderInput size={14} className="text-text-faint" />
                Mover para pasta
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowMoveSubmenu(false);
                }}
                className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-text-faint transition hover:bg-panel"
              >
                <ChevronRight size={12} className="rotate-180" />
                Voltar
              </button>

              <div className="max-h-52 overflow-y-auto">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenChange(false);
                    setShowMoveSubmenu(false);
                    onMoveToFolder(null);
                  }}
                  disabled={currentFolderId === null}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-medium text-text transition hover:bg-panel disabled:opacity-40"
                >
                  Sem pasta
                  {currentFolderId === null && <Check size={13} className="text-accent" />}
                </button>

                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenChange(false);
                      setShowMoveSubmenu(false);
                      onMoveToFolder(folder.id);
                    }}
                    disabled={currentFolderId === folder.id}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-text transition hover:bg-panel disabled:opacity-40"
                  >
                    <span className="truncate">{folder.name}</span>
                    {currentFolderId === folder.id && (
                      <Check size={13} className="shrink-0 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== */
/* FORMULÁRIO DE NOVO DECK — um único passo, personalização opcional     */
/* ==================================================================== */

const DECK_COLORS = [
  { name: "Theo", value: "rgb(var(--accent))" },
  { name: "Azul", value: "#60a5fa" },
  { name: "Violeta", value: "#a78bfa" },
  { name: "Rosa", value: "#f472b6" },
  { name: "Âmbar", value: "#fbbf24" },
  { name: "Verde", value: "#4ade80" },
  { name: "Ciano", value: "#22d3ee" },
  { name: "Vermelho", value: "#f87171" },
];

function NewDeckForm({
  folders,
  onCreated,
  onCancel,
}: {
  folders: Folder[];
  onCreated: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);

  const [folderId, setFolderId] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const folderPickerRef = useClickOutside(folderOpen, () => setFolderOpen(false));

  const [showCustomize, setShowCustomize] = useState(false);
  const [targetCards, setTargetCards] = useState("20");
  const [color, setColor] = useState("rgb(var(--accent))");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedFolder = folders.find((folder) => folder.id === folderId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError(null);

    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      setError("Digite um nome para o deck.");
      return;
    }

    if (cleanName.length < 3) {
      setError("O nome deve possuir pelo menos 3 caracteres.");
      return;
    }

    const parsedTargetCards = Number.parseInt(targetCards, 10);

    if (!Number.isFinite(parsedTargetCards) || parsedTargetCards < 1) {
      setError("A meta deve ser de pelo menos 1 cartão.");
      return;
    }

    if (parsedTargetCards > 100000) {
      setError("A meta não pode ultrapassar 100.000 cartões.");
      return;
    }

    setLoading(true);

    try {
      const createdDeck = await createDeck({
        name: cleanName,
        description: cleanDescription || undefined,
        folder_id: folderId || null,
        target_cards: parsedTargetCards,
        color,
      });

      if (!createdDeck || !createdDeck.id) {
        throw new Error("O deck foi criado, mas a aplicação não recebeu o ID do deck.");
      }

      setName("");
      setDescription("");
      setShowDescription(false);
      setFolderId("");
      setShowCustomize(false);
      setTargetCards("20");
      setColor("rgb(var(--accent))");

      await onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="mb-1">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* NOME — único campo obrigatório */}

      <div>
        <Label>Nome do deck</Label>

        <Input
          autoFocus
          required
          value={name}
          maxLength={80}
          disabled={loading}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Ex.: Direito Constitucional"
        />

        <div className="mt-1.5 flex justify-end">
          <span
            className={`text-[10px] ${name.length >= 70 ? "text-amber-400" : "text-text-faint"}`}
          >
            {name.length}/80
          </span>
        </div>
      </div>

      {/* DESCRIÇÃO — oculta por padrão, some clique de distância */}

      {showDescription ? (
        <div>
          <Label>Descrição</Label>

          <Textarea
            rows={3}
            maxLength={300}
            value={description}
            disabled={loading}
            autoFocus
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Artigos da Constituição Federal, jurisprudência e doutrina."
          />

          <div className="mt-1.5 flex justify-end">
            <span
              className={`text-[10px] ${description.length >= 270 ? "text-amber-400" : "text-text-faint"}`}
            >
              {description.length}/300
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDescription(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-muted transition hover:text-accent"
        >
          <Plus size={13} />
          Adicionar descrição
        </button>
      )}

      {/* PASTA */}

      <div>
        <Label>Pasta</Label>

        <div ref={folderPickerRef} className="relative mt-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => setFolderOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-panel px-4 py-3 text-left text-sm text-text outline-none transition hover:border-accent/30 focus:border-accent/50 focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            aria-expanded={folderOpen}
            aria-haspopup="listbox"
          >
            <span className={folderId ? "truncate text-text" : "truncate text-text-muted"}>
              {selectedFolder?.name ?? "Sem pasta"}
            </span>

            <ChevronDown
              size={16}
              className={`shrink-0 text-text-faint transition-transform ${folderOpen ? "rotate-180" : ""}`}
            />
          </button>

          {folderOpen && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-ink-soft p-1.5 shadow-2xl shadow-black/30"
              role="listbox"
            >
              <button
                type="button"
                onClick={() => {
                  setFolderId("");
                  setFolderOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  folderId === "" ? "bg-accent/10 text-accent" : "text-text hover:bg-panel"
                }`}
                role="option"
                aria-selected={folderId === ""}
              >
                <span>Sem pasta</span>
                {folderId === "" && <Check size={15} />}
              </button>

              {folders.map((folder) => {
                const selected = folder.id === folderId;

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setFolderId(folder.id);
                      setFolderOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      selected ? "bg-accent/10 text-accent" : "text-text hover:bg-panel"
                    }`}
                    role="option"
                    aria-selected={selected}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen size={14} className="shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </div>

                    {selected && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PERSONALIZAR — meta e cor, recolhido por padrão */}

      <div className="rounded-2xl border border-border/60 bg-surface">
        <button
          type="button"
          onClick={() => setShowCustomize((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          aria-expanded={showCustomize}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="h-4 w-4 rounded-full border border-border/70"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-semibold text-text">Personalizar (meta e cor)</span>
          </div>

          <ChevronDown
            size={15}
            className={`text-text-faint transition-transform ${showCustomize ? "rotate-180" : ""}`}
          />
        </button>

        {showCustomize && (
          <div className="space-y-4 border-t border-border/50 p-4">
            <div>
              <Label>Meta de cartões</Label>

              <div className="relative mt-1">
                <Input
                  type="number"
                  min={1}
                  max={100000}
                  value={targetCards}
                  disabled={loading}
                  onChange={(event) => setTargetCards(event.target.value)}
                  placeholder="20"
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-text-faint">
                  cartões
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-text-faint">
                Exibida no card do deck como referência de estudo.
              </p>
            </div>

            <div>
              <Label>Cor do deck</Label>

              <div className="mt-2 grid grid-cols-8 gap-2">
                {DECK_COLORS.map((item) => {
                  const selected = color === item.value;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      disabled={loading}
                      onClick={() => setColor(item.value)}
                      title={item.name}
                      aria-label={`Selecionar cor ${item.name}`}
                      aria-pressed={selected}
                      className={`relative flex aspect-square items-center justify-center rounded-xl border transition-all duration-150 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                        selected
                          ? "border-accent/50 bg-panel shadow-lg"
                          : "border-border/60 bg-panel hover:border-border"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full shadow-sm"
                        style={{ backgroundColor: item.value }}
                      />

                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-xl">
                          <Check size={12} strokeWidth={3} className="text-white drop-shadow-md" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RODAPÉ */}

      <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={loading} onClick={onCancel}>
          Cancelar
        </Button>

        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {loading ? "Criando..." : "Criar deck"}
        </Button>
      </div>
    </form>
  );
}
