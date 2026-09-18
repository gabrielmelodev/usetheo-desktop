// ============================================================
// FSRS — Free Spaced Repetition Scheduler (v4.5)
// ============================================================
//
// Alternativa ao SM-2 clássico. Em vez de multiplicadores fixos,
// modela a memória com 3 variáveis por cartão:
//
//   S (Estabilidade)   — estabilidade da memória em dias
//   D (Dificuldade)    — de 1 (fácil) a 10 (difícil)
//   R (Retrievability) — chance estimada de lembrar HOJE (0–1)
//
// Pesos padrão (19 parâmetros) baseados no FSRS v4.5.
//
// IMPORTANTE:
// - A API pública deste arquivo é mantida.
// - As fórmulas existentes são preservadas.
// - Foram adicionadas apenas proteções contra valores inválidos.
// - O objetivo é manter o comportamento compatível com o backend.
//

import type { Rating } from "./types";

// ============================================================
// PESOS PADRÃO
// ============================================================

export const DEFAULT_FSRS_WEIGHTS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824, 1.9813,
  0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
] as const;

// ============================================================
// CONSTANTES
// ============================================================

const MIN_STABILITY = 0.1;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

const MIN_RETENTION = 0.7;
const MAX_RETENTION = 0.97;

const DAY_MS = 86_400_000;

// ============================================================
// MAPEAMENTO DAS AVALIAÇÕES
// ============================================================

const RATING_INDEX: Record<Rating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

// ============================================================
// TIPOS
// ============================================================

export interface FsrsCardState {
  /**
   * Estabilidade em dias.
   *
   * 0 = cartão novo, nunca revisado.
   */
  stability: number;

  /**
   * Dificuldade do cartão.
   *
   * 1 = muito fácil
   * 10 = muito difícil
   */
  difficulty: number;

  /**
   * Última vez que o cartão foi revisado.
   *
   * null = cartão nunca revisado.
   */
  last_review: string | null;
}

export interface FsrsScheduleResult {
  stability: number;
  difficulty: number;
  interval_days: number;
  last_review: string;
  retrievability_at_review: number;
}

// ============================================================
// VALIDAÇÃO INTERNA
// ============================================================

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function safeNumber(value: number, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function getWeight(weights: readonly number[], index: number, fallback: number): number {
  const value = weights[index];

  return isFiniteNumber(value) ? value : fallback;
}

function clampDifficulty(difficulty: number): number {
  const safeDifficulty = safeNumber(difficulty, 5);

  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, safeDifficulty));
}

function clampStability(stability: number): number {
  const safeStability = safeNumber(stability, MIN_STABILITY);

  return Math.max(MIN_STABILITY, safeStability);
}

function clampRetrievability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeDesiredRetention(desiredRetention: number): number {
  const safeRetention = safeNumber(desiredRetention, 0.9);

  return Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, safeRetention));
}

// ============================================================
// ESTABILIDADE INICIAL
// ============================================================

export function initStability(rating: Rating, w: readonly number[] = DEFAULT_FSRS_WEIGHTS): number {
  const ratingIndex = RATING_INDEX[rating] ?? 3;

  const weight = getWeight(w, ratingIndex - 1, 1);

  return Math.max(MIN_STABILITY, weight);
}

// ============================================================
// DIFICULDADE INICIAL
// ============================================================

export function initDifficulty(
  rating: Rating,
  w: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): number {
  const g = RATING_INDEX[rating] ?? 3;

  const baseDifficulty = getWeight(w, 4, 5);

  const difficultyAdjustment = getWeight(w, 5, 0);

  const difficulty = baseDifficulty - (g - 3) * difficultyAdjustment;

  return clampDifficulty(difficulty);
}

// ============================================================
// RETRIEVABILITY
// ============================================================

/**
 * Probabilidade estimada de lembrar do cartão
 * depois de `elapsedDays` dias sem vê-lo.
 */
export function retrievability(elapsedDays: number, stability: number): number {
  const safeElapsedDays = Math.max(0, safeNumber(elapsedDays, 0));

  const safeStability = clampStability(stability);

  const value = Math.pow(1 + safeElapsedDays / (9 * safeStability), -1);

  return clampRetrievability(value);
}

// ============================================================
// PRÓXIMA DIFICULDADE
// ============================================================

function nextDifficulty(difficulty: number, rating: Rating, w: readonly number[]): number {
  const d = clampDifficulty(difficulty);

  const g = RATING_INDEX[rating] ?? 3;

  const weight6 = getWeight(w, 6, 1);

  const weight7 = getWeight(w, 7, 0);

  const deltaD = -weight6 * (g - 3);

  const dPrime = d + deltaD;

  const easyD0 = initDifficulty("easy", w);

  // Reversão à média:
  //
  // aproxima gradualmente a dificuldade do
  // valor inicial de um cartão fácil.
  const reverted = weight7 * easyD0 + (1 - weight7) * dPrime;

  return clampDifficulty(reverted);
}

// ============================================================
// PRÓXIMA ESTABILIDADE — RECORDAÇÃO
// ============================================================

function nextStabilityOnRecall(
  difficulty: number,
  stability: number,
  retrievabilityValue: number,
  rating: Rating,
  w: readonly number[],
): number {
  const d = clampDifficulty(difficulty);

  const s = clampStability(stability);

  const r = clampRetrievability(retrievabilityValue);

  const hardPenalty = rating === "hard" ? getWeight(w, 15, 1) : 1;

  const easyBonus = rating === "easy" ? getWeight(w, 16, 1) : 1;

  const growth =
    Math.exp(getWeight(w, 8, 1)) *
    (11 - d) *
    Math.pow(s, -getWeight(w, 9, 0.1)) *
    (Math.exp((1 - r) * getWeight(w, 10, 1)) - 1) *
    hardPenalty *
    easyBonus;

  const nextStability = s * (1 + growth);

  return clampStability(nextStability);
}

// ============================================================
// PRÓXIMA ESTABILIDADE — ESQUECIMENTO
// ============================================================

function nextStabilityOnForget(
  difficulty: number,
  stability: number,
  retrievabilityValue: number,
  w: readonly number[],
): number {
  const d = clampDifficulty(difficulty);

  const s = clampStability(stability);

  const r = clampRetrievability(retrievabilityValue);

  const nextStability =
    getWeight(w, 11, 1) *
    Math.pow(d, -getWeight(w, 12, 0.1)) *
    (Math.pow(s + 1, getWeight(w, 13, 1)) - 1) *
    Math.exp(getWeight(w, 14, 1) * (1 - r));

  return clampStability(nextStability);
}

// ============================================================
// PRÓXIMO INTERVALO
// ============================================================

/**
 * Converte estabilidade + retenção desejada
 * no próximo intervalo, em dias.
 */
export function nextIntervalDays(stability: number, desiredRetention: number): number {
  const safeStability = clampStability(stability);

  const r = normalizeDesiredRetention(desiredRetention);

  const interval = 9 * safeStability * (1 / r - 1);

  return Math.max(1, safeNumber(interval, 1));
}

// ============================================================
// APLICA UMA REVISÃO
// ============================================================

/**
 * Aplica uma avaliação:
 *
 * - again
 * - hard
 * - good
 * - easy
 *
 * e devolve o novo estado FSRS do cartão.
 */
export function scheduleFsrs(
  state: FsrsCardState,
  rating: Rating,
  now: Date,
  desiredRetention: number,
  w: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsScheduleResult {
  let stability: number;
  let difficulty: number;

  let r = 1;

  // ----------------------------------------------------------
  // Proteção contra datas inválidas
  // ----------------------------------------------------------

  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  // ----------------------------------------------------------
  // Estado atual seguro
  // ----------------------------------------------------------

  const currentStability = clampStability(state.stability);

  const currentDifficulty = clampDifficulty(state.difficulty);

  // ----------------------------------------------------------
  // Cartão novo
  // ----------------------------------------------------------

  const hasValidLastReview =
    Boolean(state.last_review) && !Number.isNaN(new Date(state.last_review as string).getTime());

  const isNewCard = !hasValidLastReview || state.stability <= 0;

  if (isNewCard) {
    stability = initStability(rating, w);

    difficulty = initDifficulty(rating, w);
  } else {
    // --------------------------------------------------------
    // Cartão já revisado
    // --------------------------------------------------------

    const lastReview = new Date(state.last_review as string);

    const elapsedDays = Math.max(0, (safeNow.getTime() - lastReview.getTime()) / DAY_MS);

    r = retrievability(elapsedDays, currentStability);

    difficulty = nextDifficulty(currentDifficulty, rating, w);

    stability =
      rating === "again"
        ? nextStabilityOnForget(currentDifficulty, currentStability, r, w)
        : nextStabilityOnRecall(currentDifficulty, currentStability, r, rating, w);
  }

  // ----------------------------------------------------------
  // Garantia final de consistência
  // ----------------------------------------------------------

  stability = clampStability(stability);

  difficulty = clampDifficulty(difficulty);

  r = clampRetrievability(r);

  const interval_days = nextIntervalDays(stability, desiredRetention);

  return {
    stability,
    difficulty,
    interval_days,
    last_review: safeNow.toISOString(),
    retrievability_at_review: r,
  };
}
