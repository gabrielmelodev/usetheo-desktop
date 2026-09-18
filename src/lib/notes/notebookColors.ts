/**
 * Paleta de cores usada para "colorir" notebooks e seções, do jeito
 * que o OneNote faz (cada caderno tem uma cor de capa, cada seção tem
 * uma cor de aba). A cor é sempre a mesma para o mesmo id — não é
 * escolhida à mão, é derivada por hash, então fica estável entre
 * sessões sem precisar guardar nada a mais.
 */

export interface NotebookColor {
  name: string;
  /** Ponto/ícone sólido (capa do caderno, indicador da página ativa). */
  dot: string;
  /** Fundo sólido, usado na aba ativa da seção. */
  solidBg: string;
  /** Texto sobre o fundo sólido. */
  onSolidText: string;
  /** Fundo suave, para estados de hover/seleção leve. */
  softBg: string;
  /** Texto sobre o fundo suave / capa. */
  softText: string;
  /** Cor usada no sublinhado fino das abas inativas. */
  underline: string;
}

const PALETTE: NotebookColor[] = [
  {
    name: "violet",
    dot: "bg-violet-500",
    solidBg: "bg-violet-500",
    onSolidText: "text-white",
    softBg: "bg-violet-500/15",
    softText: "text-violet-300",
    underline: "bg-violet-500/70",
  },
  {
    name: "rose",
    dot: "bg-rose-500",
    solidBg: "bg-rose-500",
    onSolidText: "text-white",
    softBg: "bg-rose-500/15",
    softText: "text-rose-300",
    underline: "bg-rose-500/70",
  },
  {
    name: "orange",
    dot: "bg-orange-500",
    solidBg: "bg-orange-500",
    onSolidText: "text-white",
    softBg: "bg-orange-500/15",
    softText: "text-orange-300",
    underline: "bg-orange-500/70",
  },
  {
    name: "amber",
    dot: "bg-amber-400",
    solidBg: "bg-amber-400",
    onSolidText: "text-ink",
    softBg: "bg-amber-400/15",
    softText: "text-amber-300",
    underline: "bg-amber-400/70",
  },
  {
    name: "emerald",
    dot: "bg-emerald-500",
    solidBg: "bg-emerald-500",
    onSolidText: "text-white",
    softBg: "bg-emerald-500/15",
    softText: "text-emerald-300",
    underline: "bg-emerald-500/70",
  },
  {
    name: "teal",
    dot: "bg-teal-500",
    solidBg: "bg-teal-500",
    onSolidText: "text-white",
    softBg: "bg-teal-500/15",
    softText: "text-teal-300",
    underline: "bg-teal-500/70",
  },
  {
    name: "sky",
    dot: "bg-sky-500",
    solidBg: "bg-sky-500",
    onSolidText: "text-white",
    softBg: "bg-sky-500/15",
    softText: "text-sky-300",
    underline: "bg-sky-500/70",
  },
  {
    name: "fuchsia",
    dot: "bg-fuchsia-500",
    solidBg: "bg-fuchsia-500",
    onSolidText: "text-white",
    softBg: "bg-fuchsia-500/15",
    softText: "text-fuchsia-300",
    underline: "bg-fuchsia-500/70",
  },
];

/** Hash simples e determinístico (mesmo id -> sempre a mesma cor). */
function hashId(id: string): number {
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  return hash;
}

export function colorForId(id: string): NotebookColor {
  return PALETTE[hashId(id) % PALETTE.length];
}
