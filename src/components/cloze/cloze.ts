const CLOZE_REGEX = /\{\{\s*c\d+\s*::\s*([\s\S]*?)(?:\s*::\s*([\s\S]*?))?\s*\}\}/gi;

export function hasCloze(html: string): boolean {
  return /\{\{\s*c\d+\s*::/i.test(html);
}

export function renderClozeQuestion(html: string): string {
  if (!html) return "";

  return html.replace(CLOZE_REGEX, (_match, _answer, hint) => {
    const cleanHint = typeof hint === "string" ? hint.trim() : "";

    return `
        <span
          class="cloze-hidden"
          title="${cleanHint}"
          style="
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:80px;
            min-height:1.4em;
            margin:0 5px;
            padding:2px 12px;
            border-bottom:2px dotted currentColor;
            border-radius:6px;
            background:rgba(0,0,0,.05);
            font-weight:800;
          "
        >
          ${cleanHint || "•••"}
        </span>
      `;
  });
}

export function renderClozeAnswer(html: string): string {
  if (!html) return "";

  return html.replace(
    CLOZE_REGEX,
    (_match, answer) => `
      <span
        class="cloze-answer"
        style="
          font-weight:800;
          text-decoration:underline;
          text-underline-offset:3px;
        "
      >
        ${answer}
      </span>
    `,
  );
}
