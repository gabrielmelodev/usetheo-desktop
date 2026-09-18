import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Check,
  Cloud,
  CloudOff,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import type { NotesPage } from "../../lib/notes/types";
import * as notesApi from "../../lib/notes/notesApi";

interface PageEditorProps {
  page: NotesPage;
  onSaved?: (page: NotesPage) => void;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PageEditor({ page, onSaved }: PageEditorProps) {
  const [title, setTitle] = useState(page.title);
  const [createdAt, setCreatedAt] = useState(page.createdAt);
  const [updatedAt, setUpdatedAt] = useState(page.updatedAt);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">(
    page.dirty ? "dirty" : "saved",
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Comece a escrever..." }),
    ],
    content: page.content as JSONContent,
    onUpdate: () => scheduleSave(),
  });

  // Troca de página: recarrega o editor com o novo conteúdo.
  useEffect(() => {
    setTitle(page.title);
    setCreatedAt(page.createdAt);
    setUpdatedAt(page.updatedAt);
    setSaveState(page.dirty ? "dirty" : "saved");
    editor?.commands.setContent(page.content as JSONContent, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.localId]);

  function scheduleSave() {
    setSaveState("dirty");

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => void persist(), AUTOSAVE_DEBOUNCE_MS);
  }

  async function persist() {
    if (!editor) return;

    setSaveState("saving");

    const content = editor.getJSON();
    const previewText = editor.getText().slice(0, 140);

    const updated = await notesApi.updatePageContent(page.localId, {
      title: titleRef.current,
      content,
      previewText,
    });

    setSaveState("saved");

    if (updated) {
      setUpdatedAt(updated.updatedAt);
      onSaved?.(updated);
    }
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave();
  }

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-ink">
      {/* Barra de ferramentas ("ribbon" simplificado) */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] bg-ink-soft/30 px-4 py-2">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          icon={<Bold size={15} />}
        />
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          icon={<Italic size={15} />}
        />
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          icon={<UnderlineIcon size={15} />}
        />
        <ToolbarButton
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          icon={<Highlighter size={15} />}
        />

        <div className="mx-1 h-4 w-px bg-white/10" />

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          icon={<List size={15} />}
        />
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          icon={<ListOrdered size={15} />}
        />

        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-faint">
          {saveState === "saving" && (
            <>
              <Cloud size={13} className="animate-pulse" />
              Salvando...
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check size={13} className="text-emerald-400" />
              Sincronizado
            </>
          )}
          {saveState === "dirty" && (
            <>
              <CloudOff size={13} />
              Alterações não salvas
            </>
          )}
        </div>
      </div>

      {/* "Folha" da página — canvas levemente destacado do fundo, como uma
          folha de papel sobre a mesa escura, do jeito que o OneNote
          desenha cada página. */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.05] bg-ink-soft/50 px-10 pb-10 pt-8 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_20px_40px_-24px_rgba(0,0,0,0.5)]">
          {/* Título + metadados, igual o cabeçalho de página do OneNote */}
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Título da página"
            className="w-full bg-transparent font-display text-3xl font-semibold text-text outline-none placeholder:text-text-faint"
          />

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] pb-4 text-[11px] text-text-faint">
            <span>Criada em {formatFullDate(createdAt)}</span>
            <span className="text-text-faint/50">·</span>
            <span>Última edição {formatFullDate(updatedAt)}</span>
          </div>

          <div className="pt-4">
            <EditorContent editor={editor} className="rich-editor notes-editor" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active ? "bg-accent/20 text-accent-bright" : "text-text-muted hover:bg-white/5 hover:text-text"
      }`}
    >
      {icon}
    </button>
  );
}
