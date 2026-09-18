import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Infinity as InfinityIcon,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";

import { Link } from "react-router-dom";

import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  Panel,
  Spinner,
} from "../components/ui";

import {
  createExam,
  deleteExam,
  examTemplateXlsxUrl,
  extractErrorMessage,
  importExamXlsx,
  listExams,
} from "../lib/api";

import type { Exam, PlanMode } from "../lib/types";

// =====================================================
// INFORMAÇÕES DOS MODOS
// =====================================================

const modeInfo: Record<
  PlanMode,
  {
    label: string;
    icon: ReactNode;
    description: string;
  }
> = {
  deadline: {
    label: "Com prazo certo",
    icon: <CalendarClock className="h-4 w-4" />,
    description: "Tem uma data de prova definida. O Theo distribui os tópicos até a prova.",
  },

  continuous: {
    label: "Contínuo",
    icon: <Repeat className="h-4 w-4" />,
    description: "Sem data definida. Você estuda por horas semanais ou por ciclos.",
  },

  free: {
    label: "Livre",
    icon: <InfinityIcon className="h-4 w-4" />,
    description: "Estude do seu jeito, sem cronograma automático e sem meta obrigatória.",
  },
};

// =====================================================
// EDITAIS
// =====================================================

export default function Editais() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de criação
  const [creating, setCreating] = useState(false);

  // Modal de exclusão
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [deleting, setDeleting] = useState(false);

  // ===================================================
  // CARREGAR EDITAIS
  // ===================================================

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const data = await listExams();
      setExams(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // ===================================================
  // ESC - MODAL DE CRIAÇÃO
  // ===================================================

  useEffect(() => {
    if (!creating) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreating(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [creating]);

  // ===================================================
  // ESC - MODAL DE EXCLUSÃO
  // ===================================================

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) {
        setDeleteTarget(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteTarget, deleting]);

  // ===================================================
  // EXCLUSÃO
  // ===================================================

  function onDeleteExam(examId: string, examName: string) {
    setDeleteTarget({
      id: examId,
      name: examName,
    });
  }

  async function confirmDeleteExam() {
    if (!deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await deleteExam(deleteTarget.id);

      setDeleteTarget(null);

      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* =================================================
          CABEÇALHO
         ================================================= */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-text">Meu Plano</h1>

          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
            Cada edital é um plano. Você pode ter um com prazo, outro contínuo e outro livre ao
            mesmo tempo.
          </p>
        </div>

        <div className="shrink-0">
          <Button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo edital
          </Button>
        </div>
      </div>

      {/* =================================================
          ERRO
         ================================================= */}

      {error && <ErrorBanner message={error} />}

      {/* =================================================
          LISTAGEM
         ================================================= */}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : exams.length === 0 ? (
        <EmptyState
          title="Nenhum edital ainda"
          description="Monte um edital pra transformar seu concurso em cronograma."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {exams.map((exam) => {
            const mode = modeInfo[exam.plan_mode];

            return (
              <div key={exam.id} className="group relative min-w-0">
                <Link to={`/editais/${exam.id}`} className="block">
                  <Panel className="h-full min-w-0 transition hover:border-white/20">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-text-muted">
                      {mode.icon}

                      <Badge tone="accent">{mode.label}</Badge>
                    </div>

                    <h3 className="break-words font-display text-lg text-text">{exam.name}</h3>

                    {exam.banca && (
                      <p className="mt-1 break-words text-xs text-text-muted">
                        Banca: {exam.banca}
                      </p>
                    )}

                    {exam.exam_date && (
                      <p className="mt-1 text-sm text-text-muted">
                        Prova em {formatDate(exam.exam_date)}
                      </p>
                    )}
                  </Panel>
                </Link>

                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    onDeleteExam(exam.id, exam.name);
                  }}
                  className="absolute right-2 top-2 rounded-lg bg-red-500/0 p-2 text-red-400 opacity-0 transition hover:bg-red-500/20 focus:opacity-100 group-hover:opacity-100"
                  title="Deletar edital"
                  aria-label={`Deletar edital ${exam.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================
          MODAL NEXT STEP
         ================================================= */}

      {creating && (
        <CreateExamModal
          onClose={() => {
            setCreating(false);
          }}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {/* =================================================
          MODAL DE EXCLUSÃO
         ================================================= */}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-exam-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            {/* CABEÇALHO */}

            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                  <Trash2 className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <h2
                    id="delete-exam-title"
                    className="font-display text-lg font-semibold text-text"
                  >
                    Deletar edital?
                  </h2>

                  <p className="mt-0.5 text-xs text-text-muted">Esta ação não pode ser desfeita.</p>
                </div>
              </div>

              <button
                type="button"
                disabled={deleting}
                onClick={closeDeleteModal}
                className="shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* CONTEÚDO */}

            <div className="px-5 py-5 sm:px-6">
              <div className="rounded-xl border border-white/10 bg-ink-softer px-4 py-3">
                <p className="break-words text-sm font-semibold text-text">{deleteTarget.name}</p>

                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Ao deletar este edital, os dados relacionados a ele poderão ser removidos
                  permanentemente.
                </p>
              </div>
            </div>

            {/* AÇÕES */}

            <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="secondary"
                disabled={deleting}
                onClick={closeDeleteModal}
              >
                Cancelar
              </Button>

              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  void confirmDeleteExam();
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />

                {deleting ? "Deletando..." : "Deletar edital"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// MODAL DE CRIAÇÃO - NEXT STEP
// =====================================================

function CreateExamModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [banca, setBanca] = useState("");

  const [planMode, setPlanMode] = useState<PlanMode>("deadline");

  const [examDate, setExamDate] = useState("");

  const [sprintDays, setSprintDays] = useState("7");

  const [weeklyHours, setWeeklyHours] = useState("10");

  const [continuousMode, setContinuousMode] = useState<"semanal" | "ciclo">("semanal");

  const [maxSessionMinutes, setMaxSessionMinutes] = useState("60");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ===================================================
  // VALIDAÇÃO
  // ===================================================

  function validateStepOne() {
    if (!name.trim()) {
      setError("Informe o nome do edital.");
      return false;
    }

    setError(null);
    return true;
  }

  function validateStepTwo() {
    const parsedSprintDays = Number(sprintDays);
    const parsedWeeklyHours = Number(weeklyHours);
    const parsedMaxSessionMinutes = Number(maxSessionMinutes);

    if (planMode === "deadline") {
      if (!examDate) {
        setError("Informe a data da prova.");
        return false;
      }

      if (!Number.isFinite(parsedSprintDays) || parsedSprintDays < 3 || parsedSprintDays > 13) {
        setError("O sprint final deve estar entre 3 e 13 dias.");

        return false;
      }
    }

    if (planMode === "continuous") {
      if (!Number.isFinite(parsedWeeklyHours) || parsedWeeklyHours < 1) {
        setError("Informe pelo menos 1 hora por semana.");

        return false;
      }

      if (continuousMode === "ciclo") {
        if (!Number.isFinite(parsedMaxSessionMinutes) || parsedMaxSessionMinutes < 15) {
          setError("A sessão máxima deve ter pelo menos 15 minutos.");

          return false;
        }
      }
    }

    setError(null);

    return true;
  }

  // ===================================================
  // PRÓXIMO PASSO
  // ===================================================

  function nextStep() {
    if (step === 1) {
      if (!validateStepOne()) {
        return;
      }

      setStep(2);
      return;
    }

    if (step === 2) {
      if (!validateStepTwo()) {
        return;
      }

      setStep(3);
    }
  }

  // ===================================================
  // VOLTAR
  // ===================================================

  function previousStep() {
    if (loading) {
      return;
    }

    setError(null);

    if (step > 1) {
      setStep((current) => current - 1);
    } else {
      onClose();
    }
  }

  // ===================================================
  // CRIAR EDITAL
  // ===================================================

  async function onSubmit() {
    if (!validateStepOne() || !validateStepTwo()) {
      return;
    }

    const parsedSprintDays = Number(sprintDays);
    const parsedWeeklyHours = Number(weeklyHours);
    const parsedMaxSessionMinutes = Number(maxSessionMinutes);

    setLoading(true);
    setError(null);

    try {
      await createExam({
        name: name.trim(),

        banca: banca.trim() || undefined,

        plan_mode: planMode,

        exam_date: planMode === "deadline" ? examDate : undefined,

        sprint_days: planMode === "deadline" ? parsedSprintDays : undefined,

        weekly_hours: planMode === "continuous" ? parsedWeeklyHours : undefined,

        continuous_mode: planMode === "continuous" ? continuousMode : undefined,

        max_session_minutes:
          planMode === "continuous" && continuousMode === "ciclo"
            ? parsedMaxSessionMinutes
            : undefined,
      });

      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ===================================================
  // IMPORTAR XLSX
  // ===================================================

  async function onImportFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      await importExamXlsx(file);

      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-exam-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        style={{
          maxHeight: "calc(100vh - 2rem)",
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {/* =================================================
            CABEÇALHO
           ================================================= */}

        <div className="shrink-0 border-b border-white/10">
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id="create-exam-title" className="font-display text-xl text-text">
                Montar seu plano
              </h2>

              <p className="mt-1 text-xs text-text-muted">Configure seu edital em poucos passos.</p>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* =================================================
              INDICADOR DE ETAPAS
             ================================================= */}

          <div className="px-5 pb-4 sm:px-6">
            <div className="flex items-center">
              <StepIndicator
                number={1}
                label="Informações"
                active={step === 1}
                completed={step > 1}
              />

              <div className={`h-px flex-1 ${step > 1 ? "bg-accent" : "bg-white/10"}`} />

              <StepIndicator
                number={2}
                label="Configuração"
                active={step === 2}
                completed={step > 2}
              />

              <div className={`h-px flex-1 ${step > 2 ? "bg-accent" : "bg-white/10"}`} />

              <StepIndicator number={3} label="Revisar" active={step === 3} completed={false} />
            </div>
          </div>
        </div>

        {/* =================================================
            CONTEÚDO
           ================================================= */}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            {/* ERRO */}

            {error && (
              <div className="mb-5">
                <ErrorBanner message={error} />
              </div>
            )}

            {/* =================================================
                STEP 1
               ================================================= */}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-text">Informações do edital</h3>

                  <p className="mt-1 text-sm text-text-muted">
                    Comece informando os dados básicos do seu concurso.
                  </p>
                </div>

                {/* NOME */}

                <div>
                  <Label>Nome do edital</Label>

                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(null);
                    }}
                    placeholder="Ex.: Analista Legislativo — Câmara dos Deputados"
                    autoComplete="off"
                    autoFocus
                  />
                </div>

                {/* BANCA */}

                <div>
                  <Label>Banca</Label>

                  <Input
                    value={banca}
                    onChange={(event) => {
                      setBanca(event.target.value);
                      setError(null);
                    }}
                    placeholder="CEBRASPE, FGV, FCC..."
                    autoComplete="off"
                  />
                </div>

                {/* IMPORTAÇÃO */}

                <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-accent-bright" />

                        <p className="text-sm font-semibold text-text">Já possui uma planilha?</p>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        Importe seu edital diretamente pelo Excel.
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (file) {
                            void onImportFile(file);
                          }

                          event.target.value = "";
                        }}
                      />

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={loading}
                        onClick={() => {
                          fileRef.current?.click();
                        }}
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Importar
                      </Button>

                      <a
                        href={examTemplateXlsxUrl()}
                        className="whitespace-nowrap text-xs text-accent-bright hover:underline"
                      >
                        baixar modelo
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =================================================
                STEP 2
               ================================================= */}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-text">Como você quer estudar?</h3>

                  <p className="mt-1 text-sm text-text-muted">
                    Escolha o tipo de planejamento que combina com sua preparação.
                  </p>
                </div>

                {/* TIPOS */}

                <div className="grid gap-3">
                  {(Object.keys(modeInfo) as PlanMode[]).map((mode) => {
                    const selected = planMode === mode;

                    return (
                      <button
                        type="button"
                        key={mode}
                        onClick={() => {
                          setPlanMode(mode);
                          setError(null);
                        }}
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          selected
                            ? "border-accent bg-accent/10 shadow-sm"
                            : "border-white/10 bg-ink-softer hover:border-white/20 hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              selected
                                ? "bg-accent/15 text-accent-bright"
                                : "bg-white/5 text-text-muted"
                            }`}
                          >
                            {modeInfo[mode].icon}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-text">
                                {modeInfo[mode].label}
                              </span>

                              {selected && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-xs leading-relaxed text-text-muted">
                              {modeInfo[mode].description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* DEADLINE */}

                {planMode === "deadline" && (
                  <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-text">Configuração da prova</p>

                      <p className="mt-1 text-xs text-text-muted">
                        Defina quando será sua prova e o período reservado para o sprint final.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Data da prova</Label>

                        <Input
                          type="date"
                          value={examDate}
                          onChange={(event) => {
                            setExamDate(event.target.value);
                            setError(null);
                          }}
                        />
                      </div>

                      <div>
                        <Label>Sprint final (dias, 3-13)</Label>

                        <Input
                          type="number"
                          min={3}
                          max={13}
                          value={sprintDays}
                          onChange={(event) => {
                            setSprintDays(event.target.value);
                            setError(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* CONTÍNUO */}

                {planMode === "continuous" && (
                  <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-text">Configuração do estudo</p>

                      <p className="mt-1 text-xs text-text-muted">
                        Defina quanto tempo você pretende estudar.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Horas por semana</Label>

                        <Input
                          type="number"
                          min={1}
                          step="0.5"
                          value={weeklyHours}
                          onChange={(event) => {
                            setWeeklyHours(event.target.value);
                            setError(null);
                          }}
                        />
                      </div>

                      <div>
                        <Label>Modo</Label>

                        <select
                          value={continuousMode}
                          onChange={(event) => {
                            setContinuousMode(event.target.value as "semanal" | "ciclo");

                            setError(null);
                          }}
                          className="w-full rounded-lg border border-white/10 bg-ink-softer px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        >
                          <option value="semanal">Semanal</option>

                          <option value="ciclo">Ciclo</option>
                        </select>
                      </div>

                      {continuousMode === "ciclo" && (
                        <div className="sm:col-span-2">
                          <Label>Sessão máxima (minutos)</Label>

                          <Input
                            type="number"
                            min={15}
                            value={maxSessionMinutes}
                            onChange={(event) => {
                              setMaxSessionMinutes(event.target.value);
                              setError(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* LIVRE */}

                {planMode === "free" && (
                  <div className="rounded-xl border border-white/10 bg-ink-softer p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
                        <InfinityIcon className="h-4 w-4" />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-text">Plano livre</p>

                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          O Theo não vai exigir data, horas semanais ou sprint final. Você terá
                          liberdade para organizar os estudos.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* =================================================
                STEP 3
               ================================================= */}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-text">Tudo pronto</h3>

                  <p className="mt-1 text-sm text-text-muted">
                    Confira as informações antes de criar seu plano.
                  </p>
                </div>

                {/* RESUMO */}

                <div className="overflow-hidden rounded-xl border border-white/10">
                  {/* NOME */}

                  <div className="border-b border-white/10 bg-ink-softer px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Edital
                    </p>

                    <p className="mt-1 break-words text-base font-semibold text-text">
                      {name || "Sem nome"}
                    </p>

                    {banca.trim() && <p className="mt-1 text-xs text-text-muted">Banca: {banca}</p>}
                  </div>

                  {/* PLANO */}

                  <div className="border-b border-white/10 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Tipo de plano
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
                        {modeInfo[planMode].icon}
                      </div>

                      <span className="text-sm font-semibold text-text">
                        {modeInfo[planMode].label}
                      </span>
                    </div>
                  </div>

                  {/* CONFIGURAÇÃO */}

                  <div className="px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Configuração
                    </p>

                    {planMode === "deadline" && (
                      <div className="mt-2 space-y-1 text-sm text-text">
                        <p>
                          <span className="text-text-muted">Prova:</span>{" "}
                          {examDate ? formatDate(examDate) : "Não informada"}
                        </p>

                        <p>
                          <span className="text-text-muted">Sprint final:</span> {sprintDays} dias
                        </p>
                      </div>
                    )}

                    {planMode === "continuous" && (
                      <div className="mt-2 space-y-1 text-sm text-text">
                        <p>
                          <span className="text-text-muted">Horas por semana:</span> {weeklyHours}
                        </p>

                        <p>
                          <span className="text-text-muted">Modo:</span>{" "}
                          {continuousMode === "semanal" ? "Semanal" : "Ciclo"}
                        </p>

                        {continuousMode === "ciclo" && (
                          <p>
                            <span className="text-text-muted">Sessão máxima:</span>{" "}
                            {maxSessionMinutes} min
                          </p>
                        )}
                      </div>
                    )}

                    {planMode === "free" && (
                      <p className="mt-2 text-sm text-text">Sem cronograma automático.</p>
                    )}
                  </div>
                </div>

                {/* MENSAGEM */}

                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-bright">
                      <Check className="h-4 w-4" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-text">
                        Seu plano está pronto para ser criado.
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        Depois de criar, você poderá acessar o edital e organizar as matérias e
                        tópicos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =================================================
            RODAPÉ / NAVEGAÇÃO
           ================================================= */}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-ink-soft px-5 py-4 sm:px-6">
          {/* ESQUERDA */}

          <div>
            <button
              type="button"
              disabled={loading}
              onClick={previousStep}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-text-muted transition hover:bg-white/5 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />

              {step === 1 ? "Cancelar" : "Voltar"}
            </button>
          </div>

          {/* DIREITA */}

          <div>
            {step < 3 ? (
              <Button type="button" disabled={loading} onClick={nextStep}>
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={loading}
                onClick={() => {
                  void onSubmit();
                }}
              >
                {loading ? (
                  <>
                    <Spinner />
                    Criando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Criar edital
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// INDICADOR DE ETAPA
// =====================================================

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
          active || completed ? "bg-accent text-white" : "bg-white/5 text-text-muted"
        }`}
      >
        {completed ? <Check className="h-3.5 w-3.5" /> : number}
      </div>

      <span
        className={`hidden text-xs font-medium sm:block ${
          active ? "text-text" : "text-text-muted"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// =====================================================
// FORMATAR DATA
// =====================================================

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");

  if (!year || !month || !day) {
    return iso;
  }

  return `${day}/${month}/${year}`;
}
