import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Notebook, Section } from "../../lib/notes/types";
import * as notesApi from "../../lib/notes/notesApi";
import { colorForId } from "../../lib/notes/notebookColors";

interface SectionTabsProps {
  notebook: Notebook | null;
  selectedSectionId: string | null;
  onSelectSection: (notebook: Notebook, section: Section) => void;
  refreshKey: number;
}

/**
 * Tira de abas coloridas, uma por seção — o elemento mais reconhecível
 * do OneNote. A aba da seção ativa fica "acesa" com a cor sólida do
 * caderno; as outras ficam neutras, só com um traço fino da cor
 * embaixo, como pastas suspensas numa gaveta de arquivo.
 */
export function SectionTabs({ notebook, selectedSectionId, onSelectSection, refreshKey }: SectionTabsProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!notebook) {
      setSections([]);
      return;
    }

    void notesApi.listSections(notebook.id).then((list) => {
      setSections(list);

      // Abre a primeira seção automaticamente ao trocar de caderno.
      if (list.length > 0 && !list.some((s) => s.id === selectedSectionId)) {
        onSelectSection(notebook, list[0]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook?.id, refreshKey]);

  async function handleCreate() {
    if (!notebook) return;

    const name = newName.trim();

    if (!name) {
      setCreating(false);
      return;
    }

    try {
      const section = await notesApi.createSection(notebook, name);
      setNewName("");
      setCreating(false);

      const list = await notesApi.listSections(notebook.id);
      setSections(list);
      onSelectSection(notebook, section);
    } catch (error) {
      console.error("[Theo Notes] Erro ao criar seção:", error);
    }
  }

  if (!notebook) {
    return <div className="h-11 shrink-0 border-b border-white/[0.06] bg-ink-soft/20" />;
  }

  return (
    <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-white/[0.06] bg-ink-soft/20 px-3 pt-2.5">
      {sections.map((section) => {
        const color = colorForId(section.id);
        const isActive = section.id === selectedSectionId;

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelectSection(notebook, section)}
            className={`relative shrink-0 whitespace-nowrap rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? `${color.solidBg} ${color.onSolidText} shadow-sm`
                : `bg-white/[0.03] text-text-muted hover:bg-white/[0.06] hover:text-text`
            }`}
          >
            {!isActive && (
              <span className={`absolute inset-x-2 bottom-0 h-[2.5px] rounded-full ${color.underline}`} />
            )}
            {section.name}
          </button>
        );
      })}

      {creating ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          onBlur={() => void handleCreate()}
          placeholder="Nome da seção"
          className="mb-0.5 w-36 shrink-0 rounded-t-lg border border-b-0 border-white/10 bg-ink-softer px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent/60"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mb-0.5 flex shrink-0 items-center gap-1 rounded-t-lg px-2.5 py-1.5 text-xs text-text-faint hover:bg-white/[0.04] hover:text-text"
          title="Nova seção"
        >
          <Plus size={13} />
        </button>
      )}

      {sections.length === 0 && !creating && (
        <span className="pb-2 text-xs text-text-faint">Nenhuma seção ainda neste caderno.</span>
      )}
    </div>
  );
}
