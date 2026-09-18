import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

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
  adminCreateNativeDeck,
  adminDeleteDeck,
  adminListAllDecks,
  adminListUsers,
  adminPlatformStats,
  adminSetDeckTemplate,
  adminSetUserRole,
  extractErrorMessage,
} from "../lib/api";

import { useAuth } from "../lib/auth-context";
import type { AdminUserRow, Deck } from "../lib/types";

type PlatformStats = {
  total_users: number;
  total_decks: number;
  total_template_decks: number;
  total_cards: number;
  total_exams: number;
};

const PAGE_SIZE = 25;

type DeckWithOwner = Deck & {
  owner_email?: string;
};

export default function Admin() {
  const { user } = useAuth();

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [allDecks, setAllDecks] = useState<DeckWithOwner[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [deckSearch, setDeckSearch] = useState("");

  const [userPage, setUserPage] = useState(1);
  const [deckPage, setDeckPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [s, u, d] = await Promise.all([
        adminPlatformStats(),
        adminListUsers(),
        adminListAllDecks(),
      ]);

      setStats(s);
      setUsers(u);
      setAllDecks(d);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * ============================================================
   * USUÁRIOS
   * ============================================================
   */

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();

    if (!search) {
      return users;
    }

    return users.filter((u) => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase().trim();

      const email = (u.email ?? "").toLowerCase();
      const role = (u.role ?? "").toLowerCase();

      return name.includes(search) || email.includes(search) || role.includes(search);
    });
  }, [users, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * PAGE_SIZE;

    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, userPage]);

  useEffect(() => {
    if (userPage > totalUserPages) {
      setUserPage(totalUserPages);
    }
  }, [userPage, totalUserPages]);

  /*
   * ============================================================
   * DECKS
   * ============================================================
   */

  const templateDecks = useMemo(() => {
    return allDecks.filter((deck) => deck.is_template);
  }, [allDecks]);

  const filteredDecks = useMemo(() => {
    const search = deckSearch.trim().toLowerCase();

    if (!search) {
      return allDecks;
    }

    return allDecks.filter((deck) => {
      const name = (deck.name ?? "").toLowerCase();
      const owner = (deck.owner_email ?? "").toLowerCase();

      return name.includes(search) || owner.includes(search);
    });
  }, [allDecks, deckSearch]);

  const totalDeckPages = Math.max(1, Math.ceil(filteredDecks.length / PAGE_SIZE));

  const paginatedDecks = useMemo(() => {
    const start = (deckPage - 1) * PAGE_SIZE;

    return filteredDecks.slice(start, start + PAGE_SIZE);
  }, [filteredDecks, deckPage]);

  useEffect(() => {
    if (deckPage > totalDeckPages) {
      setDeckPage(totalDeckPages);
    }
  }, [deckPage, totalDeckPages]);

  /*
   * ============================================================
   * ALTERAR ROLE
   * ============================================================
   */

  async function toggleRole(targetUser: AdminUserRow) {
    setBusyId(targetUser.id);
    setError(null);

    const newRole = targetUser.role === "admin" ? "user" : "admin";

    try {
      await adminSetUserRole(targetUser.id, newRole);

      /*
       * Atualização local.
       *
       * Não fazemos load() novamente.
       * Isso evita baixar todos os usuários e decks
       * depois de cada alteração.
       */
      setUsers((current) =>
        current.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u)),
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /*
   * ============================================================
   * ALTERAR TEMPLATE
   * ============================================================
   */

  async function toggleTemplate(deck: Deck) {
    setBusyId(deck.id);
    setError(null);

    const newValue = !deck.is_template;

    try {
      await adminSetDeckTemplate(deck.id, newValue);

      /*
       * Atualização local.
       *
       * Evita nova consulta de todos os decks.
       */
      setAllDecks((current) =>
        current.map((item) =>
          item.id === deck.id
            ? {
                ...item,
                is_template: newValue,
              }
            : item,
        ),
      );

      /*
       * Atualiza também a estatística local.
       */
      setStats((current) => {
        if (!current) return current;

        return {
          ...current,
          total_template_decks: current.total_template_decks + (newValue ? 1 : -1),
        };
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /*
   * ============================================================
   * EXCLUIR DECK
   * ============================================================
   */

  async function removeDeck(deck: Deck) {
    const confirmed = confirm(
      `Remover "${deck.name}" da plataforma?\n\n` + `Isso apaga o deck de quem for o dono.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyId(deck.id);
    setError(null);

    try {
      await adminDeleteDeck(deck.id);

      /*
       * Remove imediatamente da interface.
       */
      setAllDecks((current) => current.filter((item) => item.id !== deck.id));

      /*
       * Atualiza estatísticas localmente.
       */
      setStats((current) => {
        if (!current) return current;

        return {
          ...current,
          total_decks: Math.max(0, current.total_decks - 1),
          total_template_decks: deck.is_template
            ? Math.max(0, current.total_template_decks - 1)
            : current.total_template_decks,
          total_cards: Math.max(0, current.total_cards - (deck.total_cards ?? 0)),
        };
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /*
   * ============================================================
   * ACESSO
   * ============================================================
   */

  if (user && user.role !== "admin") {
    return (
      <div className="p-8">
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10" />}
          title="Acesso restrito"
          description="Esta área é só para administradores."
        />
      </div>
    );
  }

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div>
        <h1 className="font-display text-2xl text-text">Administração</h1>

        <p className="mt-1 text-sm text-text-muted">
          Controle geral da plataforma: usuários, decks e Baralhos do Theo.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Usuários" value={stats.total_users} />

              <StatCard label="Decks" value={stats.total_decks} />

              <StatCard label="Baralhos do Theo" value={stats.total_template_decks} />

              <StatCard label="Cartões" value={stats.total_cards} />

              <StatCard label="Editais" value={stats.total_exams} />
            </div>
          )}

          {/* ================================================== */}
          {/* USUÁRIOS */}
          {/* ================================================== */}

          <Panel>
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-text-muted" />

                <h2 className="font-display text-lg text-text">Usuários</h2>

                <Badge tone="neutral">{filteredUsers.length}</Badge>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />

                <Input
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  placeholder="Buscar usuário ou e-mail..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {paginatedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {u.first_name} {u.last_name}
                    </p>

                    <p className="truncate text-xs text-text-muted">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>

                    <Button
                      variant="secondary"
                      disabled={busyId === u.id}
                      onClick={() => toggleRole(u)}
                    >
                      {busyId === u.id
                        ? "Aguarde..."
                        : u.role === "admin"
                          ? "Remover admin"
                          : "Tornar admin"}
                    </Button>
                  </div>
                </div>
              ))}

              {paginatedUsers.length === 0 && (
                <p className="py-8 text-center text-sm text-text-muted">
                  Nenhum usuário encontrado.
                </p>
              )}
            </div>

            {filteredUsers.length > PAGE_SIZE && (
              <Pagination
                page={userPage}
                totalPages={totalUserPages}
                totalItems={filteredUsers.length}
                pageSize={PAGE_SIZE}
                onPrevious={() => setUserPage((page) => Math.max(1, page - 1))}
                onNext={() => setUserPage((page) => Math.min(totalUserPages, page + 1))}
              />
            )}
          </Panel>

          {/* ================================================== */}
          {/* BARALHOS DO THEO */}
          {/* ================================================== */}

          <Panel>
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-text-muted" />

                <h2 className="font-display text-lg text-text">Baralhos do Theo</h2>

                <Badge tone="streak">{templateDecks.length}</Badge>
              </div>

              <Button variant="secondary" onClick={() => setCreating((value) => !value)}>
                <Plus className="h-4 w-4" />
                Criar baralho nativo
              </Button>
            </div>

            <p className="mb-4 text-sm text-text-muted">
              Um baralho criado aqui já nasce como modelo público. Depois de criado, adicione tipos
              de nota e cartões nele normalmente.
            </p>

            {creating && (
              <NativeDeckForm
                onDone={() => {
                  setCreating(false);
                  void load();
                }}
              />
            )}

            <div className="divide-y divide-white/[0.06]">
              {templateDecks.map((deck) => (
                <DeckAdminRow
                  key={deck.id}
                  deck={deck}
                  busy={busyId === deck.id}
                  onToggle={() => toggleTemplate(deck)}
                  onRemove={() => removeDeck(deck)}
                />
              ))}

              {templateDecks.length === 0 && (
                <p className="py-8 text-center text-sm text-text-muted">
                  Nenhum Baralho do Theo ainda.
                </p>
              )}
            </div>
          </Panel>

          {/* ================================================== */}
          {/* TODOS OS DECKS */}
          {/* ================================================== */}

          <Panel>
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-text-muted" />

                <h2 className="font-display text-lg text-text">Todos os decks da plataforma</h2>

                <Badge tone="neutral">{filteredDecks.length}</Badge>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />

                <Input
                  value={deckSearch}
                  onChange={(e) => {
                    setDeckSearch(e.target.value);
                    setDeckPage(1);
                  }}
                  placeholder="Buscar deck ou proprietário..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {paginatedDecks.map((deck) => (
                <DeckAdminRow
                  key={deck.id}
                  deck={deck}
                  busy={busyId === deck.id}
                  onToggle={() => toggleTemplate(deck)}
                  onRemove={() => removeDeck(deck)}
                  showOwner
                />
              ))}

              {paginatedDecks.length === 0 && (
                <p className="py-8 text-center text-sm text-text-muted">Nenhum deck encontrado.</p>
              )}
            </div>

            {filteredDecks.length > PAGE_SIZE && (
              <Pagination
                page={deckPage}
                totalPages={totalDeckPages}
                totalItems={filteredDecks.length}
                pageSize={PAGE_SIZE}
                onPrevious={() => setDeckPage((page) => Math.max(1, page - 1))}
                onNext={() => setDeckPage((page) => Math.min(totalDeckPages, page + 1))}
              />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/*
 * ============================================================
 * STAT CARD
 * ============================================================
 */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="text-center">
      <p className="font-display text-2xl text-text">{value.toLocaleString("pt-BR")}</p>

      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </Panel>
  );
}

/*
 * ============================================================
 * DECK ROW
 * ============================================================
 */

function DeckAdminRow({
  deck,
  busy,
  onToggle,
  onRemove,
  showOwner,
}: {
  deck: DeckWithOwner;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
  showOwner?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <Link
          to={`/decks/${deck.id}`}
          className="block truncate text-sm font-medium text-text hover:underline"
        >
          {deck.name}
        </Link>

        <p className="truncate text-xs text-text-muted">
          {(deck.total_cards ?? 0).toLocaleString("pt-BR")} cartões
          {showOwner && deck.owner_email ? ` · ${deck.owner_email}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {deck.is_template && <Badge tone="streak">Baralho do Theo</Badge>}

        <Button variant="secondary" disabled={busy} onClick={onToggle}>
          {busy ? "Aguarde..." : deck.is_template ? "Remover de modelo" : "Tornar modelo"}
        </Button>

        <Button variant="danger" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * PAGINATION
 * ============================================================
 */

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const firstItem = (page - 1) * pageSize + 1;

  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-text-muted">
        Mostrando {firstItem.toLocaleString("pt-BR")}–{lastItem.toLocaleString("pt-BR")} de{" "}
        {totalItems.toLocaleString("pt-BR")}
      </p>

      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={onPrevious}>
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>

        <span className="min-w-[80px] text-center text-xs text-text-muted">
          Página {page} de {totalPages}
        </span>

        <Button variant="secondary" disabled={page >= totalPages} onClick={onNext}>
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * NATIVE DECK FORM
 * ============================================================
 */

function NativeDeckForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#8b5cf6");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await adminCreateNativeDeck({
        name: cleanName,
        description: cleanDescription || undefined,
        color,
      });

      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label>Nome</Label>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Direito Constitucional — Essencial"
            disabled={loading}
          />
        </div>

        <div>
          <Label>Cor</Label>

          <Input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-[42px] p-1"
            disabled={loading}
          />
        </div>
      </div>

      <div className="mt-3">
        <Label>Descrição (opcional)</Label>

        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="mt-3">
        <Button disabled={loading || !name.trim()} onClick={submit}>
          {loading ? "Criando..." : "Criar baralho"}
        </Button>
      </div>
    </div>
  );
}
