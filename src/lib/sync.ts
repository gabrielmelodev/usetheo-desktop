import { http } from "./api";
import { cloudflareFullSync } from "./cloudSync";

import {
  dbGet,
  dbGetAll,
  dbPutRemote,
  dbDeleteRemote,
  metaGet,
  metaSet,
  listPendingDeletes,
  clearPendingDeletes,
  type StoreName,
  type SyncEntityType,
} from "./localdb";

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const SYNC_CURSOR_KEY = "sync_since";

const INITIAL_SYNC_DATE = "1970-01-01T00:00:00Z";

export type SyncStatus = "idle" | "syncing" | "done" | "error";

export const SYNC_FINISHED_EVENT = "theo-sync-finished";

// ============================================================
// EVENTO GLOBAL DE SYNC
// ============================================================

/**
 * Avisa o app inteiro que o banco local acabou de ser atualizado.
 *
 * Telas como Dashboard, Estatísticas e Estudar podem
 * escutar esse evento para recarregar seus dados.
 */
function notifySyncFinished(detail: Record<string, unknown>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SYNC_FINISHED_EVENT, {
      detail,
    }),
  );
}

// ============================================================
// STORES
// ============================================================

const ENTITY_STORE: Record<
  Extract<SyncEntityType, "deck" | "folder" | "note_type" | "note" | "card">,
  StoreName
> = {
  deck: "decks",
  folder: "folders",
  note_type: "note_types",
  note: "notes",
  card: "cards",
};

// ============================================================
// HELPERS
// ============================================================

function safeParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") {
    return (raw as T) ?? fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ============================================================
// COMPARAÇÃO DE DATAS
// ============================================================

/**
 * Compara updated_at com segurança.
 *
 * Retorna:
 *
 *  1  -> a é mais nova
 *  0  -> iguais
 * -1  -> b é mais nova
 */
function compareUpdatedAt(a: unknown, b: unknown): number {
  if (!a || !b) {
    return 0;
  }

  const timeA = new Date(String(a)).getTime();

  const timeB = new Date(String(b)).getTime();

  if (!Number.isFinite(timeA) || !Number.isFinite(timeB)) {
    return 0;
  }

  if (timeA > timeB) {
    return 1;
  }

  if (timeA < timeB) {
    return -1;
  }

  return 0;
}

// ============================================================
// NORMALIZAÇÃO DE NOTE TYPE
// ============================================================

function normalizeNoteType(noteType: any): any {
  if (!noteType) {
    return noteType;
  }

  return {
    ...noteType,

    fields: safeParse(noteType.fields, []),

    templates: safeParse(noteType.templates, []),
  };
}

// ============================================================
// NORMALIZAÇÃO DE NOTE
// ============================================================

function normalizeNote(note: any): any {
  if (!note) {
    return note;
  }

  return {
    ...note,

    fields: safeParse(note.fields, {}),

    tags: safeParse(note.tags, []),
  };
}

// ============================================================
// PUSH RESPONSE
// ============================================================

interface PushResponse {
  success?: boolean;

  applied: {
    note_types?: number;
    decks: number;
    folders: number;
    notes: number;
    cards: number;
    deletes: number;
  };

  server_time: string;
}

// ============================================================
// CHANGES RESPONSE
// ============================================================

interface ChangesResponse {
  server_time: string;

  note_types?: any[];
  decks?: any[];
  notes?: any[];
  cards?: any[];
  folders?: any[];

  deletes?: {
    entity_type: SyncEntityType;
    id: string;
    updated_at?: string;
    deleted_at?: string;
  }[];

  [key: string]: any;
}

// ============================================================
// PUSH — DISPOSITIVO → SERVIDOR
// ============================================================

/**
 * Envia todos os dados locais para o servidor.
 *
 * ORDEM LÓGICA:
 *
 * 1. note_types
 * 2. folders
 * 3. decks
 * 4. notes
 * 5. cards
 * 6. deletes
 *
 * O backend também respeita essa ordem.
 */
export async function pushToServer(): Promise<{
  pushed: number;
  deleted: number;
}> {
  console.log("[Theo Sync] ========================================");

  console.log("[Theo Sync] PUSH iniciado");

  // ==========================================================
  // BUSCAR DADOS LOCAIS
  // ==========================================================

  const [noteTypes, decks, folders, notes, cards, pending] = await Promise.all([
    dbGetAll<any>("note_types"),

    dbGetAll<any>("decks"),

    dbGetAll<any>("folders"),

    dbGetAll<any>("notes"),

    dbGetAll<any>("cards"),

    listPendingDeletes(),
  ]);

  // ==========================================================
  // NORMALIZAR NOTE TYPES
  // ==========================================================

  const normalizedNoteTypes = noteTypes.map(normalizeNoteType);

  // ==========================================================
  // NORMALIZAR NOTES
  // ==========================================================

  const normalizedNotes = notes.map(normalizeNote);

  // ==========================================================
  // DELETES
  // ==========================================================

  const deletes = pending.map((p) => ({
    entity_type: p.entity_type,
    id: p.entity_id,
  }));

  // ==========================================================
  // LOG DOS DADOS LOCAIS
  // ==========================================================

  console.log("[Theo Sync] Dados locais encontrados:");

  console.log("[Theo Sync] note_types:", normalizedNoteTypes.length);

  console.log("[Theo Sync] folders:", folders.length);

  console.log("[Theo Sync] decks:", decks.length);

  console.log("[Theo Sync] notes:", normalizedNotes.length);

  console.log("[Theo Sync] cards:", cards.length);

  console.log("[Theo Sync] deletes:", deletes.length);

  // ==========================================================
  // LOG DOS NOTE TYPES
  // ==========================================================

  if (normalizedNoteTypes.length > 0) {
    console.log(
      "[Theo Sync] note_types locais:",
      normalizedNoteTypes.map((noteType) => ({
        id: noteType.id,
        name: noteType.name,
      })),
    );
  }

  // ==========================================================
  // LOG DAS NOTES
  // ==========================================================

  if (normalizedNotes.length > 0) {
    console.log(
      "[Theo Sync] notes locais:",
      normalizedNotes.map((note) => ({
        id: note.id,
        note_type_id: note.note_type_id,
        deck_id: note.deck_id,
      })),
    );
  }

  // ==========================================================
  // VALIDAR REFERÊNCIAS DAS NOTES
  // ==========================================================

  /**
   * Antes de mandar para o servidor verificamos se cada note
   * possui o note_type correspondente no banco local.
   *
   * Isso evita mandar uma note impossível de sincronizar.
   */

  const noteTypeIds = new Set<string>(
    normalizedNoteTypes.map((noteType) => noteType?.id).filter(Boolean),
  );

  const notesWithoutNoteType = normalizedNotes.filter(
    (note) => note?.note_type_id && !noteTypeIds.has(note.note_type_id),
  );

  if (notesWithoutNoteType.length > 0) {
    console.error("[Theo Sync] ERRO: existem notes cujo note_type_id não existe localmente.");

    console.error(
      "[Theo Sync] Notes problemáticas:",
      notesWithoutNoteType.map((note) => ({
        id: note.id,
        note_type_id: note.note_type_id,
        deck_id: note.deck_id,
      })),
    );

    throw new Error(
      "Existem notas locais sem o note_type correspondente. " +
        "A sincronização foi interrompida para evitar inconsistência.",
    );
  }

  // ==========================================================
  // VERIFICAR SE EXISTE ALGO PARA ENVIAR
  // ==========================================================

  const hasAnything =
    normalizedNoteTypes.length > 0 ||
    decks.length > 0 ||
    folders.length > 0 ||
    normalizedNotes.length > 0 ||
    cards.length > 0 ||
    deletes.length > 0;

  if (!hasAnything) {
    console.log("[Theo Sync] Nada para enviar.");

    console.log("[Theo Sync] ========================================");

    return {
      pushed: 0,
      deleted: 0,
    };
  }

  // ==========================================================
  // PAYLOAD
  // ==========================================================

  const payload = {
    note_types: normalizedNoteTypes,

    folders,

    decks,

    notes: normalizedNotes,

    cards,

    deletes,
  };

  // ==========================================================
  // LOG DO PAYLOAD
  // ==========================================================

  console.log("[Theo Sync] ========================================");

  console.log("[Theo Sync] MOBILE → SERVER");

  console.log("[Theo Sync] POST /sync/push");

  console.log("[Theo Sync] Payload:", {
    note_types: payload.note_types.length,

    folders: payload.folders.length,

    decks: payload.decks.length,

    notes: payload.notes.length,

    cards: payload.cards.length,

    deletes: payload.deletes.length,
  });

  // ==========================================================
  // LOG CRÍTICO PARA NOTE TYPE
  // ==========================================================

  if (payload.note_types.length > 0) {
    console.log(
      "[Theo Sync] NOTE TYPES enviados:",
      payload.note_types.map((noteType) => ({
        id: noteType.id,
        name: noteType.name,
      })),
    );
  }

  if (payload.notes.length > 0) {
    console.log(
      "[Theo Sync] NOTES enviadas:",
      payload.notes.map((note) => ({
        id: note.id,
        note_type_id: note.note_type_id,
        deck_id: note.deck_id,
      })),
    );
  }

  // ==========================================================
  // ENVIO PARA O SERVIDOR
  // ==========================================================

  let data: PushResponse;

  try {
    const response = await http.post<PushResponse>("/sync/push", payload);

    data = response.data;
  } catch (error: any) {
    console.error("[Theo Sync] ERRO no POST /sync/push");

    console.error("[Theo Sync] Status:", error?.response?.status);

    console.error("[Theo Sync] Resposta:", error?.response?.data);

    console.error("[Theo Sync] Mensagem:", error?.message);

    throw error;
  }

  // ==========================================================
  // RESPOSTA DO SERVIDOR
  // ==========================================================

  console.log("[Theo Sync] SERVER → MOBILE");

  console.log("[Theo Sync] /sync/push resposta:", {
    success: data.success,

    applied: data.applied,

    server_time: data.server_time,
  });

  // ==========================================================
  // LIMPAR SOMENTE AS EXCLUSÕES ENVIADAS
  // ==========================================================

  if (pending.length > 0) {
    console.log("[Theo Sync] Limpando deletes pendentes:", pending.length);

    await clearPendingDeletes(pending.map((p) => p.id));
  }

  // ==========================================================
  // CONTADOR
  // ==========================================================

  const pushed =
    (data.applied.note_types ?? 0) +
    data.applied.decks +
    data.applied.folders +
    data.applied.notes +
    data.applied.cards;

  console.log("[Theo Sync] PUSH concluído:", {
    pushed,
    deleted: data.applied.deletes,
  });

  console.log("[Theo Sync] ========================================");

  return {
    pushed,
    deleted: data.applied.deletes,
  };
}

// ============================================================
// MERGE DE UM REGISTRO
// ============================================================

/**
 * Mescla um registro vindo do servidor com o local.
 *
 * Campos exclusivamente locais são preservados.
 *
 * Se o registro local for mais novo, não será sobrescrito.
 */
async function mergeRecord(store: StoreName, incoming: any): Promise<boolean> {
  if (!incoming || !incoming.id) {
    return false;
  }

  const { deleted: _deleted, ...rest } = incoming;

  const existing = await dbGet<any>(store, rest.id);

  // ==========================================================
  // NÃO SOBRESCREVER VERSÃO LOCAL MAIS NOVA
  // ==========================================================

  if (
    existing?.updated_at &&
    rest.updated_at &&
    compareUpdatedAt(existing.updated_at, rest.updated_at) > 0
  ) {
    return false;
  }

  // ==========================================================
  // MESCLAGEM
  // ==========================================================

  const merged = existing
    ? {
        ...existing,
        ...rest,
      }
    : rest;

  await dbPutRemote(store, merged);

  return true;
}

// ============================================================
// MERGE DE VÁRIOS REGISTROS
// ============================================================

async function mergeMany(store: StoreName, records: any[]): Promise<number> {
  let applied = 0;

  for (const record of records) {
    if (await mergeRecord(store, record)) {
      applied++;
    }
  }

  return applied;
}

// ============================================================
// EXCLUSÕES RECEBIDAS DO SERVIDOR
// ============================================================

/**
 * Aplica exclusões vindas do servidor.
 *
 * Se existir uma versão local mais nova que a exclusão,
 * o registro não será apagado.
 */
async function applyServerDeletes(deletes: ChangesResponse["deletes"]): Promise<number> {
  if (!deletes?.length) {
    return 0;
  }

  let deleted = 0;

  for (const del of deletes) {
    const store = ENTITY_STORE[del.entity_type as SyncEntityType];

    if (!store) {
      console.warn("[Theo Sync] Store não encontrada para delete:", del.entity_type);

      continue;
    }

    const existing = await dbGet<any>(store, del.id);

    // ========================================================
    // NÃO APAGAR VERSÃO LOCAL MAIS NOVA
    // ========================================================

    if (existing?.updated_at && del.updated_at) {
      const comparison = compareUpdatedAt(existing.updated_at, del.updated_at);

      if (comparison > 0) {
        continue;
      }
    }

    // ========================================================
    // REGISTRO NÃO EXISTE LOCALMENTE
    // ========================================================

    if (!existing) {
      continue;
    }

    // ========================================================
    // EXCLUIR
    // ========================================================

    await dbDeleteRemote(store, del.id);

    deleted++;
  }

  return deleted;
}

// ============================================================
// PULL — SERVIDOR → DISPOSITIVO
// ============================================================

export async function pullFromServer(): Promise<{
  pulled: number;
}> {
  // ==========================================================
  // CURSOR
  // ==========================================================

  const since = (await metaGet<string>(SYNC_CURSOR_KEY)) ?? INITIAL_SYNC_DATE;

  console.log("[Theo Sync] ========================================");

  console.log("[Theo Sync] PULL iniciado");

  console.log("[Theo Sync] Cursor:", since);

  console.log("[Theo Sync] MOBILE → SERVER");

  console.log("[Theo Sync] GET /sync/changes");

  // ==========================================================
  // REQUEST
  // ==========================================================

  let data: ChangesResponse;

  try {
    const response = await http.get<ChangesResponse>("/sync/changes", {
      params: {
        since,
      },
    });

    data = response.data;
  } catch (error: any) {
    console.error("[Theo Sync] ERRO no GET /sync/changes");

    console.error("[Theo Sync] Status:", error?.response?.status);

    console.error("[Theo Sync] Resposta:", error?.response?.data);

    console.error("[Theo Sync] Mensagem:", error?.message);

    throw error;
  }

  // ==========================================================
  // RESPOSTA
  // ==========================================================

  console.log("[Theo Sync] SERVER → MOBILE");

  console.log("[Theo Sync] /sync/changes recebido:", {
    server_time: data.server_time,

    note_types: data.note_types?.length ?? 0,

    folders: data.folders?.length ?? 0,

    decks: data.decks?.length ?? 0,

    notes: data.notes?.length ?? 0,

    cards: data.cards?.length ?? 0,

    deletes: data.deletes?.length ?? 0,
  });

  let pulled = 0;

  // ==========================================================
  // NOTE TYPES
  // ==========================================================

  if (data.note_types?.length) {
    console.log("[Theo Sync] Aplicando note_types:", data.note_types.length);

    const parsedNoteTypes = data.note_types.map(normalizeNoteType);

    pulled += await mergeMany("note_types", parsedNoteTypes);
  }

  // ==========================================================
  // FOLDERS
  // ==========================================================

  if (data.folders?.length) {
    console.log("[Theo Sync] Aplicando folders:", data.folders.length);

    pulled += await mergeMany("folders", data.folders);
  }

  // ==========================================================
  // DECKS
  // ==========================================================

  if (data.decks?.length) {
    console.log("[Theo Sync] Aplicando decks:", data.decks.length);

    pulled += await mergeMany("decks", data.decks);
  }

  // ==========================================================
  // NOTES
  // ==========================================================

  if (data.notes?.length) {
    console.log("[Theo Sync] Aplicando notes:", data.notes.length);

    const parsedNotes = data.notes.map(normalizeNote);

    pulled += await mergeMany("notes", parsedNotes);
  }

  // ==========================================================
  // CARDS
  // ==========================================================

  if (data.cards?.length) {
    console.log("[Theo Sync] Aplicando cards:", data.cards.length);

    pulled += await mergeMany("cards", data.cards);
  }

  // ==========================================================
  // EXCLUSÕES
  // ==========================================================

  const deleted = await applyServerDeletes(data.deletes);

  // ==========================================================
  // CURSOR
  // ==========================================================

  const nextCursor = data.server_time ?? new Date().toISOString();

  await metaSet(SYNC_CURSOR_KEY, nextCursor);

  console.log("[Theo Sync] Cursor atualizado:", nextCursor);

  // ==========================================================
  // LOG FINAL
  // ==========================================================

  console.log("[Theo Sync] PULL concluído:", {
    pulled,
    deleted,
    serverTime: data.server_time,
  });

  // ==========================================================
  // AVISAR UI
  // ==========================================================

  notifySyncFinished({
    pulled,
    deleted,
    source: "pull",
  });

  console.log("[Theo Sync] ========================================");

  return {
    pulled,
  };
}

// ============================================================
// FULL SYNC
// ============================================================

/**
 * Push seguido de Pull.
 *
 * Fluxo:
 *
 * 1. SQLite → PostgreSQL
 * 2. PostgreSQL → SQLite
 */
export async function fullSync(): Promise<{
  pulled: number;
  pushed: number;
  deleted: number;
}> {
  console.log("[Theo Sync] ========================================");

  console.log("[Theo Sync] FULL SYNC iniciado");

  try {
    // O Worker Cloudflare usa o protocolo de eventos incremental.
    // O backend Rust atual continua disponível como fallback de compatibilidade.
    const apiUrl = String(import.meta.env.VITE_API_URL ?? "");
    const useCloudflare =
      import.meta.env.VITE_SYNC_PROTOCOL === "cloudflare" ||
      apiUrl.includes("workers.dev");

    if (useCloudflare) {
      const result = await cloudflareFullSync();

      notifySyncFinished({
        ...result,
        source: "cloudflare-sync",
      });

      return result;
    }

    // ========================================================
    // 1. PUSH
    // ========================================================

    const { pushed, deleted } = await pushToServer();

    // ========================================================
    // 2. PULL
    // ========================================================

    const { pulled } = await pullFromServer();

    const result = {
      pulled,
      pushed,
      deleted,
    };

    console.log("[Theo Sync] FULL SYNC concluído:", result);

    console.log("[Theo Sync] ========================================");

    notifySyncFinished({
      ...result,
      source: "full-sync",
    });

    return result;
  } catch (error) {
    console.error("[Theo Sync] FULL SYNC falhou:", error);

    console.log("[Theo Sync] ========================================");

    throw error;
  }
}

// ============================================================
// RESET DO CURSOR
// ============================================================

/**
 * Faz o próximo pull buscar novamente desde o início.
 *
 * Útil para:
 *
 * - logout/login;
 * - recuperação de dados;
 * - debug;
 * - reinstalação/reconstrução do banco local.
 */
export async function resetSyncCursor(): Promise<void> {
  console.log("[Theo Sync] Resetando cursor:", SYNC_CURSOR_KEY);

  await metaSet(SYNC_CURSOR_KEY, null);

  console.log("[Theo Sync] Cursor resetado.");
}

// ============================================================
// FORCE FULL SYNC
// ============================================================

/**
 * Limpa o cursor e força uma sincronização completa.
 *
 * Use principalmente:
 *
 * - primeiro login no dispositivo;
 * - recuperação do banco local;
 * - debug;
 * - troca de conta.
 */
export async function forceFullSync(): Promise<{
  pulled: number;
  pushed: number;
  deleted: number;
}> {
  console.log("[Theo Sync] ========================================");

  console.log("[Theo Sync] FORCE FULL SYNC");

  // ==========================================================
  // RESET
  // ==========================================================

  await resetSyncCursor();

  // ==========================================================
  // GARANTIR CURSOR INICIAL
  // ==========================================================

  await metaSet(SYNC_CURSOR_KEY, INITIAL_SYNC_DATE);

  const confirmedCursor = await metaGet<string>(SYNC_CURSOR_KEY);

  console.log("[Theo Sync] Cursor confirmado:", confirmedCursor);

  // ==========================================================
  // EXECUTAR
  // ==========================================================

  const result = await fullSync();

  console.log("[Theo Sync] FORCE FULL SYNC concluído:", result);

  console.log("[Theo Sync] ========================================");

  return result;
}

// ============================================================
// INITIAL SYNC
// ============================================================

/**
 * Alias para o primeiro carregamento de dados.
 */
export async function initialSync(): Promise<{
  pulled: number;
  pushed: number;
  deleted: number;
}> {
  return forceFullSync();
}
