import {
  Flame,
  Sparkles,
  Target,
  TrendingUp,
  CalendarClock,
  AlarmClockCheck,
  Activity,
  FileText,
  BookText,
  Video,
  CircleHelp,
  RotateCcw,
  BookOpen,
  Clock3,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Snowflake,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Link } from "react-router-dom";

import { Button, Panel, Spinner } from "../components/ui";

import {
  getDashboardSummary,
  getQueue,
  getStatsOverview,
  listCards,
  listStudyLogs,
  listExamSubjects,
  listExamTopics,
} from "../lib/api";

import { useAuth } from "../lib/auth-context";

import type { DashboardSummary, QueueResponse, StatsOverview, StudyLog } from "../lib/types";

// ============================================================
// TIPOS AUXILIARES
// ============================================================

type DashboardCard = {
  id?: string;
  state?: string | number | null;
  status?: string | number | null;
  srs_state?: string | number | null;
  due_at?: string | null;
  due?: string | null;
  interval?: number | null;
  repetitions?: number | null;
  [key: string]: unknown;
};

// ============================================================
// HELPERS
// ============================================================

function numberValue(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Converte a duração de um StudyLog para SEGUNDOS.
 *
 * Compatibilidade:
 * - seconds
 * - duration_seconds
 * - duration_ms
 * - minutes
 */
function getStudyDurationSeconds(log: StudyLog): number {
  const item = log as StudyLog & {
    seconds?: number | null;
    duration_seconds?: number | null;
    duration_ms?: number | null;
  };

  if (item.duration_seconds != null) {
    return Math.max(0, numberValue(item.duration_seconds));
  }

  if (item.seconds != null) {
    return Math.max(0, numberValue(item.seconds));
  }

  if (item.duration_ms != null) {
    return Math.max(0, numberValue(item.duration_ms) / 1000);
  }

  if (log.minutes != null) {
    return Math.max(0, numberValue(log.minutes) * 60);
  }

  return 0;
}

/**
 * Formata segundos com precisão.
 */
function formatStudyDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(numberValue(seconds)));

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0"),
    ].join(":");
  }

  return [String(minutes).padStart(2, "0"), String(remainingSeconds).padStart(2, "0")].join(":");
}

/**
 * Para o eixo do gráfico.
 */
function formatChartTick(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));

  if (totalSeconds === 0) {
    return "0";
  }

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    if (minutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${minutes}min`;
  }

  return `${minutes}min`;
}

function normalizeState(card: DashboardCard): string {
  const raw = card.state ?? card.status ?? card.srs_state ?? "";

  return String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isNewCard(card: DashboardCard): boolean {
  const state = normalizeState(card);

  return state === "new" || state === "novo" || state === "0";
}

function isLearningCard(card: DashboardCard): boolean {
  const state = normalizeState(card);

  return state === "learning" || state === "learn" || state === "aprendendo" || state === "1";
}

function isReviewCard(card: DashboardCard): boolean {
  const state = normalizeState(card);

  return state === "review" || state === "revisao" || state === "2";
}

function isDueCard(card: DashboardCard): boolean {
  const rawDue = card.due_at ?? card.due ?? null;

  if (!rawDue) {
    return false;
  }

  const due = new Date(String(rawDue));

  if (Number.isNaN(due.getTime())) {
    return false;
  }

  return due.getTime() <= Date.now();
}

// ============================================================
// DATA / HORÁRIO LOCAL
// ============================================================

function startOfLocalDay(date: Date = new Date()): Date {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseStudyDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Nome amigável para as datas das revisões programadas.
 */
function getScheduledReviewLabel(date: Date, today: Date): string {
  const dateKey = getLocalDateKey(date);

  const todayKey = getLocalDateKey(today);

  const tomorrow = new Date(today);

  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowKey = getLocalDateKey(tomorrow);

  if (dateKey === todayKey) {
    return "Hoje";
  }

  if (dateKey === tomorrowKey) {
    return "Amanhã";
  }

  return date
    .toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    })
    .replace(".", "");
}

function getChartScaleMax(maxMinutes: number): number {
  const max = Math.max(0, Math.ceil(maxMinutes));

  const steps = [30, 60, 90, 120, 180, 240, 360, 480, 720, 960, 1200, 1440];

  const predefined = steps.find((step) => max <= step);

  if (predefined) {
    return predefined;
  }

  return Math.ceil(max / 240) * 240;
}

function getChartTickStep(maxMinutes: number): number {
  if (maxMinutes <= 120) {
    return 30;
  }

  if (maxMinutes <= 360) {
    return 60;
  }

  if (maxMinutes <= 720) {
    return 120;
  }

  return 240;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatWeekday(date: Date): string {
  return date
    .toLocaleDateString("pt-BR", {
      weekday: "short",
    })
    .replace(".", "")
    .toLowerCase();
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatActivityDate(dateString: string): string {
  const value = parseStudyDate(dateString);

  if (!value) {
    return "Data desconhecida";
  }

  const today = startOfLocalDay();

  const yesterday = new Date(today);

  yesterday.setDate(yesterday.getDate() - 1);

  const valueKey = getLocalDateKey(value);

  if (valueKey === getLocalDateKey(today)) {
    return "Hoje";
  }

  if (valueKey === getLocalDateKey(yesterday)) {
    return "Ontem";
  }

  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateString: string): string {
  const value = parseStudyDate(dateString);

  if (!value) {
    return "--:--:--";
  }

  return value.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(dateString: string): string {
  const value = parseStudyDate(dateString);

  if (!value) {
    return "Data desconhecida";
  }

  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================
// WEATHER — VISUAL, SEM NÚMEROS
// ============================================================
type WeatherKind = "sun" | "cloud" | "partly" | "rain" | "storm" | "drizzle" | "snow";

type WeatherState = {
  kind: WeatherKind;
  label: string;
};

function getWeatherState(code: number, isDay: boolean): WeatherState {
  if (!isDay && code <= 3) {
    return { kind: "cloud", label: "Céu noturno" };
  }

  if (code === 0) return { kind: "sun", label: "Ensolarado" };
  if (code === 1 || code === 2) return { kind: "partly", label: "Parcialmente nublado" };
  if (code === 3) return { kind: "cloud", label: "Nublado" };
  if ([45, 48].includes(code)) return { kind: "cloud", label: "Neblina" };
  if ([51, 53, 55, 56, 57].includes(code)) return { kind: "drizzle", label: "Garoa" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { kind: "rain", label: "Chuva" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { kind: "snow", label: "Neve" };
  if ([95, 96, 99].includes(code)) return { kind: "storm", label: "Tempestade" };

  return { kind: "cloud", label: "Nublado" };
}

function WeatherVisual({ weather }: { weather: WeatherState | null }) {
  const kind = weather?.kind ?? "cloud";

  const Icon =
    kind === "sun"
      ? Sun
      : kind === "partly"
        ? CloudSun
        : kind === "rain"
          ? CloudRain
          : kind === "drizzle"
            ? CloudDrizzle
            : kind === "storm"
              ? CloudLightning
              : kind === "snow"
                ? Snowflake
                : Cloud;

  return (
    <div
      className={`pointer-events-none absolute inset-y-0 right-0 w-[46%] min-w-[280px] overflow-hidden ${
        kind === "sun"
          ? "weather-sun"
          : kind === "rain" || kind === "drizzle"
            ? "weather-rain"
            : kind === "storm"
              ? "weather-storm"
              : kind === "snow"
                ? "weather-snow"
                : "weather-cloud"
      }`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#0b0f14]/20" />

      {kind === "sun" && (
        <>
          <div className="absolute -right-12 -top-20 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute right-16 top-8 h-28 w-28 rounded-full border border-amber-200/20 bg-amber-200/10 blur-sm" />
        </>
      )}

      {(kind === "cloud" ||
        kind === "partly" ||
        kind === "rain" ||
        kind === "drizzle" ||
        kind === "storm") && (
        <div className="weather-cloud-layer absolute right-[-30px] top-7 h-28 w-[340px] opacity-35">
          <div className="absolute right-16 top-8 h-20 w-44 rounded-full bg-slate-300/15 blur-xl" />
          <div className="absolute right-28 top-2 h-24 w-28 rounded-full bg-slate-200/10 blur-xl" />
          <div className="absolute right-2 top-12 h-16 w-32 rounded-full bg-slate-300/10 blur-xl" />
        </div>
      )}

      {(kind === "rain" || kind === "drizzle" || kind === "storm") && (
        <div className="absolute inset-0 overflow-hidden opacity-40">
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className="weather-drop absolute top-[-20px] h-10 w-px rounded-full bg-sky-300/40"
              style={{
                right: `${8 + ((index * 17) % 88)}%`,
                animationDelay: `${(index % 7) * 0.23}s`,
                animationDuration: `${0.9 + (index % 4) * 0.18}s`,
              }}
            />
          ))}
        </div>
      )}

      {kind === "snow" && (
        <div className="absolute inset-0 overflow-hidden opacity-50">
          {Array.from({ length: 16 }, (_, index) => (
            <span
              key={index}
              className="weather-snowflake absolute top-[-12px] h-1.5 w-1.5 rounded-full bg-white/70"
              style={{
                right: `${8 + ((index * 19) % 88)}%`,
                animationDelay: `${(index % 8) * 0.35}s`,
                animationDuration: `${3.2 + (index % 4) * 0.45}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="absolute right-7 top-1/2 flex -translate-y-1/2 items-center gap-3 text-right">
        <span className="sr-only">{weather?.label ?? "Clima indisponível"}</span>
        <Icon
          className="h-14 w-14 text-white/15 drop-shadow-[0_0_24px_rgba(255,255,255,0.12)]"
          strokeWidth={1.2}
        />
      </div>
    </div>
  );
}

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWeather = async () => {
      try {
        if (!navigator.geolocation) {
          return;
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 7000,
            maximumAge: 30 * 60 * 1000,
          });
        });

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,is_day&timezone=auto`,
          { headers: { Accept: "application/json" } },
        );

        if (!response.ok) return;

        const data = (await response.json()) as {
          current?: {
            weather_code?: number;
            is_day?: number;
          };
        };

        const code = Number(data.current?.weather_code);
        const isDay = Number(data.current?.is_day) === 1;

        if (!cancelled && Number.isFinite(code)) {
          setWeather(getWeatherState(code, isDay));
        }
      } catch {
        // O dashboard continua funcionando normalmente mesmo sem clima.
      }
    };

    void loadWeather();

    const refreshTimer = window.setInterval(
      () => {
        void loadWeather();
      },
      30 * 60 * 1000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  return <WeatherVisual weather={weather} />;
}

// ============================================================
// DASHBOARD
// ============================================================

export default function Dashboard() {
  const { user } = useAuth();

  const [stats, setStats] = useState<StatsOverview | null>(null);

  const [queue, setQueue] = useState<QueueResponse | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);

  // Histórico completo usado pelo gráfico de tempo por matéria.
  const [allStudyLogs, setAllStudyLogs] = useState<StudyLog[]>([]);

  // Relação local: topic_id -> nome da matéria.
  // O StudyLog guarda apenas topic_id; a matéria vem de ExamTopic.subject_id
  // e ExamSubject.name.
  const [studySubjectByTopicId, setStudySubjectByTopicId] = useState<Record<string, string>>({});

  const [cards, setCards] = useState<DashboardCard[]>([]);

  const [loading, setLoading] = useState(true);

  // ==========================================================
  // CARREGAR DASHBOARD
  // ==========================================================

  const refreshDashboard = useCallback(async () => {
    setLoading(true);

    // ----------------------------------------------------------
    // FLASHCARDS + ESTATÍSTICAS + FILA
    // ----------------------------------------------------------

    try {
      const [statsResponse, queueResponse, cardsResponse] = await Promise.all([
        getStatsOverview(),
        getQueue(undefined, 50),
        listCards(),
      ]);

      console.log("[Theo Dashboard] stats:", statsResponse);

      console.log("[Theo Dashboard] cards:", cardsResponse);

      console.log("[Theo Dashboard] queue:", queueResponse);

      setStats(statsResponse);

      setQueue(queueResponse);

      const normalizedCards = (Array.isArray(cardsResponse)
        ? cardsResponse
        : []) as unknown as DashboardCard[];

      setCards(normalizedCards);
    } catch (error) {
      console.error("[Theo Dashboard] Erro carregando flashcards:", error);

      setCards([]);
    }

    // ----------------------------------------------------------
    // LOGS DE ESTUDO
    // ----------------------------------------------------------

    try {
      const logs = await listStudyLogs({});
      const allLogs = Array.isArray(logs) ? logs : [];

      // StudyLog não traz o nome da matéria diretamente. Ele possui apenas
      // exam_id + topic_id. Resolvemos a cadeia: topic_id -> subject_id -> name.
      // Os dados são carregados uma vez por edital e mantidos em memória,
      // evitando uma consulta por registro de estudo.
      const examIds = Array.from(
        new Set(allLogs.map((log) => String(log.exam_id ?? "").trim()).filter(Boolean)),
      );

      const subjectByTopicId: Record<string, string> = {};

      await Promise.all(
        examIds.map(async (examId) => {
          try {
            const [topics, subjects] = await Promise.all([
              listExamTopics(examId),
              listExamSubjects(examId),
            ]);

            const subjectNameById = new Map<string, string>();

            for (const subject of subjects) {
              if (typeof subject?.id !== "string") continue;

              const subjectName = typeof subject.name === "string" ? subject.name.trim() : "";

              if (subjectName) {
                subjectNameById.set(subject.id, subjectName);
              }
            }

            for (const topic of topics) {
              const subjectName = subjectNameById.get(topic.subject_id)?.trim();

              if (topic.id && subjectName) {
                subjectByTopicId[topic.id] = subjectName;
              }
            }
          } catch (taxonomyError) {
            // Um edital com metadados indisponíveis não deve impedir o Dashboard
            // de exibir os demais registros de estudo.
            console.error(
              `[Theo Dashboard] Erro carregando matérias do edital ${examId}:`,
              taxonomyError,
            );
          }
        }),
      );

      setStudySubjectByTopicId(subjectByTopicId);

      // Mantemos todos os registros para o agrupamento por matéria.
      // A lista de 7 dias continua sendo usada somente no gráfico diário
      // e nas atividades recentes.
      setAllStudyLogs(allLogs);

      const today = startOfLocalDay();

      const sevenDayStart = new Date(today);

      sevenDayStart.setDate(sevenDayStart.getDate() - 6);

      const filtered = logs
        .filter((log) => {
          const createdAt = parseStudyDate(log.created_at);

          if (!createdAt) {
            return false;
          }

          return createdAt >= sevenDayStart;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setStudyLogs(filtered);
    } catch (error) {
      console.error("[Theo Dashboard] Erro carregando logs:", error);

      setStudyLogs([]);
      setAllStudyLogs([]);
      setStudySubjectByTopicId({});
    }

    // ----------------------------------------------------------
    // RESUMO DO EDITAL
    // ----------------------------------------------------------

    try {
      const dashboardSummary = await getDashboardSummary();

      setSummary(dashboardSummary);
    } catch (error) {
      console.error("[Theo Dashboard] Erro carregando resumo:", error);

      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  // ==========================================================
  // SINCRONIZAÇÃO
  // ==========================================================

  useEffect(() => {
    function handleSyncFinished() {
      void refreshDashboard();
    }

    window.addEventListener("theo-sync-finished", handleSyncFinished);

    return () => {
      window.removeEventListener("theo-sync-finished", handleSyncFinished);
    };
  }, [refreshDashboard]);

  // ==========================================================
  // ESTATÍSTICAS REAIS DOS FLASHCARDS
  // ==========================================================

  const cardStats = useMemo(() => {
    const calculatedNew = cards.filter(isNewCard).length;

    const calculatedLearning = cards.filter(isLearningCard).length;

    const calculatedReview = cards.filter(isReviewCard).length;

    const total = cards.length;

    const apiNew = numberValue(stats?.new_cards);

    const apiLearning = numberValue(stats?.learning_cards);

    const apiReview = numberValue(stats?.review_cards);

    const newCards = calculatedNew > 0 ? calculatedNew : apiNew;

    const learningCards = calculatedLearning > 0 ? calculatedLearning : apiLearning;

    const reviewCards = calculatedReview > 0 ? calculatedReview : apiReview;

    const queueCount = numberValue(queue?.count);

    return {
      total,
      newCards,
      learningCards,
      reviewCards,
      queueCount,
    };
  }, [cards, stats, queue]);

  // ==========================================================
  // REVISÕES PROGRAMADAS
  //
  // Usa o due_at/due REAL de cada card.
  //
  // São exibidos:
  // Hoje
  // Amanhã
  // + próximos 5 dias
  //
  // Total = exatamente o número de cards programados
  // para aquele dia.
  // ==========================================================

  const scheduledReviews = useMemo(() => {
    const today = startOfLocalDay();

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);

      date.setDate(today.getDate() + index);

      return {
        date,
        key: getLocalDateKey(date),
        count: 0,
      };
    });

    const dayMap = new Map(days.map((day) => [day.key, day]));

    cards.forEach((card) => {
      const rawDue = card.due_at ?? card.due ?? null;

      if (!rawDue) {
        return;
      }

      const dueDate = parseStudyDate(String(rawDue));

      if (!dueDate) {
        return;
      }

      const localDueDate = startOfLocalDay(dueDate);

      const key = getLocalDateKey(localDueDate);

      const day = dayMap.get(key);

      if (day) {
        day.count += 1;
      }
    });

    return days;
  }, [cards]);

  // Maior quantidade para desenhar as barras.
  const maxScheduledReviews = useMemo(() => {
    return Math.max(...scheduledReviews.map((day) => day.count), 1);
  }, [scheduledReviews]);

  // ==========================================================
  // INDICADORES
  // ==========================================================

  const totalCards = cardStats.total > 0 ? cardStats.total : numberValue(stats?.total_cards);

  const newCards = cardStats.newCards;

  const learningCards = cardStats.learningCards;

  const reviewCards = cardStats.reviewCards;

  const retention = numberValue(stats?.retention_rate_pct);

  const streak = numberValue(stats?.current_streak_days);

  const reviewsToday = numberValue(stats?.reviews_today);

  const hour = new Date().getHours();

  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const memoryStatus =
    retention >= 90 ? "Excelente" : retention >= 75 ? "Boa" : retention >= 50 ? "Regular" : "Baixa";

  const studyLevel =
    totalCards === 0
      ? "Iniciante"
      : totalCards < 100
        ? "Fundação"
        : totalCards < 500
          ? "Em evolução"
          : totalCards < 1000
            ? "Avançado"
            : "Especialista";

  const motivation =
    streak >= 30
      ? "Seu hábito de estudo está consolidado."
      : streak >= 7
        ? "Você mantém uma boa frequência de estudos."
        : streak > 0
          ? "Continue criando consistência."
          : "Inicie uma nova sequência de estudos.";

  const reviewPriority = reviewCards > 50 ? "Alta" : reviewCards > 10 ? "Média" : "Baixa";

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div>
      <header
        className="
    dashboard-weather-header
    relative
    mb-10
    min-h-[230px]
    overflow-hidden
    rounded-[30px]
    border
    border-white/[0.07]
    bg-[#10140f]
    shadow-[0_24px_80px_rgba(0,0,0,.32)]
  "
      >
        <style>{`
    @keyframes theoWeatherGlow {
      0%, 100% {
        opacity: .16;
        transform: scale(.94) translate3d(0, 0, 0);
      }
      50% {
        opacity: .30;
        transform: scale(1.06) translate3d(-8px, 6px, 0);
      }
    }

    @keyframes theoWeatherLight {
      0%, 100% {
        opacity: .035;
        transform: translate3d(0, 0, 0);
      }
      50% {
        opacity: .09;
        transform: translate3d(18px, -10px, 0);
      }
    }

    @keyframes theoWeatherCloud {
      0%, 100% {
        transform: translate3d(0, 0, 0);
      }
      50% {
        transform: translate3d(-20px, 3px, 0);
      }
    }

    @keyframes theoWeatherDrop {
      0% {
        transform: translate3d(0, -35px, 0) rotate(14deg);
        opacity: 0;
      }

      12% {
        opacity: .42;
      }

      70% {
        opacity: .18;
      }

      100% {
        transform: translate3d(-38px, 235px, 0) rotate(14deg);
        opacity: 0;
      }
    }

    @keyframes theoWeatherSnow {
      0% {
        transform: translate3d(0, -15px, 0);
        opacity: 0;
      }

      15% {
        opacity: .48;
      }

      70% {
        opacity: .18;
      }

      100% {
        transform: translate3d(-26px, 225px, 0);
        opacity: 0;
      }
    }

    @keyframes theoWeatherParticle {
      0% {
        transform: translate3d(0, 8px, 0) scale(.75);
        opacity: 0;
      }

      25% {
        opacity: .28;
      }

      75% {
        opacity: .12;
      }

      100% {
        transform: translate3d(0, -32px, 0) scale(1);
        opacity: 0;
      }
    }

    .weather-glow {
      animation: theoWeatherGlow 8s ease-in-out infinite;
    }

    .weather-light {
      animation: theoWeatherLight 10s ease-in-out infinite;
    }

    .weather-cloud-layer {
      animation: theoWeatherCloud 14s ease-in-out infinite;
    }

    .weather-drop {
      animation: theoWeatherDrop 2.8s linear infinite;
    }

    .weather-snowflake {
      animation: theoWeatherSnow 4s ease-in infinite;
    }

    .weather-particle {
      animation: theoWeatherParticle 6s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .weather-glow,
      .weather-light,
      .weather-cloud-layer,
      .weather-drop,
      .weather-snowflake,
      .weather-particle {
        animation: none !important;
      }
    }
  `}</style>

        {/* =========================================================
      ATMOSFERA BASE
  ========================================================= */}

        <div
          className="
      pointer-events-none
      absolute
      inset-0
      bg-[radial-gradient(circle_at_85%_10%,rgba(167,201,87,.16),transparent_28%),radial-gradient(circle_at_5%_100%,rgba(255,255,255,.035),transparent_32%),linear-gradient(115deg,rgba(255,255,255,.018),transparent_42%)]
    "
        />

        {/* =========================================================
      BRILHO PRINCIPAL
  ========================================================= */}

        <div
          className="
      weather-glow
      pointer-events-none
      absolute
      -right-24
      -top-32
      h-80
      w-80
      rounded-full
      bg-accent/20
      blur-[90px]
    "
        />

        {/* =========================================================
      LUZ SECUNDÁRIA
  ========================================================= */}

        <div
          className="
      weather-light
      pointer-events-none
      absolute
      -bottom-32
      -left-20
      h-72
      w-72
      rounded-full
      bg-white/[0.045]
      blur-[90px]
    "
        />

        {/* =========================================================
      TEXTURA / PARTÍCULAS
  ========================================================= */}

        <div
          className="
      weather-particle
      pointer-events-none
      absolute
      left-[12%]
      top-[38%]
      h-1
      w-1
      rounded-full
      bg-white/25
    "
        />

        <div
          className="
      weather-particle
      pointer-events-none
      absolute
      left-[31%]
      top-[70%]
      h-1.5
      w-1.5
      rounded-full
      bg-white/15
      [animation-delay:1.5s]
    "
        />

        <div
          className="
      weather-particle
      pointer-events-none
      absolute
      left-[62%]
      top-[30%]
      h-1
      w-1
      rounded-full
      bg-accent/35
      [animation-delay:3s]
    "
        />

        <div
          className="
      weather-particle
      pointer-events-none
      absolute
      right-[14%]
      top-[66%]
      h-1
      w-1
      rounded-full
      bg-white/20
      [animation-delay:4.2s]
    "
        />

        {/* =========================================================
      REFLEXO SUPERIOR
  ========================================================= */}

        <div
          className="
      pointer-events-none
      absolute
      inset-x-0
      top-0
      h-px
      bg-gradient-to-r
      from-transparent
      via-white/[0.10]
      to-transparent
    "
        />

        {/* =========================================================
      BORDA INTERNA
  ========================================================= */}

        <div
          className="
      pointer-events-none
      absolute
      inset-[1px]
      rounded-[29px]
      border
      border-white/[0.025]
    "
        />

        {/* =========================================================
      CONTEÚDO
  ========================================================= */}

        <div
          className="
      relative
      z-10
      flex
      min-h-[230px]
      flex-col
      justify-center
      px-7
      py-8
      md:px-9
    "
        >
          {/* Saudação */}

          <div className="max-w-2xl">
            <p
              className="
          mb-2
          text-[11px]
          font-semibold
          uppercase
          tracking-[0.18em]
          text-text-muted/70
        "
            >
              Seu espaço de estudos
            </p>

            <h1
              className="
          font-display
          text-3xl
          font-bold
          tracking-[-0.025em]
          text-text
          sm:text-4xl
        "
            >
              {greeting}, <span className="text-accent-bright">{user?.first_name}</span>
            </h1>

            <p
              className="
          mt-3
          max-w-[680px]
          text-sm
          leading-6
          text-text-muted
          sm:text-[15px]
        "
            >
              {motivation} Seu nível atual é{" "}
              <strong className="font-semibold text-text">{studyLevel}</strong>. Sua retenção está
              em{" "}
              <strong className="font-semibold text-accent-bright">{retention.toFixed(1)}%</strong>{" "}
              ({memoryStatus}).
            </p>
          </div>

          {/* =======================================================
        WEATHER
    ======================================================= */}

          <div
            className="
        mt-7
        flex
        w-fit
        items-center
        rounded-2xl
        border
        border-white/[0.06]
        bg-black/[0.16]
        px-4
        py-3
        shadow-[inset_0_1px_0_rgba(255,255,255,.025)]
        backdrop-blur-md
      "
          >
            <WeatherWidget />
          </div>
        </div>

        {/* =========================================================
      GRADIENTE INFERIOR
  ========================================================= */}

        <div
          className="
      pointer-events-none
      absolute
      inset-x-0
      bottom-0
      h-24
      bg-gradient-to-t
      from-black/20
      via-black/[0.04]
      to-transparent
    "
        />

        {/* =========================================================
      VINHETA LATERAL
  ========================================================= */}

        <div
          className="
      pointer-events-none
      absolute
      inset-y-0
      right-0
      w-1/3
      bg-gradient-to-l
      from-accent/[0.025]
      to-transparent
    "
        />
      </header>

      {/* ======================================================
          LOADING
      ====================================================== */}

      {loading ? (
        <div
          className="
            flex
            justify-center
            py-20
            text-text-muted
          "
        >
          <Spinner />
        </div>
      ) : (
        <>
          {/* ==================================================
              FLASHCARDS
          ================================================== */}

          <div
            className="
              grid
              grid-cols-1
              gap-5
              md:grid-cols-3
            "
          >
            {/* TOTAL */}

            <Panel
              className="
                relative
                overflow-hidden
                md:col-span-2
              "
            >
              <div
                className="
                  absolute
                  right-0
                  top-0
                  h-40
                  w-40
                  rounded-full
                  bg-accent/10
                  blur-3xl
                "
              />

              <div className="relative">
                <p className="text-sm text-text-muted">Seus flashcards</p>

                <p
                  className="
                    mt-2
                    font-display
                    text-5xl
                    font-bold
                    text-text
                  "
                >
                  {totalCards}
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    text-text-muted
                  "
                >
                  Prioridade de revisão:
                  <span
                    className="
                      ml-1
                      text-accent-bright
                    "
                  >
                    {reviewPriority}
                  </span>
                </p>

                <div
                  className="
                    mt-6
                    grid
                    grid-cols-3
                    gap-3
                  "
                >
                  <MiniStat label="Novas" value={newCards} />

                  <MiniStat label="Aprendendo" value={learningCards} />

                  <MiniStat label="Revisão" value={reviewCards} />
                </div>

                <Link to="/study">
                  <Button className="mt-6">Iniciar estudo</Button>
                </Link>
              </div>
            </Panel>

            {/* SEQUÊNCIA */}

            <Panel>
              <div
                className="
                  flex
                  items-center
                  gap-3
                "
              >
                <div
                  className="
                    flex
                    h-12
                    w-12
                    items-center
                    justify-center
                    rounded-xl
                    bg-streak/15
                    text-streak
                  "
                >
                  <Flame size={24} />
                </div>

                <div>
                  <p className="text-xs text-text-muted">Sequência atual</p>

                  <p className="font-mono text-2xl">
                    {streak}

                    <span
                      className="
                        ml-1
                        text-sm
                        text-text-muted
                      "
                    >
                      dias
                    </span>
                  </p>
                </div>
              </div>
            </Panel>

            {/* BASE */}

            <StatCard icon={<Target size={20} />} label="Base de conhecimento" value={totalCards} />

            {/* MEMÓRIA */}

            <StatCard
              icon={<TrendingUp size={20} />}
              label="Memória"
              value={`${retention.toFixed(1)}%`}
            />

            {/* RITMO */}

            <StatCard
              icon={<Sparkles size={20} />}
              label="Ritmo diário"
              value={reviewsToday > 0 ? `${reviewsToday} revisões` : "Sem revisões"}
            />
          </div>

          {/* ==================================================
              REVISÕES PROGRAMADAS
          ================================================== */}

          <div className="mt-8">
            <div
              className="
                mb-4
                flex
                items-center
                justify-between
                gap-4
              "
            >
              <div>
                <div className="flex items-center gap-2">
                  <AlarmClockCheck
                    className="
                      h-4
                      w-4
                      text-accent-bright
                    "
                  />

                  <h2
                    className="
                      font-display
                      text-lg
                      text-text
                    "
                  >
                    Revisões programadas
                  </h2>
                </div>

                <p
                  className="
                    mt-1
                    text-xs
                    text-text-muted
                  "
                >
                  Próximas revisões previstas para os próximos dias
                </p>
              </div>

              <Link
                to="/study"
                className="
                  hidden
                  rounded-lg
                  border
                  border-white/10
                  bg-white/[0.03]
                  px-3
                  py-2
                  text-xs
                  font-medium
                  text-text-muted
                  transition
                  hover:border-accent/20
                  hover:bg-accent/10
                  hover:text-accent-bright
                  sm:block
                "
              >
                Estudar
              </Link>
            </div>

            <Panel>
              {scheduledReviews.some((item) => item.count > 0) ? (
                <div
                  className="
                    grid
                    grid-cols-2
                    gap-3
                    sm:grid-cols-4
                    lg:grid-cols-7
                  "
                >
                  {scheduledReviews.map((item, index) => {
                    const today = startOfLocalDay();

                    const isToday = index === 0;

                    const isTomorrow = index === 1;

                    const hasReviews = item.count > 0;

                    const percentage = hasReviews
                      ? Math.max((item.count / maxScheduledReviews) * 100, 8)
                      : 0;

                    return (
                      <Link
                        key={item.key}
                        to="/study"
                        className={`
                            group
                            relative
                            overflow-hidden
                            rounded-2xl
                            border
                            p-4
                            transition-all
                            duration-200
                            ${
                              isToday
                                ? "border-accent/30 bg-accent/10"
                                : hasReviews
                                  ? "border-white/[0.07] bg-white/[0.025] hover:border-accent/20 hover:bg-white/[0.05]"
                                  : "border-white/[0.05] bg-white/[0.015]"
                            }
                          `}
                      >
                        {isToday && (
                          <div
                            className="
                                absolute
                                right-0
                                top-0
                                h-16
                                w-16
                                rounded-full
                                bg-accent/20
                                blur-2xl
                              "
                          />
                        )}

                        <div className="relative">
                          <div
                            className="
                                flex
                                items-center
                                justify-between
                                gap-2
                              "
                          >
                            <p
                              className={`
                                  text-xs
                                  font-medium
                                  ${isToday ? "text-accent-bright" : "text-text-muted"}
                                `}
                            >
                              {getScheduledReviewLabel(item.date, today)}
                            </p>

                            {isToday && (
                              <span
                                className="
                                    rounded-full
                                    border
                                    border-accent/20
                                    bg-accent/10
                                    px-1.5
                                    py-0.5
                                    text-[9px]
                                    font-semibold
                                    uppercase
                                    tracking-wide
                                    text-accent-bright
                                  "
                              >
                                Hoje
                              </span>
                            )}

                            {isTomorrow && !isToday && (
                              <span
                                className="
                                      rounded-full
                                      border
                                      border-white/10
                                      bg-white/[0.04]
                                      px-1.5
                                      py-0.5
                                      text-[9px]
                                      font-medium
                                      text-text-muted
                                    "
                              >
                                Próximo
                              </span>
                            )}
                          </div>

                          <p
                            className={`
                                mt-3
                                font-mono
                                text-3xl
                                font-bold
                                ${
                                  hasReviews
                                    ? isToday
                                      ? "text-accent-bright"
                                      : "text-text"
                                    : "text-text-muted/40"
                                }
                              `}
                          >
                            {item.count}
                          </p>

                          <p
                            className="
                                mt-1
                                text-[11px]
                                text-text-muted
                              "
                          >
                            {item.count === 1 ? "revisão" : "revisões"}
                          </p>

                          <div
                            className="
                                mt-4
                                h-1
                                overflow-hidden
                                rounded-full
                                bg-white/[0.05]
                              "
                          >
                            <div
                              className={`
                                  h-full
                                  rounded-full
                                  transition-all
                                  duration-500
                                  ${
                                    hasReviews
                                      ? isToday
                                        ? "bg-accent"
                                        : "bg-accent/60"
                                      : "bg-transparent"
                                  }
                                `}
                              style={{
                                width: `${percentage}%`,
                              }}
                            />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="
                    flex
                    flex-col
                    items-center
                    justify-center
                    rounded-2xl
                    border
                    border-dashed
                    border-white/[0.08]
                    bg-white/[0.02]
                    px-6
                    py-10
                    text-center
                  "
                >
                  <div
                    className="
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center
                      rounded-2xl
                      border
                      border-accent/15
                      bg-accent/10
                      text-accent
                    "
                  >
                    <CalendarClock size={22} strokeWidth={1.7} />
                  </div>

                  <p
                    className="
                      mt-4
                      text-sm
                      font-semibold
                      text-text
                    "
                  >
                    Nenhuma revisão programada
                  </p>

                  <p
                    className="
                      mt-1
                      max-w-sm
                      text-xs
                      leading-5
                      text-text-muted
                    "
                  >
                    Não há revisões agendadas para os próximos 7 dias.
                  </p>
                </div>
              )}
            </Panel>
          </div>

          {/* ==================================================
              EDITAL
          ================================================== */}

          {summary &&
            (summary.today.minutes_studied > 0 ||
              summary.reviews_pending > 0 ||
              summary.diagnosis.weakest_subject) && (
              <div className="mt-8">
                <div
                  className="
                    mb-3
                    flex
                    items-center
                    gap-2
                  "
                >
                  <CalendarClock
                    className="
                      h-4
                      w-4
                      text-text-muted
                    "
                  />

                  <h2
                    className="
                      font-display
                      text-lg
                      text-text
                    "
                  >
                    Seu edital hoje
                  </h2>
                </div>

                <div
                  className="
                    grid
                    grid-cols-2
                    gap-4
                    md:grid-cols-4
                  "
                >
                  <Panel>
                    <p className="text-xs text-text-muted">Estudado hoje</p>

                    <p
                      className="
                        mt-1
                        font-mono
                        text-2xl
                        text-text
                      "
                    >
                      {summary.today.minutes_studied}
                      min
                    </p>
                  </Panel>

                  <Panel>
                    <p className="text-xs text-text-muted">Questões hoje</p>

                    <p
                      className="
                        mt-1
                        font-mono
                        text-2xl
                        text-text
                      "
                    >
                      {summary.today.questions_correct}/{summary.today.questions_total}
                    </p>
                  </Panel>

                  <Panel>
                    <p className="text-xs text-text-muted">Revisões pendentes</p>

                    <p
                      className="
                        mt-1
                        font-mono
                        text-2xl
                        text-text
                      "
                    >
                      {summary.reviews_pending}
                    </p>
                  </Panel>

                  <Panel>
                    <div
                      className="
                        flex
                        items-center
                        gap-2
                        text-text-muted
                      "
                    >
                      <Flame className="h-3.5 w-3.5" />

                      <p className="text-xs">Sequência</p>
                    </div>

                    <p
                      className="
                        mt-1
                        font-mono
                        text-2xl
                        text-text
                      "
                    >
                      {summary.streak_days} dias
                    </p>
                  </Panel>
                </div>

                {(summary.diagnosis.weakest_subject || summary.next_review) && (
                  <div
                    className="
                      mt-4
                      grid
                      gap-4
                      md:grid-cols-2
                    "
                  >
                    {summary.diagnosis.weakest_subject && (
                      <Panel>
                        <div
                          className="
                            mb-2
                            flex
                            items-center
                            gap-2
                            text-text-muted
                          "
                        >
                          <AlarmClockCheck className="h-4 w-4" />

                          <p className="text-sm">Diagnóstico</p>
                        </div>

                        <p className="text-sm text-text">
                          Ponto fraco:{" "}
                          <strong className="text-again">
                            {summary.diagnosis.weakest_subject.name}
                          </strong>{" "}
                          ({Math.round(summary.diagnosis.weakest_subject.accuracy * 100)}% de
                          acerto)
                        </p>

                        {summary.diagnosis.strongest_subject && (
                          <p
                            className="
                              mt-1
                              text-sm
                              text-text-muted
                            "
                          >
                            Ponto forte: {summary.diagnosis.strongest_subject.name} (
                            {Math.round(summary.diagnosis.strongest_subject.accuracy * 100)}
                            %)
                          </p>
                        )}
                      </Panel>
                    )}

                    {summary.next_review && (
                      <Panel>
                        <p
                          className="
                            mb-2
                            text-sm
                            text-text-muted
                          "
                        >
                          Próxima revisão
                        </p>

                        <p className="text-sm text-text">{summary.next_review.topic_title}</p>

                        <p
                          className="
                            mt-1
                            text-xs
                            text-text-muted
                          "
                        >
                          agendada para {formatDate(summary.next_review.scheduled_date)}
                        </p>
                      </Panel>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* ==================================================
              ÚLTIMOS 7 DIAS
          ================================================== */}

          <div className="mt-8">
            <div className="mb-4">
              <h2
                className="
                  font-display
                  text-lg
                  text-text
                "
              >
                Últimos 7 dias
              </h2>

              <p
                className="
                  mt-1
                  text-xs
                  text-text-muted
                "
              >
                Tempo de estudo por dia — calendário local
              </p>
            </div>

            <StudyChart studyLogs={studyLogs} />
          </div>

          {/* ==================================================
              TEMPO DE ESTUDO POR MATÉRIA
          ================================================== */}

          <div className="mt-8">
            <div className="mb-4">
              <h2 className="font-display text-lg text-text">Tempo de estudo por matéria</h2>
              <p className="mt-1 text-xs text-text-muted">
                Tempo acumulado por matéria usando a duração real de cada sessão.
              </p>
            </div>

            <SubjectStudyChart studyLogs={allStudyLogs} subjectByTopicId={studySubjectByTopicId} />
          </div>

          {/* ==================================================
              ATIVIDADES
          ================================================== */}

          {studyLogs.length > 0 && (
            <div className="mt-8">
              <div
                className="
                  mb-4
                  flex
                  items-center
                  gap-2
                "
              >
                <Activity
                  className="
                    h-4
                    w-4
                    text-text-muted
                  "
                />

                <h2
                  className="
                    font-display
                    text-lg
                    text-text
                  "
                >
                  Atividades recentes
                </h2>
              </div>

              <RecentActivities logs={studyLogs.slice(0, 10)} />
            </div>
          )}

          {/* ==================================================
              SEM REVISÕES
          ================================================== */}

          {queue?.count === 0 && (
            <div
              className="
                mt-12
                flex
                flex-col
                items-center
              "
            >
              <h3
                className="
                  mt-6
                  font-display
                  text-2xl
                  font-semibold
                "
              >
                Revisões concluídas
              </h3>

              <p
                className="
                  mt-2
                  max-w-md
                  text-center
                  text-sm
                  text-text-muted
                "
              >
                Todas as cartas disponíveis foram revisadas. Você pode criar novos decks para
                continuar aumentando sua base de conhecimento.
              </p>

              <Link
                to="/decks"
                className="
                  mt-8
                  rounded-xl
                  bg-accent
                  px-6
                  py-3
                  font-medium
                  text-white
                  transition
                  hover:scale-105
                "
              >
                Criar deck
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// DATA
// ============================================================

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");

  return `${d}/${m}/${y}`;
}

// ============================================================
// MINI STAT
// ============================================================

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="
        rounded-xl
        bg-white/5
        p-3
        transition
        hover:bg-white/10
      "
    >
      <p className="text-xs text-text-muted">{label}</p>

      <p
        className="
          mt-1
          text-xl
          font-semibold
          text-text
        "
      >
        {value}
      </p>
    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Panel>
      <div
        className="
          flex
          items-center
          gap-3
        "
      >
        <div
          className="
            flex
            h-10
            w-10
            items-center
            justify-center
            rounded-xl
            bg-white/5
            text-accent-bright
          "
        >
          {icon}
        </div>

        <div>
          <p className="text-xs text-text-muted">{label}</p>

          <p
            className="
              mt-1
              font-mono
              text-2xl
              font-semibold
              text-text
            "
          >
            {value}
          </p>
        </div>
      </div>
    </Panel>
  );
}

// ============================================================
// STUDY CHART
// ============================================================

function StudyChart({ studyLogs }: { studyLogs: StudyLog[] }) {
  const today = startOfLocalDay();

  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);

    date.setDate(today.getDate() - (6 - index));

    return {
      date,
      key: getLocalDateKey(date),
      minutes: 0,
    };
  });

  const dayMap = new Map(chartDays.map((day) => [day.key, day]));

  studyLogs.forEach((log) => {
    const createdAt = parseStudyDate(log.created_at);

    if (!createdAt) {
      return;
    }

    const localDateKey = getLocalDateKey(createdAt);

    const day = dayMap.get(localDateKey);

    if (!day) {
      return;
    }

    day.minutes += numberValue(log.minutes);
  });

  const maxStudyMinutes = Math.max(...chartDays.map((item) => item.minutes), 0);

  const scaleMaxMinutes = getChartScaleMax(maxStudyMinutes);

  const tickStep = getChartTickStep(scaleMaxMinutes);

  const tickValues: number[] = [];

  for (let value = scaleMaxMinutes; value >= 0; value -= tickStep) {
    tickValues.push(value);
  }

  if (tickValues[tickValues.length - 1] !== 0) {
    tickValues.push(0);
  }

  const totalMinutes = chartDays.reduce((total, item) => total + item.minutes, 0);

  const averageMinutes = chartDays.length > 0 ? Math.round(totalMinutes / chartDays.length) : 0;

  return (
    <Panel>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div
            className="
              flex
              h-44
              w-14
              shrink-0
              flex-col
              justify-between
              py-0.5
              text-right
              text-[10px]
              text-text-muted
            "
          >
            {tickValues.map((value) => (
              <span key={value}>{formatChartTick(value)}</span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-44">
              <div
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  flex
                  flex-col
                  justify-between
                "
              >
                {tickValues.map((value) => (
                  <div
                    key={value}
                    className="
                        border-t
                        border-white/[0.06]
                      "
                  />
                ))}
              </div>

              <div
                className="
                  relative
                  z-10
                  flex
                  h-full
                  items-end
                  gap-2
                "
              >
                {chartDays.map((item) => {
                  const percentage =
                    scaleMaxMinutes > 0 ? (item.minutes / scaleMaxMinutes) * 100 : 0;

                  const hasStudy = item.minutes > 0;

                  const isToday = item.key === getLocalDateKey(today);

                  return (
                    <div
                      key={item.key}
                      className="
                          flex
                          h-full
                          min-w-0
                          flex-1
                          items-end
                          justify-center
                        "
                    >
                      <div
                        className={`
                            w-3/4
                            min-w-[10px]
                            max-w-12
                            rounded-t-lg
                            transition-all
                            duration-300
                            ${
                              hasStudy
                                ? isToday
                                  ? "bg-accent"
                                  : "bg-accent/70"
                                : "bg-white/[0.04]"
                            }
                            ${hasStudy ? "hover:bg-accent-bright" : ""}
                          `}
                        style={{
                          height: hasStudy ? `${Math.max(percentage, 4)}%` : "2px",
                        }}
                        title={`${formatFullDate(item.date)} — ${formatStudyDuration(
                          item.minutes,
                        )}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              {chartDays.map((item) => {
                const isToday = item.key === getLocalDateKey(today);

                return (
                  <div
                    key={item.key}
                    className="
                        min-w-0
                        flex-1
                        text-center
                      "
                  >
                    <p
                      className={`
                          truncate
                          text-[11px]
                          font-semibold
                          ${isToday ? "text-accent-bright" : "text-text"}
                        `}
                    >
                      {isToday ? "Hoje" : formatWeekday(item.date)}
                    </p>

                    <p
                      className="
                          mt-0.5
                          text-[10px]
                          text-text-muted
                        "
                    >
                      {formatShortDate(item.date)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="
            grid
            grid-cols-1
            gap-3
            border-t
            border-white/10
            pt-3
            sm:grid-cols-3
          "
        >
          <div>
            <p
              className="
                text-[10px]
                uppercase
                tracking-wide
                text-text-muted
              "
            >
              Hoje
            </p>

            <p
              className="
                mt-1
                font-mono
                text-sm
                font-semibold
                text-text
              "
            >
              {formatStudyDuration(chartDays[6]?.minutes ?? 0)}
            </p>
          </div>

          <div>
            <p
              className="
                text-[10px]
                uppercase
                tracking-wide
                text-text-muted
              "
            >
              Total
            </p>

            <p
              className="
                mt-1
                font-mono
                text-sm
                font-semibold
                text-text
              "
            >
              {formatStudyDuration(totalMinutes)}
            </p>
          </div>

          <div>
            <p
              className="
                text-[10px]
                uppercase
                tracking-wide
                text-text-muted
              "
            >
              Média/dia
            </p>

            <p
              className="
                mt-1
                font-mono
                text-sm
                font-semibold
                text-text
              "
            >
              {formatStudyDuration(averageMinutes)}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ============================================================
// TEMPO DE ESTUDO POR MATÉRIA
// ============================================================

function getStudySubject(log: StudyLog, subjectByTopicId: Record<string, string>): string {
  // Fonte oficial: StudyLog.topic_id -> ExamTopic.subject_id -> ExamSubject.name.
  const resolvedSubject = subjectByTopicId[log.topic_id]?.trim();

  if (resolvedSubject) {
    return resolvedSubject;
  }

  // Compatibilidade com registros antigos/formatos enriquecidos que possam
  // eventualmente trazer o nome diretamente no objeto.
  const item = log as StudyLog & {
    subject_name?: unknown;
    subject?: unknown;
    materia?: unknown;
    materia_name?: unknown;
    discipline_name?: unknown;
    discipline?: unknown;
    subject_title?: unknown;
    topic_title?: unknown;
    topic?: unknown;
  };

  const candidates = [
    item.subject_name,
    item.subject,
    item.materia,
    item.materia_name,
    item.discipline_name,
    item.discipline,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Matéria não encontrada";
}

type SubjectStudyData = {
  subject: string;
  minutes: number;
  percentage: number;
};

function buildSubjectStudyData(
  studyLogs: StudyLog[],
  subjectByTopicId: Record<string, string>,
): SubjectStudyData[] {
  const subjectMap = new Map<string, number>();

  for (const log of studyLogs) {
    const minutes = Math.max(0, numberValue(log.minutes));

    if (minutes <= 0) continue;

    const subject = getStudySubject(log, subjectByTopicId);
    subjectMap.set(subject, (subjectMap.get(subject) ?? 0) + minutes);
  }

  const sorted = Array.from(subjectMap.entries())
    .map(([subject, minutes]) => ({ subject, minutes, percentage: 0 }))
    .sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = sorted.reduce((sum, item) => sum + item.minutes, 0);
  if (totalMinutes <= 0) return [];

  const maxVisible = 8;
  const visible = sorted.slice(0, maxVisible);
  const others = sorted.slice(maxVisible).reduce((sum, item) => sum + item.minutes, 0);

  if (others > 0) {
    visible.push({ subject: "Outras", minutes: others, percentage: 0 });
  }

  return visible.map((item) => ({
    ...item,
    percentage: (item.minutes / totalMinutes) * 100,
  }));
}

function SubjectStudyChart({
  studyLogs,
  subjectByTopicId,
}: {
  studyLogs: StudyLog[];
  subjectByTopicId: Record<string, string>;
}) {
  const data = buildSubjectStudyData(studyLogs, subjectByTopicId);
  const totalMinutes = data.reduce((sum, item) => sum + item.minutes, 0);
  const colors = [
    "#38bdf8",
    "#34d399",
    "#fbbf24",
    "#a78bfa",
    "#fb7185",
    "#22d3ee",
    "#e879f9",
    "#fb923c",
    "#a3e635",
  ];

  return (
    <Panel>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock3 size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-semibold text-text">
            Nenhum tempo por matéria registrado
          </p>
          <p className="mt-1 max-w-md text-xs leading-5 text-text-muted">
            As sessões precisam ter duração e matéria associadas para aparecerem neste gráfico.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="relative mx-auto h-64 w-64 shrink-0 sm:h-72 sm:w-72">
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `conic-gradient(${data
                  .map((item, index) => {
                    const start = data
                      .slice(0, index)
                      .reduce((sum, previous) => sum + previous.percentage, 0);
                    const end = start + item.percentage;
                    return `${colors[index % colors.length]} ${start}% ${end}%`;
                  })
                  .join(", ")})`,
              }}
            />
            <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-[#111318] text-center shadow-inner">
              <span className="text-[10px] uppercase tracking-widest text-text-muted">
                Tempo total
              </span>
              <span className="mt-1 font-mono text-2xl font-semibold text-text">
                {formatStudyDuration(totalMinutes * 60)}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-xs text-text-muted">Distribuição por matéria</p>
              <span className="text-xs text-text-muted">{data.length} matérias</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.map((item, index) => (
                <div
                  key={item.subject}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                      aria-hidden="true"
                    />
                    <p className="truncate text-sm font-medium text-text" title={item.subject}>
                      {item.subject}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold text-text">
                      {formatStudyDuration(item.minutes * 60)}
                    </p>
                    <p className="text-[11px] text-text-muted">{item.percentage.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ============================================================
// RECENT ACTIVITIES
// ============================================================

function RecentActivities({ logs }: { logs: StudyLog[] }) {
  type ActivityCategory = "teoria" | "revisao" | "questoes" | "videoaula" | "leitura";

  type CategoryConfig = {
    label: string;
    icon: typeof BookOpen;
    color: string;
    iconColor: string;
    bg: string;
    border: string;
  };

  const categoryConfig: Record<ActivityCategory, CategoryConfig> = {
    teoria: {
      label: "Teoria",
      icon: BookOpen,
      color: "text-blue-300",
      iconColor: "text-blue-300",
      bg: "bg-blue-400/10",
      border: "border-blue-400/10",
    },

    revisao: {
      label: "Revisão",
      icon: RotateCcw,
      color: "text-emerald-300",
      iconColor: "text-emerald-300",
      bg: "bg-emerald-400/10",
      border: "border-emerald-400/10",
    },

    questoes: {
      label: "Questões",
      icon: CircleHelp,
      color: "text-amber-300",
      iconColor: "text-amber-300",
      bg: "bg-amber-400/10",
      border: "border-amber-400/10",
    },

    videoaula: {
      label: "Videoaula",
      icon: Video,
      color: "text-purple-300",
      iconColor: "text-purple-300",
      bg: "bg-purple-400/10",
      border: "border-purple-400/10",
    },

    leitura: {
      label: "Leitura",
      icon: BookText,
      color: "text-cyan-300",
      iconColor: "text-cyan-300",
      bg: "bg-cyan-400/10",
      border: "border-cyan-400/10",
    },
  };

  const fallbackCategory: CategoryConfig = {
    label: "Atividade",
    icon: FileText,
    color: "text-text",
    iconColor: "text-text-muted",
    bg: "bg-white/[0.05]",
    border: "border-white/[0.08]",
  };

  function getCategoryConfig(category: string): CategoryConfig {
    if (category in categoryConfig) {
      return categoryConfig[category as ActivityCategory];
    }

    return {
      ...fallbackCategory,
      label: category || fallbackCategory.label,
    };
  }

  function getAccuracy(log: StudyLog): number | null {
    const total = log.questions_total;

    const correct = log.questions_correct;

    if (
      total === null ||
      total === undefined ||
      total <= 0 ||
      correct === null ||
      correct === undefined
    ) {
      return null;
    }

    return Math.round((correct / total) * 100);
  }

  function getAccuracyColor(accuracy: number): string {
    if (accuracy >= 80) {
      return "text-emerald-400";
    }

    if (accuracy >= 60) {
      return "text-amber-400";
    }

    return "text-red-400";
  }

  function getAccuracyBarColor(accuracy: number): string {
    if (accuracy >= 80) {
      return "bg-emerald-400";
    }

    if (accuracy >= 60) {
      return "bg-amber-400";
    }

    return "bg-red-400";
  }

  return (
    <Panel>
      <div className="space-y-4">
        {logs.length === 0 ? (
          <div
            className="
              relative
              flex
              flex-col
              items-center
              justify-center
              overflow-hidden
              rounded-2xl
              border
              border-dashed
              border-white/[0.08]
              bg-white/[0.02]
              px-6
              py-12
              text-center
            "
          >
            <div
              className="
                absolute
                inset-0
                bg-[radial-gradient(circle_at_center,rgba(143,166,107,0.08),transparent_60%)]
              "
            />

            <div
              className="
                relative
                mb-4
                flex
                h-14
                w-14
                items-center
                justify-center
                rounded-2xl
                border
                border-accent/15
                bg-accent/10
                text-accent
              "
            >
              <Target size={25} strokeWidth={1.7} />
            </div>

            <p
              className="
                relative
                text-sm
                font-semibold
                text-text
              "
            >
              Nenhuma missão registrada
            </p>

            <p
              className="
                relative
                mt-1.5
                max-w-sm
                text-xs
                leading-5
                text-text-muted
              "
            >
              Suas sessões de estudo aparecerão aqui conforme você avançar.
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const config = getCategoryConfig(log.category);

            const Icon = config.icon;

            const accuracy = getAccuracy(log);

            const duration = formatStudyDuration(numberValue(log.minutes));

            const hasQuestions =
              log.questions_total !== null &&
              log.questions_total !== undefined &&
              log.questions_total > 0;

            const hasCorrectAnswers =
              log.questions_correct !== null && log.questions_correct !== undefined;

            return (
              <div
                key={log.id}
                className="
                  group
                  relative
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/[0.06]
                  bg-white/[0.025]
                  p-4
                  transition-all
                  duration-200
                  hover:border-accent/15
                  hover:bg-white/[0.04]
                "
                title={formatDateTime(log.created_at)}
              >
                <div
                  className="
                    absolute
                    inset-y-3
                    left-0
                    w-0.5
                    rounded-r-full
                    bg-accent/50
                    opacity-0
                    transition-opacity
                    duration-200
                    group-hover:opacity-100
                  "
                />

                <div className="flex items-center gap-3.5">
                  <div
                    className={`
                      flex
                      h-11
                      w-11
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      border
                      ${config.border}
                      ${config.bg}
                    `}
                  >
                    <Icon size={19} strokeWidth={1.8} className={config.iconColor} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`
                          truncate
                          text-sm
                          font-semibold
                          ${config.color}
                        `}
                      >
                        {config.label}
                      </p>

                      {hasQuestions && (
                        <span
                          className="
                            hidden
                            rounded-md
                            border
                            border-white/[0.06]
                            bg-white/[0.035]
                            px-1.5
                            py-0.5
                            text-[9px]
                            font-medium
                            uppercase
                            tracking-[0.08em]
                            text-text-muted
                            sm:inline-flex
                          "
                        >
                          Questões
                        </span>
                      )}
                    </div>

                    <div
                      className="
                        mt-1.5
                        flex
                        flex-wrap
                        items-center
                        gap-x-2
                        gap-y-1
                        text-[11px]
                        text-text-muted
                      "
                    >
                      <span>{formatActivityDate(log.created_at)}</span>

                      <span className="text-white/15">•</span>

                      <span>{formatTime(log.created_at)}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className="
                        flex
                        items-center
                        justify-end
                        gap-1.5
                      "
                    >
                      <Clock3 size={12} strokeWidth={1.8} className="text-accent/70" />

                      <span
                        className="
                          font-mono
                          text-sm
                          font-semibold
                          tracking-tight
                          text-accent
                        "
                      >
                        {duration}
                      </span>
                    </div>

                    {hasQuestions && hasCorrectAnswers && (
                      <div
                        className="
                            mt-1.5
                            flex
                            items-center
                            justify-end
                            gap-1.5
                          "
                      >
                        <span
                          className="
                              text-[11px]
                              font-medium
                              text-text-muted
                            "
                        >
                          {log.questions_correct}/{log.questions_total}
                        </span>

                        {accuracy !== null && (
                          <span
                            className={`
                                text-[10px]
                                font-semibold
                                ${getAccuracyColor(accuracy)}
                              `}
                          >
                            {accuracy}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {accuracy !== null && (
                  <div className="mt-4">
                    <div
                      className="
                        mb-1.5
                        flex
                        items-center
                        justify-between
                      "
                    >
                      <span
                        className="
                          text-[10px]
                          font-medium
                          uppercase
                          tracking-[0.08em]
                          text-text-muted/70
                        "
                      >
                        Aproveitamento
                      </span>

                      <span
                        className={`
                          text-[10px]
                          font-semibold
                          ${getAccuracyColor(accuracy)}
                        `}
                      >
                        {accuracy}%
                      </span>
                    </div>

                    <div
                      className="
                        h-1
                        overflow-hidden
                        rounded-full
                        bg-white/[0.05]
                      "
                    >
                      <div
                        className={`
                          h-full
                          rounded-full
                          transition-all
                          duration-500
                          ${getAccuracyBarColor(accuracy)}
                        `}
                        style={{
                          width: `${Math.min(Math.max(accuracy, 0), 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
