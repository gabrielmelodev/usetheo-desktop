import { X, Loader2, CheckCircle2 } from "lucide-react";

import { useEffect, useState, type FormEvent } from "react";

import { createPortal } from "react-dom";

import { Button, ErrorBanner, Panel, Label, Input } from "../../components/ui";

import RichTextEditor, { type CardType } from "../editor/RichTextEditor";

import { createNote, ensureNoteType, extractErrorMessage } from "../../lib/api";

import ClozeCardForm, {
  extractTextFromHtml,
  getClozeText,
  normalizeCloze,
} from "../cards/ClozeCardForm";

// =====================================================
// PROPS
// =====================================================

interface AddCardModalProps {
  open: boolean;
  deckId: string;
  onClose: () => void;
  onCreated: () => void;
}

type MultipleChoiceAnswer = "A" | "B" | "C" | "D";

// =====================================================
// COMPONENTE
// =====================================================

export default function AddCardModal({ open, deckId, onClose, onCreated }: AddCardModalProps) {
  // ===================================================
  // ESTADO PRINCIPAL
  // ===================================================

  const [cardType, setCardType] = useState<CardType>("basic");

  const [front, setFront] = useState("");

  const [back, setBack] = useState("");

  const [tags, setTags] = useState("");

  // ===================================================
  // MÚLTIPLA ESCOLHA
  // ===================================================

  const [optionA, setOptionA] = useState("");

  const [optionB, setOptionB] = useState("");

  const [optionC, setOptionC] = useState("");

  const [optionD, setOptionD] = useState("");

  const [correct, setCorrect] = useState<MultipleChoiceAnswer>("A");

  // ===================================================
  // UI
  // ===================================================

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [createdCount, setCreatedCount] = useState(0);

  // ===================================================
  // BLOQUEAR SCROLL DA PÁGINA
  // ===================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ===================================================
  // CTRL + ENTER
  // ===================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    function shortcut(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === "Enter") {
        const form = document.getElementById("add-card-form") as HTMLFormElement | null;

        form?.requestSubmit();
      }
    }

    window.addEventListener("keydown", shortcut);

    return () => {
      window.removeEventListener("keydown", shortcut);
    };
  }, [open]);

  // ===================================================
  // ESC
  // ===================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, loading, onClose]);

  // ===================================================
  // LIMPAR FORMULÁRIO
  // ===================================================

  function clearForm() {
    setFront("");
    setBack("");
    setTags("");

    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");

    setCorrect("A");

    setError(null);
  }

  // ===================================================
  // FECHAR MODAL
  // ===================================================

  function closeModal() {
    if (loading) {
      return;
    }

    clearForm();

    setCreatedCount(0);

    setCardType("basic");

    onClose();
  }

  // ===================================================
  // TROCAR TIPO
  // ===================================================

  function handleCardTypeChange(type: CardType) {
    if (loading || type === cardType) {
      return;
    }

    clearForm();

    setCardType(type);
  }

  // ===================================================
  // VALIDAR CLOZE
  // ===================================================

  function validateCloze(text: string): string | null {
    const plainText = text.includes("<") ? extractTextFromHtml(text) : text;

    const clozeText = normalizeCloze(plainText);

    if (!clozeText.trim()) {
      return "Digite o texto do card.";
    }

    const clozeMatches = clozeText.match(/\{\{c\d+::[^{}]+?\}\}/gi);

    if (!clozeMatches || clozeMatches.length === 0) {
      return 'Para cards Cloze, use uma omissão como "{{c1::texto}}".';
    }

    for (const cloze of clozeMatches) {
      const match = cloze.match(/^\{\{c(\d+)::(.+?)\}\}$/i);

      if (!match) {
        return `Cloze inválido: ${cloze}`;
      }

      const index = Number(match[1]);

      const content = match[2].trim();

      if (!index || index < 1) {
        return `Número do Cloze inválido: ${cloze}`;
      }

      if (!content) {
        return `O Cloze ${cloze} está vazio.`;
      }
    }

    return null;
  }

  // ===================================================
  // CAMPOS DA NOTA
  // ===================================================

  function getFields(): Record<string, string> {
    switch (cardType) {
      case "basic":
        return {
          Front: front,
          Back: back,
        };

      case "cloze":
        return {
          Text: getClozeText(front),
        };

      case "multiple_choice": {
        const answer = [
          `A) ${optionA}`,
          `B) ${optionB}`,
          `C) ${optionC}`,
          `D) ${optionD}`,
          "",
          `Resposta correta: ${correct}`,
        ].join("\n");

        return {
          Question: front,
          Answer: answer,
        };
      }

      case "true_false":
        return {
          Question: front,
          Answer: back,
        };

      default:
        return {
          Front: front,
          Back: back,
        };
    }
  }

  // ===================================================
  // TAGS
  // ===================================================

  function getTags(): string[] {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  // ===================================================
  // VALIDAÇÃO
  // ===================================================

  function validateFields(): string | null {
    // =================================================
    // CLOZE
    // =================================================

    if (cardType === "cloze") {
      return validateCloze(front);
    }

    // =================================================
    // PERGUNTA
    // =================================================

    const frontText = extractTextFromHtml(front);

    if (!frontText.trim()) {
      if (cardType === "multiple_choice" || cardType === "true_false") {
        return "Digite a pergunta.";
      }

      return "Digite a pergunta do card.";
    }

    // =================================================
    // MÚLTIPLA ESCOLHA
    // =================================================

    if (cardType === "multiple_choice") {
      if (!optionA.trim()) {
        return "Digite a alternativa A.";
      }

      if (!optionB.trim()) {
        return "Digite a alternativa B.";
      }

      if (!optionC.trim()) {
        return "Digite a alternativa C.";
      }

      if (!optionD.trim()) {
        return "Digite a alternativa D.";
      }

      if (!correct) {
        return "Selecione a alternativa correta.";
      }

      return null;
    }

    // =================================================
    // VERDADEIRO / FALSO
    // =================================================

    if (cardType === "true_false") {
      if (!back.trim()) {
        return "Informe se a afirmação é verdadeira ou falsa.";
      }

      if (back !== "Verdadeiro" && back !== "Falso") {
        return "Selecione Verdadeiro ou Falso.";
      }

      return null;
    }

    // =================================================
    // BÁSICO
    // =================================================

    const backText = extractTextFromHtml(back);

    if (!backText.trim()) {
      return "Digite a resposta do card.";
    }

    return null;
  }

  // ===================================================
  // SUBMIT
  // ===================================================

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);

    const validationError = validateFields();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      // ===============================================
      // NOTE TYPE
      // ===============================================

      const noteTypeId = await ensureNoteType(cardType);

      // ===============================================
      // CAMPOS
      // ===============================================

      const fields = getFields();

      // ===============================================
      // TAGS
      // ===============================================

      const noteTags = getTags();

      // ===============================================
      // DEBUG
      // ===============================================

      console.log("Criando card:", {
        deck_id: deckId,
        card_type: cardType,
        note_type_id: noteTypeId,
        fields,
        tags: noteTags,
      });

      // ===============================================
      // CRIAR NOTA
      // ===============================================

      await createNote({
        deck_id: deckId,
        note_type_id: noteTypeId,
        fields,
        tags: noteTags,
      });

      // ===============================================
      // CONTADOR
      // ===============================================

      setCreatedCount((value) => value + 1);

      // ===============================================
      // LIMPAR
      // ===============================================

      clearForm();

      // ===============================================
      // ATUALIZAR LISTA
      // ===============================================

      onCreated();
    } catch (error) {
      console.error("Erro criando flashcard:", error);

      setError(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  // ===================================================
  // MODAL FECHADO
  // ===================================================

  if (!open) {
    return null;
  }

  // ===================================================
  // OPÇÕES MÚLTIPLA ESCOLHA
  // ===================================================

  const multipleChoiceOptions = [
    {
      letter: "A" as const,
      value: optionA,
      setter: setOptionA,
    },
    {
      letter: "B" as const,
      value: optionB,
      setter: setOptionB,
    },
    {
      letter: "C" as const,
      value: optionC,
      setter: setOptionC,
    },
    {
      letter: "D" as const,
      value: optionD,
      setter: setOptionD,
    },
  ];

  // ===================================================
  // TIPOS DOS CARDS
  // ===================================================

  const cardTypes: Array<{
    type: CardType;
    label: string;
  }> = [
    {
      type: "basic",
      label: "Básico",
    },
    {
      type: "cloze",
      label: "Cloze",
    },
    {
      type: "multiple_choice",
      label: "Múltipla",
    },
    {
      type: "true_false",
      label: "V / F",
    },
  ];

  // ===================================================
  // MODAL
  //
  // IMPORTANTE:
  // O modal é renderizado diretamente no BODY.
  // Assim nenhum container pai consegue deslocá-lo.
  // ===================================================

  return createPortal(
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          closeModal();
        }
      }}
      className="
        fixed
        inset-0
        z-[99999]
        flex
        items-center
        justify-center
        overflow-hidden
        bg-black/55
        px-6
        py-5
        backdrop-blur-sm
        animate-in
        fade-in
        duration-150
      "
    >
      {/* =================================================
          PAINEL
      ================================================= */}

      <Panel
        className="
          relative
          m-0
          flex
          w-full
          max-w-4xl
          max-h-[calc(100vh-24px)]
          flex-col
          overflow-hidden
          rounded-xl
          border
          border-white/10
          bg-background/95
          shadow-2xl
          animate-in
          zoom-in-95
          duration-150
        "
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <header
          className="
            flex
            shrink-0
            items-center
            justify-between
            border-b
            border-white/5
            px-4
            py-2.5
          "
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Criar Flashcard</h2>

              {createdCount > 0 && (
                <span
                  className="
                    flex
                    items-center
                    gap-1
                    rounded-full
                    bg-green-500/10
                    px-1.5
                    py-0.5
                    text-[10px]
                    text-green-400
                  "
                >
                  <CheckCircle2 size={11} />

                  {createdCount}
                </span>
              )}
            </div>

            <p className="text-[10px] text-text-muted">Crie vários cards sem sair da tela.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={closeModal}
            aria-label="Fechar"
            className="
    h-8
    w-8
    shrink-0
    rounded-full
    border
    
    p-0
    text-slate-500
    shadow-sm
    transition-all
    duration-150
    hover:bg-slate-200
    hover:text-slate-800
    hover:shadow
    active:scale-95
    disabled:cursor-not-allowed
    disabled:opacity-50
  "
          >
            <X size={15} className="text-slate-500" strokeWidth={2.2} />
          </Button>
        </header>

        {/* =================================================
            ÁREA DO FORMULÁRIO

            SOMENTE ESTA ÁREA POSSUI SCROLL.
        ================================================= */}

        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            overscroll-contain
            scrollbar-thin
          "
        >
          <form
            id="add-card-form"
            onSubmit={handleSubmit}
            className="
              space-y-2
              px-4
              py-3
            "
          >
            {/* =============================================
                ERRO
            ============================================= */}

            {error && <ErrorBanner message={error} />}

            {/* =============================================
                TIPO DO CARD
            ============================================= */}

            <div
              className="
                flex
                items-center
                gap-0.5
                rounded-lg
                border
                border-white/10
                bg-black/10
                p-0.5
              "
            >
              {cardTypes.map((item) => {
                const active = cardType === item.type;

                return (
                  <button
                    key={item.type}
                    type="button"
                    disabled={loading}
                    onClick={() => handleCardTypeChange(item.type)}
                    className={`
                      flex
                      flex-1
                      items-center
                      justify-center
                      rounded-md
                      px-2
                      py-1.5
                      text-[10px]
                      font-medium
                      transition
                      ${
                        active
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-text-muted hover:bg-white/5 hover:text-white"
                      }
                      disabled:pointer-events-none
                      disabled:opacity-50
                    `}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* =============================================
                BÁSICO
            ============================================= */}

            {cardType === "basic" && (
              <div>
                <Label>Conteúdo do cartão</Label>

                <div className="mt-1">
                  <RichTextEditor
                    value={front}
                    onChange={setFront}
                    backValue={back}
                    onBackChange={setBack}
                    placeholder="Digite a pergunta..."
                    cardType="basic"
                    disabled={loading}
                    showNextStep={false}
                  />
                </div>
              </div>
            )}

            {/* =============================================
                CLOZE
            ============================================= */}

            {cardType === "cloze" && (
              <div>
                <Label>Texto</Label>

                <div className="mt-1">
                  <ClozeCardForm value={front} onChange={setFront} disabled={loading} />
                </div>
              </div>
            )}

            {/* =============================================
                MÚLTIPLA ESCOLHA
            ============================================= */}

            {cardType === "multiple_choice" && (
              <>
                <div>
                  <Label>Frente / Pergunta</Label>

                  <div className="mt-1">
                    <RichTextEditor
                      value={front}
                      onChange={setFront}
                      placeholder="Digite a pergunta..."
                      cardType="multiple_choice"
                      disabled={loading}
                      showNextStep={false}
                    />
                  </div>
                </div>

                <div
                  className="
                    space-y-1.5
                    rounded-lg
                    border
                    border-white/10
                    bg-black/10
                    p-2
                  "
                >
                  <div className="flex items-center justify-between">
                    <Label>Alternativas</Label>

                    <span className="text-[10px] text-text-muted">Selecione a correta</span>
                  </div>

                  {multipleChoiceOptions.map((option) => (
                    <div
                      key={option.letter}
                      className="
                          flex
                          items-center
                          gap-1.5
                        "
                    >
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setCorrect(option.letter)}
                        className={`
                            flex
                            h-7
                            w-7
                            shrink-0
                            items-center
                            justify-center
                            rounded-md
                            border
                            text-xs
                            font-semibold
                            transition
                            ${
                              correct === option.letter
                                ? "border-green-400 bg-green-500/20 text-green-300"
                                : "border-white/10 text-text-muted hover:bg-white/10"
                            }
                            disabled:pointer-events-none
                            disabled:opacity-50
                          `}
                      >
                        {option.letter}
                      </button>

                      <Input
                        value={option.value}
                        disabled={loading}
                        onChange={(event) => option.setter(event.target.value)}
                        placeholder={`Alternativa ${option.letter}`}
                      />
                    </div>
                  ))}

                  <p className="text-[10px] text-text-muted">
                    Alternativa correta: <strong className="text-green-400">{correct}</strong>
                  </p>
                </div>
              </>
            )}

            {/* =============================================
                VERDADEIRO / FALSO
            ============================================= */}

            {cardType === "true_false" && (
              <>
                <div>
                  <Label>Frente / Pergunta</Label>

                  <div className="mt-1">
                    <RichTextEditor
                      value={front}
                      onChange={setFront}
                      placeholder="Digite a afirmação..."
                      cardType="true_false"
                      disabled={loading}
                      showNextStep={false}
                    />
                  </div>
                </div>

                <div>
                  <Label>Resposta</Label>

                  <select
                    value={back}
                    disabled={loading}
                    onChange={(event) => setBack(event.target.value)}
                    className="
                      mt-1
                      h-8
                      w-full
                      rounded-md
                      border
                      border-white/10
                      bg-black/20
                      px-2
                      text-xs
                      outline-none
                      focus:border-white/20
                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    <option value="">Selecione...</option>

                    <option value="Verdadeiro">Verdadeiro</option>

                    <option value="Falso">Falso</option>
                  </select>
                </div>
              </>
            )}

            {/* =============================================
                TAGS
            ============================================= */}

            <div>
              <Label>Tags</Label>

              <Input
                value={tags}
                disabled={loading}
                onChange={(event) => setTags(event.target.value)}
                placeholder="STF, Constitucional"
              />
            </div>
          </form>
        </div>

        {/* =================================================
            AÇÕES

            FICA FORA DO SCROLL.
            O CRONÔMETRO NÃO DEVE COBRIR ESTES BOTÕES.
        ================================================= */}

        <div
          className="
            relative
            z-[100000]
            flex
            shrink-0
            items-center
            justify-end
            gap-1.5
            border-t
            border-white/5
            bg-background
            px-4
            py-2.5
          "
        >
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={closeModal}
            className="h-8 px-3 text-xs"
          >
            Fechar
          </Button>

          <Button
            type="submit"
            form="add-card-form"
            disabled={loading}
            className="
              h-8
              min-w-[140px]
              px-3
              text-xs
            "
          >
            {loading && <Loader2 size={13} className="animate-spin" />}

            {loading ? "Salvando..." : "Salvar e criar outro"}
          </Button>
        </div>
      </Panel>
    </div>,

    // ===================================================
    // IMPORTANTE:
    // O MODAL VAI DIRETO PARA O BODY.
    // ===================================================

    document.body,
  );
}
