import { BookOpen, Globe, Lock, Sparkles, Trash2, Brain, Pencil, Check, X } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui";

import type { Deck } from "../../lib/types";

interface DeckHeaderProps {
  deck: Deck;

  cardsCount?: number;

  onStudy: () => void;

  onPublish?: () => void;

  onDelete?: () => void;

  /**
   * Salva o novo nome do deck.
   *
   * Se não for informado, os controles
   * de edição não serão exibidos.
   */
  onEdit?: (name?: string) => void;
}

export default function DeckHeader({
  deck,
  cardsCount = 0,
  onStudy,
  onPublish,
  onDelete,
  onEdit,
}: DeckHeaderProps) {
  const isTheo = deck.is_template === true;
  const isPublic = deck.is_public === true;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(deck.name);

  const inputRef = useRef<HTMLInputElement>(null);

  // =========================================================
  // SINCRONIZAR TÍTULO
  // =========================================================

  useEffect(() => {
    if (!editing) {
      setTitle(deck.name);
    }
  }, [deck.name, editing]);

  // =========================================================
  // INICIAR EDIÇÃO
  // =========================================================

  function startEditing() {
    if (!onEdit) {
      return;
    }

    setTitle(deck.name);
    setEditing(true);

    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  // =========================================================
  // CANCELAR EDIÇÃO
  // =========================================================

  function cancelEditing() {
    setTitle(deck.name);
    setEditing(false);
  }

  // =========================================================
  // SALVAR TÍTULO
  // =========================================================

  function saveTitle() {
    const newTitle = title.trim();

    if (!newTitle) {
      setTitle(deck.name);
      return;
    }

    if (newTitle === deck.name) {
      setEditing(false);
      return;
    }

    onEdit?.(newTitle);
    setEditing(false);
  }

  // =========================================================
  // TECLADO DO TÍTULO
  // =========================================================

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveTitle();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  // =========================================================
  // STATUS / PRIVACIDADE
  // =========================================================

  const privacyLabel = isTheo ? "Theo" : isPublic ? "Público" : "Privado";

  const PrivacyIcon = isTheo ? Sparkles : isPublic ? Globe : Lock;

  const privacyClassName = isTheo
    ? "bg-accent/10 text-accent"
    : isPublic
      ? "bg-emerald-500/10 text-emerald-400"
      : "bg-white/5 text-zinc-400";

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <section
      className="
        mb-8
        overflow-hidden
        rounded-3xl
        border
        border-white/[0.08]
        bg-gradient-to-br
        from-white/[0.04]
        to-transparent
        shadow-xl
      "
    >
      {/* =====================================================
          CONTEÚDO PRINCIPAL
      ===================================================== */}

      <div
        className="
          flex
          flex-col
          gap-6
          p-6
          lg:flex-row
          lg:items-center
          lg:justify-between
        "
      >
        {/* ===================================================
            INFORMAÇÕES
        =================================================== */}

        <div
          className="
            flex
            min-w-0
            items-start
            gap-5
          "
        >
          {/* =================================================
              ÍCONE
          ================================================= */}

          <div
            className={`
              hidden
              h-16
              w-16
              shrink-0
              items-center
              justify-center
              rounded-2xl
              sm:flex
              ${isTheo ? "bg-accent/15 text-accent" : "bg-accent/10 text-accent"}
            `}
          >
            {isTheo ? <Sparkles size={32} /> : <BookOpen size={32} />}
          </div>

          {/* =================================================
              TEXTO
          ================================================= */}

          <div className="min-w-0 flex-1">
            {/* ===============================================
                TÍTULO
            =============================================== */}

            {!editing ? (
              <div
                className="
                  flex
                  min-w-0
                  items-center
                  gap-2
                "
              >
                <h1
                  title={deck.name}
                  className="
                    max-w-[520px]
                    truncate
                    text-3xl
                    font-semibold
                    tracking-tight
                    text-white
                  "
                >
                  {deck.name}
                </h1>

                {onEdit && (
                  <button
                    type="button"
                    onClick={startEditing}
                    title="Editar nome do deck"
                    aria-label="Editar nome do deck"
                    className="
                      flex
                      h-8
                      w-8
                      shrink-0
                      items-center
                      justify-center
                      rounded-lg
                      text-zinc-400
                      transition
                      hover:bg-white/10
                      hover:text-white
                    "
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ) : (
              <div
                className="
                  flex
                  max-w-[620px]
                  items-center
                  gap-2
                "
              >
                {/* =========================================
                    INPUT
                ========================================= */}

                <input
                  ref={inputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  maxLength={120}
                  className="
                    min-w-0
                    flex-1
                    rounded-xl
                    border
                    border-accent/50
                    bg-white/[0.06]
                    px-3
                    py-2
                    text-2xl
                    font-semibold
                    tracking-tight
                    text-white
                    outline-none
                    transition
                    placeholder:text-zinc-500
                    focus:border-accent
                    focus:bg-white/[0.08]
                    focus:ring-2
                    focus:ring-accent/20
                  "
                  placeholder="Nome do deck"
                  aria-label="Nome do deck"
                />

                {/* =========================================
                    SALVAR
                ========================================= */}

                <button
                  type="button"
                  onClick={saveTitle}
                  title="Salvar"
                  aria-label="Salvar nome"
                  disabled={!title.trim()}
                  className="
                    flex
                    h-10
                    w-10
                    shrink-0
                    items-center
                    justify-center
                    rounded-xl
                    bg-accent
                    text-white
                    transition
                    hover:brightness-110
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                  "
                >
                  <Check size={18} />
                </button>

                {/* =========================================
                    CANCELAR
                ========================================= */}

                <button
                  type="button"
                  onClick={cancelEditing}
                  title="Cancelar"
                  aria-label="Cancelar edição"
                  className="
                    flex
                    h-10
                    w-10
                    shrink-0
                    items-center
                    justify-center
                    rounded-xl
                    border
                    border-white/10
                    bg-white/[0.04]
                    text-zinc-400
                    transition
                    hover:bg-white/10
                    hover:text-white
                  "
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* =================================================
                DESCRIÇÃO
            ================================================= */}

            <p
              className="
                mt-2
                max-w-xl
                line-clamp-2
                text-sm
                text-zinc-400
              "
            >
              {deck.description || "Organize seus estudos com repetição espaçada inteligente."}
            </p>

            {/* =================================================
                STATUS
            ================================================= */}

            <div
              className="
                mt-4
                flex
                flex-wrap
                gap-2
              "
            >
              {/* =============================================
                  QUANTIDADE DE CARTÕES
              ============================================= */}

              <span
                className="
                  flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/10
                  bg-white/5
                  px-3
                  py-1.5
                  text-xs
                  text-zinc-300
                "
              >
                <BookOpen size={14} className="text-accent-bright" />

                <span>{cardsCount}</span>

                <span>{cardsCount === 1 ? "cartão" : "cartões"}</span>
              </span>

              {/* =============================================
                  PRIVACIDADE / ORIGEM
              ============================================= */}

              <span
                className={`
                  flex
                  items-center
                  gap-2
                  rounded-full
                  px-3
                  py-1.5
                  text-xs
                  ${privacyClassName}
                `}
              >
                <PrivacyIcon size={14} />

                {privacyLabel}
              </span>
            </div>
          </div>
        </div>

        {/* ===================================================
            AÇÕES
        =================================================== */}

        <div
          className="
            flex
            shrink-0
            flex-wrap
            justify-end
            gap-2
          "
        >
          {/* =================================================
              EDITAR
          ================================================= */}

          {onEdit && !editing && (
            <Button
              variant="secondary"
              onClick={startEditing}
              title="Editar deck"
              className="
                h-10
                gap-2
              "
            >
              <Pencil size={17} />

              <span className="hidden sm:inline">Editar</span>
            </Button>
          )}

          {/* =================================================
              ESTUDAR
          ================================================= */}

          <Button
            onClick={onStudy}
            className="
              h-10
              gap-2
              shadow-lg
              shadow-accent/20
            "
          >
            <Sparkles size={18} />
            Estudar
          </Button>
        </div>
      </div>

      {/* =====================================================
          RODAPÉ
      ===================================================== */}

      <div
        className="
          flex
          items-center
          gap-2
          border-t
          border-white/[0.08]
          bg-black/20
          px-6
          py-3
          text-xs
          text-zinc-400
        "
      >
        <Brain size={14} className="text-accent" />

        <span>
          {isTheo
            ? "Conteúdo oficial do Theo com revisão inteligente."
            : "Revisão inteligente ativa com repetição espaçada."}
        </span>
      </div>
    </section>
  );
}
