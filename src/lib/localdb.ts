/**
 * Theo — armazenamento local.
 *
 * Desktop Electron: SQLite via IPC (fonte operacional).
 * Web/fallback: IndexedDB legado, preservando o funcionamento atual.
 *
 * O SQLite mantém também uma fila de eventos para sincronização incremental.
 */

import * as legacy from "./localdb-legacy";

export type StoreName =
  | "decks"
  | "folders"
  | "note_types"
  | "notes"
  | "cards"
  | "review_log"
  | "exams"
  | "exam_subjects"
  | "exam_topics"
  | "study_logs"
  | "topic_reviews"
  | "manual_schedule"
  | "goals"
  | "questions"
  | "question_attempts"
  | "pending_deletes"
  | "meta";

export type SyncEntityType =
  | "folder"
  | "deck"
  | "note_type"
  | "note"
  | "card"
  | Exclude<StoreName, "pending_deletes" | "meta">;

export const STORES: readonly StoreName[] = [
  "decks", "folders", "note_types", "notes", "cards", "review_log",
  "exams", "exam_subjects", "exam_topics", "study_logs", "topic_reviews",
  "manual_schedule", "goals", "questions", "question_attempts",
  "pending_deletes", "meta",
];

export interface PendingDelete {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  deleted_at: string;
}

export interface SyncQueueEvent {
  event_id: string;
  entity_type: string;
  entity_id: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: unknown;
  version: number;
  created_at: string;
  retry_count: number;
  status: string;
}

type DesktopLocalDatabase = {
  getStatus: () => Promise<{ initialized: boolean; path: string }>;
  switchAccount: (accountId: string | null) => Promise<unknown>;
  getActiveAccount: () => Promise<string | null>;
  adoptAnonymousData: (accountId: string) => Promise<unknown>;
  migrateFromIndexedDB: (records: Record<string, unknown[]>) => Promise<unknown>;
  getAll: (store: string) => Promise<unknown[]>;
  count: (store: string) => Promise<number>;
  get: (store: string, id: string) => Promise<unknown>;
  put: (store: string, value: unknown, options?: { sync?: boolean }) => Promise<unknown>;
  putMany: (store: string, values: unknown[], options?: { sync?: boolean }) => Promise<void>;
  delete: (store: string, id: string, options?: { sync?: boolean }) => Promise<void>;
  clear: (store: string) => Promise<void>;
  metaGet: (key: string) => Promise<unknown>;
  metaSet: (key: string, value: unknown) => Promise<void>;
  getSyncQueue: (limit?: number) => Promise<SyncQueueEvent[]>;
  ackSyncQueue: (eventIds: string[]) => Promise<void>;
  retrySyncQueue: (eventIds: string[]) => Promise<void>;
  incrementClock: () => Promise<number>;
  recordConflict: (conflict: Record<string, unknown>) => Promise<void>;
  getMetrics: () => Promise<Record<string, number>>;
};

declare global {
  interface Window {
    theoDesktop?: {
      localDatabase?: DesktopLocalDatabase;
    };
  }
}

function desktopDb(): DesktopLocalDatabase | null {
  if (typeof window === "undefined") return null;
  return window.theoDesktop?.localDatabase ?? null;
}

let initialization: Promise<void> | null = null;

async function initialize(): Promise<void> {
  const bridge = desktopDb();
  if (!bridge) return;

  const status = await bridge.getStatus();
  if (status.initialized) return;

  // Migração única e não destrutiva do IndexedDB existente.
  // O banco antigo continua intacto até o usuário confirmar/validar a nova instalação.
  const records: Record<string, unknown[]> = {};
  for (const store of legacy.STORES) {
    try {
      records[store] = await legacy.dbGetAll(store);
    } catch {
      records[store] = [];
    }
  }

  await bridge.migrateFromIndexedDB(records);
}

async function ensureInitialized(): Promise<void> {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export async function dbCount(store: StoreName): Promise<number> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.count(store);
  return (await legacy.dbGetAll(store as legacy.StoreName)).length;
}

export async function dbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return (await bridge.getAll(store)) as T[];
  return legacy.dbGetAll<T>(store as legacy.StoreName);
}

export async function dbGet<T = unknown>(store: StoreName, id: string): Promise<T | undefined> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return (await bridge.get(store, id)) as T | undefined;
  return legacy.dbGet<T>(store as legacy.StoreName, id);
}

export async function dbPut<T extends { id: string }>(
  store: StoreName,
  value: T,
): Promise<T> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return (await bridge.put(store, value, { sync: true })) as T;
  return legacy.dbPut(store as legacy.StoreName, value);
}

export async function dbPutRemote<T extends { id: string }>(
  store: StoreName,
  value: T,
): Promise<T> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return (await bridge.put(store, value, { sync: false })) as T;
  return legacy.dbPut(store as legacy.StoreName, value);
}

export async function dbPutMany<T extends { id: string }>(
  store: StoreName,
  values: T[],
): Promise<void> {
  await ensureInitialized();
  if (!values.length) return;
  const bridge = desktopDb();
  if (bridge) {
    await bridge.putMany(store, values, { sync: true });
    return;
  }
  await legacy.dbPutMany(store as legacy.StoreName, values);
}

export async function dbPutManyRemote<T extends { id: string }>(
  store: StoreName,
  values: T[],
): Promise<void> {
  await ensureInitialized();
  if (!values.length) return;
  const bridge = desktopDb();
  if (bridge) {
    await bridge.putMany(store, values, { sync: false });
    return;
  }
  await legacy.dbPutMany(store as legacy.StoreName, values);
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) {
    await bridge.delete(store, id, { sync: true });
    return;
  }
  await legacy.dbDelete(store as legacy.StoreName, id);
}

export async function dbDeleteRemote(store: StoreName, id: string): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) {
    await bridge.delete(store, id, { sync: false });
    return;
  }
  await legacy.dbDelete(store as legacy.StoreName, id);
}

export async function dbClear(store: StoreName): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.clear(store);
  return legacy.dbClear(store as legacy.StoreName);
}

export async function metaGet<T = unknown>(key: string): Promise<T | undefined> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return (await bridge.metaGet(key)) as T | undefined;
  return legacy.metaGet<T>(key);
}

export async function metaSet<T = unknown>(key: string, value: T): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.metaSet(key, value);
  return legacy.metaSet(key, value);
}

export async function metaSetRemote<T = unknown>(key: string, value: T): Promise<void> {
  // Meta não entra na fila de entidades automaticamente.
  await metaSet(key, value);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function queueDeletion(entityType: SyncEntityType, entityId: string): Promise<void> {
  const entry: PendingDelete = {
    id: `${entityType}:${entityId}`,
    entity_type: entityType,
    entity_id: entityId,
    deleted_at: nowIso(),
  };

  // Mantém a fila antiga para compatibilidade com o protocolo Rust atual.
  await dbPut("pending_deletes", entry);
}

export async function listPendingDeletes(): Promise<PendingDelete[]> {
  return dbGetAll<PendingDelete>("pending_deletes");
}

export async function clearPendingDeletes(ids: string[]): Promise<void> {
  for (const id of ids) await dbDeleteRemote("pending_deletes", id);
}

export async function getSyncQueue(limit = 100): Promise<SyncQueueEvent[]> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.getSyncQueue(limit);
  return [];
}

export async function ackSyncQueue(eventIds: string[]): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge && eventIds.length) await bridge.ackSyncQueue(eventIds);
}

export async function retrySyncQueue(eventIds: string[]): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge && eventIds.length) await bridge.retrySyncQueue(eventIds);
}

export async function switchLocalAccount(accountId: string | null): Promise<void> {
  const bridge = desktopDb();
  if (!bridge) return;
  await bridge.switchAccount(accountId);
}

export async function adoptAnonymousData(accountId: string): Promise<unknown> {
  const bridge = desktopDb();
  if (!bridge) return null;
  return bridge.adoptAnonymousData(accountId);
}

export async function getDeviceId(): Promise<string> {
  const existing = await metaGet<string>("device_id");
  if (existing) return existing;
  const id = newId();
  await metaSet("device_id", id);
  return id;
}

export async function nextSyncClock(): Promise<number> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.incrementClock();
  const current = Number((await metaGet("sync_clock")) ?? 0);
  const next = current + 1;
  await metaSet("sync_clock", next);
  return next;
}

export async function recordSyncConflict(conflict: Record<string, unknown>): Promise<void> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) await bridge.recordConflict(conflict);
}

export async function getLocalDatabaseStats(): Promise<Record<string, number>> {
  await ensureInitialized();
  const bridge = desktopDb();
  if (bridge) return bridge.getMetrics();

  const stats: Record<string, number> = {};
  for (const store of STORES) {
    try { stats[store] = (await legacy.dbGetAll(store as legacy.StoreName)).length; } catch { stats[store] = 0; }
  }
  return stats;
}

export async function closeDb(): Promise<void> {
  const bridge = desktopDb();
  if (bridge) return;
  await legacy.closeDb();
}
