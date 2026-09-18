import { useEffect, useState } from "react";

import { Plus, Search } from "lucide-react";

import { Link } from "react-router-dom";

import { Button, ErrorBanner, Input, Label, Panel, Spinner } from "../components/ui";

import { extractErrorMessage, listExams } from "../lib/api";

import type { Exam } from "../lib/types";

export default function Questions() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await listExams();

        setExams(data);

        if (data.length > 0) {
          setSelectedExamId(data[0].id);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const selectedExam = exams.find((exam) => exam.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-text">Questões</h1>

          <p className="mt-1 text-sm text-text-muted">
            Organize e acompanhe suas questões por edital.
          </p>
        </div>

        <Button>
          <Plus className="h-4 w-4" />
          Nova questão
        </Button>
      </div>

      {/* ERRO */}

      {error && <ErrorBanner message={error} />}

      {/* SEM EDITAIS */}

      {exams.length === 0 ? (
        <Panel>
          <p className="text-center text-text-muted">
            Nenhum edital encontrado. Crie um edital para começar a adicionar questões.
          </p>

          <Link to="/editais" className="mt-4 block text-center">
            <Button>Ir para Editais</Button>
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          {/* SELEÇÃO DE EDITAL */}

          <div className="lg:col-span-1">
            <Panel>
              <div className="mb-3">
                <Label>Selecione um edital</Label>
              </div>

              <div className="space-y-2">
                {exams.map((exam) => {
                  const selected = selectedExamId === exam.id;

                  return (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => setSelectedExamId(exam.id)}
                      className={`
                        w-full rounded-lg border px-3 py-2
                        text-left text-sm transition
                        ${
                          selected
                            ? "border-accent bg-accent/10 text-accent-bright"
                            : "border-white/10 bg-white/5 text-text hover:bg-white/10"
                        }
                      `}
                    >
                      <p className="truncate font-medium">{exam.name}</p>

                      {exam.exam_date && (
                        <p className="mt-0.5 text-xs text-text-muted">
                          {formatDate(exam.exam_date)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* QUESTÕES */}

          <div className="lg:col-span-3">
            <Panel>
              <div className="mb-4">
                <div className="relative">
                  <Search
                    className="
                      pointer-events-none
                      absolute
                      left-3
                      top-1/2
                      h-4
                      w-4
                      -translate-y-1/2
                      text-text-muted
                    "
                  />

                  <Input
                    className="pl-9"
                    placeholder="Buscar questões..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="rounded-lg bg-white/5 p-4 text-center text-sm text-text-muted">
                  {selectedExam ? (
                    <>
                      As questões do edital{" "}
                      <span className="font-medium text-text">"{selectedExam.name}"</span>{" "}
                      aparecerão aqui.
                    </>
                  ) : (
                    "Selecione um edital para visualizar as questões."
                  )}
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");

  if (!year || !month || !day) {
    return iso;
  }

  return `${day}/${month}/${year}`;
}
