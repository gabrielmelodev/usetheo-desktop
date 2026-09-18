// ============================================================
// PROGRESSO DE ESTUDO (posição na fila) — local
// ============================================================
//
// Antes, isso chamava um endpoint fixo em um IP de rede local
// (10.1.61.61), o que quebrava o app pra qualquer pessoa fora
// daquela rede. Agora fica salvo no dispositivo, junto com o
// resto dos dados — funciona em qualquer lugar, sem servidor.

import { metaGet, metaSet } from "./localdb";

interface StudyProgress {
  card_id: string;
  position: number;
}

function progressKey(deckId: string): string {
  return `study_progress:${deckId}`;
}

export async function getStudyProgress(deckId: string): Promise<StudyProgress | null> {
  const progress = await metaGet<StudyProgress>(progressKey(deckId));
  return progress ?? null;
}

export async function saveStudyProgress(
  deckId: string,
  cardId: string,
  position: number,
): Promise<StudyProgress> {
  const progress: StudyProgress = { card_id: cardId, position };
  await metaSet(progressKey(deckId), progress);
  return progress;
}
