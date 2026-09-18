import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FolderPlus, Plus } from "lucide-react";
import type { Notebook, Section } from "../../lib/notes/types";
import * as notesApi from "../../lib/notes/notesApi";

interface NotebookSidebarProps {
  selectedSectionId: string | null;
  onSelectSection: (notebook: Notebook, section: Section) => void;
  refreshKey: number;
}

export function NotebookSidebar({
  selectedSectionId,
  onSelectSection,
  refreshKey,
}: NotebookSidebarProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sectionsByNotebook, setSectionsByNotebook] = useState<Record<string, Section[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");

  useEffect(() => {
    void loadNotebooks();
  }, [refreshKey]);

  async function loadNotebooks() {
    const list = await notesApi.listNotebooks();
    setNotebooks(list);

    // Recarrega seções dos notebooks já expandidos.
    const expandedIds = Object.keys(expanded).filter((id) => expanded[id]);

    for (const id of expandedIds) {
      await loadSections(id);
    }
  }

  async function loadSections(notebookId: string) {
    const sections = await notesApi.listSections(notebookId);
    setSectionsByNotebook((prev) => ({ ...prev, [notebookId]: sections }));
  }

  async function toggleNotebook(notebook: Notebook) {
    const isOpen = !!expanded[notebook.id];

    setExpanded((prev) => ({ ...prev, [notebook.id]: !isOpen }));

    if (!isOpen && !sectionsByNotebook[notebook.id]) {
      await loadSections(notebook.id);
    }
  }

  async function handleCreateNotebook() {
    const name = newNotebookName.trim();

    if (!name) {
      setCreatingNotebook(false);
      return;
    }

    try {
      await notesApi.createNotebook(name);
      setNewNotebookName("");
      setCreatingNotebook(false);
      await loadNotebooks();
    } catch (error) {
      console.error("[Theo Notes] Erro ao criar caderno:", error);
    }
  }

  async function handleCreateSection(notebook: Notebook) {
    const name = window.prompt("Nome da nova seção:");

    if (!name?.trim()) {
      return;
    }

    try {
      await notesApi.createSection(notebook, name.trim());
      await loadSections(notebook.id);
    } catch (error) {
      console.error("[Theo Notes] Erro ao criar seção:", error);
    }
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-white/[0.06] bg-ink-soft/40">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
          Cadernos
        </span>

        <button
          type="button"
          onClick={() => setCreatingNotebook(true)}
          className="rounded-md p-1 text-text-faint hover:bg-white/5 hover:text-text"
          aria-label="Novo caderno"
          title="Novo caderno"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {creatingNotebook && (
          <div className="mb-1 px-1">
            <input
              autoFocus
              value={newNotebookName}
              onChange={(e) => setNewNotebookName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateNotebook();
                if (e.key === "Escape") setCreatingNotebook(false);
              }}
              onBlur={() => void handleCreateNotebook()}
              placeholder="Nome do caderno"
              className="w-full rounded-lg border border-white/10 bg-ink-softer px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/60"
            />
          </div>
        )}

        {notebooks.length === 0 && !creatingNotebook && (
          <p className="px-2 py-4 text-center text-xs text-text-faint">
            Nenhum caderno ainda. Crie o primeiro com o botão "+".
          </p>
        )}

        {notebooks.map((notebook) => {
          const isOpen = !!expanded[notebook.id];
          const sections = sectionsByNotebook[notebook.id] ?? [];

          return (
            <div key={notebook.id}>
              <button
                type="button"
                onClick={() => void toggleNotebook(notebook)}
                className="group flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-sm font-medium text-text hover:bg-white/[0.04]"
              >
                {isOpen ? (
                  <ChevronDown size={14} className="shrink-0 text-text-faint" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-text-faint" />
                )}

                <BookOpen size={15} className="shrink-0 text-accent-bright" strokeWidth={1.7} />

                <span className="truncate">{notebook.name}</span>

                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCreateSection(notebook);
                  }}
                  className="ml-auto shrink-0 rounded p-0.5 text-text-faint opacity-0 hover:text-text group-hover:opacity-100"
                  title="Nova seção"
                >
                  <FolderPlus size={13} />
                </span>
              </button>

              {isOpen && (
                <div className="ml-5 border-l border-white/[0.06] pl-2">
                  {sections.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-text-faint">Nenhuma seção ainda.</p>
                  )}

                  {sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => onSelectSection(notebook, section)}
                      className={`flex w-full items-center truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
                        selectedSectionId === section.id
                          ? "bg-accent/15 text-accent-bright"
                          : "text-text-muted hover:bg-white/[0.04] hover:text-text"
                      }`}
                    >
                      {section.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
