/**
 * ============================================================
 * THEO — BANCO LOCAL
 * ============================================================
 *
 * Camada de dados 100% local usando IndexedDB.
 *
 * Usada principalmente quando:
 * - usuário está offline;
 * - usuário não está logado;
 * - usuário está no modo "somente neste dispositivo".
 *
 * Stores principais:
 * - folders
 * - decks
 * - note_types
 * - notes
 * - cards
 *
 * Stores auxiliares:
 * - kv
 * - error_logs
 *
 * PRINCÍPIOS:
 * - não depender de API para carregar os dados locais;
 * - não apagar dados durante migrações;
 * - recuperar conexão fechada;
 * - tratar banco bloqueado;
 * - evitar Promise presa;
 * - registrar erros sem criar loop infinito;
 * - funcionar bem com grande quantidade de dados.
 * ============================================================
 */

const DB_NAME = "theo-local";

/**
 * IMPORTANTE:
 *
 * Se alterar stores ou índices:
 * aumente esta versão.
 */
const DB_VERSION = 4;

/**
 * ============================================================
 * STORES
 * ============================================================
 */

export const STORES = {
  folders: "folders",
  decks: "decks",
  noteTypes: "note_types",
  notes: "notes",
  cards: "cards",
  kv: "kv",
  errorLogs: "error_logs",
} as const;

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

export interface LocalErrorLog {
  id: string;

  created_at: string;

  type: string;

  message: string;

  operation?: string;

  store?: string;

  stack?: string;

  status?: number;

  details?: unknown;

  synced?: boolean;
}

/**
 * ============================================================
 * DATABASE STATE
 * ============================================================
 */

let dbPromise: Promise<IDBDatabase> | null = null;

let activeDb: IDBDatabase | null = null;

let openingDatabase = false;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/**
 * ============================================================
 * ERROR MESSAGE
 * ============================================================
 */

export function extractLocalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || "Erro desconhecido.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (
      error as {
        message?: unknown;
      }
    ).message === "string"
  ) {
    return (
      error as {
        message: string;
      }
    ).message;
  }

  try {
    const serialized = JSON.stringify(error);

    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // ignora
  }

  return "Erro desconhecido.";
}

/**
 * ============================================================
 * NORMALIZE ERROR
 * ============================================================
 */

function normalizeError(error: unknown): {
  message: string;
  stack?: string;
  status?: number;
  details?: unknown;
} {
  if (error instanceof Error) {
    const possibleStatus =
      "status" in error &&
      typeof (
        error as Error & {
          status?: unknown;
        }
      ).status === "number"
        ? (
            error as Error & {
              status: number;
            }
          ).status
        : undefined;

    return {
      message: error.message || error.name || "Erro desconhecido.",
      stack: error.stack,
      status: possibleStatus,
    };
  }

  if (typeof error === "string") {
    return {
      message: error,
    };
  }

  if (error && typeof error === "object") {
    const objectError = error as {
      message?: unknown;
      stack?: unknown;
      status?: unknown;
      details?: unknown;
      response?: {
        status?: unknown;
      };
    };

    const status =
      typeof objectError.status === "number"
        ? objectError.status
        : typeof objectError.response?.status === "number"
          ? objectError.response.status
          : undefined;

    return {
      message:
        typeof objectError.message === "string"
          ? objectError.message
          : extractLocalErrorMessage(error),
      stack: typeof objectError.stack === "string" ? objectError.stack : undefined,
      status,
      details: objectError.details,
    };
  }

  return {
    message: extractLocalErrorMessage(error),
  };
}

/**
 * ============================================================
 * DATABASE OPEN
 * ============================================================
 *
 * Abertura robusta do IndexedDB.
 *
 * Tratamos:
 * - blocked;
 * - versionchange;
 * - close;
 * - erro;
 * - conexão inválida;
 * - múltiplas chamadas simultâneas.
 * ============================================================
 */

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("IndexedDB não está disponível neste ambiente."));
  }

  /**
   * Se já temos uma conexão viva,
   * reutilizamos.
   */
  if (activeDb) {
    return Promise.resolve(activeDb);
  }

  /**
   * Se já existe uma abertura em andamento,
   * reutilizamos a mesma Promise.
   */
  if (dbPromise) {
    return dbPromise;
  }

  if (openingDatabase) {
    return dbPromise ?? Promise.reject(new Error("Falha ao inicializar IndexedDB."));
  }

  openingDatabase = true;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      openingDatabase = false;
      dbPromise = null;

      reject(error);

      return;
    }

    /**
     * ========================================================
     * UPGRADE
     * ========================================================
     */

    request.onupgradeneeded = (event) => {
      const db = request.result;

      const transaction = request.transaction;

      const oldVersion = event.oldVersion;

      const newVersion = event.newVersion;

      console.info(`[Theo][IndexedDB] Migração ${oldVersion} → ${newVersion}`);

      /**
       * ------------------------------------------------------
       * FOLDERS
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.folders)) {
        db.createObjectStore(STORES.folders, {
          keyPath: "id",
        });
      }

      /**
       * ------------------------------------------------------
       * DECKS
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.decks)) {
        db.createObjectStore(STORES.decks, {
          keyPath: "id",
        });
      }

      /**
       * ------------------------------------------------------
       * NOTE TYPES
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.noteTypes)) {
        const store = db.createObjectStore(STORES.noteTypes, {
          keyPath: "id",
        });

        store.createIndex("name", "name", {
          unique: false,
        });
      } else if (transaction) {
        const store = transaction.objectStore(STORES.noteTypes);

        if (!store.indexNames.contains("name")) {
          store.createIndex("name", "name", {
            unique: false,
          });
        }
      }

      /**
       * ------------------------------------------------------
       * NOTES
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.notes)) {
        const store = db.createObjectStore(STORES.notes, {
          keyPath: "id",
        });

        store.createIndex("deck_id", "deck_id", {
          unique: false,
        });
      } else if (transaction) {
        const store = transaction.objectStore(STORES.notes);

        if (!store.indexNames.contains("deck_id")) {
          store.createIndex("deck_id", "deck_id", {
            unique: false,
          });
        }
      }

      /**
       * ------------------------------------------------------
       * CARDS
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.cards)) {
        const store = db.createObjectStore(STORES.cards, {
          keyPath: "id",
        });

        store.createIndex("deck_id", "deck_id", {
          unique: false,
        });

        store.createIndex("note_id", "note_id", {
          unique: false,
        });
      } else if (transaction) {
        const store = transaction.objectStore(STORES.cards);

        if (!store.indexNames.contains("deck_id")) {
          store.createIndex("deck_id", "deck_id", {
            unique: false,
          });
        }

        if (!store.indexNames.contains("note_id")) {
          store.createIndex("note_id", "note_id", {
            unique: false,
          });
        }
      }

      /**
       * ------------------------------------------------------
       * KV
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.kv)) {
        db.createObjectStore(STORES.kv, {
          keyPath: "key",
        });
      }

      /**
       * ------------------------------------------------------
       * ERROR LOGS
       * ------------------------------------------------------
       */

      if (!db.objectStoreNames.contains(STORES.errorLogs)) {
        const store = db.createObjectStore(STORES.errorLogs, {
          keyPath: "id",
        });

        store.createIndex("created_at", "created_at", {
          unique: false,
        });

        store.createIndex("type", "type", {
          unique: false,
        });

        store.createIndex("synced", "synced", {
          unique: false,
        });
      } else if (transaction) {
        const store = transaction.objectStore(STORES.errorLogs);

        if (!store.indexNames.contains("created_at")) {
          store.createIndex("created_at", "created_at", {
            unique: false,
          });
        }

        if (!store.indexNames.contains("type")) {
          store.createIndex("type", "type", {
            unique: false,
          });
        }

        if (!store.indexNames.contains("synced")) {
          store.createIndex("synced", "synced", {
            unique: false,
          });
        }
      }
    };

    /**
     * ========================================================
     * BLOCKED
     * ========================================================
     */

    request.onblocked = () => {
      console.warn("[Theo][IndexedDB] Upgrade bloqueado. Outra conexão ainda está aberta.");

      /**
       * Não rejeitamos imediatamente.
       *
       * O navegador pode concluir a migração
       * assim que a conexão antiga for fechada.
       */
    };

    /**
     * ========================================================
     * SUCCESS
     * ========================================================
     */

    request.onsuccess = () => {
      const db = request.result;

      activeDb = db;

      openingDatabase = false;

      /**
       * ------------------------------------------------------
       * VERSION CHANGE
       * ------------------------------------------------------
       *
       * Outra aba pediu uma versão mais nova.
       *
       * Precisamos fechar esta conexão.
       */

      db.onversionchange = () => {
        console.warn("[Theo][IndexedDB] Mudança de versão detectada. Fechando conexão.");

        try {
          db.close();
        } catch {
          // ignorado
        }

        if (activeDb === db) {
          activeDb = null;
        }

        dbPromise = null;
      };

      /**
       * ------------------------------------------------------
       * CLOSE
       * ------------------------------------------------------
       */

      db.onclose = () => {
        console.warn("[Theo][IndexedDB] Conexão encerrada.");

        if (activeDb === db) {
          activeDb = null;
        }

        dbPromise = null;
      };

      /**
       * ------------------------------------------------------
       * ERROR
       * ------------------------------------------------------
       */

      db.onerror = (event) => {
        console.warn("[Theo][IndexedDB] Erro na conexão:", event);
      };

      dbPromise = Promise.resolve(db);

      resolve(db);
    };

    /**
     * ========================================================
     * ERROR
     * ========================================================
     */

    request.onerror = () => {
      const error = request.error ?? new Error("Não foi possível abrir o IndexedDB.");

      console.error("[Theo][IndexedDB] Falha ao abrir banco:", error);

      openingDatabase = false;

      activeDb = null;

      dbPromise = null;

      reject(error);
    };
  });

  /**
   * Se a Promise falhar,
   * precisamos permitir nova tentativa.
   */
  dbPromise.catch(() => {
    dbPromise = null;
    openingDatabase = false;
  });

  return dbPromise;
}

/**
 * ============================================================
 * ENSURE STORE
 * ============================================================
 *
 * Verifica se uma store existe antes de criar uma transação.
 *
 * Isso gera mensagens muito mais claras em caso de banco
 * corrompido ou migração incompleta.
 * ============================================================
 */

async function ensureStore(storeName: string): Promise<IDBDatabase> {
  const db = await openDb();

  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(`Store "${storeName}" não existe no banco local.`);
  }

  return db;
}

/**
 * ============================================================
 * WITH STORE
 * ============================================================
 */

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await ensureStore(storeName);

  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction | null = null;

    let request: IDBRequest<T> | void;

    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;

      reject(error);
    };

    try {
      transaction = db.transaction(storeName, mode);

      const store = transaction.objectStore(storeName);

      request = fn(store);
    } catch (error) {
      fail(error);
      return;
    }

    let requestResult: T | undefined;

    /**
     * --------------------------------------------------------
     * REQUEST
     * --------------------------------------------------------
     */

    if (request) {
      request.onsuccess = () => {
        requestResult = request!.result;
      };

      request.onerror = () => {
        fail(request!.error ?? new Error(`Erro na operação da store "${storeName}".`));
      };
    }

    /**
     * --------------------------------------------------------
     * TRANSACTION COMPLETE
     * --------------------------------------------------------
     */

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }

      settled = true;

      resolve(requestResult as T);
    };

    /**
     * --------------------------------------------------------
     * TRANSACTION ERROR
     * --------------------------------------------------------
     */

    transaction.onerror = () => {
      fail(transaction?.error ?? new Error(`Erro na transação "${storeName}".`));
    };

    /**
     * --------------------------------------------------------
     * ABORT
     * --------------------------------------------------------
     */

    transaction.onabort = () => {
      fail(transaction?.error ?? new Error(`Transação abortada "${storeName}".`));
    };
  });
}

/**
 * ============================================================
 * GET ALL
 * ============================================================
 */

export async function getAll<T>(
  storeName: string,
  indexName?: string,
  query?: IDBValidKey,
): Promise<T[]> {
  const db = await ensureStore(storeName);

  return new Promise<T[]>((resolve, reject) => {
    let tx: IDBTransaction | null = null;

    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;

      reject(error);
    };

    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      fail(error);
      return;
    }

    let source: IDBObjectStore | IDBIndex;

    try {
      const store = tx.objectStore(storeName);

      source = indexName ? store.index(indexName) : store;
    } catch (error) {
      fail(error);
      return;
    }

    let request: IDBRequest<T[]>;

    try {
      request = query !== undefined ? source.getAll(query) : source.getAll();
    } catch (error) {
      fail(error);
      return;
    }

    request.onsuccess = () => {
      if (settled) {
        return;
      }

      settled = true;

      resolve(request.result as T[]);
    };

    request.onerror = () => {
      fail(request.error ?? new Error(`Erro ao consultar "${storeName}".`));
    };

    tx.onerror = () => {
      fail(tx?.error ?? new Error(`Erro na transação "${storeName}".`));
    };

    tx.onabort = () => {
      fail(tx?.error ?? new Error(`Consulta abortada "${storeName}".`));
    };
  });
}

/**
 * ============================================================
 * GET
 * ============================================================
 */

export async function get<T>(storeName: string, id: string): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, "readonly", (store) => store.get(id));
}

/**
 * ============================================================
 * PUT
 * ============================================================
 */

export async function put<T>(storeName: string, value: T): Promise<T> {
  await withStore<IDBValidKey>(storeName, "readwrite", (store) => store.put(value));

  return value;
}

/**
 * ============================================================
 * DELETE
 * ============================================================
 */

export async function del(storeName: string, id: string): Promise<void> {
  await withStore<undefined>(storeName, "readwrite", (store) => {
    store.delete(id);

    return undefined;
  });
}

/**
 * ============================================================
 * KV GET
 * ============================================================
 */

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await get<{
    key: string;
    value: T;
  }>(STORES.kv, key);

  return row?.value;
}

/**
 * ============================================================
 * KV SET
 * ============================================================
 */

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await put(STORES.kv, {
    key,
    value,
  });
}

/**
 * ============================================================
 * LOCAL ID
 * ============================================================
 */

export function genId(prefix: string): string {
  let randomPart: string;

  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      randomPart = crypto.randomUUID();
    } else {
      randomPart = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  } catch {
    randomPart = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  return `local-${prefix}-${randomPart}`;
}

/**
 * ============================================================
 * NOW ISO
 * ============================================================
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * ============================================================
 * LOCAL ID CHECK
 * ============================================================
 */

export function isLocalId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("local-");
}

/**
 * ============================================================
 * ERROR LOG
 * ============================================================
 */

export async function logLocalError(params: {
  type?: string;
  error: unknown;
  operation?: string;
  store?: string;
  details?: unknown;
  status?: number;
}): Promise<LocalErrorLog | null> {
  const normalized = normalizeError(params.error);

  const record: LocalErrorLog = {
    id: genId("error"),

    created_at: nowIso(),

    type: params.type ?? "unknown",

    message: normalized.message,

    operation: params.operation,

    store: params.store,

    stack: normalized.stack,

    status: params.status !== undefined ? params.status : normalized.status,

    details: params.details !== undefined ? params.details : normalized.details,

    synced: false,
  };

  /**
   * IMPORTANTE:
   *
   * Se o próprio IndexedDB estiver quebrado,
   * não chamamos logLocalError novamente.
   *
   * Isso evita loop infinito.
   */

  try {
    await put(STORES.errorLogs, record);

    return record;
  } catch (storageError) {
    console.error("[Theo][IndexedDB] Não foi possível salvar erro:", storageError, record);

    return null;
  }
}

/**
 * ============================================================
 * INDEXEDDB ERROR
 * ============================================================
 */

export async function logIndexedDbError(
  error: unknown,
  operation?: string,
  store?: string,
  details?: unknown,
): Promise<LocalErrorLog | null> {
  return logLocalError({
    type: "indexeddb",
    error,
    operation,
    store,
    details,
  });
}

/**
 * ============================================================
 * SYNC ERROR
 * ============================================================
 */

export async function logSyncError(
  error: unknown,
  operation?: string,
  details?: unknown,
): Promise<LocalErrorLog | null> {
  return logLocalError({
    type: "sync",
    error,
    operation,
    details,
  });
}

/**
 * ============================================================
 * API ERROR
 * ============================================================
 */

export async function logApiError(
  error: unknown,
  operation?: string,
  status?: number,
  details?: unknown,
): Promise<LocalErrorLog | null> {
  return logLocalError({
    type: "api",
    error,
    operation,
    status,
    details,
  });
}

/**
 * ============================================================
 * ERROR LOGS
 * ============================================================
 */

export async function getErrorLogs(): Promise<LocalErrorLog[]> {
  const logs = await getAll<LocalErrorLog>(STORES.errorLogs, "created_at");

  return logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * ============================================================
 * ERROR LOGS BY TYPE
 * ============================================================
 */

export async function getErrorLogsByType(type: string): Promise<LocalErrorLog[]> {
  const logs = await getAll<LocalErrorLog>(STORES.errorLogs, "type", type);

  return logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * ============================================================
 * UNSYNCED ERRORS
 * ============================================================
 */

export async function getUnsyncedErrorLogs(): Promise<LocalErrorLog[]> {
  const logs = await getErrorLogs();

  return logs.filter((log) => log.synced !== true);
}

/**
 * ============================================================
 * MARK ERROR SYNCED
 * ============================================================
 */

export async function markErrorAsSynced(id: string): Promise<void> {
  const log = await get<LocalErrorLog>(STORES.errorLogs, id);

  if (!log) {
    return;
  }

  await put(STORES.errorLogs, {
    ...log,
    synced: true,
  });
}

/**
 * ============================================================
 * MARK MANY ERRORS SYNCED
 * ============================================================
 */

export async function markErrorsAsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = await ensureStore(STORES.errorLogs);

  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction | null = null;

    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;

      reject(error);
    };

    try {
      tx = db.transaction(STORES.errorLogs, "readwrite");
    } catch (error) {
      fail(error);
      return;
    }

    const store = tx.objectStore(STORES.errorLogs);

    for (const id of ids) {
      const request = store.get(id);

      request.onsuccess = () => {
        const log = request.result as LocalErrorLog | undefined;

        if (!log) {
          return;
        }

        store.put({
          ...log,
          synced: true,
        });
      };

      request.onerror = () => {
        fail(request.error ?? new Error(`Erro ao atualizar log ${id}.`));
      };
    }

    tx.oncomplete = () => {
      if (settled) {
        return;
      }

      settled = true;

      resolve();
    };

    tx.onerror = () => {
      fail(tx?.error ?? new Error("Erro ao marcar logs como sincronizados."));
    };

    tx.onabort = () => {
      fail(tx?.error ?? new Error("Transação de logs abortada."));
    };
  });
}

/**
 * ============================================================
 * DELETE ERROR LOG
 * ============================================================
 */

export async function deleteErrorLog(id: string): Promise<void> {
  await del(STORES.errorLogs, id);
}

/**
 * ============================================================
 * CLEAR ERROR LOGS
 * ============================================================
 */

export async function clearErrorLogs(): Promise<void> {
  const db = await ensureStore(STORES.errorLogs);

  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction | null = null;

    try {
      tx = db.transaction(STORES.errorLogs, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    const request = tx.objectStore(STORES.errorLogs).clear();

    request.onerror = () => {
      reject(request.error ?? new Error("Não foi possível limpar os logs."));
    };

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(tx?.error ?? new Error("Erro ao limpar logs."));
    };

    tx.onabort = () => {
      reject(tx?.error ?? new Error("Limpeza dos logs abortada."));
    };
  });
}

/**
 * ============================================================
 * ERROR LOG COUNT
 * ============================================================
 */

export async function getErrorLogCount(): Promise<number> {
  const db = await ensureStore(STORES.errorLogs);

  return new Promise<number>((resolve, reject) => {
    let tx: IDBTransaction | null = null;

    try {
      tx = db.transaction(STORES.errorLogs, "readonly");
    } catch (error) {
      reject(error);
      return;
    }

    const request = tx.objectStore(STORES.errorLogs).count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Não foi possível contar os logs."));
    };

    tx.onerror = () => {
      reject(tx?.error ?? new Error("Erro ao contar logs."));
    };
  });
}

/**
 * ============================================================
 * CLEAR ALL LOCAL DATA
 * ============================================================
 *
 * APAGA SOMENTE:
 * - folders
 * - decks
 * - note_types
 * - notes
 * - cards
 *
 * NÃO APAGA:
 * - kv
 * - error_logs
 * ============================================================
 */

export async function clearAllLocalData(): Promise<void> {
  const db = await openDb();

  const names = [STORES.folders, STORES.decks, STORES.noteTypes, STORES.notes, STORES.cards];

  for (const name of names) {
    if (!db.objectStoreNames.contains(name)) {
      continue;
    }
  }

  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction | null = null;

    try {
      tx = db.transaction(names, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    try {
      for (const name of names) {
        if (db.objectStoreNames.contains(name)) {
          tx.objectStore(name).clear();
        }
      }
    } catch (error) {
      reject(error);
      return;
    }

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(tx?.error ?? new Error("Erro ao limpar os dados locais."));
    };

    tx.onabort = () => {
      reject(tx?.error ?? new Error("Limpeza dos dados locais abortada."));
    };
  });
}

/**
 * ============================================================
 * DATABASE INFO
 * ============================================================
 *
 * Útil para diagnóstico no Theo.
 * ============================================================
 */

export async function getLocalDatabaseInfo(): Promise<{
  name: string;
  version: number;
  stores: string[];
}> {
  const db = await openDb();

  return {
    name: DB_NAME,
    version: db.version,
    stores: Array.from(db.objectStoreNames),
  };
}

/**
 * ============================================================
 * DATABASE HEALTH CHECK
 * ============================================================
 */

export async function checkLocalDatabase(): Promise<{
  ok: boolean;
  version: number;
  stores: string[];
  error?: string;
}> {
  try {
    const info = await getLocalDatabaseInfo();

    const requiredStores = [
      STORES.folders,
      STORES.decks,
      STORES.noteTypes,
      STORES.notes,
      STORES.cards,
      STORES.kv,
      STORES.errorLogs,
    ];

    const missing = requiredStores.filter((store) => !info.stores.includes(store));

    if (missing.length > 0) {
      return {
        ok: false,
        version: info.version,
        stores: info.stores,
        error: `Stores ausentes: ${missing.join(", ")}`,
      };
    }

    return {
      ok: true,
      version: info.version,
      stores: info.stores,
    };
  } catch (error) {
    return {
      ok: false,
      version: 0,
      stores: [],
      error: extractLocalErrorMessage(error),
    };
  }
}

/**
 * ============================================================
 * CLOSE DATABASE
 * ============================================================
 *
 * Útil quando:
 * - usuário troca de conta;
 * - logout;
 * - testes;
 * - hot reload;
 * - recuperação de conexão.
 * ============================================================
 */

export function closeLocalDatabase(): void {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // ignorado
    }
  }

  activeDb = null;

  dbPromise = null;

  openingDatabase = false;
}

/**
 * ============================================================
 * RESET DATABASE
 * ============================================================
 *
 * ATENÇÃO:
 *
 * Esta função APAGA TODO o IndexedDB.
 *
 * Não deve ser usada automaticamente.
 *
 * Serve apenas para recuperação manual de banco
 * corrompido ou desenvolvimento.
 * ============================================================
 */

export async function deleteLocalDatabase(): Promise<void> {
  closeLocalDatabase();

  if (!hasIndexedDB()) {
    throw new Error("IndexedDB não está disponível.");
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Não foi possível apagar o banco local."));
    };

    request.onblocked = () => {
      console.warn("[Theo][IndexedDB] Exclusão do banco bloqueada por outra conexão.");
    };
  });
}
