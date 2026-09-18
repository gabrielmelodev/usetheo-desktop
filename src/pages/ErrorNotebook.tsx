import { useMemo, useState } from "react";

import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Filter,
  Play,
  Search,
  Target,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { Badge, Button, EmptyState, ErrorBanner, Input, Label, Panel } from "../components/ui";

// =====================================================
// TIPOS
// =====================================================

type QuestionStatus = "pending" | "reviewing" | "mastered";

type FilterType = "all" | "wrong" | "difficult" | "marked";

type ErrorReason =
  | "Esquecimento"
  | "Desatenção"
  | "Interpretação"
  | "Conteúdo não consolidado"
  | "Dúvida";

type NotebookQuestion = {
  id: string;
  number: number;
  discipline: string;
  subject: string;
  board: string;
  exam: string;
  statement: string;
  alternatives: string[];
  correctAnswer: string;
  selectedAnswer: string;
  explanation: string;
  errorCount: number;
  lastAttemptAt: string;
  nextReviewAt: string;
  status: QuestionStatus;
  marked: boolean;
  difficult: boolean;
  errorReason: ErrorReason | null;
  personalNote: string;
};

// =====================================================
// DADOS DE EXEMPLO
// Substituir posteriormente pelos dados da API.
// =====================================================

const initialQuestions: NotebookQuestion[] = [
  {
    id: "q-001",
    number: 42,
    discipline: "Direito Constitucional",
    subject: "Controle de constitucionalidade",
    board: "Cebraspe",
    exam: "Analista Legislativo",
    statement:
      "No controle concentrado de constitucionalidade, determinadas ações possuem competência de julgamento atribuída ao Supremo Tribunal Federal, conforme a Constituição Federal.",
    alternatives: [
      "A) Apenas os tribunais de justiça podem realizar controle concentrado.",
      "B) A ADI pode ser utilizada para questionar a constitucionalidade de lei ou ato normativo federal ou estadual.",
      "C) O controle concentrado não produz efeitos vinculantes.",
      "D) Qualquer cidadão possui legitimidade universal para propor ADI.",
    ],
    correctAnswer: "B",
    selectedAnswer: "A",
    explanation:
      "A ADI é instrumento de controle concentrado destinado a questionar a constitucionalidade de lei ou ato normativo federal ou estadual perante o STF, observados os legitimados constitucionais.",
    errorCount: 3,
    lastAttemptAt: "2026-09-14",
    nextReviewAt: "2026-09-15",
    status: "pending",
    marked: true,
    difficult: true,
    errorReason: "Conteúdo não consolidado",
    personalNote: "Revisar legitimidade, objeto e efeitos das ações do controle concentrado.",
  },
  {
    id: "q-002",
    number: 18,
    discipline: "Direito Administrativo",
    subject: "Atos administrativos",
    board: "FGV",
    exam: "Tribunais",
    statement: "A respeito dos atributos dos atos administrativos, assinale a alternativa correta.",
    alternatives: [
      "A) Todo ato administrativo é irrevogável.",
      "B) A imperatividade está presente em todos os atos administrativos.",
      "C) A presunção de legitimidade é atributo dos atos administrativos.",
      "D) A autoexecutoriedade depende sempre de autorização judicial.",
    ],
    correctAnswer: "C",
    selectedAnswer: "B",
    explanation:
      "A presunção de legitimidade é atributo dos atos administrativos. Ela indica que o ato é presumido válido até que seja invalidado.",
    errorCount: 1,
    lastAttemptAt: "2026-09-13",
    nextReviewAt: "2026-09-16",
    status: "reviewing",
    marked: false,
    difficult: true,
    errorReason: "Interpretação",
    personalNote: "Diferenciar imperatividade, presunção de legitimidade e autoexecutoriedade.",
  },
  {
    id: "q-003",
    number: 76,
    discipline: "Direito Penal",
    subject: "Teoria do crime",
    board: "FCC",
    exam: "Área Jurídica",
    statement: "Considerando a teoria tripartida do crime, assinale a alternativa correta.",
    alternatives: [
      "A) O crime é composto apenas por tipicidade e ilicitude.",
      "B) A culpabilidade integra o conceito tripartido de crime.",
      "C) A tipicidade é elemento exclusivo da culpabilidade.",
      "D) A ilicitude não pode ser afastada por causas legais.",
    ],
    correctAnswer: "B",
    selectedAnswer: "D",
    explanation: "Na concepção tripartida, o crime é fato típico, ilícito e culpável.",
    errorCount: 2,
    lastAttemptAt: "2026-09-12",
    nextReviewAt: "2026-09-15",
    status: "pending",
    marked: false,
    difficult: false,
    errorReason: "Esquecimento",
    personalNote: "Memorizar os elementos da teoria tripartida.",
  },
  {
    id: "q-004",
    number: 91,
    discipline: "Direito Constitucional",
    subject: "Direitos fundamentais",
    board: "Vunesp",
    exam: "Câmara Municipal",
    statement:
      "Sobre a aplicabilidade das normas definidoras dos direitos e garantias fundamentais, assinale a alternativa correta.",
    alternatives: [
      "A) As normas definidoras de direitos fundamentais possuem aplicação imediata.",
      "B) Todas dependem de regulamentação para produzir qualquer efeito.",
      "C) Apenas os direitos individuais possuem aplicação imediata.",
      "D) Direitos fundamentais não podem ser exigidos judicialmente.",
    ],
    correctAnswer: "A",
    selectedAnswer: "A",
    explanation:
      "O art. 5º, § 1º, da Constituição Federal estabelece que as normas definidoras dos direitos e garantias fundamentais têm aplicação imediata.",
    errorCount: 1,
    lastAttemptAt: "2026-09-10",
    nextReviewAt: "2026-09-18",
    status: "mastered",
    marked: true,
    difficult: false,
    errorReason: null,
    personalNote: "Questão consolidada após revisão.",
  },
  {
    id: "q-005",
    number: 113,
    discipline: "Direito Administrativo",
    subject: "Poder de polícia",
    board: "Cebraspe",
    exam: "Área Administrativa",
    statement:
      "O poder de polícia administrativa permite à Administração Pública condicionar ou restringir o uso de bens, atividades e direitos individuais em benefício do interesse público.",
    alternatives: ["A) A afirmação está correta.", "B) A afirmação está incorreta."],
    correctAnswer: "A",
    selectedAnswer: "B",
    explanation:
      "O poder de polícia é a atividade administrativa que limita ou disciplina direito, interesse ou liberdade, regulando atos ou abstenções em razão do interesse público.",
    errorCount: 2,
    lastAttemptAt: "2026-09-11",
    nextReviewAt: "2026-09-17",
    status: "pending",
    marked: true,
    difficult: true,
    errorReason: "Desatenção",
    personalNote: "Revisar conceito legal do poder de polícia no CTN.",
  },
];

// =====================================================
// HELPERS
// =====================================================

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");

  if (!year || !month || !day) {
    return iso;
  }

  return `${day}/${month}/${year}`;
}

function isToday(iso: string) {
  return iso === "2026-09-15";
}

function getStatusLabel(status: QuestionStatus) {
  if (status === "mastered") {
    return "Consolidada";
  }

  if (status === "reviewing") {
    return "Em revisão";
  }

  return "Pendente";
}

function getStatusTone(status: QuestionStatus) {
  if (status === "mastered") {
    return "success" as const;
  }

  if (status === "reviewing") {
    return "accent" as const;
  }

  return "warning" as const;
}

// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

export default function ErrorNotebook() {
  const [questions, setQuestions] = useState<NotebookQuestion[]>(initialQuestions);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedQuestion, setSelectedQuestion] = useState<NotebookQuestion | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<NotebookQuestion | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  const [reviewMode, setReviewMode] = useState(false);

  // ===================================================
  // ESTATÍSTICAS
  // ===================================================

  const totalQuestions = questions.length;

  const pendingQuestions = questions.filter(
    (question) =>
      question.status !== "mastered" &&
      (isToday(question.nextReviewAt) || question.nextReviewAt < "2026-09-15"),
  ).length;

  const recurrentErrors = questions.filter((question) => question.errorCount >= 2).length;

  const masteredQuestions = questions.filter((question) => question.status === "mastered").length;

  const accuracy = totalQuestions ? Math.round((masteredQuestions / totalQuestions) * 100) : 0;

  // ===================================================
  // DISCIPLINAS
  // ===================================================

  const disciplines = useMemo(() => {
    return Array.from(new Set(questions.map((question) => question.discipline))).sort();
  }, [questions]);

  // ===================================================
  // FILTRAGEM
  // ===================================================

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return questions.filter((question) => {
      const matchesSearch =
        !normalizedSearch ||
        question.statement.toLowerCase().includes(normalizedSearch) ||
        question.subject.toLowerCase().includes(normalizedSearch) ||
        question.discipline.toLowerCase().includes(normalizedSearch) ||
        question.board.toLowerCase().includes(normalizedSearch) ||
        String(question.number).includes(normalizedSearch);

      const matchesFilter =
        filter === "all" ||
        (filter === "wrong" && question.errorCount > 0) ||
        (filter === "difficult" && question.difficult) ||
        (filter === "marked" && question.marked);

      const matchesDiscipline =
        disciplineFilter === "all" || question.discipline === disciplineFilter;

      const matchesStatus = statusFilter === "all" || question.status === statusFilter;

      return matchesSearch && matchesFilter && matchesDiscipline && matchesStatus;
    });
  }, [questions, search, filter, disciplineFilter, statusFilter]);

  // ===================================================
  // REMOVER QUESTÃO
  // ===================================================

  function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setQuestions((current) => current.filter((question) => question.id !== deleteTarget.id));

    if (selectedQuestion?.id === deleteTarget.id) {
      setSelectedQuestion(null);
    }

    setDeleteTarget(null);
  }

  // ===================================================
  // MARCAR COMO CONSOLIDADA
  // ===================================================

  function markAsMastered(questionId: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              status: "mastered",
              nextReviewAt: "2026-09-22",
            }
          : question,
      ),
    );

    setSelectedQuestion((current) =>
      current?.id === questionId
        ? {
            ...current,
            status: "mastered",
            nextReviewAt: "2026-09-22",
          }
        : current,
    );
  }

  // ===================================================
  // REGISTRAR NOVO ERRO
  // ===================================================

  function registerError(questionId: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              errorCount: question.errorCount + 1,
              status: "pending",
              nextReviewAt: "2026-09-15",
            }
          : question,
      ),
    );

    setSelectedQuestion((current) =>
      current?.id === questionId
        ? {
            ...current,
            errorCount: current.errorCount + 1,
            status: "pending",
            nextReviewAt: "2026-09-15",
          }
        : current,
    );
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* =================================================
          CABEÇALHO
         ================================================= */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent-bright" />
            <h1 className="font-display text-2xl text-text">Caderno de Erros</h1>
          </div>

          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
            Revise questões que você errou, teve dificuldade ou marcou para estudar novamente.
          </p>
        </div>

        <div className="shrink-0">
          <Button
            type="button"
            onClick={() => {
              setReviewMode(true);
            }}
          >
            <Play className="h-4 w-4" />
            Iniciar revisão
          </Button>
        </div>
      </div>

      {/* =================================================
          ERRO
         ================================================= */}

      {error && <ErrorBanner message={error} />}

      {/* =================================================
          ESTATÍSTICAS
         ================================================= */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-4 w-4" />}
          label="Total no caderno"
          value={totalQuestions}
          description="Questões registradas"
        />

        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Revisar hoje"
          value={pendingQuestions}
          description="Revisões pendentes"
          tone="warning"
        />

        <StatCard
          icon={<RepeatIcon />}
          label="Erros recorrentes"
          value={recurrentErrors}
          description="Erradas duas vezes ou mais"
          tone="danger"
        />

        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Consolidadas"
          value={`${accuracy}%`}
          description={`${masteredQuestions} questões dominadas`}
          tone="success"
        />
      </div>

      {/* =================================================
          ÁREA DE QUESTÕES
         ================================================= */}

      <Panel className="min-w-0">
        <div className="space-y-4">
          {/* CABEÇALHO DA LISTA */}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-lg text-text">Questões para revisar</h2>

              <p className="mt-1 text-xs text-text-muted">
                {filteredQuestions.length}{" "}
                {filteredQuestions.length === 1 ? "questão encontrada" : "questões encontradas"}
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowFilters((current) => !current);
              }}
            >
              <Filter className="h-4 w-4" />
              {showFilters ? "Ocultar filtros" : "Filtros"}
            </Button>
          </div>

          {/* BUSCA */}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />

            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Buscar por questão, assunto, disciplina ou banca..."
              className="pl-10"
            />
          </div>

          {/* FILTROS */}

          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              Todas
            </FilterButton>

            <FilterButton active={filter === "wrong"} onClick={() => setFilter("wrong")}>
              Erradas
            </FilterButton>

            <FilterButton active={filter === "difficult"} onClick={() => setFilter("difficult")}>
              Difíceis
            </FilterButton>

            <FilterButton active={filter === "marked"} onClick={() => setFilter("marked")}>
              Marcadas
            </FilterButton>
          </div>

          {showFilters && (
            <div className="grid gap-4 rounded-xl border border-white/10 bg-ink-softer p-4 sm:grid-cols-2">
              <div>
                <Label>Disciplina</Label>

                <select
                  value={disciplineFilter}
                  onChange={(event) => {
                    setDisciplineFilter(event.target.value);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-ink-softer px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  <option value="all">Todas as disciplinas</option>

                  {disciplines.map((discipline) => (
                    <option key={discipline} value={discipline}>
                      {discipline}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Status</Label>

                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-ink-softer px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  <option value="all">Todos os status</option>
                  <option value="pending">Pendentes</option>
                  <option value="reviewing">Em revisão</option>
                  <option value="mastered">Consolidadas</option>
                </select>
              </div>
            </div>
          )}

          {/* LISTAGEM */}

          {filteredQuestions.length === 0 ? (
            <EmptyState
              title="Nenhuma questão encontrada"
              description="Tente alterar os filtros ou adicionar novas questões ao caderno."
            />
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((question) => (
                <QuestionListItem
                  key={question.id}
                  question={question}
                  onOpen={() => {
                    setSelectedQuestion(question);
                  }}
                  onDelete={() => {
                    setDeleteTarget(question);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* =================================================
          MODAL DA QUESTÃO
         ================================================= */}

      {selectedQuestion && (
        <QuestionModal
          question={selectedQuestion}
          onClose={() => {
            setSelectedQuestion(null);
          }}
          onMarkMastered={() => {
            markAsMastered(selectedQuestion.id);
          }}
          onRegisterError={() => {
            registerError(selectedQuestion.id);
          }}
          onDelete={() => {
            setDeleteTarget(selectedQuestion);
          }}
        />
      )}

      {/* =================================================
          MODAL DE EXCLUSÃO
         ================================================= */}

      {deleteTarget && (
        <DeleteQuestionModal
          question={deleteTarget}
          onClose={() => {
            setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      {/* =================================================
          MODAL DE REVISÃO
         ================================================= */}

      {reviewMode && (
        <ReviewModal
          questions={questions.filter((question) => question.status !== "mastered")}
          onClose={() => {
            setReviewMode(false);
          }}
          onOpenQuestion={(question) => {
            setReviewMode(false);
            setSelectedQuestion(question);
          }}
        />
      )}
    </div>
  );
}

// =====================================================
// CARD DE ESTATÍSTICA
// =====================================================

function StatCard({
  icon,
  label,
  value,
  description,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const iconClass = {
    default: "text-text-muted",
    warning: "text-amber-400",
    danger: "text-red-400",
    success: "text-emerald-400",
  }[tone];

  return (
    <Panel className="min-w-0">
      <div className="flex items-center gap-2 text-text-muted">
        <span className={iconClass}>{icon}</span>
        <span className="text-xs">{label}</span>
      </div>

      <p className="mt-2 font-display text-2xl text-text">{value}</p>

      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </Panel>
  );
}

// =====================================================
// ÍCONE DE REPETIÇÃO
// =====================================================

function RepeatIcon() {
  return <span className="text-sm font-bold">↻</span>;
}

// =====================================================
// BOTÃO DE FILTRO
// =====================================================

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-accent bg-accent/10 text-accent-bright"
          : "border-white/10 bg-ink-softer text-text-muted hover:border-white/20 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

// =====================================================
// ITEM DA LISTA
// =====================================================

function QuestionListItem({
  question,
  onOpen,
  onDelete,
}: {
  question: NotebookQuestion;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative min-w-0 rounded-xl border border-white/10 bg-ink-softer transition hover:border-white/20">
      <button type="button" onClick={onOpen} className="block w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
            <BookOpen className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <Badge tone="accent">Questão {String(question.number).padStart(3, "0")}</Badge>

              {question.errorCount >= 2 && (
                <Badge tone="accent">Errou {question.errorCount}x</Badge>
              )}

              {question.difficult && <Badge tone="neutral">Difícil</Badge>}

              {question.marked && <Badge tone="accent">Marcada</Badge>}
            </div>

            <h3 className="mt-2 break-words text-sm font-semibold text-text">{question.subject}</h3>

            <p className="mt-1 break-words text-xs text-text-muted">
              {question.discipline} · {question.board} · {question.exam}
            </p>

            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-muted">
              {question.statement}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-muted">
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {isToday(question.nextReviewAt)
                  ? "Revisar hoje"
                  : `Revisar em ${formatDate(question.nextReviewAt)}`}
              </span>

              <span>{getStatusLabel(question.status)}</span>
            </div>
          </div>

          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-text" />
        </div>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="absolute right-10 top-3 rounded-lg p-2 text-text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
        title="Remover do caderno"
        aria-label={`Remover questão ${question.number} do caderno`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// =====================================================
// MODAL DA QUESTÃO
// =====================================================

function QuestionModal({
  question,
  onClose,
  onMarkMastered,
  onRegisterError,
  onDelete,
}: {
  question: NotebookQuestion;
  onClose: () => void;
  onMarkMastered: () => void;
  onRegisterError: () => void;
  onDelete: () => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {/* CABEÇALHO */}

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Caderno de Erros</Badge>
              <Badge tone={getStatusTone(question.status)}>{getStatusLabel(question.status)}</Badge>
            </div>

            <h2
              id="question-modal-title"
              className="mt-2 break-words font-display text-xl text-text"
            >
              Questão {String(question.number).padStart(3, "0")}
            </h2>

            <p className="mt-1 text-xs text-text-muted">
              {question.discipline} · {question.subject}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* CONTEÚDO */}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
            {/* METADADOS */}

            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{question.board}</Badge>
              <Badge tone="accent">{question.exam}</Badge>
              <Badge tone="neutral">
                {question.errorCount} {question.errorCount === 1 ? "erro" : "erros"}
              </Badge>
            </div>

            {/* ENUNCIADO */}

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Enunciado
              </p>

              <p className="text-sm leading-relaxed text-text">{question.statement}</p>
            </div>

            {/* ALTERNATIVAS */}

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Alternativas
              </p>

              {question.alternatives.map((alternative) => {
                const letter = alternative.charAt(0);
                const isCorrect = letter === question.correctAnswer;
                const isSelected = letter === question.selectedAnswer;

                let alternativeClass = "border-white/10 bg-ink-softer text-text-muted";

                if (showAnswer && isCorrect) {
                  alternativeClass = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
                } else if (showAnswer && isSelected && !isCorrect) {
                  alternativeClass = "border-red-500/40 bg-red-500/10 text-red-300";
                }

                return (
                  <div
                    key={alternative}
                    className={`rounded-xl border px-3.5 py-3 text-sm transition ${alternativeClass}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-semibold">{letter})</span>
                      <span>{alternative.slice(2)}</span>

                      {showAnswer && isCorrect && (
                        <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
                      )}

                      {showAnswer && isSelected && !isCorrect && (
                        <XCircle className="ml-auto h-4 w-4 shrink-0 text-red-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RESULTADO */}

            {!showAnswer && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />

                  <div>
                    <p className="text-sm font-semibold text-text">
                      Tente responder antes de ver o gabarito.
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      Relembre o conteúdo e escolha a alternativa que você considera correta.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {showAnswer && (
              <>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />

                    <div>
                      <p className="text-sm font-semibold text-text">
                        Gabarito: alternativa {question.correctAnswer}
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        Sua resposta anterior: alternativa {question.selectedAnswer}.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Comentário
                  </p>

                  <p className="text-sm leading-relaxed text-text-muted">{question.explanation}</p>
                </div>
              </>
            )}

            {/* REGISTRO DO ERRO */}

            <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">Registro do erro</p>

                  {question.errorReason ? (
                    <p className="mt-1 text-xs text-text-muted">
                      Motivo: <span className="text-text">{question.errorReason}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-text-muted">Nenhum motivo registrado.</p>
                  )}

                  {question.personalNote && (
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">
                      {question.personalNote}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ */}

        <div className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-ink-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Remover
          </button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowAnswer((current) => !current);
              }}
            >
              {showAnswer ? "Ocultar gabarito" : "Ver gabarito"}
            </Button>

            {question.status !== "mastered" ? (
              <Button type="button" onClick={onMarkMastered}>
                <Check className="h-4 w-4" />
                Marcar consolidada
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={onRegisterError}>
                <RepeatIcon />
                Registrar novo erro
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MODAL DE EXCLUSÃO
// =====================================================

function DeleteQuestionModal({
  question,
  onClose,
  onConfirm,
}: {
  question: NotebookQuestion;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-question-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h2
                id="delete-question-title"
                className="font-display text-lg font-semibold text-text"
              >
                Remover questão?
              </h2>

              <p className="mt-0.5 text-xs text-text-muted">
                A questão será retirada do Caderno de Erros.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-white/10 bg-ink-softer px-4 py-3">
            <p className="text-sm font-semibold text-text">
              Questão {String(question.number).padStart(3, "0")} — {question.subject}
            </p>

            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              O histórico original da questão não será necessariamente excluído. Esta ação remove
              apenas o registro do caderno nesta versão local.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>

          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-600 active:scale-[0.98]"
          >
            <Trash2 className="h-4 w-4" />
            Remover do caderno
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MODAL DE REVISÃO
// =====================================================

function ReviewModal({
  questions,
  onClose,
  onOpenQuestion,
}: {
  questions: NotebookQuestion[];
  onClose: () => void;
  onOpenQuestion: (question: NotebookQuestion) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
              <Play className="h-5 w-5" />
            </div>

            <div>
              <h2 id="review-modal-title" className="font-display text-lg font-semibold text-text">
                Iniciar revisão
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Resolva uma sequência exclusiva de questões do seu Caderno de Erros.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-accent-bright" />

              <div>
                <p className="text-sm font-semibold text-text">
                  {questions.length}{" "}
                  {questions.length === 1 ? "questão disponível" : "questões disponíveis"}
                </p>

                <p className="mt-1 text-xs text-text-muted">Questões ainda não consolidadas.</p>
              </div>
            </div>
          </div>

          {questions.length === 0 ? (
            <EmptyState
              title="Caderno revisado"
              description="Não há questões pendentes para esta sessão."
            />
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Escolha uma questão para começar
              </p>

              {questions.slice(0, 5).map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => {
                    onOpenQuestion(question);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-softer p-3 text-left transition hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">
                      Questão {String(question.number).padStart(3, "0")}
                    </p>

                    <p className="mt-1 truncate text-xs text-text-muted">
                      {question.discipline} · {question.subject}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-4 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
