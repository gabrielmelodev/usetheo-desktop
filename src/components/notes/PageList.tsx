import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import type { NotesPage, Section } from "../../lib/notes/types";
import * as notesApi from "../../lib/notes/notesApi";
import { colorForId } from "../../lib/notes/notebookColors";

interface PageListProps {
  section: Section | null;
  selectedPageLocalId: string | null;
  onSelectPage: (page: NotesPage) => void;
  refreshKey: number;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();

  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Lista de páginas de uma seção — a coluna estreita entre as abas de
 * seção e o editor, igual o painel de páginas do OneNote: título,
 * data/hora da última edição e uma prévia do texto em cada linha.
 */
export function PageList({ section, selectedPageLocalId, onSelectPage, refreshKey }: PageListProps) {
  const [pages, setPages] = useState<NotesPage[]>([]);

  const color = section ? colorForId(section.id) : null;

  useEffect(() => {
    if (!section) {
      setPages([]);
      return;
    }

    void notesApi.listPages(section.id).then(setPages);
  }, [section, refreshKey]);

  async function handleNewPage() {
    if (!section) return;

    const page = await notesApi.createPage(section);
    setPages(await notesApi.listPages(section.id));
    onSelectPage(page);
  }

  if (!section) {
    return (
      <div className="flex w-72 shrink-0 items-center justify-center border-r border-white/[0.06] bg-ink-soft/20 px-4 text-center text-sm text-text-faint">
        Selecione uma seção para ver as páginas.
      </div>
    );
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-ink-soft/20">
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => void handleNewPage()}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${color?.softBg} ${color?.softText} hover:brightness-125`}
        >
          <Plus size={14} />
          Nova página
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {pages.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">
            Nenhuma página ainda nesta seção.
          </p>
        )}

        {pages.map((page) => {
          const isSelected = selectedPageLocalId === page.localId;

          return (
            <button
              key={page.localId}
              type="button"
              onClick={() => onSelectPage(page)}
              className={`relative flex w-full flex-col gap-0.5 rounded-lg py-2 pl-3 pr-2.5 text-left transition-colors ${
                isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              {isSelected && (
                <span className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full ${color?.dot}`} />
              )}

              <div className="flex items-center gap-1.5">
                <FileText size={13} className="shrink-0 text-text-faint" strokeWidth={1.8} />

                <span className={`truncate text-[13px] font-medium ${isSelected ? "text-text" : "text-text-muted"}`}>
                  {page.title || "Sem título"}
                </span>

                {page.dirty && (
                  <span
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                    title="Ainda não sincronizado"
                  />
                )}
              </div>

              <span className="truncate pl-[19px] text-[11px] text-text-faint">
                {formatDate(page.updatedAt)}
                {page.previewText ? ` · ${page.previewText}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
