import RichTextEditor from "../editor/RichTextEditor";

export interface ClozeCardFormProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Extrai somente o texto visível do HTML.
 *
 * IMPORTANTE:
 * Esta função deve ser usada apenas para validação.
 * Não use para salvar o conteúdo do Cloze,
 * pois ela remove toda a formatação HTML.
 */
export function extractTextFromHtml(html: string): string {
  if (!html) {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  const parser = new DOMParser();

  const parsed = parser.parseFromString(html, "text/html");

  return (parsed.body.textContent || "").replace(/\u00a0/g, " ").trim();
}

/**
 * Normaliza espaços e quebras de linha
 * sem remover HTML.
 */
export function normalizeCloze(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/**
 * Retorna o conteúdo do Cloze preservando
 * toda a formatação HTML.
 *
 * Exemplo:
 *
 * <strong>Texto</strong>
 *
 * continua:
 *
 * <strong>Texto</strong>
 */
export function getClozeText(value: string): string {
  if (!value) {
    return "";
  }

  return normalizeCloze(value);
}

/**
 * Retorna todos os números de Cloze encontrados.
 *
 * Exemplo:
 *
 * {{c1::Brasil}} {{c2::Brasília}}
 *
 * retorna:
 *
 * [1, 2]
 */
export function getClozeNumbers(value: string): number[] {
  if (!value) {
    return [];
  }

  const numbers: number[] = [];

  const regex = /\{\{c(\d+)::/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const number = Number(match[1]);

    if (number >= 1) {
      numbers.push(number);
    }
  }

  return numbers;
}

/**
 * Retorna o próximo número de Cloze.
 *
 * Exemplo:
 *
 * c1
 * c2
 * c3
 *
 * retorna 4.
 */
export function getNextClozeNumber(value: string): number {
  const numbers = getClozeNumbers(value);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

/**
 * Normaliza os números dos Clozes na ordem em que aparecem.
 *
 * Exemplo:
 *
 * {{c1::Brasil}}
 * {{c1::Brasília}}
 * {{c5::Governo}}
 *
 * vira:
 *
 * {{c1::Brasil}}
 * {{c2::Brasília}}
 * {{c3::Governo}}
 *
 * O conteúdo interno é preservado.
 */
export function normalizeClozeNumbers(value: string): string {
  if (!value) {
    return "";
  }

  let number = 1;

  return value.replace(/\{\{c\d+::([\s\S]*?)\}\}/gi, (_match: string, content: string) => {
    const cloze = `{{c${number}::${content}}}`;

    number += 1;

    return cloze;
  });
}

/**
 * Valida um card Cloze.
 */
export function validateCloze(value: string): string | null {
  const clozeText = getClozeText(value);

  if (!clozeText) {
    return "Digite o texto do card.";
  }

  /**
   * Procura Clozes mesmo quando existe HTML
   * dentro do conteúdo.
   */
  const clozeMatches = clozeText.match(/\{\{c\d+::[\s\S]*?\}\}/gi);

  if (!clozeMatches || clozeMatches.length === 0) {
    return "Crie pelo menos uma omissão usando {{c1::texto}}.";
  }

  for (const cloze of clozeMatches) {
    const match = cloze.match(/^\{\{c(\d+)::([\s\S]*?)\}\}$/i);

    if (!match) {
      return `Cloze inválido: ${cloze}`;
    }

    const index = Number(match[1]);

    /**
     * Remove HTML apenas para validar
     * se existe conteúdo.
     */
    const content = match[2]
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/\u00a0/g, " ")
      .trim();

    if (!index || index < 1) {
      return `Número do Cloze inválido: ${cloze}`;
    }

    if (!content) {
      return `O Cloze ${cloze} está vazio.`;
    }
  }

  return null;
}

/**
 * Formulário visual do Cloze.
 */
export default function ClozeCardForm({ value, onChange, disabled = false }: ClozeCardFormProps) {
  return (
    <div className="space-y-2">
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder="Digite o texto e selecione uma palavra para criar uma omissão..."
        cardType="cloze"
        disabled={disabled}
      />
    </div>
  );
}
