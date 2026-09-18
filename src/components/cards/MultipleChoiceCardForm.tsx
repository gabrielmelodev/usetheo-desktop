import RichTextEditor from "../editor/RichTextEditor";

export type MultipleChoiceAnswer = "A" | "B" | "C" | "D";

interface MultipleChoiceCardFormProps {
  question: string;

  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;

  correct: MultipleChoiceAnswer;

  onQuestionChange: (value: string) => void;

  onOptionAChange: (value: string) => void;
  onOptionBChange: (value: string) => void;
  onOptionCChange: (value: string) => void;
  onOptionDChange: (value: string) => void;

  onCorrectChange: (value: MultipleChoiceAnswer) => void;

  disabled?: boolean;
}

export default function MultipleChoiceCardForm({
  question,

  optionA,
  optionB,
  optionC,
  optionD,

  correct,

  onQuestionChange,

  onOptionAChange,
  onOptionBChange,
  onOptionCChange,
  onOptionDChange,

  onCorrectChange,

  disabled = false,
}: MultipleChoiceCardFormProps) {
  const options = [
    {
      letter: "A" as const,
      value: optionA,
      setter: onOptionAChange,
    },
    {
      letter: "B" as const,
      value: optionB,
      setter: onOptionBChange,
    },
    {
      letter: "C" as const,
      value: optionC,
      setter: onOptionCChange,
    },
    {
      letter: "D" as const,
      value: optionD,
      setter: onOptionDChange,
    },
  ];

  return (
    <div className="space-y-2">
      {/* =================================================
          PERGUNTA
      ================================================= */}

      <div>
        <label className="text-xs font-medium">Pergunta</label>

        <div className="mt-1">
          <RichTextEditor
            value={question}
            onChange={onQuestionChange}
            placeholder="Digite a pergunta..."
            cardType="multiple_choice"
            disabled={disabled}
          />
        </div>
      </div>

      {/* =================================================
          ALTERNATIVAS
      ================================================= */}

      <div
        className="
          space-y-2
          rounded-lg
          border
          border-white/10
          bg-black/10
          p-2
        "
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Alternativas</label>

          <span className="text-[10px] text-text-muted">Clique na letra para marcar a correta</span>
        </div>

        {options.map((option) => {
          const isCorrect = correct === option.letter;

          return (
            <div key={option.letter} className="flex items-center gap-2">
              {/* =================================================
                  LETRA
              ================================================= */}

              <button
                type="button"
                disabled={disabled}
                onClick={() => onCorrectChange(option.letter)}
                className={`
                  flex
                  h-8
                  w-8
                  shrink-0
                  items-center
                  justify-center
                  rounded-md
                  border
                  text-xs
                  font-semibold
                  transition

                  ${
                    isCorrect
                      ? "border-green-400 bg-green-500/20 text-green-300"
                      : "border-white/10 text-text-muted hover:bg-white/10 hover:text-white"
                  }
                `}
                aria-label={`Marcar alternativa ${option.letter} como correta`}
              >
                {option.letter}
              </button>

              {/* =================================================
                  TEXTO
              ================================================= */}

              <input
                type="text"
                value={option.value}
                disabled={disabled}
                onChange={(event) => option.setter(event.target.value)}
                placeholder={`Alternativa ${option.letter}`}
                className="
                  h-8
                  min-w-0
                  flex-1
                  rounded-md
                  border
                  border-white/10
                  bg-black/20
                  px-2
                  text-xs
                  outline-none
                  transition
                  placeholder:text-text-muted
                  focus:border-accent
                "
              />
            </div>
          );
        })}

        {/* =================================================
            RESPOSTA CORRETA
        ================================================= */}

        <div
          className="
            flex
            items-center
            justify-between
            rounded-md
            bg-green-500/5
            px-2
            py-1.5
          "
        >
          <span className="text-[10px] text-text-muted">Resposta correta</span>

          <strong className="text-xs text-green-400">{correct}</strong>
        </div>
      </div>

      {/* =================================================
          AJUDA
      ================================================= */}

      <p className="px-1 text-[10px] text-text-muted">
        Preencha as quatro alternativas e selecione a alternativa correta.
      </p>
    </div>
  );
}
