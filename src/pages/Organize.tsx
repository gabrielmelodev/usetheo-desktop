import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  Layers3,
  RefreshCw,
  Target,
  Trophy,
  RotateCcw,
  ArrowRight,
  Link,
} from "lucide-react";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import { CoachTour, useCoachTour, type TourStep } from "../components/onboarding/CoachTour";

import {
  listCards,
  listExams,
  listExamSubjects,
  listExamTopics,
  listManualSchedule,
  listStudyLogs,
} from "../lib/api";

import type { Exam, ExamSubject, ExamTopic, ManualScheduleEntry, StudyLog } from "../lib/types";

/* =========================================================
   HELPERS
========================================================= */

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/*
 * IMPORTANTE:
 * Trabalhamos com datas no calendário usando a data LOCAL.
 *
 * Isso evita o problema clássico:
 *
 * 06/09/2026
 * ↓
 * new Date("2026-09-06")
 * ↓
 * dependendo do timezone pode virar 05/09/2026.
 */
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;

  const text = String(value).trim();

  if (!text) return null;

  /*
   * Data pura:
   * YYYY-MM-DD
   *
   * Nunca usar new Date("YYYY-MM-DD") aqui,
   * pois isso é interpretado como UTC.
   */
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);

    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return date;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(value?: string | null): string {
  const date = parseDate(value);

  if (!date) {
    return "Sem data definida";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(value?: string | null): string {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatMinutes(minutes: number): string {
  const value = Number(minutes || 0);

  if (value <= 0) {
    return "0min";
  }

  const hours = Math.floor(value / 60);
  const rest = value % 60;

  if (hours === 0) {
    return `${rest}min`;
  }

  if (rest === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${rest}min`;
}

function formatHours(minutes: number): string {
  const value = Number(minutes || 0);

  return `${(value / 60).toFixed(1).replace(".", ",")}h`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function isSameDay(first: Date, second: Date): boolean {
  return dateKey(first) === dateKey(second);
}

function daysUntil(value?: string | null): number | null {
  const date = parseDate(value);

  if (!date) {
    return null;
  }

  const today = new Date();

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.ceil((targetStart.getTime() - todayStart.getTime()) / 86400000);
}

function weekdayName(weekday: number): string {
  const names = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  return names[weekday] ?? "Dia";
}

function getCalendarDays(date: Date): Array<{
  date: Date;
  currentMonth: boolean;
}> {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);

  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const firstWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const previousMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();

  const days: Array<{
    date: Date;
    currentMonth: boolean;
  }> = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    days.push({
      date: new Date(date.getFullYear(), date.getMonth() - 1, previousMonthLastDay - index),
      currentMonth: false,
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    days.push({
      date: new Date(date.getFullYear(), date.getMonth(), day),
      currentMonth: true,
    });
  }

  while (days.length < 42) {
    const last = days[days.length - 1].date;

    days.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      currentMonth: false,
    });
  }

  return days;
}

/* =========================================================
   FLASHCARDS
========================================================= */

/*
 * Não dependemos de um tipo Card específico aqui.
 *
 * Isso permite que o calendário funcione mesmo se seu backend
 * estiver usando:
 *
 * next_review
 * next_review_at
 * due_date
 * dueDate
 * review_at
 * reviewAt
 * scheduled_for
 * scheduled_at
 * etc.
 */
type FlashcardRecord = Record<string, unknown>;

const REVIEW_DATE_FIELDS = [
  "next_review_at",
  "next_review",
  "nextReviewAt",
  "nextReview",
  "review_at",
  "reviewAt",
  "due_date",
  "dueDate",
  "scheduled_for",
  "scheduledFor",
  "scheduled_at",
  "scheduledAt",
  "review_date",
  "reviewDate",
] as const;

function normalizeCards(payload: unknown): FlashcardRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is FlashcardRecord =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }

  if (payload !== null && typeof payload === "object") {
    const object = payload as Record<string, unknown>;

    const possibleArrays = [object.cards, object.data, object.items, object.results, object.result];

    for (const value of possibleArrays) {
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is FlashcardRecord =>
            item !== null && typeof item === "object" && !Array.isArray(item),
        );
      }
    }
  }

  return [];
}

function getCardReviewDate(card: FlashcardRecord): Date | null {
  for (const field of REVIEW_DATE_FIELDS) {
    const value = card[field];

    if (typeof value === "string" || typeof value === "number") {
      const date = parseDate(String(value));

      if (date) {
        return date;
      }
    }
  }

  /*
   * Também verifica estruturas aninhadas comuns.
   *
   * Exemplo:
   * {
   *   schedule: {
   *      due: "2026-09-10"
   *   }
   * }
   */
  const nestedFields = [
    "schedule",
    "review",
    "scheduling",
    "spaced_repetition",
    "spacedRepetition",
    "fsrs",
  ];

  for (const nestedField of nestedFields) {
    const nested = card[nestedField];

    if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedObject = nested as Record<string, unknown>;

      for (const field of REVIEW_DATE_FIELDS) {
        const value = nestedObject[field];

        if (typeof value === "string" || typeof value === "number") {
          const date = parseDate(String(value));

          if (date) {
            return date;
          }
        }
      }

      /*
       * Campos comuns do FSRS:
       * due
       */
      const due = nestedObject.due;

      if (typeof due === "string" || typeof due === "number") {
        const date = parseDate(String(due));

        if (date) {
          return date;
        }
      }
    }
  }

  /*
   * Campo due direto.
   */
  const due = card.due;

  if (typeof due === "string" || typeof due === "number") {
    const date = parseDate(String(due));

    if (date) {
      return date;
    }
  }

  return null;
}

function stripHtml(value: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = value;

  return temp.textContent || temp.innerText || "";
}

function getCardTitle(card: FlashcardRecord, index: number): string {
  const fields = ["front", "question", "title", "name", "text", "content"];

  for (const field of fields) {
    const value = card[field];

    if (typeof value === "string" && value.trim()) {
      const clean = stripHtml(value).trim();

      if (clean) {
        return clean;
      }
    }
  }

  return `Flashcard ${index + 1}`;
}

function cardBelongsToExam(card: FlashcardRecord, examId: string): boolean {
  /*
   * Se o card não possui exam_id, não filtramos.
   * Assim ele continua aparecendo no calendário.
   */
  const fields = ["exam_id", "examId", "edital_id", "editalId"];

  let foundExamField = false;

  for (const field of fields) {
    const value = card[field];

    if (typeof value === "string" || typeof value === "number") {
      foundExamField = true;

      if (String(value) === String(examId)) {
        return true;
      }
    }
  }

  return !foundExamField;
}

/* =========================================================
   SISTEMA VISUAL
========================================================= */

const pageBackground = "min-h-full bg-ink text-text";

const cardClass = "rounded-2xl border border-paper-line/10 bg-ink-soft shadow-card";

const innerClass = "rounded-xl border border-paper-line/10 bg-ink-softer";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-paper-line/10 bg-ink-softer px-4 text-sm font-bold text-text-muted transition-all duration-200 hover:border-accent-bright/35 hover:bg-ink-soft hover:text-text active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-white shadow-lg shadow-accent/10 transition-all duration-200 hover:bg-accent-bright hover:shadow-accent/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const iconButtonClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-paper-line/10 bg-ink-softer text-text-muted transition-all duration-200 hover:border-accent-bright/35 hover:bg-accent/10 hover:text-accent-bright active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "h-11 w-full appearance-none rounded-xl border border-paper-line/10 bg-ink-softer px-3 pr-10 text-sm font-semibold text-text outline-none transition-all duration-200 hover:border-paper-line/20 focus:border-accent-bright/60 focus:ring-2 focus:ring-accent/20";

const labelClass = "text-[10px] font-black uppercase tracking-[0.14em] text-text-muted";

const subtleTextClass = "text-xs font-medium text-text-muted";

/* =========================================================
   STAT CARD
========================================================= */

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  description?: string;
  tone?: "accent" | "streak" | "good";
};

function StatCard({ icon: Icon, label, value, description, tone = "accent" }: StatCardProps) {
  const tones = {
    accent: {
      icon: "bg-accent/15 text-accent-bright",
      glow: "bg-accent/8",
    },
    streak: {
      icon: "bg-streak/10 text-streak",
      glow: "bg-streak/5",
    },
    good: {
      icon: "bg-good/10 text-good",
      glow: "bg-good/5",
    },
  };

  const current = tones[tone];

  return (
    <div
      className={cn(
        cardClass,
        "group relative overflow-hidden p-5",
        "transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-accent-bright/20 hover:shadow-card-lift",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl",
          current.glow,
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={labelClass}>{label}</p>

          <p className="mt-2 text-2xl font-black tracking-tight text-text">{value}</p>

          {description && <p className="mt-1 text-xs font-medium text-text-muted">{description}</p>}
        </div>

        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            "transition-all duration-300 group-hover:scale-105",
            current.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SECTION HEADER
========================================================= */

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-bright">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <h2 className="text-base font-black text-text">{title}</h2>

          {description && (
            <p className="mt-0.5 text-xs font-medium text-text-muted">{description}</p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}

/* =========================================================
   EMPTY
========================================================= */

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-paper-line/15 bg-ink/30 px-4 py-8 text-center">
      <p className="text-xs font-semibold text-text-faint">{text}</p>
    </div>
  );
}

/* =========================================================
   PAGINAÇÃO
========================================================= */

type PaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalItems <= pageSize || totalPages <= 1) {
    return null;
  }

  const safePage = Math.min(Math.max(page, 1), totalPages);

  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const visiblePages =
    totalPages <= 5
      ? pages
      : pages.filter((value) => {
          if (value === 1 || value === totalPages) return true;
          return Math.abs(value - safePage) <= 1;
        });

  return (
    <div className="mt-4 flex flex-col border-gray-800 gap-3 border-t border-paper-line/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[10px] font-semibold text-text-faint">
        {startItem}–{endItem} de {totalItems}
      </p>

      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className={cn(iconButtonClass, "h-8 w-8 rounded-lg")}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {visiblePages.map((value, index) => {
          const previous = visiblePages[index - 1];
          const showEllipsis = previous !== undefined && value - previous > 1;

          return (
            <span key={value} className="contents">
              {showEllipsis && (
                <span className="flex h-8 w-6 items-center justify-center text-[10px] font-black text-text-faint">
                  …
                </span>
              )}

              <button
                type="button"
                onClick={() => onPageChange(value)}
                aria-current={safePage === value ? "page" : undefined}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[10px] font-black transition-all duration-200",
                  safePage === value
                    ? "bg-accent text-white shadow-md shadow-accent/15"
                    : "border border-paper-line/10 bg-ink-softer text-text-muted hover:border-accent-bright/30 hover:bg-accent/10 hover:text-accent-bright",
                )}
              >
                {value}
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className={cn(iconButtonClass, "h-8 w-8 rounded-lg")}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   SUMMARY ROW
========================================================= */

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        innerClass,
        "flex items-center justify-between gap-3 px-3 py-3",
        "transition-all duration-200",
        "hover:border-accent-bright/20 hover:bg-ink-soft",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
          <Icon className="h-4 w-4" />
        </div>

        <span className="truncate text-sm font-semibold text-text-muted">{label}</span>
      </div>

      <span className="shrink-0 text-sm font-black text-text">{value}</span>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

/* =========================================================
   TUTORIAL
========================================================= */

const organizeTourSteps: TourStep[] = [
  {
    target: '[data-tour="edital-select"]',
    title: "Escolha o edital",
    description:
      "Todo o painel abaixo — cronograma, matérias e progresso — se ajusta ao edital selecionado aqui.",
    placement: "bottom",
  },
  {
    target: '[data-tour="stats-organize"]',
    title: "Seu progresso geral",
    description: "Tempo estudado, conteúdo do edital já coberto e quanto falta para a prova.",
    placement: "bottom",
  },
  {
    target: '[data-tour="calendario-organize"]',
    title: "Calendário de estudos",
    description:
      "Dias com estudo registrado e revisões agendadas de flashcards aparecem aqui automaticamente.",
    placement: "right",
  },
];

export default function Dashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");

  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [topics, setTopics] = useState<ExamTopic[]>([]);
  const [manualSchedule, setManualSchedule] = useState<ManualScheduleEntry[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);

  /*
   * FLASHCARDS
   */
  const [flashcards, setFlashcards] = useState<FlashcardRecord[]>([]);

  /*
   * Paginação independente para as listas que podem crescer bastante.
   * Os arrays completos continuam em memória para métricas e cálculos;
   * apenas a renderização é dividida em páginas.
   */
  const SUBJECTS_PER_PAGE = 6;
  const DAY_FLASHCARDS_PER_PAGE = 6;
  const DAY_SCHEDULE_PER_PAGE = 6;
  const DAY_LOGS_PER_PAGE = 6;

  const [subjectsPage, setSubjectsPage] = useState(1);
  const [selectedDayFlashcardsPage, setSelectedDayFlashcardsPage] = useState(1);
  const [selectedDaySchedulePage, setSelectedDaySchedulePage] = useState(1);
  const [selectedDayLogsPage, setSelectedDayLogsPage] = useState(1);

  const [calendarDate, setCalendarDate] = useState(() => new Date());

  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingExamData, setLoadingExamData] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /* =======================================================
     EDITAIS
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingExams(true);
        setError(null);

        const data = await listExams();

        if (cancelled) return;

        setExams(data);

        setSelectedExamId((current) => {
          if (current && data.some((exam) => exam.id === current)) {
            return current;
          }

          return data[0]?.id ?? "";
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar os editais.");
        }
      } finally {
        if (!cancelled) {
          setLoadingExams(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     DADOS DO EDITAL + FLASHCARDS
  ======================================================= */

  useEffect(() => {
    if (!selectedExamId) {
      setSubjects([]);
      setTopics([]);
      setManualSchedule([]);
      setStudyLogs([]);
      setFlashcards([]);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoadingExamData(true);
        setError(null);

        /*
         * Os flashcards são carregados junto com o restante
         * do dashboard.
         */
        const [subjectsData, topicsData, scheduleData, logsData, cardsData] = await Promise.all([
          listExamSubjects(selectedExamId),
          listExamTopics(selectedExamId),
          listManualSchedule(selectedExamId),
          listStudyLogs({
            exam_id: selectedExamId,
          }),
          listCards(),
        ]);

        if (cancelled) return;

        setSubjects(subjectsData);
        setTopics(topicsData);
        setManualSchedule(scheduleData);
        setStudyLogs(logsData);

        /*
         * Filtra os cards do edital atual quando o card possui
         * exam_id.
         *
         * Se não possuir exam_id, ele continua sendo usado.
         */
        const normalizedCards = normalizeCards(cardsData).filter((card) =>
          cardBelongsToExam(card, selectedExamId),
        );

        setFlashcards(normalizedCards);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar os dados do edital.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingExamData(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  /* =======================================================
     ATUALIZAR
  ======================================================= */

  async function handleRefresh() {
    if (refreshing) return;

    try {
      setRefreshing(true);
      setError(null);

      const data = await listExams();

      setExams(data);

      const examId =
        selectedExamId && data.some((exam) => exam.id === selectedExamId)
          ? selectedExamId
          : (data[0]?.id ?? "");

      setSelectedExamId(examId);

      if (!examId) {
        setSubjects([]);
        setTopics([]);
        setManualSchedule([]);
        setStudyLogs([]);
        setFlashcards([]);
        return;
      }

      const [subjectsData, topicsData, scheduleData, logsData, cardsData] = await Promise.all([
        listExamSubjects(examId),
        listExamTopics(examId),
        listManualSchedule(examId),
        listStudyLogs({
          exam_id: examId,
        }),
        listCards(),
      ]);

      setSubjects(subjectsData);
      setTopics(topicsData);
      setManualSchedule(scheduleData);
      setStudyLogs(logsData);

      const normalizedCards = normalizeCards(cardsData).filter((card) =>
        cardBelongsToExam(card, examId),
      );

      setFlashcards(normalizedCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o painel.");
    } finally {
      setRefreshing(false);
    }
  }

  /* =======================================================
     MAPAS
  ======================================================= */

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === selectedExamId) ?? null,
    [exams, selectedExamId],
  );

  const organizeTour = useCoachTour("organize-intro", organizeTourSteps, {
    autoStart: false,
  });
  const subjectMap = useMemo(() => {
    const map = new Map<string, ExamSubject>();

    for (const subject of subjects) {
      map.set(subject.id, subject);
    }

    return map;
  }, [subjects]);

  const topicMap = useMemo(() => {
    const map = new Map<string, ExamTopic>();

    for (const topic of topics) {
      map.set(topic.id, topic);
    }

    return map;
  }, [topics]);

  const logsByDate = useMemo(() => {
    const map = new Map<string, StudyLog[]>();

    for (const log of studyLogs) {
      const date = parseDate(log.studied_on);

      if (!date) continue;

      const key = dateKey(date);

      const current = map.get(key) ?? [];

      current.push(log);

      map.set(key, current);
    }

    return map;
  }, [studyLogs]);

  const scheduleByWeekday = useMemo(() => {
    const map = new Map<number, ManualScheduleEntry[]>();

    for (const entry of manualSchedule) {
      const current = map.get(entry.weekday) ?? [];

      current.push(entry);

      map.set(entry.weekday, current);
    }

    return map;
  }, [manualSchedule]);

  /* =======================================================
     FLASHCARDS POR DATA
  ======================================================= */

  const flashcardsByDate = useMemo(() => {
    const map = new Map<string, FlashcardRecord[]>();

    for (const card of flashcards) {
      const reviewDate = getCardReviewDate(card);

      if (!reviewDate) continue;

      const key = dateKey(reviewDate);

      const current = map.get(key) ?? [];

      current.push(card);

      map.set(key, current);
    }

    return map;
  }, [flashcards]);

  /*
   * Quantidade total de flashcards que realmente possuem
   * data de revisão reconhecida.
   */
  const scheduledFlashcardsCount = useMemo(() => {
    let total = 0;

    for (const cards of flashcardsByDate.values()) {
      total += cards.length;
    }

    return total;
  }, [flashcardsByDate]);

  /*
   * Quantidade de revisões atrasadas.
   */
  const overdueFlashcardsCount = useMemo(() => {
    const today = new Date();

    const todayKey = dateKey(today);

    let total = 0;

    for (const [key, cards] of flashcardsByDate.entries()) {
      if (key < todayKey) {
        total += cards.length;
      }
    }

    return total;
  }, [flashcardsByDate]);

  /* =======================================================
     PROGRESSO POR MATÉRIA
  ======================================================= */

  const studiedTopicIds = useMemo(() => new Set(studyLogs.map((log) => log.topic_id)), [studyLogs]);

  /* =======================================================
     CALENDÁRIO
  ======================================================= */

  const calendarDays = useMemo(() => getCalendarDays(calendarDate), [calendarDate]);

  const selectedDateKey = dateKey(selectedDate);

  const selectedDayLogs = useMemo(
    () => logsByDate.get(selectedDateKey) ?? [],
    [logsByDate, selectedDateKey],
  );

  const selectedDaySchedule = useMemo(
    () => scheduleByWeekday.get(selectedDate.getDay()) ?? [],
    [scheduleByWeekday, selectedDate],
  );

  const selectedDayFlashcards = useMemo(
    () => flashcardsByDate.get(selectedDateKey) ?? [],
    [flashcardsByDate, selectedDateKey],
  );

  /* =======================================================
     PAGINAÇÃO DAS LISTAS
  ======================================================= */

  const subjectsTotalPages = Math.max(1, Math.ceil(subjects.length / SUBJECTS_PER_PAGE));
  const selectedDayFlashcardsTotalPages = Math.max(
    1,
    Math.ceil(selectedDayFlashcards.length / DAY_FLASHCARDS_PER_PAGE),
  );
  const selectedDayScheduleTotalPages = Math.max(
    1,
    Math.ceil(selectedDaySchedule.length / DAY_SCHEDULE_PER_PAGE),
  );
  const selectedDayLogsTotalPages = Math.max(
    1,
    Math.ceil(selectedDayLogs.length / DAY_LOGS_PER_PAGE),
  );

  const safeSubjectsPage = Math.min(subjectsPage, subjectsTotalPages);
  const safeSelectedDayFlashcardsPage = Math.min(
    selectedDayFlashcardsPage,
    selectedDayFlashcardsTotalPages,
  );
  const safeSelectedDaySchedulePage = Math.min(
    selectedDaySchedulePage,
    selectedDayScheduleTotalPages,
  );
  const safeSelectedDayLogsPage = Math.min(selectedDayLogsPage, selectedDayLogsTotalPages);

  const paginatedSubjects = useMemo(() => {
    const start = (safeSubjectsPage - 1) * SUBJECTS_PER_PAGE;
    return subjects.slice(start, start + SUBJECTS_PER_PAGE);
  }, [subjects, safeSubjectsPage]);

  const paginatedSelectedDayFlashcards = useMemo(() => {
    const start = (safeSelectedDayFlashcardsPage - 1) * DAY_FLASHCARDS_PER_PAGE;
    return selectedDayFlashcards.slice(start, start + DAY_FLASHCARDS_PER_PAGE);
  }, [selectedDayFlashcards, safeSelectedDayFlashcardsPage]);

  const paginatedSelectedDaySchedule = useMemo(() => {
    const start = (safeSelectedDaySchedulePage - 1) * DAY_SCHEDULE_PER_PAGE;
    return selectedDaySchedule.slice(start, start + DAY_SCHEDULE_PER_PAGE);
  }, [selectedDaySchedule, safeSelectedDaySchedulePage]);

  const paginatedSelectedDayLogs = useMemo(() => {
    const start = (safeSelectedDayLogsPage - 1) * DAY_LOGS_PER_PAGE;
    return selectedDayLogs.slice(start, start + DAY_LOGS_PER_PAGE);
  }, [selectedDayLogs, safeSelectedDayLogsPage]);

  useEffect(() => {
    setSubjectsPage(1);
  }, [selectedExamId]);

  useEffect(() => {
    setSelectedDayFlashcardsPage(1);
    setSelectedDaySchedulePage(1);
    setSelectedDayLogsPage(1);
  }, [selectedDateKey]);

  useEffect(() => {
    setSubjectsPage((current) => Math.min(current, subjectsTotalPages));
  }, [subjectsTotalPages]);

  useEffect(() => {
    setSelectedDayFlashcardsPage((current) => Math.min(current, selectedDayFlashcardsTotalPages));
  }, [selectedDayFlashcardsTotalPages]);

  useEffect(() => {
    setSelectedDaySchedulePage((current) => Math.min(current, selectedDayScheduleTotalPages));
  }, [selectedDayScheduleTotalPages]);

  useEffect(() => {
    setSelectedDayLogsPage((current) => Math.min(current, selectedDayLogsTotalPages));
  }, [selectedDayLogsTotalPages]);

  /* =======================================================
     MÉTRICAS
  ======================================================= */

  const totalStudyMinutes = useMemo(
    () => studyLogs.reduce((total, log) => total + Number(log.minutes || 0), 0),
    [studyLogs],
  );

  const currentMonthStudyMinutes = useMemo(() => {
    return studyLogs.reduce((total, log) => {
      const date = parseDate(log.studied_on);

      if (!date) {
        return total;
      }

      if (
        date.getMonth() === calendarDate.getMonth() &&
        date.getFullYear() === calendarDate.getFullYear()
      ) {
        return total + Number(log.minutes || 0);
      }

      return total;
    }, 0);
  }, [studyLogs, calendarDate]);

  const totalPlannedMinutes = useMemo(
    () => manualSchedule.reduce((total, item) => total + Number(item.planned_minutes || 0), 0),
    [manualSchedule],
  );

  const studiedDays = useMemo(
    () =>
      new Set(
        studyLogs
          .map((log) => {
            const date = parseDate(log.studied_on);

            return date ? dateKey(date) : null;
          })
          .filter((value): value is string => value !== null),
      ).size,
    [studyLogs],
  );

  const progressTopics = useMemo(() => {
    if (topics.length === 0) {
      return 0;
    }

    return Math.round((studiedTopicIds.size / topics.length) * 100);
  }, [topics.length, studiedTopicIds]);

  const examDaysLeft = daysUntil(selectedExam?.exam_date);

  /* =======================================================
     NAVEGAÇÃO
  ======================================================= */

  function previousMonth() {
    setCalendarDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalendarDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  function goToday() {
    const today = new Date();

    setCalendarDate(today);
    setSelectedDate(today);
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className={cn(pageBackground, "relative overflow-x-hidden")}>
      {/* ===================================================
          BACKGROUND
      =================================================== */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-accent/5 blur-[120px]" />

        <div className="absolute right-[-180px] top-[25%] h-[500px] w-[500px] rounded-full bg-accent-bright/4 blur-[140px]" />

        <div className="absolute bottom-[-180px] left-[25%] h-[450px] w-[450px] rounded-full bg-accent/5 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* =================================================
            HEADER
        ================================================= */}

        <header className={cn(cardClass, "relative overflow-hidden")}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/6 via-transparent to-transparent" />

          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/8 blur-3xl" />

          <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/20">
                <div className="absolute inset-0 rounded-2xl bg-accent-bright/10" />

                <GraduationCap className="relative h-6 w-6" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-text">
                    Painel de estudos
                  </h1>

                  {selectedExam && (
                    <span className="rounded-full border border-accent-bright/20 bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-accent-bright">
                      Edital ativo
                    </span>
                  )}
                </div>

                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-text-muted">
                  Organize seu edital, acompanhe o cronograma e visualize sua evolução de estudos.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loadingExams}
                className={secondaryButtonClass}
              >
                <RefreshCw
                  className={cn("h-4 w-4", (refreshing || loadingExams) && "animate-spin")}
                />
                Atualizar
              </button>
            </div>
          </div>
        </header>

        {/* =================================================
            ERRO
        ================================================= */}

        {error && (
          <div className="rounded-2xl border border-again/25 bg-again/8 px-4 py-3 text-sm font-semibold text-again">
            {error}
          </div>
        )}

        {/* =================================================
            EDITAL
        ================================================= */}

        {!loadingExams && exams.length > 0 && (
          <section className={cn(cardClass, "relative overflow-hidden p-5")}>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-accent/4 to-transparent" />

            <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1" data-tour="edital-select">
                <label htmlFor="exam-select" className={cn(labelClass, "mb-2 block")}>
                  Edital em acompanhamento
                </label>

                <div className="relative">
                  <select
                    id="exam-select"
                    value={selectedExamId}
                    onChange={(event) => setSelectedExamId(event.target.value)}
                    className={selectClass}
                  >
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id} className="bg-ink-soft text-text">
                        {exam.name}
                      </option>
                    ))}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                </div>
              </div>

              {selectedExam && (
                <div className="flex flex-wrap gap-2">
                  {selectedExam.banca && (
                    <span className="rounded-xl border border-paper-line/10 bg-ink-softer px-3 py-2 text-xs font-bold text-text-muted">
                      {selectedExam.banca}
                    </span>
                  )}

                  {selectedExam.exam_date && (
                    <span className="inline-flex items-center gap-2 rounded-xl border border-accent-bright/20 bg-accent/10 px-3 py-2 text-xs font-bold text-accent-bright">
                      <CalendarDays className="h-4 w-4" />

                      {formatShortDate(selectedExam.exam_date)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {(loadingExams || loadingExamData) && (
          <div className={cn(cardClass, "relative overflow-hidden py-14")}>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/4 to-transparent" />

            <div className="relative flex flex-col items-center justify-center gap-4">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
                <div className="absolute inset-0 animate-ping rounded-2xl bg-accent/5" />

                <RefreshCw className="relative h-5 w-5 animate-spin text-accent-bright" />
              </div>

              <p className="text-sm font-semibold text-text-muted">Carregando seu painel...</p>
            </div>
          </div>
        )}

        {/* =================================================
            SEM EDITAIS
        ================================================= */}

        {!loadingExams && exams.length === 0 && (
          <div
            className={cn(
              cardClass,
              "relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center",
            )}
          >
            <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl" />

            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-bright/10 bg-accent/10 text-accent-bright">
              <FileText className="h-8 w-8" />
            </div>

            <h2 className="mt-5 text-xl font-black text-text">Nenhum edital cadastrado</h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">
              Cadastre ou importe um edital para começar a organizar suas matérias, tópicos e rotina
              de estudos.
            </p>

            <a href="/exams" className={cn(primaryButtonClass, "mt-6")}>
              <FileText className="h-4 w-4" />
              Criar edital
            </a>
          </div>
        )}

        {/* =================================================
            CONTEÚDO
        ================================================= */}

        {!loadingExams && selectedExam && (
          <>
            {/* =================================================
                STATS
            ================================================= */}

            <section
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
              data-tour="stats-organize"
            >
              <StatCard
                icon={Clock3}
                label="Tempo estudado"
                value={formatMinutes(totalStudyMinutes)}
                description={`${studiedDays} dias com estudo registrado`}
                tone="accent"
              />

              <StatCard
                icon={CalendarDays}
                label="Este mês"
                value={formatMinutes(currentMonthStudyMinutes)}
                description="Tempo estudado no mês atual"
                tone="good"
              />

              <StatCard
                icon={Layers3}
                label="Conteúdo"
                value={`${progressTopics}%`}
                description={`${topics.length} tópicos no edital`}
                tone="accent"
              />

              <StatCard
                icon={Trophy}
                label="Prova"
                value={
                  examDaysLeft === null
                    ? "Sem data"
                    : examDaysLeft < 0
                      ? "Realizada"
                      : `${examDaysLeft}d`
                }
                description={
                  selectedExam.exam_date
                    ? formatDate(selectedExam.exam_date)
                    : "Defina a data da prova"
                }
                tone={examDaysLeft !== null && examDaysLeft <= 30 ? "streak" : "accent"}
              />
            </section>

            {/* =================================================
                INDICADOR DE REVISÕES
            ================================================= */}

            {scheduledFlashcardsCount > 0 && (
              <section className={cn(cardClass, "relative overflow-hidden p-4")}>
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />

                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                      <RotateCcw className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm font-black text-text">Revisões de flashcards</p>

                      <p className="mt-0.5 text-xs font-medium text-text-muted">
                        O calendário mostra automaticamente os dias com revisão agendada.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-xl border border-accent-bright/15 bg-accent/8 px-3 py-2 text-xs font-black text-accent-bright">
                      {scheduledFlashcardsCount}{" "}
                      {scheduledFlashcardsCount === 1 ? "revisão" : "revisões"}
                    </span>

                    {overdueFlashcardsCount > 0 && (
                      <span className="rounded-xl border border-again/15 bg-again/8 px-3 py-2 text-xs font-black text-again">
                        {overdueFlashcardsCount} atrasadas
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* =================================================
                CALENDÁRIO + DIA
            ================================================= */}

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
              {/* =================================================
                  CALENDÁRIO
              ================================================= */}

              <div className={cn(cardClass, "overflow-hidden")} data-tour="calendario-organize">
                {/* Cabeçalho */}

                <div className="border-b border-paper-line/10 bg-ink-softer/30 p-5 sm:p-6">
                  <SectionHeader
                    icon={CalendarDays}
                    title="Calendário de estudos"
                    description="Acompanhe planejamento, estudos realizados e revisões de flashcards."
                    action={
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={previousMonth}
                          className={cn(
                            iconButtonClass,
                            "h-9 w-9 rounded-xl",
                            "hover:bg-accent/10 hover:text-accent-bright",
                          )}
                          aria-label="Mês anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={goToday}
                          className="hidden h-9 items-center justify-center rounded-xl border border-paper-line/10 bg-ink-soft px-3 text-[11px] font-black text-text-muted transition-all hover:border-accent-bright/30 hover:bg-accent/5 hover:text-accent-bright sm:inline-flex"
                        >
                          Hoje
                        </button>

                        <button
                          type="button"
                          onClick={nextMonth}
                          className={cn(
                            iconButtonClass,
                            "h-9 w-9 rounded-xl",
                            "hover:bg-accent/10 hover:text-accent-bright",
                          )}
                          aria-label="Próximo mês"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  />

                  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-text-faint">
                        Visão mensal
                      </p>

                      <h3 className="text-xl font-black capitalize tracking-tight text-text sm:text-2xl">
                        {getMonthLabel(calendarDate)}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-bold text-text-muted">
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-bright/10">
                          <span className="h-2 w-2 rounded-full bg-accent-bright shadow-sm shadow-accent-bright/40" />
                        </span>
                        Planejado
                      </span>

                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-good/10">
                          <CheckCircle2 className="h-3 w-3 text-good" />
                        </span>
                        Estudado
                      </span>

                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10">
                          <RotateCcw className="h-3 w-3 text-accent-bright" />
                        </span>
                        Revisão
                      </span>

                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-sm shadow-accent/40" />
                        Hoje
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calendário */}

                <div className="p-3 sm:p-5">
                  {/* Dias da semana */}

                  <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-1.5">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                      <div
                        key={day}
                        className="rounded-lg py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] text-text-faint sm:py-2.5 sm:text-[10px]"
                      >
                        <span className="sm:hidden">{day.slice(0, 1)}</span>

                        <span className="hidden sm:inline">{day}</span>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-paper-line/10 bg-ink shadow-inner">
                    <div className="grid grid-cols-7">
                      {calendarDays.map(({ date, currentMonth }) => {
                        const key = dateKey(date);

                        const dayLogs = logsByDate.get(key) ?? [];

                        const daySchedule = scheduleByWeekday.get(date.getDay()) ?? [];

                        /*
                         * FLASHCARDS DO DIA
                         */
                        const dayFlashcards = flashcardsByDate.get(key) ?? [];

                        const studiedMinutes = dayLogs.reduce(
                          (total, log) => total + Number(log.minutes || 0),
                          0,
                        );

                        const isToday = isSameDay(date, new Date());

                        const isSelected = isSameDay(date, selectedDate);

                        const examDate = parseDate(selectedExam.exam_date);

                        const isExamDay = examDate !== null && isSameDay(date, examDate);

                        const hasSchedule = daySchedule.length > 0;

                        const hasStudy = studiedMinutes > 0;

                        const hasFlashcards = dayFlashcards.length > 0;

                        const isOverdue = hasFlashcards && dateKey(date) < dateKey(new Date());

                        const subjectName =
                          subjectMap.get(daySchedule[0]?.subject_id ?? "")?.name ??
                          "Estudo planejado";

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setSelectedDate(date);

                              if (!currentMonth) {
                                setCalendarDate(new Date(date.getFullYear(), date.getMonth(), 1));
                              }
                            }}
                            className={cn(
                              "group relative min-h-[92px] border-b border-r border-paper-line/8 bg-ink-soft p-2 text-left",
                              "transition-all duration-200 ease-out",
                              "hover:z-10 hover:bg-ink-softer",
                              "focus:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-bright/60",
                              "sm:min-h-[120px] sm:p-3",

                              !currentMonth && "bg-ink/60 opacity-35",

                              isToday && !isSelected && "bg-accent/4",

                              isSelected &&
                                "z-10 bg-accent/8 shadow-[inset_0_0_0_1px] shadow-accent-bright/30",

                              isExamDay && "bg-streak/3",

                              hasFlashcards && !isSelected && "bg-accent/3",
                            )}
                          >
                            {/* Topo */}

                            <div className="flex items-start justify-between gap-1">
                              <span
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition-all duration-200 sm:h-8 sm:w-8",

                                  currentMonth ? "text-text-muted" : "text-text-faint",

                                  isToday && "bg-accent text-white shadow-md shadow-accent/20",

                                  isSelected &&
                                    !isToday &&
                                    "bg-accent/15 text-accent-bright ring-1 ring-accent-bright/20",

                                  !isToday && !isSelected && "group-hover:bg-paper-line/5",
                                )}
                              >
                                {date.getDate()}
                              </span>

                              <div className="flex items-center gap-1">
                                {hasFlashcards && (
                                  <span
                                    title={
                                      isOverdue
                                        ? `${dayFlashcards.length} revisão(ões) atrasada(s)`
                                        : `${dayFlashcards.length} revisão(ões) agendada(s)`
                                    }
                                    className={cn(
                                      "flex h-6 min-w-6 items-center justify-center gap-1 rounded-lg px-1.5",
                                      isOverdue
                                        ? "border border-again/20 bg-again/10 text-again"
                                        : "border border-accent-bright/15 bg-accent/10 text-accent-bright",
                                    )}
                                  >
                                    <RotateCcw className="h-3 w-3" />

                                    <span className="text-[8px] font-black">
                                      {dayFlashcards.length}
                                    </span>
                                  </span>
                                )}

                                {isExamDay && (
                                  <span
                                    className={cn(
                                      "flex items-center gap-1 rounded-lg border px-1.5 py-1",
                                      "border-streak/20 bg-streak/8",
                                      "text-[8px] font-black uppercase tracking-wide text-streak",
                                      "shadow-sm shadow-streak/5",
                                    )}
                                  >
                                    <span className="h-1 w-1 rounded-full bg-streak" />
                                    Prova
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Conteúdo */}

                            <div className="mt-3 space-y-2">
                              {/* Planejamento */}

                              {hasSchedule && (
                                <div
                                  className={cn(
                                    "flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1",
                                    "bg-accent-bright/6",
                                    "transition-all duration-200",
                                    "group-hover:bg-accent-bright/10",
                                  )}
                                >
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-bright shadow-sm shadow-accent-bright/40" />

                                  <span className="min-w-0 truncate text-[9px] font-black text-accent-bright sm:text-[10px]">
                                    {subjectName}
                                  </span>
                                </div>
                              )}

                              {/* Flashcards */}

                              {hasFlashcards && (
                                <div
                                  className={cn(
                                    "flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1",
                                    isOverdue ? "bg-again/8" : "bg-accent/8",
                                  )}
                                >
                                  <RotateCcw
                                    className={cn(
                                      "h-3 w-3 shrink-0",
                                      isOverdue ? "text-again" : "text-accent-bright",
                                    )}
                                  />

                                  <span
                                    className={cn(
                                      "min-w-0 truncate text-[9px] font-black sm:text-[10px]",
                                      isOverdue ? "text-again" : "text-accent-bright",
                                    )}
                                  >
                                    {dayFlashcards.length}{" "}
                                    {dayFlashcards.length === 1 ? "revisão" : "revisões"}
                                  </span>
                                </div>
                              )}

                              {/* Estudo */}

                              {hasStudy && (
                                <div className="flex items-center gap-1.5">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-good/10">
                                    <CheckCircle2 className="h-3 w-3 text-good" />
                                  </span>

                                  <span className="truncate text-[9px] font-black text-good sm:text-[10px]">
                                    {formatMinutes(studiedMinutes)}
                                  </span>
                                </div>
                              )}

                              {/* Sem atividade */}

                              {!hasSchedule && !hasStudy && !hasFlashcards && currentMonth && (
                                <span className="block pt-1 text-[9px] font-medium text-text-faint/50 opacity-0 transition-opacity group-hover:opacity-100">
                                  —
                                </span>
                              )}
                            </div>

                            {/* Indicador inferior */}

                            {(hasSchedule || hasStudy || hasFlashcards) && (
                              <div className="absolute bottom-2 left-2 right-2 flex gap-1 sm:bottom-2.5 sm:left-3 sm:right-3">
                                {hasSchedule && (
                                  <span className="h-0.5 flex-1 rounded-full bg-accent-bright/50" />
                                )}

                                {hasFlashcards && (
                                  <span
                                    className={cn(
                                      "h-0.5 flex-1 rounded-full",
                                      isOverdue ? "bg-again/60" : "bg-accent/60",
                                    )}
                                  />
                                )}

                                {hasStudy && (
                                  <span className="h-0.5 flex-1 rounded-full bg-good/60" />
                                )}
                              </div>
                            )}

                            {/* Hover */}

                            {hasFlashcards && (
                              <span
                                className={cn(
                                  "absolute right-2 top-2 h-1.5 w-1.5 rounded-full opacity-0 shadow-sm transition-all duration-200 group-hover:scale-125 group-hover:opacity-100",
                                  isOverdue
                                    ? "bg-again shadow-again/50"
                                    : "bg-accent-bright shadow-accent-bright/50",
                                )}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* =================================================
                  DIA SELECIONADO
              ================================================= */}

              <aside className={cn(cardClass, "h-fit overflow-hidden")}>
                <div className="relative overflow-hidden border-b border-paper-line/10 bg-ink-softer p-5">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/10 blur-2xl" />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent-bright">
                        Dia selecionado
                      </p>

                      <h2 className="mt-1 text-xl font-black capitalize text-text">
                        {selectedDate.toLocaleDateString("pt-BR", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                        })}
                      </h2>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-5">
                  {/* =================================================
                      REVISÕES DE FLASHCARDS
                  ================================================= */}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClass}>Revisões</h3>

                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[10px] font-black",
                          selectedDayFlashcards.length > 0
                            ? "bg-accent/10 text-accent-bright"
                            : "bg-ink-soft text-text-faint",
                        )}
                      >
                        {selectedDayFlashcards.length}
                      </span>
                    </div>

                    {selectedDayFlashcards.length > 0 ? (
                      <div className="space-y-2">
                        {paginatedSelectedDayFlashcards.map((card, index) => {
                          const title = getCardTitle(
                            card,
                            (safeSelectedDayFlashcardsPage - 1) * DAY_FLASHCARDS_PER_PAGE + index,
                          );

                          const reviewDate = getCardReviewDate(card);

                          const isOverdue =
                            reviewDate !== null && dateKey(reviewDate) < dateKey(new Date());

                          return (
                            <div
                              key={`${selectedDateKey}-card-${(safeSelectedDayFlashcardsPage - 1) * DAY_FLASHCARDS_PER_PAGE + index}`}
                              className={cn(
                                innerClass,
                                "p-3 transition-all duration-200 hover:border-accent-bright/25 hover:bg-ink-soft",
                                isOverdue && "border-again/15 bg-again/5",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={cn(
                                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                    isOverdue
                                      ? "bg-again/10 text-again"
                                      : "bg-accent/10 text-accent-bright",
                                  )}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-2 text-sm font-bold text-text">
                                    {title}
                                  </p>

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {reviewDate && (
                                      <span
                                        className={cn(
                                          "rounded-lg px-2 py-1 text-[10px] font-bold",
                                          isOverdue
                                            ? "bg-again/10 text-again"
                                            : "bg-accent/10 text-accent-bright",
                                        )}
                                      >
                                        {isOverdue ? "Atrasada" : "Agendada"}
                                      </span>
                                    )}

                                    {reviewDate && (
                                      <span className="rounded-lg bg-ink-soft px-2 py-1 text-[10px] font-bold text-text-muted">
                                        {reviewDate.toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <Pagination
                          page={safeSelectedDayFlashcardsPage}
                          totalPages={selectedDayFlashcardsTotalPages}
                          totalItems={selectedDayFlashcards.length}
                          pageSize={DAY_FLASHCARDS_PER_PAGE}
                          onPageChange={setSelectedDayFlashcardsPage}
                        />
                      </div>
                    ) : (
                      <EmptyPanel text="Nenhuma revisão de flashcards agendada para este dia." />
                    )}
                  </div>

                  {/* =================================================
                      PLANEJAMENTO
                  ================================================= */}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClass}>Planejamento</h3>

                      <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-black text-accent-bright">
                        {selectedDaySchedule.length}
                      </span>
                    </div>

                    {selectedDaySchedule.length > 0 ? (
                      <div className="space-y-2">
                        {paginatedSelectedDaySchedule.map((entry) => {
                          const subject = entry.subject_id
                            ? subjectMap.get(entry.subject_id)
                            : null;

                          const topic = entry.topic_id ? topicMap.get(entry.topic_id) : null;

                          return (
                            <div
                              key={entry.id}
                              className={cn(
                                innerClass,
                                "p-3 transition-all duration-200 hover:border-accent-bright/25 hover:bg-ink-soft",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
                                  <BookOpen className="h-4 w-4" />
                                </div>

                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-text">
                                    {subject?.name ?? topic?.title ?? "Estudo"}
                                  </p>

                                  {topic && subject && (
                                    <p className="mt-0.5 truncate text-xs font-medium text-text-muted">
                                      {topic.title}
                                    </p>
                                  )}

                                  {entry.planned_minutes && (
                                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-accent-bright">
                                      <Clock3 className="h-3 w-3" />

                                      {formatMinutes(Number(entry.planned_minutes))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyPanel text="Nenhum estudo planejado para este dia." />
                    )}

                    <Pagination
                      page={safeSelectedDaySchedulePage}
                      totalPages={selectedDayScheduleTotalPages}
                      totalItems={selectedDaySchedule.length}
                      pageSize={DAY_SCHEDULE_PER_PAGE}
                      onPageChange={setSelectedDaySchedulePage}
                    />
                  </div>

                  {/* =================================================
                      REALIZADO
                  ================================================= */}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={labelClass}>Realizado</h3>

                      <span className="rounded-full bg-good/10 px-2 py-1 text-[10px] font-black text-good">
                        {formatMinutes(
                          selectedDayLogs.reduce(
                            (total, log) => total + Number(log.minutes || 0),
                            0,
                          ),
                        )}
                      </span>
                    </div>

                    {selectedDayLogs.length > 0 ? (
                      <div className="space-y-2">
                        {paginatedSelectedDayLogs.map((log) => {
                          const topic = topicMap.get(log.topic_id);

                          const subject = topic ? subjectMap.get(topic.subject_id) : null;

                          return (
                            <div
                              key={log.id}
                              className="rounded-xl border border-good/15 bg-good/5 p-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-good/10 text-good">
                                  <CheckCircle2 className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-text">
                                    {topic?.title ?? log.category ?? "Sessão de estudo"}
                                  </p>

                                  {subject && (
                                    <p className="mt-0.5 truncate text-xs font-medium text-text-muted">
                                      {subject.name}
                                    </p>
                                  )}

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-lg bg-good/8 px-2 py-1 text-[10px] font-bold text-good">
                                      {formatMinutes(Number(log.minutes || 0))}
                                    </span>

                                    {log.questions_total && log.questions_total > 0 && (
                                      <span className="rounded-lg bg-ink-soft px-2 py-1 text-[10px] font-bold text-text-muted">
                                        {log.questions_correct ?? 0}/{log.questions_total} questões
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyPanel text="Nenhum estudo registrado neste dia." />
                    )}

                    <Pagination
                      page={safeSelectedDayLogsPage}
                      totalPages={selectedDayLogsTotalPages}
                      totalItems={selectedDayLogs.length}
                      pageSize={DAY_LOGS_PER_PAGE}
                      onPageChange={setSelectedDayLogsPage}
                    />
                  </div>
                </div>
              </aside>
            </section>

            {/* =================================================
                PARTE INFERIOR
            ================================================= */}

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* MATÉRIAS */}

              <div className={cn(cardClass, "p-5")}>
                <SectionHeader icon={BookOpen} title="Matérias" description="Estrutura do edital" />

                {subjects.length > 0 ? (
                  <div className="space-y-2">
                    {paginatedSubjects.map((subject) => {
                      const subjectTopics = topics.filter(
                        (topic) => topic.subject_id === subject.id,
                      );

                      const studiedSubjectTopics = subjectTopics.filter((topic) =>
                        studiedTopicIds.has(topic.id),
                      ).length;

                      const percentage = subjectTopics.length
                        ? Math.round((studiedSubjectTopics / subjectTopics.length) * 100)
                        : 0;

                      return (
                        <div
                          key={subject.id}
                          className={cn(
                            innerClass,
                            "p-3 transition-all duration-200 hover:border-accent-bright/25 hover:bg-ink-soft",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-text">{subject.name}</p>

                              <p className="mt-0.5 text-[11px] font-medium text-text-muted">
                                {subjectTopics.length}{" "}
                                {subjectTopics.length === 1 ? "tópico" : "tópicos"}
                              </p>
                            </div>

                            <span className="shrink-0 text-xs font-black text-accent-bright">
                              {percentage}%
                            </span>
                          </div>

                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink">
                            <div
                              className="h-full rounded-full bg-accent-bright transition-all duration-700"
                              style={{
                                width: `${Math.min(percentage, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    <Pagination
                      page={safeSubjectsPage}
                      totalPages={subjectsTotalPages}
                      totalItems={subjects.length}
                      pageSize={SUBJECTS_PER_PAGE}
                      onPageChange={setSubjectsPage}
                    />
                  </div>
                ) : (
                  <EmptyPanel text="Nenhuma matéria cadastrada." />
                )}
              </div>

              {/* PLANEJAMENTO */}

              <div className={cn(cardClass, "p-5")}>
                <SectionHeader
                  icon={Target}
                  title="Planejamento semanal"
                  description="Carga planejada"
                />

                <div className="relative mb-4 overflow-hidden rounded-2xl border border-accent/15 bg-accent/8 p-4">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent-bright/8 blur-2xl" />

                  <div className="relative flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-accent-bright">
                      Total planejado
                    </span>

                    <Clock3 className="h-4 w-4 text-accent-bright" />
                  </div>

                  <p className="relative mt-1 text-2xl font-black text-text">
                    {formatHours(totalPlannedMinutes)}
                  </p>
                </div>

                {manualSchedule.length > 0 ? (
                  <div className="space-y-2">
                    {Array.from(scheduleByWeekday.entries())
                      .sort(([first], [second]) => first - second)
                      .map(([weekday, entries]) => {
                        const minutes = entries.reduce(
                          (total, entry) => total + Number(entry.planned_minutes || 0),
                          0,
                        );

                        return (
                          <div
                            key={weekday}
                            className={cn(
                              innerClass,
                              "flex items-center justify-between px-3 py-3 transition hover:border-accent-bright/20 hover:bg-ink-soft",
                            )}
                          >
                            <div>
                              <p className="text-sm font-bold text-text">{weekdayName(weekday)}</p>

                              <p className="text-[11px] font-medium text-text-muted">
                                {entries.length} {entries.length === 1 ? "atividade" : "atividades"}
                              </p>
                            </div>

                            <span className="rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-black text-accent-bright">
                              {formatMinutes(minutes)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <EmptyPanel text="Nenhum planejamento manual cadastrado." />
                )}
              </div>

              {/* RESUMO */}

              <div className={cn(cardClass, "p-5")}>
                <SectionHeader icon={Trophy} title="Resumo do edital" description="Visão geral" />

                <div className="space-y-2">
                  <SummaryRow icon={BookOpen} label="Matérias" value={String(subjects.length)} />

                  <SummaryRow icon={Layers3} label="Tópicos" value={String(topics.length)} />

                  <SummaryRow
                    icon={CheckCircle2}
                    label="Dias estudados"
                    value={String(studiedDays)}
                  />

                  <SummaryRow
                    icon={Clock3}
                    label="Tempo total"
                    value={formatMinutes(totalStudyMinutes)}
                  />

                  <SummaryRow
                    icon={RotateCcw}
                    label="Flashcards agendados"
                    value={String(scheduledFlashcardsCount)}
                  />

                  <SummaryRow
                    icon={CalendarDays}
                    label="Data da prova"
                    value={
                      selectedExam.exam_date
                        ? formatShortDate(selectedExam.exam_date)
                        : "Não definida"
                    }
                  />
                </div>

                {selectedExam.exam_date && (
                  <div className="relative mt-5 overflow-hidden rounded-2xl border border-accent/15 bg-accent/8 p-4">
                    <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent-bright/8 blur-2xl" />

                    <div className="relative flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent/15">
                        <Trophy className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-accent-bright">
                          Data da prova
                        </p>

                        <p className="mt-0.5 truncate text-sm font-black text-text">
                          {formatDate(selectedExam.exam_date)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* =================================================
                RODAPÉ
            ================================================= */}

            <section className={cn(cardClass, "relative overflow-hidden")}>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-transparent" />

              <div className="relative flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div>
                    <p className={labelClass}>Edital atual</p>

                    <h2 className="mt-1 text-lg font-black text-text">{selectedExam.name}</h2>

                    <p className="mt-1 text-xs font-medium text-text-muted">
                      {subjects.length} matérias · {topics.length} tópicos · {manualSchedule.length}{" "}
                      {manualSchedule.length === 1 ? "atividade" : "atividades"} planejadas ·{" "}
                      {scheduledFlashcardsCount} revisões
                    </p>
                  </div>
                </div>

                <a
                  href="/editais"
                  className={`${secondaryButtonClass} inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5`}
                >
                  <FileText className="h-3.5 w-3.5 text-accent-bright" />
                  Abrir edital
                </a>
              </div>
            </section>
          </>
        )}
      </div>

      <CoachTour {...organizeTour} />
    </div>
  );
}
