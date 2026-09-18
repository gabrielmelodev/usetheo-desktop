import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  RemoveFormatting,
  Table,
  Square,
  Palette,
  X,
  EyeOff,
} from "lucide-react";

import { Editor } from "@tiptap/react";
import { useState } from "react";

export type CardType = "basic" | "cloze" | "multiple_choice" | "true_false";

interface ToolbarProps {
  editor: Editor | null;
  cardType?: CardType;
}

type PaletteType = "text" | "highlight" | null;

const highlightColors = [
  { name: "Amarelo", color: "#fef08a" },
  { name: "Verde", color: "#86efac" },
  { name: "Azul", color: "#93c5fd" },
  { name: "Roxo", color: "#d8b4fe" },
  { name: "Vermelho", color: "#fca5a5" },
  { name: "Laranja", color: "#fdba74" },
  { name: "Rosa", color: "#f9a8d4" },
  { name: "Cinza", color: "#d1d5db" },
];

const textColors = [
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

export default function Toolbar({ editor, cardType = "basic" }: ToolbarProps) {
  const [openPalette, setOpenPalette] = useState<PaletteType>(null);

  if (!editor) {
    return null;
  }

  const currentEditor = editor;

  // =====================================================
  // BOTÃO PADRÃO
  // =====================================================

  function Button({
    active = false,
    disabled = false,
    onClick,
    children,
    title,
  }: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
  }) {
    return (
      <button
        type="button"
        title={title}
        disabled={disabled}
        onMouseDown={(event) => {
          /*
           * Impede o botão de roubar a seleção
           * que está marcada dentro do editor.
           */
          event.preventDefault();
        }}
        onClick={onClick}
        className={`
          rounded-md
          p-1.5
          transition
          text-text

          disabled:cursor-not-allowed
          disabled:opacity-40

          ${active ? "bg-blue-600 text-white" : "hover:bg-white/10"}
        `}
      >
        {children}
      </button>
    );
  }

  // =====================================================
  // PALETAS
  // =====================================================

  function togglePalette(palette: "text" | "highlight") {
    setOpenPalette((current) => (current === palette ? null : palette));
  }

  function setTextColor(color: string) {
    currentEditor.chain().focus().setColor(color).run();

    setOpenPalette(null);
  }

  function removeTextColor() {
    currentEditor.chain().focus().unsetColor().run();

    setOpenPalette(null);
  }

  function setHighlightColor(color: string) {
    currentEditor
      .chain()
      .focus()
      .setHighlight({
        color,
      })
      .run();

    setOpenPalette(null);
  }

  function removeHighlight() {
    currentEditor.chain().focus().unsetHighlight().run();

    setOpenPalette(null);
  }

  // =====================================================
  // CLOZE
  // =====================================================

  function getNextClozeNumber(): number {
    /*
     * Procura todos os Clozes existentes no conteúdo.
     *
     * Exemplo:
     *
     * {{c1::Brasil}}
     * {{c2::Brasília}}
     *
     * retorna 3.
     */

    const html = currentEditor.getHTML();

    const matches = html.match(/\{\{c(\d+)::/gi);

    if (!matches || matches.length === 0) {
      return 1;
    }

    const numbers = matches
      .map((match) => {
        const result = match.match(/\{\{c(\d+)::/i);

        return result ? Number(result[1]) : 0;
      })
      .filter((number) => number > 0);

    if (numbers.length === 0) {
      return 1;
    }

    return Math.max(...numbers) + 1;
  }

  function insertCloze() {
    const { from, to } = currentEditor.state.selection;

    /*
     * Não existe seleção.
     */
    if (from === to) {
      return;
    }

    const selectedText = currentEditor.state.doc.textBetween(from, to, " ");

    if (!selectedText.trim()) {
      return;
    }

    /*
     * Evita criar Cloze dentro de outro Cloze.
     */
    const html = currentEditor.getHTML();

    const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const alreadyCloze = new RegExp(`\\{\\{c\\d+::[^}]*${escapedText}[^}]*\\}\\}`, "i").test(html);

    if (alreadyCloze) {
      return;
    }

    const clozeNumber = getNextClozeNumber();

    const clozeText = `{{c${clozeNumber}::${selectedText}}}`;

    /*
     * Substitui exatamente o texto selecionado.
     */
    currentEditor
      .chain()
      .focus()
      .insertContentAt(
        {
          from,
          to,
        },
        clozeText,
      )
      .run();
  }

  // =====================================================
  // VERIFICAR SE EXISTE SELEÇÃO
  // =====================================================

  const hasSelection = currentEditor.state.selection.from !== currentEditor.state.selection.to;

  return (
    <div
      className="
        sticky
        top-0
        z-30

        flex
        flex-wrap
        gap-1

        rounded-t-lg

        border-b
        border-white/10

        bg-background/95

        p-2

        backdrop-blur

        shadow-sm
      "
    >
      {/* =====================================================
          HISTÓRICO
      ===================================================== */}

      <Button
        title="Desfazer"
        disabled={!currentEditor.can().undo()}
        onClick={() => currentEditor.chain().focus().undo().run()}
      >
        <Undo2 size={15} />
      </Button>

      <Button
        title="Refazer"
        disabled={!currentEditor.can().redo()}
        onClick={() => currentEditor.chain().focus().redo().run()}
      >
        <Redo2 size={15} />
      </Button>

      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* =====================================================
          TEXTO
      ===================================================== */}

      <Button
        title="Negrito"
        active={currentEditor.isActive("bold")}
        onClick={() => currentEditor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </Button>

      <Button
        title="Itálico"
        active={currentEditor.isActive("italic")}
        onClick={() => currentEditor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </Button>

      <Button
        title="Sublinhado"
        active={currentEditor.isActive("underline")}
        onClick={() => currentEditor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={15} />
      </Button>

      <Button
        title="Riscado"
        active={currentEditor.isActive("strike")}
        onClick={() => currentEditor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={15} />
      </Button>

      {/* =====================================================
          CLOZE
      ===================================================== */}

      {cardType === "cloze" && (
        <>
          <div className="mx-1 h-6 w-px bg-white/10" />

          <Button
            title={
              hasSelection
                ? "Transformar seleção em Cloze"
                : "Selecione um texto para criar um Cloze"
            }
            disabled={!hasSelection}
            onClick={insertCloze}
          >
            <EyeOff size={15} />
          </Button>
        </>
      )}

      {/* =====================================================
          COR DA FONTE
      ===================================================== */}

      <div className="relative">
        <Button
          title="Cor do texto"
          active={openPalette === "text"}
          onClick={() => togglePalette("text")}
        >
          <Palette size={15} />
        </Button>

        {openPalette === "text" && (
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
              backdrop-blur
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
              <span className="text-xs text-text-muted">Cor do texto</span>

              <button
                type="button"
                onClick={() => setOpenPalette(null)}
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
                  aria-label={`Cor do texto ${item.name}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setTextColor(item.color);
                  }}
                  className="
                    h-7
                    w-7

                    rounded-full

                    border
                    border-white/20

                    shadow-sm

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
              onMouseDown={(event) => {
                event.preventDefault();
                removeTextColor();
              }}
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

      {/* =====================================================
          MARCA-TEXTO
      ===================================================== */}

      <div className="relative">
        <Button
          title="Marca-texto"
          active={openPalette === "highlight"}
          onClick={() => togglePalette("highlight")}
        >
          <Highlighter size={15} />
        </Button>

        {openPalette === "highlight" && (
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
              backdrop-blur
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
              <span className="text-xs text-text-muted">Marca-texto</span>

              <button
                type="button"
                onClick={() => setOpenPalette(null)}
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
                  aria-label={`Marca-texto ${item.name}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setHighlightColor(item.color);
                  }}
                  className="
                    h-7
                    w-7

                    rounded-md

                    border
                    border-white/20

                    shadow-sm

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
              onMouseDown={(event) => {
                event.preventDefault();
                removeHighlight();
              }}
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

      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* =====================================================
          TÍTULOS
      ===================================================== */}

      <Button
        title="Título 1"
        active={currentEditor.isActive("heading", { level: 1 })}
        onClick={() =>
          currentEditor
            .chain()
            .focus()
            .toggleHeading({
              level: 1,
            })
            .run()
        }
      >
        <Heading1 size={15} />
      </Button>

      <Button
        title="Título 2"
        active={currentEditor.isActive("heading", { level: 2 })}
        onClick={() =>
          currentEditor
            .chain()
            .focus()
            .toggleHeading({
              level: 2,
            })
            .run()
        }
      >
        <Heading2 size={15} />
      </Button>

      <Button
        title="Título 3"
        active={currentEditor.isActive("heading", { level: 3 })}
        onClick={() =>
          currentEditor
            .chain()
            .focus()
            .toggleHeading({
              level: 3,
            })
            .run()
        }
      >
        <Heading3 size={15} />
      </Button>

      {/* =====================================================
          LISTAS
      ===================================================== */}

      <Button
        title="Lista"
        active={currentEditor.isActive("bulletList")}
        onClick={() => currentEditor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} />
      </Button>

      <Button
        title="Lista numerada"
        active={currentEditor.isActive("orderedList")}
        onClick={() => currentEditor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} />
      </Button>

      <Button
        title="Lista de tarefas"
        active={currentEditor.isActive("taskList")}
        onClick={() => currentEditor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare size={15} />
      </Button>

      {/* =====================================================
          BLOCOS
      ===================================================== */}

      <Button
        title="Citação"
        active={currentEditor.isActive("blockquote")}
        onClick={() => currentEditor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={15} />
      </Button>

      <Button
        title="Código"
        active={currentEditor.isActive("codeBlock")}
        onClick={() => currentEditor.chain().focus().toggleCodeBlock().run()}
      >
        <Code size={15} />
      </Button>

      {/* =====================================================
          LINK
      ===================================================== */}

      <Button
        title="Adicionar link"
        active={currentEditor.isActive("link")}
        onClick={() => {
          const previousUrl = currentEditor.getAttributes("link").href;

          const url = window.prompt("URL", previousUrl || "");

          if (url === null) {
            return;
          }

          if (url.trim() === "") {
            currentEditor.chain().focus().unsetLink().run();

            return;
          }

          currentEditor
            .chain()
            .focus()
            .setLink({
              href: url.trim(),
            })
            .run();
        }}
      >
        <Link2 size={15} />
      </Button>

      {/* =====================================================
          TABELA
      ===================================================== */}

      <Button
        title="Inserir tabela"
        onClick={() => {
          (currentEditor.chain() as any)
            .focus()
            .insertTable({
              rows: 3,
              cols: 3,
              withHeaderRow: true,
            })
            .run();
        }}
      >
        <Table size={15} />
      </Button>

      {/* =====================================================
          BOX ANKI
      ===================================================== */}

      <Button
        title="Box"
        active={currentEditor.isActive("box")}
        onClick={() => {
          (currentEditor.chain() as any).focus().toggleBox().run();
        }}
      >
        <Square size={15} />
      </Button>

      {/* =====================================================
          ALINHAMENTO
      ===================================================== */}

      <Button
        title="Alinhar à esquerda"
        active={currentEditor.isActive({
          textAlign: "left",
        })}
        onClick={() => currentEditor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft size={15} />
      </Button>

      <Button
        title="Centralizar"
        active={currentEditor.isActive({
          textAlign: "center",
        })}
        onClick={() => currentEditor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter size={15} />
      </Button>

      <Button
        title="Alinhar à direita"
        active={currentEditor.isActive({
          textAlign: "right",
        })}
        onClick={() => currentEditor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight size={15} />
      </Button>

      {/* =====================================================
          LIMPAR FORMATAÇÃO
      ===================================================== */}

      <Button
        title="Limpar formatação"
        onClick={() => currentEditor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting size={15} />
      </Button>

      {/* =====================================================
          TIPO DO CARD
      ===================================================== */}

      {cardType === "cloze" && (
        <div
          className="
            ml-1
            flex
            items-center
            rounded-md
            bg-purple-500/10
            px-2
            text-xs
            text-purple-400
          "
        >
          Cloze
        </div>
      )}

      {cardType === "multiple_choice" && (
        <div
          className="
            ml-1
            flex
            items-center
            rounded-md
            bg-blue-500/10
            px-2
            text-xs
            text-blue-400
          "
        >
          Múltipla escolha
        </div>
      )}

      {cardType === "true_false" && (
        <div
          className="
            ml-1
            flex
            items-center
            rounded-md
            bg-green-500/10
            px-2
            text-xs
            text-green-400
          "
        >
          Verdadeiro / Falso
        </div>
      )}

      {cardType === "basic" && (
        <div
          className="
            ml-1
            flex
            items-center
            rounded-md
            bg-gray-500/10
            px-2
            text-xs
            text-text-muted
          "
        >
          Básico
        </div>
      )}
    </div>
  );
}
