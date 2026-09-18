import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { EditorContent, useEditor } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Highlighter,
  List,
  ListOrdered,
  Link2,
  Palette,
  X,
  Eye,
  Braces,
} from "lucide-react";

// =====================================================
// PROPS
// =====================================================

interface ClozeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// =====================================================
// CORES
// =====================================================

interface ColorOption {
  name: string;
  color: string;
}

const highlightColors: ColorOption[] = [
  { name: "Amarelo", color: "#fef08a" },
  { name: "Verde", color: "#86efac" },
  { name: "Azul", color: "#93c5fd" },
  { name: "Roxo", color: "#d8b4fe" },
  { name: "Vermelho", color: "#fca5a5" },
  { name: "Laranja", color: "#fdba74" },
  { name: "Rosa", color: "#f9a8d4" },
  { name: "Cinza", color: "#d1d5db" },
];

const textColors: ColorOption[] = [
  { name: "Preto", color: "#000000" },
  { name: "Branco", color: "#ffffff" },
  { name: "Vermelho", color: "#ef4444" },
  { name: "Laranja", color: "#f97316" },
  { name: "Amarelo", color: "#eab308" },
  { name: "Verde", color: "#22c55e" },
  { name: "Azul", color: "#3b82f6" },
  { name: "Roxo", color: "#a855f7" },
  { name: "Rosa", color: "#ec4899" },
  { name: "Cinza", color: "#6b7280" },
];

// =====================================================
// CLOZE
// =====================================================

function getClozeNumbers(content: string): number[] {
  const regex = /\{\{c(\d+)::/gi;

  return [...content.matchAll(regex)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isFinite(number) && number > 0);
}

function getNextClozeFromContent(content: string): number {
  const numbers = getClozeNumbers(content);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

// =====================================================
// COMPONENTE
// =====================================================

export default function ClozeEditor({
  value,
  onChange,
  placeholder = "Digite o texto do card...",
}: ClozeEditorProps) {
  const [textPaletteOpen, setTextPaletteOpen] = useState(false);
  const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);
  const [preview, setPreview] = useState(false);

  /**
   * Guarda o próximo número do Cloze.
   *
   * IMPORTANTE:
   * Não depende de renderização do React.
   */
  const nextClozeRef = useRef(1);

  /**
   * Guarda o último HTML produzido pelo editor.
   */
  const lastEditorHtmlRef = useRef(value || "");

  // ===================================================
  // EDITOR
  // ===================================================

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        link: false,
      }),

      Underline,

      TextStyle,

      Color.configure({
        types: ["textStyle"],
      }),

      Highlight.configure({
        multicolor: true,
      }),

      Link.configure({
        openOnClick: false,
      }),

      Placeholder.configure({
        placeholder,
      }),
    ],

    content: value || "",

    onCreate({ editor }) {
      const html = editor.getHTML();

      lastEditorHtmlRef.current = html;
      nextClozeRef.current = getNextClozeFromContent(html);
    },

    onUpdate({ editor }) {
      const html = editor.getHTML();

      lastEditorHtmlRef.current = html;

      nextClozeRef.current = getNextClozeFromContent(html);

      onChange(html);
    },
  });

  // ===================================================
  // SINCRONIZAÇÃO
  // ===================================================

  useEffect(() => {
    if (!editor) return;

    const currentEditorHtml = editor.getHTML();

    /**
     * O próprio editor acabou de produzir esse valor.
     */
    if (value === lastEditorHtmlRef.current) {
      return;
    }

    /**
     * Já está sincronizado.
     */
    if (value === currentEditorHtml) {
      lastEditorHtmlRef.current = value;
      return;
    }

    /**
     * Alteração externa.
     */
    editor.commands.setContent(value || "", {
      emitUpdate: false,
    });

    lastEditorHtmlRef.current = value || "";

    nextClozeRef.current = getNextClozeFromContent(value || "");
  }, [value, editor]);

  // ===================================================
  // BOTÃO TOOLBAR
  // ===================================================

  function ToolbarButton({
    active = false,
    onClick,
    children,
    title,
  }: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
    title?: string;
  }) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={(event) => {
          event.preventDefault();
          onClick();
        }}
        className={`
          flex
          h-8
          w-8
          items-center
          justify-center
          rounded-md
          transition
          ${active ? "bg-accent text-white" : "text-text-muted hover:bg-white/10 hover:text-white"}
        `}
      >
        {children}
      </button>
    );
  }

  // ===================================================
  // INSERIR CLOZE
  // ===================================================

  function insertCloze() {
    if (!editor) return;

    const clozeNumber = nextClozeRef.current;

    const { from, to } = editor.state.selection;

    // =================================================
    // COM SELEÇÃO
    // =================================================

    if (from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to, " ");

      if (!selectedText.trim()) {
        return;
      }

      const cloze = `{{c${clozeNumber}::${selectedText}}}`;

      editor.chain().focus().deleteSelection().insertContent(cloze).run();

      /**
       * Reserva o próximo número imediatamente.
       */
      nextClozeRef.current = clozeNumber + 1;

      return;
    }

    // =================================================
    // SEM SELEÇÃO
    // =================================================

    const cloze = `{{c${clozeNumber}::texto}}`;

    editor.chain().focus().insertContent(cloze).run();

    nextClozeRef.current = clozeNumber + 1;
  }

  // ===================================================
  // REMOVER ÚLTIMO CLOZE
  // ===================================================

  function removeLastCloze() {
    if (!editor) return;

    const html = editor.getHTML();

    const regex = /\{\{c(\d+)::([\s\S]*?)\}\}/gi;

    const matches = [...html.matchAll(regex)];

    if (matches.length === 0) {
      return;
    }

    const last = matches[matches.length - 1];

    const original = last[0];
    const content = last[2];

    const newHtml = html.replace(original, content);

    editor.commands.setContent(newHtml, {
      emitUpdate: false,
    });

    lastEditorHtmlRef.current = newHtml;

    nextClozeRef.current = getNextClozeFromContent(newHtml);

    onChange(newHtml);
  }

  // ===================================================
  // COR DO TEXTO
  // ===================================================

  function handleTextColor(event: MouseEvent<HTMLButtonElement>, color: string) {
    event.preventDefault();

    editor?.chain().focus().setColor(color).run();

    setTextPaletteOpen(false);
  }

  function handleUnsetTextColor(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    editor?.chain().focus().unsetColor().run();

    setTextPaletteOpen(false);
  }

  // ===================================================
  // MARCA-TEXTO
  // ===================================================

  function handleHighlight(event: MouseEvent<HTMLButtonElement>, color: string) {
    event.preventDefault();

    editor
      ?.chain()
      .focus()
      .setHighlight({
        color,
      })
      .run();

    setHighlightPaletteOpen(false);
  }

  function handleUnsetHighlight(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    editor?.chain().focus().unsetHighlight().run();

    setHighlightPaletteOpen(false);
  }

  // ===================================================
  // LINK
  // ===================================================

  function handleLink() {
    if (!editor) return;

    const url = window.prompt("Link");

    if (!url) return;

    editor
      .chain()
      .focus()
      .setLink({
        href: url,
      })
      .run();
  }

  // ===================================================
  // PREVIEW
  // ===================================================

  function getPreviewHtml() {
    return value.replace(/\{\{c(\d+)::([\s\S]*?)\}\}/gi, (_match, number) => {
      return `
          <span
            style="
              display:inline-block;
              padding:2px 7px;
              border-radius:5px;
              background:rgba(59,130,246,.18);
              border:1px solid rgba(59,130,246,.45);
              color:#93c5fd;
              font-weight:600;
            "
          >
            [Cloze ${number}]
          </span>
        `;
    });
  }

  // ===================================================
  // ESTADO
  // ===================================================

  if (!editor) {
    return null;
  }

  const clozeNumbers = getClozeNumbers(value);

  const clozeCount = clozeNumbers.length;

  const nextClozeNumber = nextClozeRef.current;

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div
      className="
        overflow-hidden
        rounded-lg
        border
        border-white/10
        bg-black/10
      "
    >
      {/* TOOLBAR */}

      <div
        className="
          sticky
          top-0
          z-10
          flex
          flex-wrap
          items-center
          gap-1
          border-b
          border-white/10
          bg-background/95
          px-3
          py-2
          backdrop-blur
        "
      >
        {/* BOLD */}

        <ToolbarButton
          title="Negrito"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>

        {/* ITÁLICO */}

        <ToolbarButton
          title="Itálico"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>

        {/* SUBLINHADO */}

        <ToolbarButton
          title="Sublinhado"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* CLOZE */}

        <ToolbarButton title={`Criar Cloze c${nextClozeNumber}`} onClick={insertCloze}>
          <Braces size={15} />
        </ToolbarButton>

        {/* REMOVER */}

        <ToolbarButton title="Remover último Cloze" onClick={removeLastCloze}>
          <X size={15} />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {/* COR DO TEXTO */}

        <div className="relative">
          <ToolbarButton
            title="Cor do texto"
            active={editor.isActive("textStyle")}
            onClick={() => {
              setTextPaletteOpen((current) => !current);
              setHighlightPaletteOpen(false);
            }}
          >
            <Palette size={15} />
          </ToolbarButton>

          {textPaletteOpen && (
            <div
              className="
                absolute
                left-0
                top-full
                z-50
                mt-2
                w-[190px]
                rounded-lg
                border
                border-white/10
                bg-background
                p-2
                shadow-xl
              "
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Cor do texto</span>

                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setTextPaletteOpen(false);
                  }}
                  className="
                    rounded
                    p-1
                    text-text-muted
                    hover:bg-white/10
                    hover:text-white
                  "
                >
                  <X size={13} />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {textColors.map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    title={item.name}
                    onMouseDown={(event) => handleTextColor(event, item.color)}
                    className="
                      h-7
                      w-7
                      rounded-full
                      border
                      border-white/20
                      transition
                      hover:scale-110
                      hover:border-white
                    "
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onMouseDown={handleUnsetTextColor}
                className="
                  mt-2
                  flex
                  w-full
                  items-center
                  justify-center
                  gap-1
                  rounded-md
                  border
                  border-white/10
                  px-2
                  py-1.5
                  text-xs
                  text-text-muted
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <X size={12} />
                Remover cor
              </button>
            </div>
          )}
        </div>

        {/* MARCA-TEXTO */}

        <div className="relative">
          <ToolbarButton
            title="Marca-texto"
            active={editor.isActive("highlight")}
            onClick={() => {
              setHighlightPaletteOpen((current) => !current);
              setTextPaletteOpen(false);
            }}
          >
            <Highlighter size={15} />
          </ToolbarButton>

          {highlightPaletteOpen && (
            <div
              className="
                absolute
                left-0
                top-full
                z-50
                mt-2
                w-[190px]
                rounded-lg
                border
                border-white/10
                bg-background
                p-2
                shadow-xl
              "
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Marca-texto</span>

                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setHighlightPaletteOpen(false);
                  }}
                  className="
                    rounded
                    p-1
                    text-text-muted
                    hover:bg-white/10
                    hover:text-white
                  "
                >
                  <X size={13} />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {highlightColors.map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    title={item.name}
                    onMouseDown={(event) => handleHighlight(event, item.color)}
                    className="
                      h-7
                      w-7
                      rounded-md
                      border
                      border-white/20
                      transition
                      hover:scale-110
                      hover:border-white
                    "
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onMouseDown={handleUnsetHighlight}
                className="
                  mt-2
                  flex
                  w-full
                  items-center
                  justify-center
                  gap-1
                  rounded-md
                  border
                  border-white/10
                  px-2
                  py-1.5
                  text-xs
                  text-text-muted
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <X size={12} />
                Remover marca-texto
              </button>
            </div>
          )}
        </div>

        {/* LISTA */}

        <ToolbarButton
          title="Lista"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>

        {/* LISTA NUMERADA */}

        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        {/* LINK */}

        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={handleLink}>
          <Link2 size={15} />
        </ToolbarButton>

        {/* PREVIEW */}

        <div className="ml-auto">
          <ToolbarButton
            title="Visualizar"
            active={preview}
            onClick={() => setPreview((current) => !current)}
          >
            <Eye size={15} />
          </ToolbarButton>
        </div>
      </div>

      {/* STATUS */}

      <div
        className="
          flex
          items-center
          justify-between
          border-b
          border-white/5
          bg-black/10
          px-3
          py-1.5
        "
      >
        <span className="text-[10px] text-text-muted">
          {clozeCount === 0
            ? "Nenhuma omissão criada"
            : `${clozeCount} ${clozeCount === 1 ? "omissão" : "omissões"}`}
        </span>

        <span className="text-[10px] text-text-muted">
          Próximo: <strong className="text-blue-400">c{nextClozeNumber}</strong>
        </span>
      </div>

      {/* EDITOR */}

      {preview ? (
        <div
          className="
            min-h-[240px]
            max-h-[240px]
            overflow-y-auto
            p-3
          "
        >
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{
              __html: getPreviewHtml(),
            }}
          />
        </div>
      ) : (
        <div
          className="
            min-h-[240px]
            max-h-[240px]
            overflow-y-auto
            p-3
          "
        >
          <EditorContent editor={editor} className="rich-editor" />
        </div>
      )}

      {/* AJUDA */}

      <div
        className="
          border-t
          border-white/5
          bg-black/10
          px-3
          py-2
        "
      >
        <p className="text-[10px] text-text-muted">
          <strong className="text-blue-400">{"{}"}</strong>
        </p>

        <p className="mt-1 text-[10px] text-text-muted">
          Exemplo: Brasília é a capital do{" "}
          <code className="rounded bg-black/20 px-1 text-blue-300">{"{{c1::Brasil}}"}</code>
        </p>
      </div>
    </div>
  );
}
