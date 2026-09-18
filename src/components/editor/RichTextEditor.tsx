import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { EditorContent, useEditor } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  Check,
  EyeOff,
  Highlighter,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Palette,
  Redo2,
  RemoveFormatting,
  Undo2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";

// =====================================================
// TIPOS
// =====================================================

export type CardType = "basic" | "cloze" | "multiple_choice" | "true_false";

export interface RichTextEditorProps {
  /**
   * Conteúdo da frente.
   */
  value: string;

  /**
   * Alteração da frente.
   */
  onChange: (value: string) => void;

  /**
   * Conteúdo do verso.
   *
   * Usado principalmente em cards básicos.
   */
  backValue?: string;

  /**
   * Alteração do verso.
   */
  onBackChange?: (value: string) => void;

  /**
   * Placeholder do editor.
   */
  placeholder?: string;

  /**
   * Tipo do cartão.
   */
  cardType?: CardType;

  /**
   * Desabilita edição.
   */
  disabled?: boolean;

  /**
   * Callback do próximo passo.
   */
  onNextStep?: () => void;

  /**
   * Exibe o botão "Próximo passo".
   */
  showNextStep?: boolean;

  /**
   * Texto do botão "Próximo passo".
   */
  nextStepLabel?: string;
}

// =====================================================
// TIPOS AUXILIARES
// =====================================================

interface ColorOption {
  name: string;
  color: string;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  title: string;
  tone?: "default" | "accent";
  onClick: () => void;
  children: ReactNode;
}

// =====================================================
// CORES
// =====================================================

const HIGHLIGHT_COLORS: ColorOption[] = [
  {
    name: "Amarelo",
    color: "#fef08a",
  },
  {
    name: "Verde",
    color: "#86efac",
  },
  {
    name: "Azul",
    color: "#93c5fd",
  },
  {
    name: "Roxo",
    color: "#d8b4fe",
  },
  {
    name: "Vermelho",
    color: "#fca5a5",
  },
  {
    name: "Laranja",
    color: "#fdba74",
  },
  {
    name: "Rosa",
    color: "#f9a8d4",
  },
  {
    name: "Cinza",
    color: "#d1d5db",
  },
];

const TEXT_COLORS: ColorOption[] = [
  {
    name: "Preto",
    color: "#000000",
  },
  {
    name: "Branco",
    color: "#ffffff",
  },
  {
    name: "Vermelho",
    color: "#ef4444",
  },
  {
    name: "Laranja",
    color: "#f97316",
  },
  {
    name: "Amarelo",
    color: "#eab308",
  },
  {
    name: "Verde",
    color: "#22c55e",
  },
  {
    name: "Azul",
    color: "#3b82f6",
  },
  {
    name: "Roxo",
    color: "#a855f7",
  },
  {
    name: "Rosa",
    color: "#ec4899",
  },
  {
    name: "Cinza",
    color: "#6b7280",
  },
];

const DEFAULT_TEXT_COLOR = "#ef4444";
const DEFAULT_HIGHLIGHT_COLOR = "#fef08a";

const SHORTCUTS = [
  {
    keys: "Ctrl+B",
    label: "Negrito",
  },
  {
    keys: "Ctrl+I",
    label: "Itálico",
  },
  {
    keys: "Ctrl+U",
    label: "Sublinhado",
  },
  {
    keys: "Ctrl+K",
    label: "Inserir link",
  },
  {
    keys: "Alt+C",
    label: "Criar omissão",
  },
  {
    keys: "Ctrl+Enter",
    label: "Próximo passo",
  },
  {
    keys: "Ctrl+Z",
    label: "Desfazer",
  },
  {
    keys: "Ctrl+Shift+Z",
    label: "Refazer",
  },
  {
    keys: "Esc",
    label: "Fechar menu aberto",
  },
];

// =====================================================
// BOTÃO DA TOOLBAR
// =====================================================

function ToolbarButton({
  active = false,
  disabled = false,
  title,
  tone = "default",
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();

        if (!disabled) {
          onClick();
        }
      }}
      className={`
        flex h-9 w-9 shrink-0
        items-center justify-center
        rounded-lg
        transition

        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-accent/70
        focus-visible:ring-offset-1
        focus-visible:ring-offset-background

        ${
          active
            ? tone === "accent"
              ? "bg-accent text-white shadow-sm shadow-accent/30"
              : "bg-white/15 text-white"
            : "text-text-muted hover:bg-white/10 hover:text-white"
        }

        disabled:cursor-not-allowed
        disabled:opacity-40
      `}
    >
      {children}
    </button>
  );
}

// =====================================================
// GRUPO DA TOOLBAR
// =====================================================

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      className="
        flex items-center gap-0.5
        rounded-lg
        bg-white/[0.03]
        p-0.5
      "
    >
      {children}
    </div>
  );
}

// =====================================================
// DIVISOR
// =====================================================

function ToolbarDivider() {
  return (
    <div
      className="
        mx-1
        h-5
        w-px
        shrink-0
        bg-white/10
      "
      aria-hidden="true"
    />
  );
}

// =====================================================
// CHEVRON
// =====================================================

function ChevronDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// =====================================================
// EDITOR PRINCIPAL
// =====================================================

export default function RichTextEditor({
  value,
  onChange,
  backValue = "",
  onBackChange,
  placeholder = "Digite aqui...",
  cardType = "basic",
  disabled = false,
  onNextStep,
  showNextStep = true,
  nextStepLabel = "Próximo passo",
}: RichTextEditorProps) {
  // ===================================================
  // ESTADOS
  // ===================================================

  const [textPaletteOpen, setTextPaletteOpen] = useState(false);

  const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [expanded, setExpanded] = useState(false);

  const [lastTextColor, setLastTextColor] = useState(DEFAULT_TEXT_COLOR);

  const [lastHighlightColor, setLastHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);

  const [textStats, setTextStats] = useState({
    characters: 0,
    words: 0,
    paragraphs: 0,
  });

  // ===================================================
  // REFS
  // ===================================================

  const textPaletteRef = useRef<HTMLDivElement>(null);

  const highlightPaletteRef = useRef<HTMLDivElement>(null);

  const linkRef = useRef<HTMLDivElement>(null);

  const shortcutsRef = useRef<HTMLDivElement>(null);

  const onChangeRef = useRef(onChange);
  const onBackChangeRef = useRef(onBackChange);
  const onNextStepRef = useRef(onNextStep);

  // ===================================================
  // CALLBACK REFS
  // ===================================================

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onBackChangeRef.current = onBackChange;
  }, [onBackChange]);

  useEffect(() => {
    onNextStepRef.current = onNextStep;
  }, [onNextStep]);

  // ===================================================
  // EXTENSÕES TIPTAP
  // ===================================================

  const extensions = useMemo(
    () => [
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
        autolink: true,
        linkOnPaste: true,
      }),

      Placeholder.configure({
        placeholder,
      }),

      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    [placeholder],
  );

  // ===================================================
  // EDITOR DA FRENTE
  // ===================================================

  const frontEditor = useEditor(
    {
      extensions,
      content: value || "",
      editable: !disabled,

      shouldRerenderOnTransaction: false,

      editorProps: {
        attributes: {
          class:
            "prose prose-invert max-w-none outline-none " +
            "text-[15px] leading-7 text-white/90 " +
            "focus:outline-none min-h-[180px]",

          spellcheck: "true",

          role: "textbox",

          "aria-label": "Frente do cartão",

          "aria-multiline": "true",
        },
      },

      onUpdate({ editor }) {
        onChangeRef.current(editor.getHTML());
      },
    },
    [extensions],
  );

  // ===================================================
  // EDITOR DO VERSO
  // ===================================================

  const backEditor = useEditor(
    {
      extensions,
      content: backValue || "",
      editable: !disabled,

      shouldRerenderOnTransaction: false,

      editorProps: {
        attributes: {
          class:
            "prose prose-invert max-w-none outline-none " +
            "text-[15px] leading-7 text-white/90 " +
            "focus:outline-none min-h-[180px]",

          spellcheck: "true",

          role: "textbox",

          "aria-label": "Verso do cartão",

          "aria-multiline": "true",
        },
      },

      onUpdate({ editor }) {
        onBackChangeRef.current?.(editor.getHTML());
      },
    },
    [extensions],
  );

  // ===================================================
  // SINCRONIZAR FRENTE
  // ===================================================

  useEffect(() => {
    if (!frontEditor) {
      return;
    }

    const nextHtml = value || "";

    if (frontEditor.getHTML() !== nextHtml) {
      frontEditor.commands.setContent(nextHtml, {
        emitUpdate: false,
      });
    }
  }, [frontEditor, value]);

  // ===================================================
  // SINCRONIZAR VERSO
  // ===================================================

  useEffect(() => {
    if (!backEditor) {
      return;
    }

    const nextHtml = backValue || "";

    if (backEditor.getHTML() !== nextHtml) {
      backEditor.commands.setContent(nextHtml, {
        emitUpdate: false,
      });
    }
  }, [backEditor, backValue]);

  // ===================================================
  // EDITÁVEL
  // ===================================================

  useEffect(() => {
    frontEditor?.setEditable(!disabled);
    backEditor?.setEditable(!disabled);
  }, [frontEditor, backEditor, disabled]);

  // ===================================================
  // ESTATÍSTICAS
  // ===================================================

  useEffect(() => {
    if (!frontEditor) {
      return;
    }

    const updateStats = () => {
      const text = frontEditor.getText();

      const normalizedText = text.trim();

      const words = normalizedText.length === 0 ? 0 : normalizedText.split(/\s+/).length;

      setTextStats({
        characters: text.length,
        words,
        paragraphs: frontEditor.state.doc.content.childCount,
      });
    };

    updateStats();

    frontEditor.on("update", updateStats);

    return () => {
      frontEditor.off("update", updateStats);
    };
  }, [frontEditor]);

  // ===================================================
  // AVISO DE TAMANHO
  // ===================================================

  const lengthHint = useMemo(() => {
    if (textStats.characters >= 20000) {
      return "Texto muito extenso";
    }

    if (textStats.characters >= 10000) {
      return "Texto extenso";
    }

    if (textStats.characters >= 5000) {
      return "Texto longo";
    }

    return null;
  }, [textStats.characters]);

  // ===================================================
  // FECHAR MENUS AO CLICAR FORA
  // ===================================================

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (textPaletteRef.current && !textPaletteRef.current.contains(target)) {
        setTextPaletteOpen(false);
      }

      if (highlightPaletteRef.current && !highlightPaletteRef.current.contains(target)) {
        setHighlightPaletteOpen(false);
      }

      if (linkRef.current && !linkRef.current.contains(target)) {
        setLinkOpen(false);
      }

      if (shortcutsRef.current && !shortcutsRef.current.contains(target)) {
        setShortcutsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  // ===================================================
  // ESC
  // ===================================================

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      const hasOpenMenu = textPaletteOpen || highlightPaletteOpen || linkOpen || shortcutsOpen;

      if (hasOpenMenu) {
        setTextPaletteOpen(false);
        setHighlightPaletteOpen(false);
        setLinkOpen(false);
        setShortcutsOpen(false);
        return;
      }

      if (expanded) {
        setExpanded(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [expanded, highlightPaletteOpen, linkOpen, shortcutsOpen, textPaletteOpen]);

  // ===================================================
  // CLOZE
  // ===================================================

  const insertCloze = useCallback(
    (editor: ReturnType<typeof useEditor>) => {
      if (!editor || disabled) {
        return;
      }

      const { from, to } = editor.state.selection;

      if (from === to) {
        editor.chain().focus().insertContent("{{c1::texto}}").run();

        return;
      }

      const selectedText = editor.state.doc.textBetween(from, to, " ");

      if (!selectedText.trim()) {
        return;
      }

      const safeText = selectedText.replace(/::/g, " ");

      editor.chain().focus().deleteSelection().insertContent(`{{c1::${safeText}}}`).run();
    },
    [disabled],
  );

  // ===================================================
  // PRÓXIMO PASSO
  // ===================================================

  const handleNextStep = useCallback(() => {
    if (disabled || !onNextStepRef.current) {
      return;
    }

    if (frontEditor) {
      onChangeRef.current(frontEditor.getHTML());
    }

    if (backEditor) {
      onBackChangeRef.current?.(backEditor.getHTML());
    }

    onNextStepRef.current();
  }, [frontEditor, backEditor, disabled]);

  // ===================================================
  // ATALHOS
  // ===================================================

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled) {
        return;
      }

      const isMod = event.ctrlKey || event.metaKey;

      // Ctrl + K
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault();

        setTextPaletteOpen(false);
        setHighlightPaletteOpen(false);
        setShortcutsOpen(false);
        setLinkOpen(true);

        return;
      }

      // Alt + C
      if (cardType === "cloze" && event.altKey && event.key.toLowerCase() === "c") {
        event.preventDefault();

        insertCloze(frontEditor);

        return;
      }

      // Ctrl + Enter
      if (isMod && event.key === "Enter" && onNextStepRef.current) {
        event.preventDefault();

        handleNextStep();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, cardType, frontEditor, handleNextStep, insertCloze]);

  // ===================================================
  // COR DO TEXTO
  // ===================================================

  const applyTextColor = useCallback(
    (color: string) => {
      if (!frontEditor || disabled) {
        return;
      }

      frontEditor.chain().focus().setColor(color).run();

      setLastTextColor(color);
      setTextPaletteOpen(false);
    },
    [frontEditor, disabled],
  );

  const handleTextColor = useCallback(
    (event: MouseEvent<HTMLButtonElement>, color: string) => {
      event.preventDefault();

      applyTextColor(color);
    },
    [applyTextColor],
  );

  const handleUnsetTextColor = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      if (!frontEditor || disabled) {
        return;
      }

      frontEditor.chain().focus().unsetColor().run();

      setTextPaletteOpen(false);
    },
    [frontEditor, disabled],
  );

  // ===================================================
  // MARCA-TEXTO
  // ===================================================

  const applyHighlight = useCallback(
    (color: string) => {
      if (!frontEditor || disabled) {
        return;
      }

      frontEditor
        .chain()
        .focus()
        .setHighlight({
          color,
        })
        .run();

      setLastHighlightColor(color);

      setHighlightPaletteOpen(false);
    },
    [frontEditor, disabled],
  );

  const handleHighlight = useCallback(
    (event: MouseEvent<HTMLButtonElement>, color: string) => {
      event.preventDefault();

      applyHighlight(color);
    },
    [applyHighlight],
  );

  const handleUnsetHighlight = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      if (!frontEditor || disabled) {
        return;
      }

      frontEditor.chain().focus().unsetHighlight().run();

      setHighlightPaletteOpen(false);
    },
    [frontEditor, disabled],
  );

  // ===================================================
  // LINK
  // ===================================================

  function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!frontEditor || disabled) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    const url = String(formData.get("url") || "").trim();

    if (!url) {
      return;
    }

    let normalizedUrl = url;

    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://") &&
      !normalizedUrl.startsWith("mailto:")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    frontEditor
      .chain()
      .focus()
      .setLink({
        href: normalizedUrl,
      })
      .run();

    setLinkOpen(false);
  }

  function handleUnsetLink() {
    if (!frontEditor || disabled) {
      return;
    }

    frontEditor.chain().focus().unsetLink().run();

    setLinkOpen(false);
  }

  // ===================================================
  // LIMPAR FORMATAÇÃO
  // ===================================================

  function clearFormatting() {
    if (!frontEditor || disabled) {
      return;
    }

    frontEditor.chain().focus().clearNodes().unsetAllMarks().run();
  }

  // ===================================================
  // CARREGAMENTO
  // ===================================================

  if (!frontEditor || !backEditor) {
    return (
      <div
        className="
          flex
          min-h-[280px]
          items-center
          justify-center
          rounded-lg
          border
          border-white/10
          bg-black/10
        "
      >
        <div className="text-sm text-text-muted">Carregando editor...</div>
      </div>
    );
  }

  // ===================================================
  // TOOLBAR
  // ===================================================

  const toolbar = (
    <div
      className="
        sticky top-0 z-20
        flex flex-wrap items-center gap-1.5
        border-b border-white/10
        bg-background/95
        px-3 py-2
        backdrop-blur-xl
      "
      role="toolbar"
      aria-label="Ferramentas de formatação"
    >
      {/* =================================================
          CLOZE
      ================================================= */}

      {cardType === "cloze" && (
        <>
          <button
            type="button"
            title="Criar omissão (Alt+C)"
            aria-label="Criar omissão (Alt+C)"
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();

              if (!disabled) {
                insertCloze(frontEditor);
              }
            }}
            className="
              flex h-9 shrink-0
              items-center gap-1.5
              rounded-lg
              bg-accent/15
              px-2.5
              text-xs font-semibold
              text-accent
              transition
              hover:bg-accent/25
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-accent/70
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            <EyeOff size={14} aria-hidden="true" />

            <span>Omissão</span>

            <span
              className="
                ml-0.5
                rounded
                border
                border-accent/30
                bg-accent/10
                px-1
                py-0.5
                text-[9px]
                font-bold
                tracking-wide
              "
            >
              ALT+C
            </span>
          </button>

          <ToolbarDivider />
        </>
      )}

      {/* =================================================
          DESFAZER / REFAZER
      ================================================= */}

      <ToolbarGroup>
        <ToolbarButton
          title="Desfazer (Ctrl+Z)"
          disabled={!frontEditor.can().undo() || disabled}
          onClick={() => frontEditor.chain().focus().undo().run()}
        >
          <Undo2 size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Refazer (Ctrl+Shift+Z)"
          disabled={!frontEditor.can().redo() || disabled}
          onClick={() => frontEditor.chain().focus().redo().run()}
        >
          <Redo2 size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* =================================================
          FORMATAÇÃO
      ================================================= */}

      <ToolbarGroup>
        <ToolbarButton
          title="Negrito (Ctrl+B)"
          active={frontEditor.isActive("bold")}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Itálico (Ctrl+I)"
          active={frontEditor.isActive("italic")}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Sublinhado (Ctrl+U)"
          active={frontEditor.isActive("underline")}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* =================================================
          COR DO TEXTO
      ================================================= */}

      <div ref={textPaletteRef} className="relative flex items-center">
        <ToolbarGroup>
          <button
            type="button"
            title="Aplicar última cor de texto"
            aria-label="Aplicar última cor de texto"
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();

              if (!disabled) {
                applyTextColor(lastTextColor);
              }
            }}
            className="
              flex h-9 w-9 shrink-0
              items-center justify-center
              rounded-lg
              text-text-muted
              transition
              hover:bg-white/10
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            <span className="relative">
              <Palette size={15} />

              <span
                className="
                  absolute
                  -bottom-1
                  left-1/2
                  h-[3px]
                  w-3.5
                  -translate-x-1/2
                  rounded-full
                "
                style={{
                  backgroundColor: lastTextColor,
                }}
              />
            </span>
          </button>

          <button
            type="button"
            title="Escolher cor do texto"
            aria-label="Escolher cor do texto"
            aria-haspopup="menu"
            aria-expanded={textPaletteOpen}
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();

              if (disabled) {
                return;
              }

              setTextPaletteOpen((current) => !current);

              setHighlightPaletteOpen(false);

              setLinkOpen(false);
              setShortcutsOpen(false);
            }}
            className={`
              flex h-9 w-5 shrink-0
              items-center justify-center
              rounded-md
              text-text-muted
              transition
              hover:bg-white/10
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-40
              ${textPaletteOpen ? "bg-white/15 text-white" : ""}
            `}
          >
            <ChevronDownIcon />
          </button>
        </ToolbarGroup>

        {textPaletteOpen && (
          <div
            role="menu"
            aria-label="Cores do texto"
            className="
              absolute
              left-0
              top-full
              z-50
              mt-2
              w-[200px]
              rounded-xl
              border
              border-white/10
              bg-background
              p-3
              shadow-2xl
            "
          >
            <div
              className="
                mb-3
                flex
                items-center
                justify-between
              "
            >
              <span className="text-xs font-medium text-white/80">Cor do texto</span>

              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();

                  setTextPaletteOpen(false);
                }}
                className="
                  rounded-md
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
              {TEXT_COLORS.map((item) => {
                const currentColor = frontEditor.getAttributes("textStyle").color;

                const isSelected = currentColor === item.color;

                return (
                  <button
                    key={item.color}
                    type="button"
                    role="menuitem"
                    title={item.name}
                    aria-label={`Cor do texto: ${item.name}`}
                    aria-pressed={isSelected}
                    onMouseDown={(event) => handleTextColor(event, item.color)}
                    className="
                        relative
                        h-7
                        w-7
                        rounded-full
                        border
                        border-white/20
                        transition
                        hover:scale-110
                        hover:border-white
                        focus-visible:outline-none
                        focus-visible:ring-2
                        focus-visible:ring-accent
                      "
                    style={{
                      backgroundColor: item.color,
                    }}
                  >
                    {isSelected && (
                      <Check
                        size={13}
                        className="
                            absolute
                            inset-0
                            m-auto
                            text-white
                            drop-shadow
                          "
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onMouseDown={handleUnsetTextColor}
              className="
                mt-3
                flex
                w-full
                items-center
                justify-center
                gap-1.5
                rounded-md
                border
                border-white/10
                px-2
                py-1.5
                text-xs
                text-text-muted
                transition
                hover:bg-white/10
                hover:text-white
              "
            >
              <RemoveFormatting size={13} />
              Remover cor
            </button>
          </div>
        )}
      </div>

      {/* =================================================
          MARCA-TEXTO
      ================================================= */}

      <div ref={highlightPaletteRef} className="relative flex items-center">
        <ToolbarGroup>
          <button
            type="button"
            title="Aplicar último marca-texto"
            aria-label="Aplicar último marca-texto"
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();

              if (!disabled) {
                applyHighlight(lastHighlightColor);
              }
            }}
            className="
              flex h-9 w-9 shrink-0
              items-center justify-center
              rounded-lg
              text-text-muted
              transition
              hover:bg-white/10
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            <span className="relative">
              <Highlighter size={15} />

              <span
                className="
                  absolute
                  -bottom-1
                  left-1/2
                  h-[3px]
                  w-3.5
                  -translate-x-1/2
                  rounded-full
                "
                style={{
                  backgroundColor: lastHighlightColor,
                }}
              />
            </span>
          </button>

          <button
            type="button"
            title="Escolher marca-texto"
            aria-label="Escolher marca-texto"
            aria-haspopup="menu"
            aria-expanded={highlightPaletteOpen}
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();

              if (disabled) {
                return;
              }

              setHighlightPaletteOpen((current) => !current);

              setTextPaletteOpen(false);
              setLinkOpen(false);
              setShortcutsOpen(false);
            }}
            className={`
              flex h-9 w-5 shrink-0
              items-center justify-center
              rounded-md
              text-text-muted
              transition
              hover:bg-white/10
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-40
              ${highlightPaletteOpen ? "bg-white/15 text-white" : ""}
            `}
          >
            <ChevronDownIcon />
          </button>
        </ToolbarGroup>

        {highlightPaletteOpen && (
          <div
            role="menu"
            aria-label="Cores de marca-texto"
            className="
              absolute
              left-0
              top-full
              z-50
              mt-2
              w-[200px]
              rounded-xl
              border
              border-white/10
              bg-background
              p-3
              shadow-2xl
            "
          >
            <div
              className="
                mb-3
                flex
                items-center
                justify-between
              "
            >
              <span className="text-xs font-medium text-white/80">Marca-texto</span>

              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();

                  setHighlightPaletteOpen(false);
                }}
                className="
                  rounded-md
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
              {HIGHLIGHT_COLORS.map((item) => (
                <button
                  key={item.color}
                  type="button"
                  role="menuitem"
                  title={item.name}
                  aria-label={`Marca-texto: ${item.name}`}
                  onMouseDown={(event) => handleHighlight(event, item.color)}
                  className="
                      h-8
                      w-8
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
                mt-3
                flex
                w-full
                items-center
                justify-center
                gap-1.5
                rounded-md
                border
                border-white/10
                px-2
                py-1.5
                text-xs
                text-text-muted
                transition
                hover:bg-white/10
                hover:text-white
              "
            >
              <X size={13} />
              Remover marca-texto
            </button>
          </div>
        )}
      </div>

      <ToolbarDivider />

      {/* =================================================
          LISTAS
      ================================================= */}

      <ToolbarGroup>
        <ToolbarButton
          title="Lista"
          active={frontEditor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Lista numerada"
          active={frontEditor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* =================================================
          ALINHAMENTO
      ================================================= */}

      <ToolbarGroup>
        <ToolbarButton
          title="Alinhar à esquerda"
          active={frontEditor.isActive({
            textAlign: "left",
          })}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Centralizar"
          active={frontEditor.isActive({
            textAlign: "center",
          })}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={15} />
        </ToolbarButton>

        <ToolbarButton
          title="Alinhar à direita"
          active={frontEditor.isActive({
            textAlign: "right",
          })}
          disabled={disabled}
          onClick={() => frontEditor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* =================================================
          LINK
      ================================================= */}

      <div ref={linkRef} className="relative">
        <ToolbarButton
          title="Inserir link (Ctrl+K)"
          active={frontEditor.isActive("link")}
          disabled={disabled}
          onClick={() => {
            setLinkOpen((current) => !current);

            setTextPaletteOpen(false);
            setHighlightPaletteOpen(false);
            setShortcutsOpen(false);
          }}
        >
          <Link2 size={15} />
        </ToolbarButton>

        {linkOpen && (
          <div
            role="dialog"
            aria-label="Inserir link"
            className="
              absolute
              right-0
              top-full
              z-50
              mt-2
              w-[280px]
              rounded-xl
              border
              border-white/10
              bg-background
              p-3
              shadow-2xl
            "
          >
            <div
              className="
                mb-3
                flex
                items-center
                justify-between
              "
            >
              <span className="text-xs font-medium text-white/80">Inserir link</span>

              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();

                  setLinkOpen(false);
                }}
                className="
                  rounded-md
                  p-1
                  text-text-muted
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <X size={13} />
              </button>
            </div>

            <form onSubmit={handleLinkSubmit}>
              <input
                id="rich-text-editor-url"
                name="url"
                type="text"
                autoFocus
                defaultValue={frontEditor.getAttributes("link").href || ""}
                placeholder="https://exemplo.com"
                className="
                  h-9
                  w-full
                  rounded-md
                  border
                  border-white/10
                  bg-black/20
                  px-3
                  text-xs
                  text-white
                  outline-none
                  placeholder:text-white/30
                  focus:border-accent
                  focus-visible:ring-2
                  focus-visible:ring-accent/50
                "
              />

              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  className="
                    flex-1
                    rounded-md
                    bg-accent
                    px-3
                    py-2
                    text-xs
                    font-medium
                    text-white
                    transition
                    hover:opacity-90
                  "
                >
                  Aplicar
                </button>

                {frontEditor.isActive("link") && (
                  <button
                    type="button"
                    onClick={handleUnsetLink}
                    className="
                      rounded-md
                      border
                      border-white/10
                      px-3
                      py-2
                      text-xs
                      text-text-muted
                      hover:bg-white/10
                      hover:text-white
                    "
                  >
                    Remover
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* =================================================
          LIMPAR FORMATAÇÃO
      ================================================= */}

      <ToolbarButton title="Limpar formatação" disabled={disabled} onClick={clearFormatting}>
        <RemoveFormatting size={15} />
      </ToolbarButton>

      {/* =================================================
          DIREITA
      ================================================= */}

      <div className="ml-auto flex items-center gap-1">
        {/* ===============================================
            ATALHOS
        =============================================== */}

        <div ref={shortcutsRef} className="relative">
          <ToolbarButton
            title="Ver atalhos de teclado"
            active={shortcutsOpen}
            onClick={() => {
              setShortcutsOpen((current) => !current);

              setTextPaletteOpen(false);
              setHighlightPaletteOpen(false);
              setLinkOpen(false);
            }}
          >
            <Keyboard size={15} />
          </ToolbarButton>

          {shortcutsOpen && (
            <div
              role="dialog"
              aria-label="Atalhos de teclado"
              className="
                absolute
                right-0
                top-full
                z-50
                mt-2
                w-64
                rounded-xl
                border
                border-white/10
                bg-background
                p-3
                shadow-2xl
              "
            >
              <div
                className="
                  mb-2
                  flex
                  items-center
                  justify-between
                "
              >
                <span className="text-xs font-medium text-white/80">Atalhos de teclado</span>

                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();

                    setShortcutsOpen(false);
                  }}
                  className="
                    rounded-md
                    p-1
                    text-text-muted
                    hover:bg-white/10
                    hover:text-white
                  "
                >
                  <X size={13} />
                </button>
              </div>

              <ul className="space-y-1.5">
                {SHORTCUTS.map((item) => (
                  <li
                    key={item.keys}
                    className="
                        flex
                        items-center
                        justify-between
                        gap-3
                        text-[11px]
                      "
                  >
                    <span className="text-text-muted">{item.label}</span>

                    <kbd
                      className="
                          shrink-0
                          rounded
                          border
                          border-white/15
                          bg-white/5
                          px-1.5
                          py-0.5
                          font-mono
                          text-[10px]
                          text-white/80
                        "
                    >
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ===============================================
            EXPANDIR
        =============================================== */}

        <ToolbarButton
          title={expanded ? "Sair da tela expandida" : "Expandir editor"}
          active={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </ToolbarButton>
      </div>
    </div>
  );

  // ===================================================
  // EDITOR INDIVIDUAL
  // ===================================================

  const renderEditor = (
    editor: ReturnType<typeof useEditor>,
    label: string,
    side: "front" | "back",
  ) => {
    if (!editor) {
      return null;
    }

    return (
      <div
        className="
          overflow-hidden
          rounded-xl
          border
          border-white/10
          bg-black/20
          transition
          focus-within:border-accent/40
          focus-within:ring-1
          focus-within:ring-accent/20
        "
      >
        {/* CABEÇALHO */}

        <div
          className="
            flex
            items-center
            justify-between
            border-b
            border-white/10
            bg-white/[0.025]
            px-4
            py-2.5
          "
        >
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-semibold text-white">{label}</div>

              <div className="text-[10px] text-text-muted">
                {side === "front" ? "O que o aluno verá primeiro" : "Resposta exibida depois"}
              </div>
            </div>
          </div>

          <span
            className="
              rounded-md
              bg-white/5
              px-2
              py-1
              text-[10px]
              text-text-muted
            "
          >
            {side === "front" ? "Pergunta" : "Resposta"}
          </span>
        </div>

        {/* EDITOR */}

        <div
          className="
            min-h-[220px]
            max-h-[560px]
            overflow-y-auto
            p-4
          "
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  };

  // ===================================================
  // ÁREA DOS EDITORES
  // ===================================================

  const editorArea = (
    <div className={expanded ? "flex-1 overflow-y-auto p-5 md:p-8" : "p-4"}>
      <div className={expanded ? "mx-auto w-full max-w-7xl" : "w-full"}>
        {/* TÍTULO */}

        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white">Conteúdo do cartão</h2>

          <p className="mt-0.5 text-xs text-text-muted">Preencha a frente e o verso do cartão.</p>
        </div>

        {/* FRENTE + VERSO */}

        <div
          className="
            grid
            grid-cols-1
            gap-4
            lg:grid-cols-2
          "
        >
          {renderEditor(frontEditor, "Frente", "front")}

          {renderEditor(backEditor, "Verso", "back")}
        </div>
      </div>
    </div>
  );

  // ===================================================
  // RODAPÉ
  // ===================================================

  const footer = (
    <div
      className="
        flex
        flex-wrap
        items-center
        justify-between
        gap-x-4
        gap-y-1
        border-t
        border-white/5
        px-3
        py-1.5
        text-[10px]
        text-text-muted
      "
    >
      <div className="flex items-center gap-3">
        <span>
          {cardType === "cloze"
            ? "Modo Cloze"
            : cardType === "basic"
              ? "Modo Básico"
              : cardType === "multiple_choice"
                ? "Múltipla escolha"
                : "Verdadeiro / Falso"}
        </span>

        <span className="tabular-nums">
          {textStats.words} {textStats.words === 1 ? "palavra" : "palavras"}
          {" · "}
          {textStats.characters} {textStats.characters === 1 ? "caractere" : "caracteres"}
          {" · "}
          {textStats.paragraphs} {textStats.paragraphs === 1 ? "parágrafo" : "parágrafos"}
        </span>
      </div>

      {lengthHint && <span className="text-amber-400/90">{lengthHint}</span>}
    </div>
  );

  // ===================================================
  // PRÓXIMO PASSO
  // ===================================================

  const nextStepButton =
    showNextStep && onNextStep && !disabled ? (
      <div
        className="
          flex
          items-center
          justify-end
          border-t
          border-white/5
          bg-black/10
          px-3
          py-2
        "
      >
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();

            handleNextStep();
          }}
          className="
            group
            flex
            h-9
            items-center
            gap-2
            rounded-lg
            bg-accent
            px-4
            text-xs
            font-semibold
            text-white
            shadow-sm
            shadow-accent/20
            transition
            hover:brightness-110
            active:scale-[0.98]
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-accent/70
          "
        >
          <span>{nextStepLabel}</span>

          <ArrowRight
            size={14}
            className="
              transition-transform
              group-hover:translate-x-0.5
            "
          />
        </button>
      </div>
    ) : null;

  // ===================================================
  // MODO EXPANDIDO
  // ===================================================

  if (expanded) {
    return (
      <div
        className="
          fixed
          inset-0
          z-[100]
          flex
          flex-col
          overflow-hidden
          bg-background
        "
        role="dialog"
        aria-modal="true"
        aria-label="Editor expandido"
      >
        {toolbar}

        {editorArea}

        {nextStepButton}

        {footer}
      </div>
    );
  }

  // ===================================================
  // MODO NORMAL
  // ===================================================

  return (
    <div
      className={`
        overflow-visible
        rounded-xl
        border
        border-white/10
        bg-black/10
        ${disabled ? "opacity-70" : ""}
      `}
    >
      {toolbar}

      {editorArea}

      {nextStepButton}

      {footer}
    </div>
  );
}
