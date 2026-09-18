// ============================================================
// BANCO LOCAL (IndexedDB)
// ============================================================

const DB_NAME = "theo-local";

// v3:
// - garante todos os object stores obrigatórios
// - corrige instalações antigas/incompletas
// - inclui note_types para sincronização completa
const DB_VERSION = 3;

// ============================================================
// OBJECT STORES
// ============================================================

export const STORES = [
  "decks",
  "folders",
  "note_types",
  "notes",
  "cards",
  "review_log",
  "exams",
  "exam_subjects",
  "exam_topics",
  "study_logs",
  "topic_reviews",
  "manual_schedule",
  "goals",
  "pending_deletes",
  "meta",
] as const;

export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

// ============================================================
// ABERTURA DO BANCO
// ============================================================

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, {
            keyPath: "id",
          });
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;

      reject(request.error ?? new Error("Não foi possível abrir o banco local do Theo."));
    };

    request.onblocked = () => {
      console.warn("[Theo] A abertura do banco local está bloqueada por outra conexão.");
    };
  });

  return dbPromise;
}

// ============================================================
// OBJECT STORE
// ============================================================

function getObjectStore(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
): IDBObjectStore {
  if (!db.objectStoreNames.contains(store)) {
    throw new Error(`O banco local do Theo não possui o armazenamento "${store}".`);
  }

  return db.transaction(store, mode).objectStore(store);
}

// ============================================================
// LEITURA
// ============================================================

export async function dbGetAll<T = unknown>(store: StoreName): Promise<T[]> {
  const db = await openDb();

  return new Promise<T[]>((resolve, reject) => {
    let request: IDBRequest;

    try {
      request = getObjectStore(db, store, "readonly").getAll();
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => {
      resolve(request.result as T[]);
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Erro ao ler o armazenamento "${store}".`));
    };
  });
}

export async function dbGet<T = unknown>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await openDb();

  return new Promise<T | undefined>((resolve, reject) => {
    let request: IDBRequest;

    try {
      request = getObjectStore(db, store, "readonly").get(id);
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => {
      resolve(request.result as T | undefined);
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Erro ao ler "${id}" no armazenamento "${store}".`));
    };
  });
}

// ============================================================
// ESCRITA
// ============================================================

export async function dbPut<T extends { id: string }>(store: StoreName, value: T): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest;

    try {
      request = getObjectStore(db, store, "readwrite").put(value);
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => {
      resolve(value);
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Erro ao salvar no armazenamento "${store}".`));
    };
  });
}

export async function dbPutMany<T extends { id: string }>(
  store: StoreName,
  values: T[],
): Promise<void> {
  if (!values.length) {
    return;
  }

  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction;

    try {
      transaction = db.transaction(store, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    const objectStore = transaction.objectStore(store);

    for (const value of values) {
      objectStore.put(value);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error(`Erro ao salvar dados em "${store}".`));
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error(`A operação em "${store}" foi abortada.`));
    };
  });
}

// ============================================================
// EXCLUSÃO
// ============================================================

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    let request: IDBRequest;

    try {
      request = getObjectStore(db, store, "readwrite").delete(id);
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Erro ao excluir "${id}" de "${store}".`));
    };
  });
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    let request: IDBRequest;

    try {
      request = getObjectStore(db, store, "readwrite").clear();
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error(`Erro ao limpar "${store}".`));
    };
  });
}

// ============================================================
// META
// ============================================================

export async function metaGet<T = unknown>(key: string): Promise<T | undefined> {
  const row = await dbGet<{
    id: string;
    value: T;
  }>("meta", key);

  return row?.value;
}

export async function metaSet<T = unknown>(key: string, value: T): Promise<void> {
  await dbPut("meta", {
    id: key,
    value,
  });
}

// ============================================================
// IDS / DATAS
// ============================================================

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ============================================================
// TIPOS DE ENTIDADES SINCRONIZÁVEIS
// ============================================================

export type SyncEntityType = "folder" | "deck" | "note_type" | "note" | "card";

// ============================================================
// TUMBA DE EXCLUSÕES
// ============================================================

export interface PendingDelete {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  deleted_at: string;
}

// ============================================================
// ADICIONA EXCLUSÃO À FILA
// ============================================================

export async function queueDeletion(entityType: SyncEntityType, entityId: string): Promise<void> {
  const entry: PendingDelete = {
    id: `${entityType}:${entityId}`,
    entity_type: entityType,
    entity_id: entityId,
    deleted_at: nowIso(),
  };

  console.log("[Theo Sync] Exclusão adicionada à fila:", entry);

  await dbPut("pending_deletes", entry);
}

// ============================================================
// LISTA EXCLUSÕES PENDENTES
// ============================================================

export async function listPendingDeletes(): Promise<PendingDelete[]> {
  return dbGetAll<PendingDelete>("pending_deletes");
}

// ============================================================
// LIMPA EXCLUSÕES JÁ ENVIADAS
// ============================================================

export async function clearPendingDeletes(ids: string[]): Promise<void> {
  for (const id of ids) {
    await dbDelete("pending_deletes", id);
  }
}

// ============================================================
// UTILITÁRIOS DE BANCO
// ============================================================

export async function dbHas(store: StoreName, id: string): Promise<boolean> {
  const value = await dbGet(store, id);

  return value !== undefined;
}

export async function dbCount(store: StoreName): Promise<number> {
  const values = await dbGetAll(store);

  return values.length;
}

// ============================================================
// FECHAMENTO DO BANCO
// ============================================================

export async function closeDb(): Promise<void> {
  if (!dbPromise) {
    return;
  }

  try {
    const db = await dbPromise;
    db.close();
  } finally {
    dbPromise = null;
  }
}

// ============================================================
// DEBUG
// ============================================================

export async function getLocalDatabaseStats(): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};

  for (const store of STORES) {
    try {
      stats[store] = await dbCount(store);
    } catch (error) {
      console.error(`[Theo] Erro ao contar "${store}":`, error);

      stats[store] = 0;
    }
  }

  return stats;
}
