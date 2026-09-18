import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, useNavigate } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./lib/auth-context";
import { searchPlatform, type GlobalSearchResult } from "./lib/api";

import "./index.css";

function GlobalSearch() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  function closeSearch() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setError(null);
    setLoading(false);
  }

  function openSearch() {
    setOpen(true);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      const isSearchShortcut = (event.ctrlKey || event.metaKey) && key === "f";

      if (isSearchShortcut) {
        event.preventDefault();
        event.stopPropagation();

        openSearch();
        return;
      }

      if (!open) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        closeSearch();
        return;
      }

      if (event.key === "ArrowDown") {
        if (!results.length) {
          return;
        }

        event.preventDefault();

        setSelectedIndex((current) => (current >= results.length - 1 ? 0 : current + 1));

        return;
      }

      if (event.key === "ArrowUp") {
        if (!results.length) {
          return;
        }

        event.preventDefault();

        setSelectedIndex((current) => (current <= 0 ? results.length - 1 : current - 1));

        return;
      }

      if (event.key === "Enter") {
        if (!results.length) {
          return;
        }

        event.preventDefault();

        const result = results[selectedIndex];

        if (result) {
          openResult(result);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, results, selectedIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      requestIdRef.current += 1;

      setResults([]);
      setSelectedIndex(0);
      setError(null);
      setLoading(false);

      return;
    }

    const requestId = ++requestIdRef.current;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await searchPlatform(trimmedQuery);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResults(Array.isArray(response.results) ? response.results.slice(0, 50) : []);

        setSelectedIndex(0);
      } catch (err) {
        console.error("[Theo][GlobalSearch] Erro na busca:", err);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResults([]);
        setSelectedIndex(0);
        setError("Não foi possível realizar a busca.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function openResult(result: GlobalSearchResult) {
    closeSearch();
    navigate(result.route);
  }

  function getResultIcon(type: GlobalSearchResult["type"]) {
    switch (type) {
      case "exam":
        return "🎯";
      case "subject":
        return "📚";
      case "topic":
        return "📝";
      case "deck":
        return "🗂️";
      case "card":
        return "🃏";
      case "folder":
        return "📁";
      case "community":
        return "🌐";
      default:
        return "🔎";
    }
  }

  function getResultType(type: GlobalSearchResult["type"]) {
    switch (type) {
      case "exam":
        return "Prova";
      case "subject":
        return "Matéria";
      case "topic":
        return "Tópico";
      case "deck":
        return "Baralho";
      case "card":
        return "Card";
      case "folder":
        return "Pasta";
      case "community":
        return "Comunidade";
      default:
        return "Resultado";
    }
  }

  if (!open) {
    return null;
  }

  const hasQuery = Boolean(query.trim());
  const hasResults = results.length > 0;

  return (
    <div
      data-global-search
      className="
        fixed
        inset-0
        z-[9999]
        flex
        items-start
        justify-center
        bg-black/70
        px-4
        pt-[10vh]
        backdrop-blur-sm
      "
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeSearch();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        className="
          w-full
          max-w-2xl
          overflow-hidden
          rounded-2xl
          border
          border-white/10
          bg-ink-soft
          shadow-2xl
          shadow-black/60
        "
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="global-search-title"
                className="
                  font-display
                  text-base
                  font-semibold
                  text-text
                  sm:text-lg
                "
              >
                Buscar na plataforma
              </h2>

              <p className="mt-1 truncate text-xs text-text-muted">
                Encontre provas, matérias, tópicos, baralhos e muito mais.
              </p>
            </div>

            <button
              type="button"
              onClick={closeSearch}
              className="
                flex
                shrink-0
                items-center
                gap-1.5
                rounded-lg
                border
                border-white/10
                bg-white/5
                px-2.5
                py-1.5
                text-xs
                text-text-muted
                transition
                hover:bg-white/10
                hover:text-text
                active:scale-95
              "
            >
              <kbd
                className="
                  rounded
                  border
                  border-white/10
                  bg-black/20
                  px-1.5
                  py-0.5
                  text-[10px]
                "
              >
                Esc
              </kbd>

              <span>Fechar</span>
            </button>
          </div>

          <div
            className="
              flex
              h-14
              items-center
              gap-3
              rounded-xl
              border
              border-white/10
              bg-black/20
              px-4
              transition
              focus-within:border-white/20
              focus-within:bg-black/30
              focus-within:shadow-lg
              focus-within:shadow-black/10
            "
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="
                h-5
                w-5
                shrink-0
                text-text-muted
              "
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>

            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Digite o que você está procurando..."
              className="
                h-full
                min-w-0
                flex-1
                bg-transparent
                text-base
                text-text
                outline-none
                placeholder:text-text-muted
              "
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Buscar na plataforma"
              aria-activedescendant={
                hasResults ? `global-search-result-${selectedIndex}` : undefined
              }
            />

            {query && !loading && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="
                  flex
                  h-7
                  w-7
                  shrink-0
                  items-center
                  justify-center
                  rounded-md
                  text-text-muted
                  transition
                  hover:bg-white/10
                  hover:text-text
                "
                aria-label="Limpar busca"
              >
                ×
              </button>
            )}

            {loading && (
              <div
                className="
                  h-5
                  w-5
                  shrink-0
                  animate-spin
                  rounded-full
                  border-2
                  border-white/10
                  border-t-text
                "
                aria-label="Buscando"
              />
            )}

            {!loading && hasQuery && (
              <span
                className="
                  shrink-0
                  rounded-md
                  bg-white/5
                  px-2
                  py-1
                  text-[11px]
                  text-text-muted
                "
              >
                {results.length} {results.length === 1 ? "resultado" : "resultados"}
              </span>
            )}
          </div>
        </div>

        <div
          className="
            max-h-[55vh]
            overflow-y-auto
            p-3
            overscroll-contain
          "
        >
          {!hasQuery && (
            <div
              className="
                flex
                flex-col
                items-center
                justify-center
                px-6
                py-14
                text-center
              "
            >
              <div
                className="
                  mb-4
                  flex
                  h-14
                  w-14
                  items-center
                  justify-center
                  rounded-2xl
                  bg-white/5
                  text-2xl
                "
              >
                🔎
              </div>

              <p className="text-sm font-medium text-text">O que você está procurando?</p>

              <p
                className="
                  mt-1
                  max-w-sm
                  text-xs
                  leading-5
                  text-text-muted
                "
              >
                Digite o nome de uma prova, matéria, tópico, baralho ou outro conteúdo da
                plataforma.
              </p>
            </div>
          )}

          {hasQuery && loading && (
            <div
              className="
                flex
                flex-col
                items-center
                justify-center
                px-6
                py-14
                text-center
              "
            >
              <div
                className="
                  mb-3
                  h-7
                  w-7
                  animate-spin
                  rounded-full
                  border-2
                  border-white/10
                  border-t-text
                "
              />

              <p className="text-sm text-text-muted">Procurando...</p>
            </div>
          )}

          {hasQuery && !loading && error && (
            <div
              className="
                rounded-xl
                border
                border-red-400/10
                bg-red-400/5
                px-4
                py-5
                text-center
              "
            >
              <div className="mb-2 text-xl">⚠️</div>

              <p className="text-sm text-red-300">{error}</p>

              <button
                type="button"
                onClick={() => {
                  setError(null);

                  setQuery((current) => current + " ");

                  window.setTimeout(() => {
                    setQuery((current) => current.trim());
                  }, 0);
                }}
                className="
                  mt-3
                  rounded-lg
                  bg-white/5
                  px-3
                  py-1.5
                  text-xs
                  text-text-muted
                  transition
                  hover:bg-white/10
                  hover:text-text
                "
              >
                Tentar novamente
              </button>
            </div>
          )}

          {hasQuery && !loading && !error && !hasResults && (
            <div
              className="
                flex
                flex-col
                items-center
                justify-center
                px-6
                py-14
                text-center
              "
            >
              <div
                className="
                  mb-4
                  flex
                  h-14
                  w-14
                  items-center
                  justify-center
                  rounded-2xl
                  bg-white/5
                  text-2xl
                "
              >
                😕
              </div>

              <p className="text-sm font-medium text-text">Nenhum resultado encontrado</p>

              <p className="mt-1 text-xs text-text-muted">Tente pesquisar usando outro termo.</p>
            </div>
          )}

          {!loading && hasResults && (
            <div role="listbox" aria-label="Resultados da busca" className="space-y-1">
              {results.map((result, index) => {
                const selected = index === selectedIndex;

                return (
                  <button
                    id={`global-search-result-${index}`}
                    key={`${result.type}-${result.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => openResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={[
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                      selected ? "bg-white/10" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg transition",
                        selected ? "bg-white/10" : "bg-white/5 group-hover:bg-white/10",
                      ].join(" ")}
                    >
                      {getResultIcon(result.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className="
                            min-w-0
                            truncate
                            text-sm
                            font-medium
                            text-text
                          "
                        >
                          {result.title}
                        </p>

                        <span
                          className="
                            shrink-0
                            rounded-md
                            bg-white/5
                            px-1.5
                            py-0.5
                            text-[10px]
                            text-text-muted
                          "
                        >
                          {getResultType(result.type)}
                        </span>
                      </div>

                      {result.description && (
                        <p
                          className="
                            mt-0.5
                            truncate
                            text-xs
                            text-text-muted
                          "
                        >
                          {result.description}
                        </p>
                      )}
                    </div>

                    {selected && (
                      <span
                        className="
                          hidden
                          shrink-0
                          items-center
                          gap-1
                          text-[11px]
                          text-text-muted
                          sm:flex
                        "
                      >
                        <kbd
                          className="
                            rounded
                            border
                            border-white/10
                            bg-white/5
                            px-1.5
                            py-0.5
                          "
                        >
                          Enter
                        </kbd>

                        <span>abrir</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="
            flex
            items-center
            justify-between
            gap-4
            border-t
            border-white/10
            px-4
            py-3
            sm:px-5
          "
        >
          <div
            className="
              flex
              items-center
              gap-3
              text-[11px]
              text-text-muted
              sm:gap-4
            "
          >
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">↑</kbd>

              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">↓</kbd>

              <span className="hidden sm:inline">navegar</span>
            </span>

            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">Enter</kbd>

              <span className="hidden sm:inline">abrir</span>
            </span>
          </div>

          <span className="shrink-0 text-[11px] text-text-muted">Ctrl + F</span>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * CARTA DO THEO
 * ============================================================
 *
 * O modal fica FORA do componente Theo.
 * O Theo apenas dispara o evento para abrir.
 */
function TheoLetterModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    window.addEventListener("theo:open-letter", handleOpen);

    return () => {
      window.removeEventListener("theo:open-letter", handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="
        fixed
        inset-0
        z-[10000]
        flex
        items-center
        justify-center
        bg-black/70
        p-4
        backdrop-blur-sm
      "
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theo-letter-title"
        className="
          relative
          w-full
          max-w-lg
          overflow-hidden
          rounded-3xl
          border
          border-white/10
          bg-ink-soft
          shadow-2xl
          shadow-black/60
        "
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div
          className="
            border-b
            border-white/10
            px-6
            py-5
          "
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                Theo
              </p>

              <h2
                id="theo-letter-title"
                className="
                  mt-1
                  font-display
                  text-xl
                  font-semibold
                  text-text
                "
              >
                Uma carta para você
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="
                flex
                h-8
                w-8
                shrink-0
                items-center
                justify-center
                rounded-lg
                bg-white/5
                text-lg
                text-text-muted
                transition
                hover:bg-white/10
                hover:text-text
              "
              aria-label="Fechar carta"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-7">
          <div
            className="
              mb-6
              flex
              justify-center
            "
          >
            <div
              className="
                flex
                h-16
                w-16
                items-center
                justify-center
                rounded-2xl
                bg-white/5
                text-3xl
              "
            >
              💌
            </div>
          </div>

          <p
            className="
              text-center
              text-base
              leading-7
              text-text
            "
          >
            Hoje não precisa ser perfeito.
            <br />
            Só precisa acontecer.
          </p>

          <p
            className="
              mt-4
              text-center
              text-sm
              leading-6
              text-text-muted
            "
          >
            Continue construindo sua rotina,
            <br />
            um dia de cada vez.
          </p>

          <p
            className="
              mt-7
              text-center
              text-sm
              font-medium
              text-text-muted
            "
          >
            — Theo
          </p>
        </div>

        <div
          className="
            border-t
            border-white/10
            px-6
            py-4
          "
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="
              w-full
              rounded-xl
              bg-white/10
              px-4
              py-2.5
              text-sm
              font-medium
              text-text
              transition
              hover:bg-white/15
              active:scale-[0.99]
            "
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * ROOT
 * ============================================================
 */

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <GlobalSearch />

        <TheoLetterModal />

        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
