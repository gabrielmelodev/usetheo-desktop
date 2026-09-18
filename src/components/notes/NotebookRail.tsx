import { useEffect, useMemo, useState } from "react";

import { Book, Check, ChevronLeft, ChevronRight, Palette, Plus, X } from "lucide-react";

import type { Notebook } from "../../lib/notes/types";

import * as notesApi from "../../lib/notes/notesApi";

import { colorForId } from "../../lib/notes/notebookColors";

interface NotebookRailProps {
  activeNotebookId: string | null;
  onSelectNotebook: (notebook: Notebook) => void;
  refreshKey: number;
}

type NotebookColorOption = {
  id: string;
  label: string;
  className: string;
  dotClassName: string;
};

const NOTEBOOK_COLORS: NotebookColorOption[] = [
  {
    id: "olive",
    label: "Oliva",
    className: "bg-[#556B2F]",
    dotClassName: "bg-[#556B2F]",
  },
  {
    id: "blue",
    label: "Azul",
    className: "bg-[#3B82F6]",
    dotClassName: "bg-[#3B82F6]",
  },
  {
    id: "purple",
    label: "Roxo",
    className: "bg-[#8B5CF6]",
    dotClassName: "bg-[#8B5CF6]",
  },
  {
    id: "pink",
    label: "Rosa",
    className: "bg-[#EC4899]",
    dotClassName: "bg-[#EC4899]",
  },
  {
    id: "orange",
    label: "Laranja",
    className: "bg-[#F97316]",
    dotClassName: "bg-[#F97316]",
  },
  {
    id: "red",
    label: "Vermelho",
    className: "bg-[#EF4444]",
    dotClassName: "bg-[#EF4444]",
  },
  {
    id: "cyan",
    label: "Ciano",
    className: "bg-[#06B6D4]",
    dotClassName: "bg-[#06B6D4]",
  },
  {
    id: "green",
    label: "Verde",
    className: "bg-[#22C55E]",
    dotClassName: "bg-[#22C55E]",
  },
];

function getColorPreview(colorId: string) {
  return NOTEBOOK_COLORS.find((color) => color.id === colorId) ?? NOTEBOOK_COLORS[0];
}

/**

* Rail à esquerda com a lista de cadernos.
*
* A criação do caderno utiliza um modal inspirado na experiência
* de criação do Samsung Notes, mantendo a API atual:
*
* notesApi.createNotebook(name)
  */
export function NotebookRail({
  activeNotebookId,
  onSelectNotebook,
  refreshKey,
}: NotebookRailProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedColor, setSelectedColor] = useState("olive");

  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void notesApi
      .listNotebooks()
      .then((list) => {
        if (cancelled) return;

        setNotebooks(list);

        if (list.length > 0 && !activeNotebookId) {
          onSelectNotebook(list[0]);
        }
      })
      .catch((error) => {
        console.error("[Theo Notes] Erro ao carregar cadernos:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const selectedColorOption = useMemo(() => getColorPreview(selectedColor), [selectedColor]);

  function openCreateModal() {
    setNewName("");
    setSelectedColor("olive");
    setCreateError(null);
    setCreating(true);
  }

  function closeCreateModal() {
    if (creatingNotebook) return;

    setCreating(false);
    setNewName("");
    setCreateError(null);
  }

  async function handleCreate() {
    const name = newName.trim();

    if (!name) {
      setCreateError("Digite um nome para o caderno.");
      return;
    }

    if (creatingNotebook) return;

    setCreatingNotebook(true);
    setCreateError(null);

    try {
      const notebook = await notesApi.createNotebook(name);

      const updatedList = await notesApi.listNotebooks();

      setNotebooks(updatedList);

      setCreating(false);
      setNewName("");
      setCreateError(null);

      onSelectNotebook(notebook);
    } catch (error) {
      console.error("[Theo Notes] Erro ao criar caderno:", error);

      setCreateError(error instanceof Error ? error.message : "Não foi possível criar o caderno.");
    } finally {
      setCreatingNotebook(false);
    }
  }

  function handleCreateKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleCreate();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeCreateModal();
    }
  }

  if (collapsed) {
    return (
      <>
        {" "}
        <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-white/[0.06] bg-ink-soft/40 py-3">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-white/5 hover:text-text"
            title="Mostrar cadernos"
            aria-label="Mostrar cadernos"
          >
            {" "}
            <ChevronRight size={15} />{" "}
          </button>
          ```
          <button
            type="button"
            onClick={openCreateModal}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-text-faint transition-colors hover:bg-white/[0.07] hover:text-text"
            title="Novo caderno"
            aria-label="Novo caderno"
          >
            <Plus size={14} />
          </button>
          <div className="mt-1 flex flex-col items-center gap-1.5">
            {notebooks.map((notebook) => {
              const color = colorForId(notebook.id);
              const isActive = notebook.id === activeNotebookId;

              return (
                <button
                  key={notebook.id}
                  type="button"
                  title={notebook.name}
                  onClick={() => onSelectNotebook(notebook)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                    isActive
                      ? "scale-105 ring-2 ring-white/30"
                      : "opacity-80 hover:scale-105 hover:opacity-100"
                  } ${color.dot}`}
                >
                  <Book size={12} className={color.onSolidText} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </div>
        {creating && (
          <CreateNotebookModal
            name={newName}
            selectedColor={selectedColor}
            selectedColorOption={selectedColorOption}
            creating={creatingNotebook}
            error={createError}
            onNameChange={setNewName}
            onColorChange={setSelectedColor}
            onCreate={() => void handleCreate()}
            onKeyDown={handleCreateKeyDown}
            onClose={closeCreateModal}
          />
        )}
      </>
    );
  }

  return (
    <>
      {" "}
      <div className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.06] bg-ink-soft/40">
        {" "}
        <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-3">
          {" "}
          <div>
            {" "}
            <div className="text-sm font-semibold text-text">Cadernos</div>{" "}
            <div className="mt-0.5 text-[11px] text-text-faint">
              Suas anotações organizadas{" "}
            </div>{" "}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent transition-colors hover:bg-accent/25 hover:text-text"
              aria-label="Novo caderno"
              title="Novo caderno"
            >
              <Plus size={17} />
            </button>

            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-white/5 hover:text-text"
              aria-label="Recolher cadernos"
              title="Recolher"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {notebooks.length === 0 && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-text-faint">
                <Book size={22} strokeWidth={1.5} />
              </div>

              <p className="text-sm font-medium text-text">Nenhum caderno</p>

              <p className="mt-1 text-xs leading-5 text-text-faint">
                Crie seu primeiro caderno para começar suas anotações.
              </p>

              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90"
              >
                <Plus size={14} />
                Criar caderno
              </button>
            </div>
          )}

          {notebooks.length > 0 && (
            <div className="space-y-1">
              {notebooks.map((notebook) => {
                const color = colorForId(notebook.id);
                const isActive = notebook.id === activeNotebookId;

                return (
                  <button
                    key={notebook.id}
                    type="button"
                    onClick={() => onSelectNotebook(notebook)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all ${
                      isActive
                        ? `${color.softBg} ${color.softText} shadow-sm`
                        : "text-text-muted hover:bg-white/[0.045] hover:text-text"
                    }`}
                  >
                    <span
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm ${
                        color.dot
                      }`}
                    >
                      <span className="absolute left-0 top-0 h-full w-1 bg-black/10" />

                      <Book size={17} strokeWidth={1.8} className={color.onSolidText} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          isActive ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {notebook.name}
                      </span>

                      <span
                        className={`mt-0.5 block text-[10px] ${
                          isActive ? "opacity-70" : "text-text-faint opacity-80"
                        }`}
                      >
                        Caderno
                      </span>
                    </span>

                    {isActive && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-white/[0.05] px-3 py-2.5">
          <button
            type="button"
            onClick={openCreateModal}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-white/[0.055] hover:text-text"
          >
            <Plus size={14} />
            Novo caderno
          </button>
        </div>
      </div>
      {creating && (
        <CreateNotebookModal
          name={newName}
          selectedColor={selectedColor}
          selectedColorOption={selectedColorOption}
          creating={creatingNotebook}
          error={createError}
          onNameChange={setNewName}
          onColorChange={setSelectedColor}
          onCreate={() => void handleCreate()}
          onKeyDown={handleCreateKeyDown}
          onClose={closeCreateModal}
        />
      )}
    </>
  );
}

interface CreateNotebookModalProps {
  name: string;
  selectedColor: string;
  selectedColorOption: NotebookColorOption;
  creating: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onCreate: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

function CreateNotebookModal({
  name,
  selectedColor,
  selectedColorOption,
  creating,
  error,
  onNameChange,
  onColorChange,
  onCreate,
  onKeyDown,
  onClose,
}: CreateNotebookModalProps) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [creating, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-notebook-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) {
          onClose();
        }
      }}
    >
      {" "}
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-soft shadow-2xl">
        {" "}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          {" "}
          <div>
            {" "}
            <h2 id="create-notebook-title" className="text-base font-semibold text-text">
              Novo caderno{" "}
            </h2>
            <p className="mt-0.5 text-xs text-text-faint">
              Organize suas anotações em um novo espaço.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={17} />
          </button>
        </div>
        <div className="p-5">
          <div className="mb-5 flex justify-center">
            <div
              className={`relative flex h-28 w-24 flex-col items-center justify-center overflow-hidden rounded-xl ${selectedColorOption.className} shadow-xl transition-colors`}
            >
              <div className="absolute left-0 top-0 h-full w-2 bg-black/15" />

              <div className="absolute right-0 top-0 h-full w-3 bg-white/10" />

              <Book size={38} strokeWidth={1.45} className="relative text-white/90" />

              <span className="relative mt-2 max-w-[72px] truncate text-[9px] font-medium text-white/85">
                {name.trim() || "Meu caderno"}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-notebook-name"
              className="mb-2 block text-xs font-semibold text-text-muted"
            >
              Nome do caderno
            </label>

            <input
              id="new-notebook-name"
              autoFocus
              value={name}
              maxLength={80}
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex.: Direito Constitucional"
              disabled={creating}
              className="h-11 w-full rounded-xl border border-white/[0.09] bg-ink-softer px-3.5 text-sm text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/10 disabled:opacity-60"
            />

            <div className="mt-1.5 flex justify-end">
              <span className="text-[10px] text-text-faint">{name.length}/80</span>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2.5 flex items-center gap-2">
              <Palette size={14} className="text-text-faint" />

              <span className="text-xs font-semibold text-text-muted">Cor do caderno</span>
            </div>

            <div className="grid grid-cols-8 gap-2">
              {NOTEBOOK_COLORS.map((color) => {
                const isSelected = selectedColor === color.id;

                return (
                  <button
                    key={color.id}
                    type="button"
                    title={color.label}
                    aria-label={`Cor ${color.label}`}
                    aria-pressed={isSelected}
                    disabled={creating}
                    onClick={() => onColorChange(color.id)}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full ${color.className} transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? "scale-105 ring-2 ring-white/80 ring-offset-2 ring-offset-ink-soft"
                        : ""
                    }`}
                  >
                    {isSelected && <Check size={15} strokeWidth={2.5} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.07] px-3 py-2.5 text-xs leading-5 text-red-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-black/[0.08] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-lg px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-40"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !name.trim()}
            className="flex min-w-[92px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Criando...
              </>
            ) : (
              <>
                <Plus size={14} />
                Criar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
