import RichTextEditor from "../editor/RichTextEditor";

interface TrueFalseCardFormProps {
  question: string;
  answer: string;
  onQuestionChange: (value: string) => void;
  onAnswerChange: (value: string) => void;
  disabled?: boolean;
}

export default function TrueFalseCardForm({
  question,
  answer,
  onQuestionChange,
  onAnswerChange,
  disabled = false,
}: TrueFalseCardFormProps) {
  return (
    <div className="space-y-2">
      {/* =================================================
          PERGUNTA
      ================================================= */}

      <div>
        <label className="text-xs font-medium">Afirmação</label>

        <div className="mt-1">
          <RichTextEditor
            value={question}
            onChange={onQuestionChange}
            placeholder="Digite a afirmação..."
            cardType="true_false"
            disabled={disabled}
          />
        </div>
      </div>

      {/* =================================================
          RESPOSTA
      ================================================= */}

      <div>
        <label className="text-xs font-medium">Resposta</label>

        <select
          value={answer}
          disabled={disabled}
          onChange={(event) => onAnswerChange(event.target.value)}
          className="
            mt-1
            h-9
            w-full
            rounded-md
            border
            border-white/10
            bg-black/20
            px-2
            text-xs
            outline-none
            transition
            focus:border-accent
          "
        >
          <option value="">Selecione a resposta...</option>

          <option value="Verdadeiro">Verdadeiro</option>

          <option value="Falso">Falso</option>
        </select>
      </div>

      {/* =================================================
          AJUDA
      ================================================= */}

      <p className="px-1 text-[10px] text-text-muted">
        Crie uma afirmação e selecione se ela é verdadeira ou falsa.
      </p>
    </div>
  );
}
