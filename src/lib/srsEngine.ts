// ============================================================
// MOTOR DE REPETIÇÃO ESPAÇADA (SM-2) — versão local
// ============================================================
//
// Espelha fielmente `theo-rust/src/srs.rs`, para que o
// comportamento dos cards seja idêntico online e offline.

import type { Rating } from "./types";

export interface SrsResult {
  queue: "learning" | "review";
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
}

export function applyReview(
  rating: Rating,
  interval_days: number,
  ease_factor: number,
  repetitions: number,
  lapses: number,
): SrsResult {
  switch (rating) {
    case "again":
      return {
        queue: "learning",
        interval_days: (1 / 1440) * 10, // ~10 minutos
        ease_factor: Math.max(ease_factor - 0.2, 1.3),
        repetitions: 0,
        lapses: lapses + 1,
      };

    case "hard": {
      const newInterval = Math.max(Math.max(interval_days, 1) * 1.2, 1);
      return {
        queue: "review",
        interval_days: newInterval,
        ease_factor: Math.max(ease_factor - 0.15, 1.3),
        repetitions: repetitions + 1,
        lapses,
      };
    }

    case "good": {
      const newInterval =
        repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.max(interval_days, 1) * ease_factor;
      return {
        queue: "review",
        interval_days: newInterval,
        ease_factor,
        repetitions: repetitions + 1,
        lapses,
      };
    }

    case "easy": {
      const newInterval = repetitions === 0 ? 4 : Math.max(interval_days, 1) * ease_factor * 1.3;
      return {
        queue: "review",
        interval_days: newInterval,
        ease_factor: ease_factor + 0.15,
        repetitions: repetitions + 1,
        lapses,
      };
    }
  }
}

// ============================================================
// ESCADA DE REVISÃO DOS EDITAIS — versão local
// ============================================================
//
// Espelha `theo-rust/src/review_ladder.rs`.

export interface LadderExam {
  plan_mode: string;
  exam_date: string | null;
  sprint_days: number | null;
  excluded_weekdays: number[];
  review_intervals_days: number[] | null;
}

const DEFAULT_LADDER_DAYS = [1, 7, 30, 90];

function ladderSteps(exam: LadderExam): number[] {
  return exam.review_intervals_days && exam.review_intervals_days.length > 0
    ? exam.review_intervals_days
    : DEFAULT_LADDER_DAYS;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calcula a próxima data agendada, respeitando sprint/pós-prova e dias excluídos. */
export function nextScheduledDate(exam: LadderExam, from: Date, intervalDays: number): Date | null {
  let candidate = addDays(from, intervalDays);

  if (exam.plan_mode === "deadline" && exam.exam_date && exam.sprint_days != null) {
    const examDate = new Date(exam.exam_date);
    const sprintStart = addDays(examDate, -exam.sprint_days);
    const lastValid = addDays(examDate, 1);
    if (candidate >= sprintStart || candidate > lastValid) return null;
  }

  for (let i = 0; i < 14; i++) {
    const weekday = candidate.getDay(); // 0 = domingo, igual ao Rust (from_sunday)
    if (!exam.excluded_weekdays.includes(weekday)) return candidate;
    candidate = addDays(candidate, 1);

    if (exam.plan_mode === "deadline" && exam.exam_date && exam.sprint_days != null) {
      const examDate = new Date(exam.exam_date);
      const sprintStart = addDays(examDate, -exam.sprint_days);
      if (candidate >= sprintStart) return null;
    }
  }

  return null;
}

export interface TopicReviewRecord {
  id: string;
  user_id?: string;
  topic_id: string;
  study_log_id: string;
  step: number;
  scheduled_date: string;
  completed_at: string | null;
  completed_study_log_id: string | null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildFirstLadderStep(
  exam: LadderExam,
  topicId: string,
  studyLogId: string,
  studiedOn: Date,
  newId: () => string,
): TopicReviewRecord | null {
  const steps = ladderSteps(exam);
  if (!steps.length) return null;
  const date = nextScheduledDate(exam, studiedOn, steps[0]);
  if (!date) return null;

  return {
    id: newId(),
    topic_id: topicId,
    study_log_id: studyLogId,
    step: 1,
    scheduled_date: toDateOnly(date),
    completed_at: null,
    completed_study_log_id: null,
  };
}

export function buildNextLadderStep(
  exam: LadderExam,
  topicId: string,
  completedStudyLogId: string,
  currentStep: number,
  newId: () => string,
): TopicReviewRecord | null {
  const steps = ladderSteps(exam);
  const nextStepNumber = currentStep >= steps.length ? 1 : currentStep + 1;
  const interval = steps[nextStepNumber - 1] ?? DEFAULT_LADDER_DAYS[0];

  const today = new Date();
  const date = nextScheduledDate(exam, today, interval);
  if (!date) return null;

  return {
    id: newId(),
    topic_id: topicId,
    study_log_id: completedStudyLogId,
    step: nextStepNumber,
    scheduled_date: toDateOnly(date),
    completed_at: null,
    completed_study_log_id: null,
  };
}
