import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { useParams } from "react-router-dom";

import {
  AlarmClockCheck,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Flame,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";

import {
  Badge,
  Button,
  ErrorBanner,
  Input,
  Label,
  Panel,
  Spinner,
  Textarea,
} from "../components/ui";

import {
  createExamSubject,
  createExamTopic,
  createManualScheduleEntry,
  createStudyLog,
  deleteExamSubject,
  deleteExamTopic,
  extractErrorMessage,
  generateDeadlineSchedule,
  getContinuousSchedule,
  getDueReviews,
  getExam,
  getExamStats,
  getTopicsWithMarkers,
  listExamSubjects,
  listManualSchedule,
  skipReview,
} from "../lib/api";

import type {
  ContinuousCycleItem,
  ContinuousWeeklyDay,
  DueReview,
  Exam,
  ExamStats,
  ExamSubject,
  ManualScheduleEntry,
  StudyCategory,
  TopicMarker,
} from "../lib/types";

// ============================================================
// CONSTANTES
// ============================================================

const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ============================================================
// HELPERS
// ============================================================

function fmt(iso: string | null | undefined) {
  if (!iso) return "";

  const [year, month, day] = iso.split("-");

  if (!year || !month || !day) {
    return iso;
  }

  return `${day}/${month}`;
}

function focusFirstField(container: HTMLElement | null) {
  if (!container) return;

  const field = container.querySelector<HTMLElement>(
    'input:not([type="checkbox"]):not([type="hidden"]), textarea, select',
  );

  field?.focus();
}

function safeTopicArray(value: unknown): TopicMarker[] {
  return Array.isArray(value) ? value : [];
}

function safeSubjectArray(value: unknown): ExamSubject[] {
  return Array.isArray(value) ? value : [];
}

function safeDueArray(value: unknown): DueReview[] {
  return Array.isArray(value) ? value : [];
}

// ============================================================
// NUMERAÇÃO DOS TÓPICOS
// ============================================================

function parseTopicNumber(number: string): number[] {
  return String(number ?? "")
    .trim()
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function compareTopicNumbers(a: string, b: string): number {
  const partsA = parseTopicNumber(a);
  const partsB = parseTopicNumber(b);

  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;

    if (valueA !== valueB) {
      return valueA - valueB;
    }
  }

  return 0;
}

function sortTopicsNumerically(topics: TopicMarker[]): TopicMarker[] {
  return [...safeTopicArray(topics)].sort((a, b) => {
    const numberComparison = compareTopicNumbers(a.number, b.number);

    if (numberComparison !== 0) {
      return numberComparison;
    }

    return a.title.localeCompare(b.title, "pt-BR");
  });
}

function getNextSiblingNumber(siblings: TopicMarker[], parentNumber?: string | null): string {
  const safeSiblings = safeTopicArray(siblings);

  const usedNumbers = new Set<number>();

  const parentParts = parentNumber ? parseTopicNumber(parentNumber) : [];

  for (const topic of safeSiblings) {
    const parts = parseTopicNumber(topic.number);

    if (parts.length === 0) {
      continue;
    }

    if (parentNumber) {
      const topicParentParts = parts.slice(0, -1);

      const sameParent =
        parentParts.length === topicParentParts.length &&
        parentParts.every((value, index) => value === topicParentParts[index]);

      if (!sameParent) {
        continue;
      }
    } else {
      if (parts.length !== 1) {
        continue;
      }
    }

    usedNumbers.add(parts[parts.length - 1]);
  }

  let next = 1;

  while (usedNumbers.has(next)) {
    next += 1;
  }

  if (!parentNumber) {
    return String(next);
  }

  return `${parentNumber}.${next}`;
}

function isValidChildNumber(number: string, parentNumber: string): boolean {
  const numberParts = parseTopicNumber(number);

  const parentParts = parseTopicNumber(parentNumber);

  if (numberParts.length !== parentParts.length + 1) {
    return false;
  }

  return parentParts.every((value, index) => numberParts[index] === value);
}

// ============================================================
// DUPLICIDADES
// ============================================================

function getDuplicateTopicIds(topics: TopicMarker[]): Set<string> {
  const groups = new Map<string, TopicMarker[]>();

  for (const topic of safeTopicArray(topics)) {
    const number = String(topic.number ?? "").trim();

    if (!number) {
      continue;
    }

    const parentId = topic.parent_topic_id ?? "root";

    const key = `${topic.subject_id}:${parentId}:${number}`;

    const group = groups.get(key);

    if (group) {
      group.push(topic);
    } else {
      groups.set(key, [topic]);
    }
  }

  const duplicatedIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length > 1) {
      for (const topic of group) {
        duplicatedIds.add(topic.id);
      }
    }
  }

  return duplicatedIds;
}

// ============================================================
// EXAM DETAIL
// ============================================================

export default function ExamDetail() {
  const { id } = useParams<{ id: string }>();

  const examId = id ?? "";

  const [exam, setExam] = useState<Exam | null>(null);

  const [subjects, setSubjects] = useState<ExamSubject[]>([]);

  const [topics, setTopics] = useState<TopicMarker[]>([]);

  const [due, setDue] = useState<DueReview[]>([]);

  const [stats, setStats] = useState<ExamStats | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [logModal, setLogModal] = useState<{
    topicId: string;
    category: StudyCategory;
    reviewId?: string;
    topicTitle?: string;
    isParent?: boolean;
    subtopics?: TopicMarker[];
  } | null>(null);

  const [addingSubject, setAddingSubject] = useState(false);

  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);

  const [tutorialOpen, setTutorialOpen] = useState(false);

  // ==========================================================
  // LOAD
  // ==========================================================

  async function load() {
    if (!examId) {
      setError("Edital inválido.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [examData, subjectsData, topicsData, dueData, statsData] = await Promise.all([
        getExam(examId),
        listExamSubjects(examId),
        getTopicsWithMarkers(examId),
        getDueReviews(examId),
        getExamStats(examId),
      ]);

      setExam(examData);

      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

      setTopics(Array.isArray(topicsData) ? topicsData : []);

      setDue(Array.isArray(dueData) ? dueData : []);

      setStats(statsData);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // ==========================================================
  // TOPICS BY SUBJECT
  // ==========================================================

  const topicsBySubject = useMemo(() => {
    const map = new Map<string, TopicMarker[]>();

    const safeTopics = safeTopicArray(topics);

    for (const topic of safeTopics) {
      if (!map.has(topic.subject_id)) {
        map.set(topic.subject_id, []);
      }

      map.get(topic.subject_id)!.push(topic);
    }

    for (const [subjectId, subjectTopics] of map) {
      map.set(subjectId, sortTopicsNumerically(subjectTopics));
    }

    return map;
  }, [topics]);

  // ==========================================================
  // DUPLICIDADES
  // ==========================================================

  const duplicateTopicIds = useMemo(() => {
    return getDuplicateTopicIds(safeTopicArray(topics));
  }, [topics]);

  // ==========================================================
  // REVIEWS
  // ==========================================================

  async function onSkipReview(reviewId: string) {
    try {
      await skipReview(reviewId);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  // ==========================================================
  // DELETE SUBJECT
  // ==========================================================

  async function onDeleteSubject(subjectId: string) {
    if (!window.confirm("Tem certeza que deseja deletar esta matéria e todos os seus tópicos?")) {
      return;
    }

    try {
      await deleteExamSubject(subjectId);

      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  // ==========================================================
  // DELETE TOPIC
  // ==========================================================

  async function onDeleteTopic(topicId: string) {
    if (!window.confirm("Tem certeza que deseja deletar este tópico?")) {
      return;
    }

    try {
      await deleteExamTopic(topicId);

      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  // ==========================================================
  // NO EXAM
  // ==========================================================

  if (!exam) {
    return (
      <div className="p-8">
        <ErrorBanner message={error ?? "Edital não encontrado"} />
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* ======================================================
          CABEÇALHO
      ====================================================== */}

      <div>
        <h1 className="font-display text-2xl font-semibold leading-tight text-text sm:text-3xl">
          {exam.name}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            {exam.plan_mode === "deadline"
              ? "Com prazo certo"
              : exam.plan_mode === "continuous"
                ? "Contínuo"
                : "Livre"}
          </Badge>

          {exam.exam_date && (
            <span className="text-sm text-text-muted">Prova em {fmt(exam.exam_date)}</span>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* ======================================================
          ESTATÍSTICAS
      ====================================================== */}

      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Panel>
            <div className="flex items-center gap-2 text-text-muted">
              <Target className="h-4 w-4" />
              Progresso
            </div>

            <p className="mt-2 font-display text-2xl text-text">
              {stats.progress.studied_topics}/{stats.progress.total_topics}
            </p>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{
                  width: `${
                    stats.progress.total_topics
                      ? (100 * stats.progress.studied_topics) / stats.progress.total_topics
                      : 0
                  }%`,
                }}
              />
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-2 text-text-muted">
              <Flame className="h-4 w-4" />
              Constância
            </div>

            <p className="mt-2 font-display text-2xl text-text">{stats.streak_days} dias</p>
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center gap-2 text-text-muted">
              <AlarmClockCheck className="h-4 w-4" />
              Raio-x
            </div>

            {stats.performance.slice(0, 3).map((performance) => (
              <div
                key={performance.subject_id}
                className="flex justify-between text-xs text-text-muted"
              >
                <span>{performance.subject_name}</span>

                <span>{Math.round(performance.accuracy * 100)}%</span>
              </div>
            ))}

            {stats.performance.length === 0 && (
              <p className="text-xs text-text-muted">Sem questões registradas ainda.</p>
            )}
          </Panel>
        </div>
      )}

      {/* ======================================================
          REVISÕES
      ====================================================== */}

      {due.length > 0 && (
        <Panel>
          <h2 className="mb-3 font-display text-lg text-text">Revisões</h2>

          <div className="space-y-3">
            {due.map((review) => (
              <div
                key={review.id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="text-sm text-text">
                    {review.topic_number} {review.topic_title}
                  </span>

                  <span className="ml-2 text-xs text-text-muted">
                    {fmt(review.scheduled_date)}

                    {review.days_overdue > 0 && ` · ${review.days_overdue}d atrasada`}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setLogModal({
                        topicId: review.topic_id,
                        category: "revisao",
                        reviewId: review.id,
                        topicTitle: review.topic_title,
                      })
                    }
                  >
                    Revisar agora
                  </Button>

                  <Button variant="ghost" onClick={() => void onSkipReview(review.id)}>
                    Ignorar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ======================================================
          CRONOGRAMA
      ====================================================== */}

      <ScheduleSection exam={exam} onRefresh={load} />

      {/* ======================================================
          EDITAL ESQUEMATIZADO
      ====================================================== */}

      <Panel>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-text">Edital esquematizado</h2>

            <p className="mt-1 text-xs text-text-muted">
              Cadastre as matérias e organize os assuntos em uma estrutura hierárquica.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={() => setTutorialOpen(true)}>
              <CircleHelp className="h-4 w-4" />

              <span className="hidden sm:inline">Pesos e relevância</span>

              <span className="sm:hidden">Ajuda</span>
            </Button>

            <Button variant="secondary" onClick={() => setAddingSubject((value) => !value)}>
              <Plus className="h-4 w-4" />
              Matéria
            </Button>
          </div>
        </div>

        {duplicateTopicIds.size > 0 && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3">
            <p className="text-sm font-medium text-red-400">
              ⚠ Foram encontradas {duplicateTopicIds.size} numerações duplicadas.
            </p>

            <p className="mt-1 text-xs text-red-300/70">
              Tópicos com a mesma numeração dentro da mesma matéria e nível estão destacados abaixo.
            </p>
          </div>
        )}

        {addingSubject && (
          <NewSubjectForm
            examId={examId}
            onDone={() => {
              setAddingSubject(false);
              void load();
            }}
          />
        )}

        <div className="space-y-5">
          {subjects.map((subject) => {
            const subjectTopics = topicsBySubject.get(subject.id) ?? [];

            const rootTopics = subjectTopics.filter((topic) => !topic.parent_topic_id);

            return (
              <div
                key={subject.id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-sm transition-colors hover:border-white/[0.12] sm:p-5"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                      {subject.name}
                    </h3>

                    <p className="mt-0.5 text-xs text-text-faint">
                      Peso: {subject.weight} · Conhecimento prévio: {subject.knowledge_factor}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setAddingTopicFor(
                          addingTopicFor === `subject-${subject.id}`
                            ? null
                            : `subject-${subject.id}`,
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tópico
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => void onDeleteSubject(subject.id)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {addingTopicFor === `subject-${subject.id}` && (
                  <NewTopicForm
                    examId={examId}
                    subjectId={subject.id}
                    parentTopicId={null}
                    parentTopicNumber={null}
                    existingTopics={rootTopics}
                    onDone={() => {
                      setAddingTopicFor(null);
                      void load();
                    }}
                  />
                )}

                <div className="space-y-1.5">
                  {rootTopics.length === 0 && (
                    <p className="py-2 text-xs text-text-faint">Nenhum tópico ainda.</p>
                  )}

                  {rootTopics.map((topic) => (
                    <TopicTreeNode
                      key={topic.id}
                      topic={topic}
                      allTopics={subjectTopics}
                      duplicateTopicIds={duplicateTopicIds}
                      addingTopicFor={addingTopicFor}
                      setAddingTopicFor={setAddingTopicFor}
                      examId={examId}
                      subjectId={subject.id}
                      onRegister={(selectedTopic, children) => {
                        if (children.length > 0) {
                          setLogModal({
                            topicId: selectedTopic.id,
                            category: "teoria",
                            topicTitle: selectedTopic.title,
                            isParent: true,
                            subtopics: children,
                          });
                        } else {
                          setLogModal({
                            topicId: selectedTopic.id,
                            category: "teoria",
                            topicTitle: selectedTopic.title,
                          });
                        }
                      }}
                      onDelete={onDeleteTopic}
                      onRefresh={load}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {subjects.length === 0 && (
            <p className="text-sm text-text-muted">Adicione a primeira matéria para começar.</p>
          )}
        </div>
      </Panel>

      {/* ======================================================
          TUTORIAL
      ====================================================== */}

      {tutorialOpen && <WeightsRelevanceTutorialModal onClose={() => setTutorialOpen(false)} />}

      {/* ======================================================
          REGISTRO
      ====================================================== */}

      {logModal && (
        <StudyLogModal
          examId={examId}
          topicId={logModal.topicId}
          topicTitle={logModal.topicTitle}
          defaultCategory={logModal.category}
          isParent={logModal.isParent}
          subtopics={logModal.subtopics}
          onClose={() => setLogModal(null)}
          onSaved={() => {
            setLogModal(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// TOPIC TREE
// ============================================================

function TopicTreeNode({
  topic,
  allTopics,
  duplicateTopicIds,
  addingTopicFor,
  setAddingTopicFor,
  examId,
  subjectId,
  onRegister,
  onDelete,
  onRefresh,
  level = 0,
}: {
  topic: TopicMarker;

  allTopics: TopicMarker[];

  duplicateTopicIds: Set<string>;

  addingTopicFor: string | null;

  setAddingTopicFor: Dispatch<SetStateAction<string | null>>;

  examId: string;

  subjectId: string;

  onRegister: (topic: TopicMarker, children: TopicMarker[]) => void;

  onDelete: (topicId: string) => void;

  onRefresh: () => void;

  level?: number;
}) {
  const safeTopics = safeTopicArray(allTopics);

  const children = useMemo(() => {
    return sortTopicsNumerically(safeTopics.filter((item) => item.parent_topic_id === topic.id));
  }, [safeTopics, topic.id]);

  const formKey = `subtopic-${topic.id}`;

  const isDuplicated = duplicateTopicIds.has(topic.id);

  return (
    <div>
      <TopicRow
        topic={topic}
        isSubtopic={level > 0}
        hasSubtopics={children.length > 0}
        isDuplicated={isDuplicated}
        onAddSubtopic={() => setAddingTopicFor(addingTopicFor === formKey ? null : formKey)}
        onRegister={() => onRegister(topic, children)}
        onDelete={() => onDelete(topic.id)}
      />

      {addingTopicFor === formKey && (
        <div
          className="mt-1.5"
          style={{
            marginLeft: `${Math.min(level + 1, 8) * 24}px`,
          }}
        >
          <NewTopicForm
            examId={examId}
            subjectId={subjectId}
            parentTopicId={topic.id}
            parentTopicNumber={topic.number}
            existingTopics={children}
            onDone={() => {
              setAddingTopicFor(null);
              onRefresh();
            }}
          />
        </div>
      )}

      {children.length > 0 && (
        <div
          className="mt-1 space-y-1 border-l border-white/5"
          style={{
            marginLeft: `${Math.min(level + 1, 8) * 24}px`,
            paddingLeft: "8px",
          }}
        >
          {children.map((child) => (
            <TopicTreeNode
              key={child.id}
              topic={child}
              allTopics={safeTopics}
              duplicateTopicIds={duplicateTopicIds}
              addingTopicFor={addingTopicFor}
              setAddingTopicFor={setAddingTopicFor}
              examId={examId}
              subjectId={subjectId}
              onRegister={onRegister}
              onDelete={onDelete}
              onRefresh={onRefresh}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TOPIC ROW
// ============================================================

function TopicRow({
  topic,
  isSubtopic,
  hasSubtopics,
  isDuplicated,
  onRegister,
  onAddSubtopic,
  onDelete,
}: {
  topic: TopicMarker;

  isSubtopic?: boolean;

  hasSubtopics?: boolean;

  isDuplicated?: boolean;

  onRegister: () => void;

  onAddSubtopic?: () => void;

  onDelete: () => void;
}) {
  return (
    <div
      className={`
        group flex flex-col gap-3 rounded-xl px-3 py-3
        transition-all duration-200
        sm:flex-row sm:items-center sm:justify-between
        hover:bg-white/[0.04]
        ${isSubtopic ? "bg-white/[0.015]" : "bg-white/[0.02]"}
        ${isDuplicated ? "border border-red-500/30 bg-red-500/[0.04]" : ""}
      `}
    >
      <div className="flex min-w-0 items-start gap-2">
        {isSubtopic && <span className="shrink-0 text-text-faint">└─</span>}

        <span
          className={`
            shrink-0 rounded-md px-1.5 py-0.5
            font-mono text-xs
            ${
              isDuplicated
                ? "bg-red-500/10 text-red-400"
                : isSubtopic
                  ? "bg-white/[0.03] text-text-muted"
                  : "bg-accent/10 text-accent"
            }
          `}
        >
          {topic.number}
        </span>

        <div className="min-w-0">
          <span
            className={`
              block truncate
              ${isSubtopic ? "text-xs text-text-muted" : "text-sm font-medium text-text"}
            `}
          >
            {topic.title}
          </span>

          {isDuplicated && (
            <span className="mt-0.5 block text-[10px] font-medium text-red-400">
              ⚠ Numeração duplicada neste nível
            </span>
          )}
        </div>
      </div>

      <div className="ml-0 flex w-full flex-wrap items-center gap-1.5 sm:ml-4 sm:w-auto sm:justify-end">
        {topic.status === "not_started" && topic.scheduled_date && (
          <Badge>planejado p/ {fmt(topic.scheduled_date)}</Badge>
        )}

        {topic.status === "not_started" && !topic.scheduled_date && (
          <Badge>Ainda não estudado</Badge>
        )}

        {topic.status === "studied" && (
          <Badge tone="accent">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Estudei {fmt(topic.first_studied_on)}
          </Badge>
        )}

        {topic.next_review_date && (
          <Badge tone={topic.review_overdue_days ? "again" : "streak"}>
            {topic.review_overdue_days
              ? `${topic.review_overdue_days}d atrasada`
              : `${topic.next_review_step}º`}{" "}
            {fmt(topic.next_review_date)}
          </Badge>
        )}

        {hasSubtopics && (
          <span className="hidden text-[10px] text-text-faint sm:inline">📚 possui filhos</span>
        )}

        {onAddSubtopic && (
          <Button
            variant="ghost"
            onClick={onAddSubtopic}
            className="opacity-60 transition group-hover:opacity-100"
            title={`Adicionar subtópico de ${topic.number}`}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}

        <Button variant="ghost" onClick={onRegister}>
          Registrar
        </Button>

        <Button
          variant="ghost"
          onClick={onDelete}
          className="text-red-500 hover:text-red-400"
          title="Excluir tópico"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// NEW SUBJECT FORM
// ============================================================

function NewSubjectForm({ examId, onDone }: { examId: string; onDone: () => void }) {
  const formRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");

  const [weight, setWeight] = useState(3);

  const [knowledge, setKnowledge] = useState(1);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    focusFirstField(formRef.current);
  }, []);

  async function submit() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Informe o nome da matéria.");
      return;
    }

    if (!examId) {
      setError("Edital inválido.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createExamSubject(examId, {
        name: trimmedName,
        weight,
        knowledge_factor: knowledge,
      });

      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={formRef} className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Nome</Label>

          <Input
            placeholder="Nome da matéria"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </div>

        <div>
          <Label>Peso (1-5)</Label>

          <Input
            type="number"
            min={1}
            max={5}
            value={weight}
            onChange={(event) => {
              const value = Number(event.target.value);

              setWeight(Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 1);
            }}
          />
        </div>

        <div>
          <Label>Conhecimento prévio</Label>

          <Input
            type="number"
            step={0.1}
            min={0.5}
            max={2}
            value={knowledge}
            onChange={(event) => {
              const value = Number(event.target.value);

              setKnowledge(Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : 1);
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button disabled={loading || !name.trim() || !examId} onClick={() => void submit()}>
          {loading ? "Adicionando..." : "Adicionar"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// NEW TOPIC FORM
// ============================================================

function NewTopicForm({
  examId,
  subjectId,
  parentTopicId,
  parentTopicNumber,
  existingTopics,
  onDone,
}: {
  examId: string;

  subjectId: string;

  parentTopicId: string | null;

  parentTopicNumber?: string | null;

  existingTopics: TopicMarker[];

  onDone: () => void;
}) {
  const formRef = useRef<HTMLDivElement>(null);

  const safeExistingTopics = safeTopicArray(existingTopics);

  const [number, setNumber] = useState(() =>
    getNextSiblingNumber(safeExistingTopics, parentTopicNumber),
  );

  const [title, setTitle] = useState("");

  const [relevance, setRelevance] = useState(2);

  const [inSprint, setInSprint] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    focusFirstField(formRef.current);
  }, []);

  async function submit() {
    const trimmedNumber = number.trim();

    const trimmedTitle = title.trim();

    if (!trimmedNumber || !trimmedTitle) {
      setError("Informe o número e o título do tópico.");
      return;
    }

    if (!examId || !subjectId) {
      setError("Edital ou matéria inválidos.");
      return;
    }

    if (!/^\d+(?:\.\d+)*$/.test(trimmedNumber)) {
      setError("Use somente números separados por pontos. Exemplos: 1, 1.1, 1.1.1.");
      return;
    }

    const parsedNumber = parseTopicNumber(trimmedNumber);

    if (parsedNumber.length === 0) {
      setError("Informe uma numeração válida.");
      return;
    }

    if (!parentTopicId && parsedNumber.length !== 1) {
      setError("Um tópico principal deve possuir apenas um nível. Exemplo: 1, 2, 3.");
      return;
    }

    if (parentTopicId && parentTopicNumber) {
      if (!isValidChildNumber(trimmedNumber, parentTopicNumber)) {
        setError(
          `Este tópico deve seguir ${parentTopicNumber}.1, ${parentTopicNumber}.2, ${parentTopicNumber}.3...`,
        );
        return;
      }
    }

    const alreadyExists = safeExistingTopics.some((topic) => topic.number.trim() === trimmedNumber);

    if (alreadyExists) {
      setError(`O número ${trimmedNumber} já existe neste nível.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createExamTopic(examId, {
        subject_id: subjectId,
        parent_topic_id: parentTopicId ?? undefined,
        number: trimmedNumber,
        title: trimmedTitle,
        relevance,
        in_sprint: inSprint,
      });

      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={formRef} className="mb-3 rounded-xl border border-accent/20 bg-accent/[0.02] p-3">
      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">
          {parentTopicId ? `Subtópico de ${parentTopicNumber}` : "Novo tópico"}
        </span>

        <span className="text-xs text-text-faint">
          Próximo número: <strong className="font-mono text-text-muted">{number || "—"}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <Input
          className="md:col-span-1"
          placeholder="Nº"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />

        <Input
          className="md:col-span-2"
          placeholder="Título do tópico"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();

              if (number.trim() && title.trim()) {
                void submit();
              }
            }
          }}
        />

        <select
          value={relevance}
          onChange={(event) => setRelevance(Number(event.target.value))}
          className="rounded-lg border border-white/10 bg-ink-softer px-2 text-sm text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {[1, 2, 3, 4].map((value) => (
            <option key={value} value={value}>
              Relevância {value}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={inSprint}
            onChange={(event) => setInSprint(event.target.checked)}
          />
          sprint
        </label>
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          disabled={loading || !number.trim() || !title.trim() || !examId || !subjectId}
          onClick={() => void submit()}
        >
          {loading ? "Adicionando..." : "Adicionar tópico"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// TUTORIAL
// ============================================================

function WeightsRelevanceTutorialModal({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Target className="h-5 w-5" />
              </div>

              <div>
                <h2 id="tutorial-title" className="font-display text-xl text-text">
                  Como organizar seu edital
                </h2>

                <p className="mt-1 text-sm text-text-muted">
                  Veja na prática como usar peso, conhecimento e relevância para montar uma
                  preparação mais inteligente.
                </p>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text"
              aria-label="Fechar tutorial"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ====================================================
            CONTEÚDO
        ==================================================== */}

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-6">
            {/* ==================================================
                INTRO
            ================================================== */}

            <div className="rounded-xl border border-accent/20 bg-accent/[0.06] p-4">
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-ink">
                    1
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-text">Pense assim</h3>

                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    Você não precisa dar a mesma quantidade de tempo para todos os assuntos. O
                    sistema usa as informações que você cadastra para entender onde sua atenção é
                    mais necessária.
                  </p>

                  <p className="mt-2 text-sm font-medium text-text">
                    A ideia é simples:
                    <span className="text-accent"> importância + dificuldade + relevância</span>.
                  </p>
                </div>
              </div>
            </div>

            {/* ==================================================
                PESO
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-text">
                  2
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Peso da matéria</h3>

                  <p className="text-xs text-text-muted">
                    Quanto essa matéria importa para sua prova?
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-faint">Peso</span>

                    <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-sm text-text">
                      1
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-text">Baixa importância</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Matéria que possui menor impacto na sua preparação.
                  </p>
                </div>

                <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-faint">Peso</span>

                    <span className="rounded-md bg-accent/10 px-2 py-1 font-mono text-sm text-accent">
                      3
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-text">Importância média</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Matéria que merece uma quantidade normal de estudo.
                  </p>
                </div>

                <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-faint">Peso</span>

                    <span className="rounded-md bg-orange-400/10 px-2 py-1 font-mono text-sm text-orange-300">
                      5
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-text">Alta importância</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Matéria que deve receber bastante atenção.
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">💡</span>

                  <div>
                    <p className="text-sm font-medium text-text">Caso prático</p>

                    <p className="mt-1 text-xs leading-5 text-text-muted">
                      Imagine que Português, Direito Constitucional e Informática fazem parte do seu
                      edital.
                    </p>

                    <div className="mt-3 space-y-2">
                      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-text">Direito Constitucional</span>

                        <Badge tone="again">Peso 5</Badge>
                      </div>

                      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-text">Português</span>

                        <Badge tone="accent">Peso 4</Badge>
                      </div>

                      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-text">Informática</span>

                        <Badge>Peso 2</Badge>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-text-faint">
                      Nesse cenário, Direito Constitucional tende a receber mais atenção que
                      Informática.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                CONHECIMENTO
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-text">
                  3
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Conhecimento prévio</h3>

                  <p className="text-xs text-text-muted">Quanto você já domina essa matéria?</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 font-mono text-xs text-text-muted">0,5</span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-red-400"
                        style={{
                          width: "25%",
                        }}
                      />
                    </div>

                    <span className="w-28 text-right text-xs text-text-faint">Muito pouco</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 font-mono text-xs text-text-muted">1,0</span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: "50%",
                        }}
                      />
                    </div>

                    <span className="w-28 text-right text-xs text-text-faint">Médio</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 font-mono text-xs text-text-muted">1,5</span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: "75%",
                        }}
                      />
                    </div>

                    <span className="w-28 text-right text-xs text-text-faint">Bom</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 font-mono text-xs text-text-muted">2,0</span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{
                          width: "100%",
                        }}
                      />
                    </div>

                    <span className="w-28 text-right text-xs text-text-faint">Domínio</span>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-white/[0.03] p-3">
                  <p className="text-xs leading-5 text-text-muted">
                    <strong className="text-text">Exemplo:</strong> você nunca estudou Direito
                    Constitucional → coloque algo próximo de <strong>0,5</strong>. Já estudou
                    bastante e possui boa base → algo próximo de <strong>1,5</strong> ou{" "}
                    <strong>2,0</strong>.
                  </p>
                </div>
              </div>
            </section>

            {/* ==================================================
                RELEVÂNCIA
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-text">
                  4
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Relevância do tópico</h3>

                  <p className="text-xs text-text-muted">
                    Quão importante é esse assunto dentro da matéria?
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                {[
                  {
                    value: 1,
                    title: "Baixa",
                    description: "Pode receber menos atenção.",
                  },
                  {
                    value: 2,
                    title: "Normal",
                    description: "Assunto comum do edital.",
                  },
                  {
                    value: 3,
                    title: "Importante",
                    description: "Vale priorizar.",
                  },
                  {
                    value: 4,
                    title: "Crítica",
                    description: "Assunto que merece máxima atenção.",
                  },
                ].map((item) => (
                  <div
                    key={item.value}
                    className={`
                      rounded-xl border p-3
                      ${
                        item.value === 4
                          ? "border-orange-400/20 bg-orange-400/[0.04]"
                          : "border-white/10 bg-white/[0.02]"
                      }
                    `}
                  >
                    <span
                      className={`
                        inline-flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold
                        ${
                          item.value === 4
                            ? "bg-orange-400/10 text-orange-300"
                            : "bg-white/5 text-text"
                        }
                      `}
                    >
                      {item.value}
                    </span>

                    <p className="mt-2 text-xs font-semibold text-text">{item.title}</p>

                    <p className="mt-1 text-[11px] leading-4 text-text-faint">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ==================================================
                CASO PRÁTICO COMPLETO
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 font-mono text-sm font-bold text-accent">
                  5
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Caso prático completo</h3>

                  <p className="text-xs text-text-muted">
                    Veja exatamente como eu preencheria uma matéria.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                {/* MATÉRIA */}

                <div className="border-b border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                        Matéria
                      </p>

                      <h4 className="mt-1 text-base font-semibold text-text">
                        Direito Constitucional
                      </h4>
                    </div>

                    <Badge tone="again">Peso 5</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted">
                      Peso: <strong className="text-text">5</strong>
                    </span>

                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted">
                      Conhecimento: <strong className="text-text">0,8</strong>
                    </span>
                  </div>
                </div>

                {/* TÓPICO */}

                <div className="p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                    Tópico
                  </p>

                  <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.04] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-orange-400/10 px-1.5 py-0.5 font-mono text-xs text-orange-300">
                            3.2
                          </span>

                          <span className="text-sm font-medium text-text">
                            Controle de constitucionalidade
                          </span>
                        </div>

                        <p className="mt-2 text-xs leading-5 text-text-muted">
                          É um assunto que você ainda domina pouco e considera muito importante para
                          a prova.
                        </p>
                      </div>

                      <Badge tone="again">Relevância 4</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-text-muted">
                        Relevância: <strong className="text-text">4</strong>
                      </span>

                      <span className="rounded-lg bg-orange-400/10 px-2.5 py-1 text-[11px] font-medium text-orange-300">
                        🔥 Sprint
                      </span>
                    </div>
                  </div>
                </div>

                {/* INTERPRETAÇÃO */}

                <div className="border-t border-white/10 bg-black/10 p-4">
                  <div className="flex gap-3">
                    <span className="text-lg">🎯</span>

                    <div>
                      <p className="text-sm font-semibold text-text">O que isso significa?</p>

                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        Esse assunto combina três fatores importantes: a matéria tem peso alto, seu
                        conhecimento ainda é baixo e o tópico possui alta relevância.
                      </p>

                      <p className="mt-2 text-xs font-medium leading-5 text-accent">
                        Resultado: é um ótimo candidato para receber mais tempo de estudo e entrar
                        no seu sprint.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                COMPARAÇÃO
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-text">
                  6
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Compare dois assuntos</h3>

                  <p className="text-xs text-text-muted">
                    Veja por que um pode merecer mais atenção que o outro.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* CASO A */}

                <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                      Assunto A
                    </span>

                    <span className="text-lg">🔥</span>
                  </div>

                  <h4 className="mt-2 text-sm font-semibold text-text">
                    Controle de constitucionalidade
                  </h4>

                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Peso</span>

                      <strong className="text-text">5</strong>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Conhecimento</span>

                      <strong className="text-text">0,8</strong>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Relevância</span>

                      <strong className="text-orange-300">4</strong>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-xs font-medium text-orange-300">Alta prioridade</p>
                  </div>
                </div>

                {/* CASO B */}

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                      Assunto B
                    </span>

                    <span className="text-lg">📚</span>
                  </div>

                  <h4 className="mt-2 text-sm font-semibold text-text">Princípios fundamentais</h4>

                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Peso</span>

                      <strong className="text-text">5</strong>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Conhecimento</span>

                      <strong className="text-text">1,8</strong>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Relevância</span>

                      <strong className="text-text-muted">2</strong>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="text-xs font-medium text-text-muted">Prioridade normal</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-accent/[0.05] p-4">
                <p className="text-xs leading-5 text-text-muted">
                  Mesmo estando na mesma matéria, os dois assuntos não precisam receber o mesmo
                  tratamento. O primeiro merece mais atenção porque você ainda tem dificuldade e ele
                  possui alta relevância.
                </p>
              </div>
            </section>

            {/* ==================================================
                SPRINT
            ================================================== */}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-sm font-bold text-text">
                  7
                </span>

                <div>
                  <h3 className="font-display text-base text-text">Quando usar o Sprint?</h3>

                  <p className="text-xs text-text-muted">
                    Use para assuntos que precisam de atenção especial agora.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-xl">📅</div>

                  <p className="mt-2 text-sm font-semibold text-text">Prova próxima</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Falta pouco para a prova e você precisa acelerar determinado assunto.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-xl">⚠️</div>

                  <p className="mt-2 text-sm font-semibold text-text">Grande dificuldade</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Você está errando muito ou ainda não domina o conteúdo.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-xl">🎯</div>

                  <p className="mt-2 text-sm font-semibold text-text">Assunto estratégico</p>

                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    É um conteúdo muito importante para sua prova.
                  </p>
                </div>
              </div>
            </section>

            {/* ==================================================
                GUIA RÁPIDO
            ================================================== */}

            <section>
              <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-display text-base text-text">Guia rápido para preencher</h3>

                    <div className="mt-4 space-y-3">
                      <div className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-text">
                          1
                        </span>

                        <p className="text-xs leading-5 text-text-muted">
                          Pergunte:
                          <strong className="text-text">
                            {" "}
                            “Essa matéria é importante para minha prova?”
                          </strong>
                          <br />
                          Se sim, aumente o peso.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-text">
                          2
                        </span>

                        <p className="text-xs leading-5 text-text-muted">
                          Pergunte:
                          <strong className="text-text"> “Quanto eu já sei?”</strong>
                          <br />
                          Quanto menos souber, menor o conhecimento prévio.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-text">
                          3
                        </span>

                        <p className="text-xs leading-5 text-text-muted">
                          Para cada tópico, avalie:
                          <strong className="text-text">
                            {" "}
                            “Esse assunto é importante dentro da matéria?”
                          </strong>
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-text">
                          4
                        </span>

                        <p className="text-xs leading-5 text-text-muted">
                          Se estiver com pouco tempo, marque os assuntos mais importantes como{" "}
                          <strong className="text-accent">Sprint</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                EXEMPLOS DE CONFIGURAÇÃO
            ================================================== */}

            <section>
              <h3 className="mb-3 font-display text-base text-text">Três situações comuns</h3>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🆕</span>

                    <div>
                      <p className="text-sm font-semibold text-text">
                        “Nunca estudei essa matéria”
                      </p>

                      <p className="mt-1 text-xs text-text-muted">Peso 4 · Conhecimento 0,5</p>

                      <p className="mt-2 text-xs leading-5 text-text-faint">
                        Você considera importante, mas ainda possui pouca base.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">💪</span>

                    <div>
                      <p className="text-sm font-semibold text-text">“Já domino essa matéria”</p>

                      <p className="mt-1 text-xs text-text-muted">Peso 4 · Conhecimento 1,8</p>

                      <p className="mt-2 text-xs leading-5 text-text-faint">
                        A matéria é importante, mas você já possui uma boa base.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🔥</span>

                    <div>
                      <p className="text-sm font-semibold text-text">
                        “Esse assunto cai muito e estou errando”
                      </p>

                      <p className="mt-1 text-xs text-orange-300">
                        Peso 5 · Conhecimento 0,8 · Relevância 4 · Sprint
                      </p>

                      <p className="mt-2 text-xs leading-5 text-text-faint">
                        Esse é exatamente o tipo de assunto que merece prioridade máxima.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                FINAL
            ================================================== */}

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
              <p className="text-sm font-medium text-text">
                Não precisa acertar os valores perfeitamente.
              </p>

              <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-text-muted">
                Comece com uma estimativa. Conforme você estudar, registrar questões e acompanhar
                seu desempenho, poderá ajustar os valores.
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            FOOTER
        ==================================================== */}

        <div className="shrink-0 border-t border-white/10 bg-white/[0.015] px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-xs text-text-faint sm:block">
              Você pode abrir este tutorial novamente quando quiser.
            </p>

            <Button onClick={onClose} className="ml-auto">
              Entendi, vamos organizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STUDY LOG MODAL
// ============================================================

function StudyLogModal({
  examId,
  topicId,
  topicTitle,
  defaultCategory,
  isParent,
  subtopics,
  onClose,
  onSaved,
}: {
  examId: string;

  topicId: string;

  topicTitle?: string;

  defaultCategory: StudyCategory;

  isParent?: boolean;

  subtopics?: TopicMarker[];

  onClose: () => void;

  onSaved: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  const safeSubtopics = safeTopicArray(subtopics);

  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);

  const [category, setCategory] = useState<StudyCategory>(defaultCategory);

  const [studiedOn, setStudiedOn] = useState(() => new Date().toISOString().slice(0, 10));

  // ==========================================================
  // TEMPO TOTAL EM MINUTOS
  // ==========================================================

  const [minutes, setMinutes] = useState<number | "">("");

  const [pages, setPages] = useState<number | "">("");

  const [videoMinutes, setVideoMinutes] = useState<number | "">("");

  const [questionsTotal, setQuestionsTotal] = useState<number | "">("");

  const [questionsCorrect, setQuestionsCorrect] = useState<number | "">("");

  const [notes, setNotes] = useState("");

  const [scheduleReviews, setScheduleReviews] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const activeTopicId = selectedSubtopic ?? topicId;

  useEffect(() => {
    focusFirstField(modalRef.current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [loading, onClose]);

  // ==========================================================
  // ALTERAÇÃO DE HORAS
  // ==========================================================

  function handleHoursChange(value: string) {
    const hours = value === "" ? 0 : Math.max(0, Number(value));

    const currentMinutes = minutes === "" ? 0 : minutes % 60;

    setMinutes(hours * 60 + currentMinutes);
  }

  // ==========================================================
  // ALTERAÇÃO DE MINUTOS
  // ==========================================================

  function handleStudyMinutesChange(value: string) {
    const newMinutes = value === "" ? 0 : Math.min(59, Math.max(0, Number(value)));

    const currentHours = minutes === "" ? 0 : Math.floor(minutes / 60);

    setMinutes(currentHours * 60 + newMinutes);
  }

  // ==========================================================
  // SUBMIT
  // ==========================================================

  async function submit() {
    if (!examId || !activeTopicId) {
      setError("Edital ou tópico inválido.");
      return;
    }

    if (minutes === "" || minutes <= 0) {
      setError("Informe o tempo de estudo.");
      return;
    }

    if (questionsTotal !== "" && questionsCorrect !== "" && questionsCorrect > questionsTotal) {
      setError("A quantidade de acertos não pode ser maior que a quantidade de questões.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createStudyLog({
        exam_id: examId,
        topic_id: activeTopicId,
        category,
        studied_on: studiedOn,

        // A API continua recebendo
        // o tempo total em minutos.
        minutes,

        pages: pages === "" ? undefined : pages,

        video_minutes: videoMinutes === "" ? undefined : videoMinutes,

        questions_total: questionsTotal === "" ? undefined : questionsTotal,

        questions_correct: questionsCorrect === "" ? undefined : questionsCorrect,

        notes: notes.trim() ? notes.trim() : undefined,

        schedule_reviews: scheduleReviews,
      });

      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // HORAS/MINUTOS PARA EXIBIÇÃO
  // ==========================================================

  const displayHours = minutes === "" ? "" : Math.floor(minutes / 60);

  const displayMinutes = minutes === "" ? "" : minutes % 60;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-ink-soft p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* ====================================================
            CABEÇALHO
        ==================================================== */}

        <div className="mb-4 flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="font-display text-lg text-text">Registrar estudo</h3>

            {topicTitle && (
              <p className="mt-1 max-w-[300px] truncate text-xs text-text-muted">{topicTitle}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted transition hover:bg-white/5 hover:text-text"
            type="button"
            disabled={loading}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} />
          </div>
        )}

        {/* ====================================================
            SUBTÓPICOS
        ==================================================== */}

        {isParent && safeSubtopics.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <Label>Selecione um subtópico para estudar</Label>

            <select
              value={selectedSubtopic ?? ""}
              onChange={(event) => setSelectedSubtopic(event.target.value || null)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-ink-softer px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">Escolha um subtópico...</option>

              {safeSubtopics.map((subtopic) => (
                <option key={subtopic.id} value={subtopic.id}>
                  {subtopic.number} - {subtopic.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-4">
          {/* ==================================================
              CATEGORIA / DATA
          ================================================== */}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as StudyCategory)}
                className="w-full rounded-lg border border-white/10 bg-ink-softer px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="teoria">Teoria</option>

                <option value="revisao">Revisão</option>

                <option value="questoes">Questões</option>

                <option value="videoaula">Videoaula</option>

                <option value="leitura">Leitura</option>
              </select>
            </div>

            <div>
              <Label>Data</Label>

              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={studiedOn}
                onChange={(event) => setStudiedOn(event.target.value)}
              />
            </div>
          </div>

          {/* ==================================================
              TEMPO DE ESTUDO
          ================================================== */}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Tempo de estudo</Label>

              {minutes !== "" && minutes > 0 && (
                <span className="text-[11px] font-medium text-accent">{minutes} min totais</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* HORAS */}

              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={displayHours}
                  onChange={(event) => handleHoursChange(event.target.value)}
                  placeholder="0"
                  className="pr-14"
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-faint">
                  horas
                </span>
              </div>

              {/* MINUTOS */}

              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={displayMinutes}
                  onChange={(event) => handleStudyMinutesChange(event.target.value)}
                  placeholder="0"
                  className="pr-12"
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-faint">
                  min
                </span>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] text-text-faint">Exemplo:</p>

              <p className="mt-0.5 text-xs text-text-muted">
                2 horas e 30 minutos = <strong className="text-text">150 minutos</strong>
              </p>
            </div>
          </div>

          {/* ==================================================
              PÁGINAS / VÍDEO
          ================================================== */}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Páginas</Label>

              <Input
                type="number"
                min={0}
                value={pages}
                onChange={(event) =>
                  setPages(event.target.value === "" ? "" : Math.max(0, Number(event.target.value)))
                }
              />
            </div>

            <div>
              <Label>Vídeo (min)</Label>

              <Input
                type="number"
                min={0}
                value={videoMinutes}
                onChange={(event) =>
                  setVideoMinutes(
                    event.target.value === "" ? "" : Math.max(0, Number(event.target.value)),
                  )
                }
              />
            </div>
          </div>

          {/* ==================================================
              QUESTÕES
          ================================================== */}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Questões feitas</Label>

              <Input
                type="number"
                min={0}
                value={questionsTotal}
                onChange={(event) =>
                  setQuestionsTotal(
                    event.target.value === "" ? "" : Math.max(0, Number(event.target.value)),
                  )
                }
              />
            </div>

            <div>
              <Label>Acertos</Label>

              <Input
                type="number"
                min={0}
                value={questionsCorrect}
                onChange={(event) =>
                  setQuestionsCorrect(
                    event.target.value === "" ? "" : Math.max(0, Number(event.target.value)),
                  )
                }
              />
            </div>
          </div>

          {/* ==================================================
              NOTAS
          ================================================== */}

          <div>
            <Label>Notas (opcional)</Label>

            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anote pontos importantes, dificuldades ou observações..."
            />
          </div>

          {/* ==================================================
              REVISÕES
          ================================================== */}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={scheduleReviews}
              onChange={(event) => setScheduleReviews(event.target.checked)}
            />
            Programar revisões
          </label>

          {/* ==================================================
              SALVAR
          ================================================== */}

          <Button
            className="w-full"
            disabled={loading || minutes === "" || minutes <= 0}
            onClick={() => void submit()}
          >
            {loading ? "Salvando..." : "Salvar registro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCHEDULE SECTION
// ============================================================

function ScheduleSection({ exam, onRefresh }: { exam: Exam; onRefresh: () => void }) {
  if (exam.plan_mode === "deadline") {
    return <DeadlineSchedule exam={exam} onRefresh={onRefresh} />;
  }

  if (exam.plan_mode === "continuous") {
    return <ContinuousSchedule exam={exam} />;
  }

  return <FreeSchedule exam={exam} />;
}

// ============================================================
// DEADLINE SCHEDULE
// ============================================================

function DeadlineSchedule({ exam, onRefresh }: { exam: Exam; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await generateDeadlineSchedule(exam.id);

      setResult(
        `${res.regular_topics} tópicos distribuídos, ${res.sprint_topics} no sprint (início em ${fmt(
          res.sprint_start,
        )}).`,
      );

      onRefresh();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-muted">
          <CalendarClock className="h-4 w-4" />
          Cronograma
        </div>

        <Button variant="secondary" disabled={loading} onClick={() => void generate()}>
          {loading ? "Gerando..." : "Gerar cronograma"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      {result && <p className="mt-3 text-sm text-text-muted">{result}</p>}
    </Panel>
  );
}

// ============================================================
// CONTINUOUS SCHEDULE
// ============================================================

function ContinuousSchedule({ exam }: { exam: Exam }) {
  const [mode, setMode] = useState<"semanal" | "ciclo">(exam.continuous_mode ?? "semanal");

  const [week, setWeek] = useState<ContinuousWeeklyDay[] | null>(null);

  const [queue, setQueue] = useState<ContinuousCycleItem[] | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function load(selectedMode: "semanal" | "ciclo") {
    setLoading(true);
    setError(null);

    try {
      const res = await getContinuousSchedule(exam.id, selectedMode);

      if (res.mode === "semanal") {
        setWeek(res.week);
        setQueue(null);
      } else {
        setQueue(res.queue);
        setWeek(null);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(mode);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, exam.id]);

  return (
    <Panel>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg text-text">Cronograma</h2>

        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {(["semanal", "ciclo"] as const).map((selectedMode) => (
            <button
              key={selectedMode}
              type="button"
              onClick={() => setMode(selectedMode)}
              className={`
                  rounded-md px-3 py-1
                  text-xs font-medium
                  transition
                  ${
                    mode === selectedMode ? "bg-accent text-ink" : "text-text-muted hover:text-text"
                  }
                `}
            >
              {selectedMode === "semanal" ? "Semanal" : "Ciclo"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {week && !loading && (
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-7">
          {week.map((day) => (
            <div key={day.weekday} className="rounded-lg bg-white/[0.03] p-2">
              <p className="mb-1 font-medium text-text-muted">{day.weekday.slice(0, 3)}</p>

              {day.subjects.length === 0 && <p className="text-text-faint">—</p>}

              {day.subjects.map((subject) => (
                <p key={subject.subject_id} className="text-text">
                  {subject.subject_name} · {subject.minutes} min
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {queue && !loading && (
        <div className="flex flex-wrap gap-2">
          {queue.map((item, index) => (
            <Badge key={index}>
              {item.subject_name} · {item.minutes} min
            </Badge>
          ))}

          {queue.length === 0 && (
            <p className="text-sm text-text-muted">Nada a distribuir ainda.</p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ============================================================
// FREE SCHEDULE
// ============================================================

function FreeSchedule({ exam }: { exam: Exam }) {
  const formRef = useRef<HTMLDivElement>(null);

  const [entries, setEntries] = useState<ManualScheduleEntry[]>([]);

  const [subjects, setSubjects] = useState<ExamSubject[]>([]);

  const [adding, setAdding] = useState(false);

  const [weekday, setWeekday] = useState(1);

  const [subjectId, setSubjectId] = useState("");

  const [minutes, setMinutes] = useState(30);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [scheduleEntries, examSubjects] = await Promise.all([
        listManualSchedule(exam.id),
        listExamSubjects(exam.id),
      ]);

      setEntries(Array.isArray(scheduleEntries) ? scheduleEntries : []);

      setSubjects(Array.isArray(examSubjects) ? examSubjects : []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);

  useEffect(() => {
    if (adding) {
      focusFirstField(formRef.current);
    }
  }, [adding]);

  async function submit() {
    if (minutes <= 0) {
      setError("Informe uma quantidade de minutos maior que zero.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createManualScheduleEntry(exam.id, {
        weekday,
        subject_id: subjectId || undefined,
        planned_minutes: minutes,
      });

      setAdding(false);
      setSubjectId("");
      setMinutes(30);

      await load();
    } catch (err) {
      setError(extractErrorMessage(err));

      setLoading(false);
    }
  }

  return (
    <Panel>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg text-text">Grade semanal (livre)</h2>

        <Button variant="secondary" onClick={() => setAdding((value) => !value)}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {adding && (
        <div
          ref={formRef}
          className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-4"
        >
          <select
            value={weekday}
            onChange={(event) => setWeekday(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-ink-softer px-2 text-sm text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {weekdayNames.map((name, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="rounded-lg border border-white/10 bg-ink-softer px-2 text-sm text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">Matéria (opcional)</option>

            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>

          <Input
            type="number"
            min={1}
            value={minutes}
            onChange={(event) => {
              const value = Number(event.target.value);

              setMinutes(Number.isFinite(value) ? Math.max(1, value) : 1);
            }}
            placeholder="Minutos"
          />

          <Button disabled={loading} onClick={() => void submit()}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-7">
        {weekdayNames.map((name, index) => {
          const dayEntries = entries.filter((entry) => entry.weekday === index);

          return (
            <div key={index} className="rounded-lg bg-white/[0.03] p-2">
              <p className="mb-1 font-medium text-text-muted">{name.slice(0, 3)}</p>

              {dayEntries.map((entry) => (
                <p key={entry.id} className="mb-1 text-text">
                  {subjects.find((subject) => subject.id === entry.subject_id)?.name ?? "—"}

                  {entry.planned_minutes ? ` · ${entry.planned_minutes}min` : ""}
                </p>
              ))}

              {dayEntries.length === 0 && <p className="text-text-faint">nada planejado</p>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
