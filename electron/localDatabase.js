import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database = null;
let databasePath = null;
let basePath = null;
let activeAccountId = null;

const CURRENT_SCHEMA_VERSION = 1;

const SYNCABLE_STORES = new Set([
  "folders", "decks", "note_types", "notes", "cards",
  "exams", "exam_subjects", "exam_topics", "study_logs",
  "topic_reviews", "manual_schedule", "goals", "review_log",
  "questions", "question_attempts", "notes_meta", "settings"
]);

function nowIso() {
  return new Date().toISOString();
}

function profilePath(accountId) {
  if (!basePath) throw new Error("Base do banco local não inicializada.");
  if (!accountId) return basePath;
  const dir = path.join(path.dirname(basePath), "profiles");
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(accountId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(dir, `theo-${safe}.sqlite`);
}

function openDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (database && databasePath === filePath) return database;

  if (database) {
    try { database.close(); } catch {}
  }

  databasePath = filePath;
  database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_records (
      store TEXT NOT NULL,
      id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT,
      PRIMARY KEY (store, id)
    );

    CREATE INDEX IF NOT EXISTS idx_local_records_store_updated
      ON local_records(store, updated_at);

    CREATE INDEX IF NOT EXISTS idx_local_records_store
      ON local_records(store);

    CREATE TABLE IF NOT EXISTS local_meta (
      key TEXT PRIMARY KEY,
      value_json TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      event_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
      payload_json TEXT,
      version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created
      ON sync_queue(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_entity
      ON sync_queue(entity_type, entity_id, version);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_version INTEGER,
      remote_version INTEGER,
      resolution TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_metrics (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  const version = Number(database.pragma("user_version", { simple: true }) ?? 0);
  if (version < CURRENT_SCHEMA_VERSION) {
    database.prepare(`
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
      VALUES(?, ?)
    `).run(CURRENT_SCHEMA_VERSION, nowIso());
    database.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
  }

  return database;
}

function db(filePath) {
  const resolved = activeAccountId ? profilePath(activeAccountId) : filePath;
  return openDatabase(resolved);
}

function json(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function parse(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function setMetric(database, key, delta = 1) {
  database.prepare(`
    INSERT INTO sync_metrics(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
  `).run(key, delta);
}

function makeEventId() {
  return randomUUID();
}

function enqueue(database, { store, id, operation, payload, version }) {
  if (!SYNCABLE_STORES.has(store)) return null;

  const currentClock = Number(
    parse(database.prepare("SELECT value_json FROM local_meta WHERE key = ?")
      .get("sync_clock")?.value_json ?? "0") || 0,
  );
  const nextVersion = Math.max(Number.isFinite(version) ? version : 0, currentClock + 1);

  database.prepare(`
    INSERT INTO local_meta(key, value_json) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run("sync_clock", json(nextVersion));

  // Coalescer: se o mesmo registro ainda não foi enviado, mantém apenas
  // a última alteração. Isso reduz drasticamente requests e D1 writes.
  database.prepare(`
    DELETE FROM sync_queue
    WHERE entity_type = ? AND entity_id = ?
      AND status IN ('pending','retry')
  `).run(store, String(id));

  const eventId = makeEventId();
  database.prepare(`
    INSERT INTO sync_queue
      (event_id, entity_type, entity_id, operation, payload_json, version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    store,
    String(id),
    operation,
    payload == null ? null : json(payload),
    nextVersion,
    nowIso(),
  );

  setMetric(database, "events_queued", 1);
  return eventId;
}

export function createLocalDatabase(filePath) {
  basePath = filePath;
  return db(filePath);
}

export function switchAccount(accountId) {
  const target = profilePath(accountId ? String(accountId) : null);
  activeAccountId = accountId ? String(accountId) : null;
  return db(target);
}

export function getActiveAccount() {
  return activeAccountId;
}

export function getActivePath(filePath) {
  return activeAccountId ? profilePath(activeAccountId) : filePath;
}

export function adoptAnonymousData(accountId) {
  if (!basePath || !accountId) return { adopted: false, reason: "missing_account" };
  const anonymous = db(basePath);
  const targetPath = profilePath(String(accountId));
  const target = db(targetPath);

  const targetCount = target.prepare("SELECT COUNT(*) AS count FROM local_records").get().count;
  if (Number(targetCount) > 0) return { adopted: false, reason: "account_has_data" };

  const records = anonymous.prepare("SELECT store,id,data_json,updated_at FROM local_records").all();
  const metas = anonymous.prepare("SELECT key,value_json FROM local_meta").all();
  const queue = anonymous.prepare(`
    SELECT event_id,entity_type,entity_id,operation,payload_json,version,created_at,retry_count,status
    FROM sync_queue
  `).all();

  const tx = target.transaction(() => {
    const insertRecord = target.prepare(`
      INSERT OR IGNORE INTO local_records(store,id,data_json,updated_at)
      VALUES(?,?,?,?)
    `);
    for (const row of records) insertRecord.run(row.store,row.id,row.data_json,row.updated_at);

    const insertMeta = target.prepare(`
      INSERT OR IGNORE INTO local_meta(key,value_json) VALUES(?,?)
    `);
    for (const row of metas) insertMeta.run(row.key,row.value_json);

    const insertQueue = target.prepare(`
      INSERT OR IGNORE INTO sync_queue
        (event_id,entity_type,entity_id,operation,payload_json,version,created_at,retry_count,status)
      VALUES(?,?,?,?,?,?,?,?,?)
    `);
    for (const row of queue) {
      insertQueue.run(
        row.event_id,row.entity_type,row.entity_id,row.operation,row.payload_json,
        row.version,row.created_at,row.retry_count,row.status,
      );
    }
  });
  tx();

  // O banco anônimo deixa de ser uma segunda cópia dos dados da conta.
  anonymous.exec("DELETE FROM local_records; DELETE FROM local_meta; DELETE FROM sync_queue;");

  return { adopted: records.length > 0, records: records.length };
}

export function getStatus(filePath) {
  const database = db(filePath);
  const row = database.prepare("SELECT value_json FROM local_meta WHERE key = ?").get("indexeddb_migrated");
  return {
    initialized: Boolean(row && parse(row.value_json) === true),
    path: activeAccountId ? profilePath(activeAccountId) : filePath,
  };
}

export function markMigrated(filePath) {
  const database = db(filePath);
  database.prepare(`
    INSERT INTO local_meta(key, value_json) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run("indexeddb_migrated", json(true));
}

export function importRecords(filePath, recordsByStore) {
  const database = db(filePath);
  const insert = database.prepare(`
    INSERT INTO local_records(store, id, data_json, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(store, id) DO NOTHING
  `);

  const transaction = database.transaction((all) => {
    for (const [store, records] of Object.entries(all || {})) {
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (!record || record.id == null) continue;
        insert.run(store, String(record.id), json(record), record.updated_at ?? null);
      }
    }
    database.prepare(`
      INSERT INTO local_meta(key, value_json) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run("indexeddb_migrated", json(true));
  });

  transaction(recordsByStore || {});
  return { ok: true };
}

export function count(filePath, store) {
  const database = db(filePath);
  return Number(database.prepare("SELECT COUNT(*) AS count FROM local_records WHERE store = ?").get(store).count);
}

export function getAll(filePath, store) {
  const database = db(filePath);
  return database.prepare(`
    SELECT data_json FROM local_records WHERE store = ?
    ORDER BY COALESCE(updated_at, '') DESC, id ASC
  `).all(store).map((row) => parse(row.data_json));
}

export function get(filePath, store, id) {
  const database = db(filePath);
  const row = database.prepare(`
    SELECT data_json FROM local_records WHERE store = ? AND id = ?
  `).get(store, String(id));
  return row ? parse(row.data_json) : undefined;
}

export function put(filePath, store, value, { sync = true } = {}) {
  const database = db(filePath);
  if (!value || value.id == null) throw new Error("Registro local precisa possuir id.");

  const id = String(value.id);
  const existing = database.prepare(`
    SELECT data_json FROM local_records WHERE store = ? AND id = ?
  `).get(store, id);
  const operation = existing ? "UPDATE" : "CREATE";
  const updatedAt = value.updated_at ?? value.created_at ?? nowIso();

  const transaction = database.transaction(() => {
    database.prepare(`
      INSERT INTO local_records(store, id, data_json, updated_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(store, id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(store, id, json(value), updatedAt);

    if (sync) enqueue(database, {
      store, id, operation, payload: value,
      version: Number(value.version ?? 0),
    });
    setMetric(database, "local_writes", 1);
  });

  transaction();
  return value;
}

export function putMany(filePath, store, values, { sync = true } = {}) {
  const database = db(filePath);
  if (!Array.isArray(values) || values.length === 0) return;

  const transaction = database.transaction((items) => {
    for (const value of items) {
      if (!value || value.id == null) continue;
      const id = String(value.id);
      const existing = database.prepare(
        "SELECT data_json FROM local_records WHERE store = ? AND id = ?",
      ).get(store, id);
      const operation = existing ? "UPDATE" : "CREATE";
      const updatedAt = value.updated_at ?? value.created_at ?? nowIso();

      database.prepare(`
        INSERT INTO local_records(store, id, data_json, updated_at)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(store, id) DO UPDATE SET
          data_json = excluded.data_json,
          updated_at = excluded.updated_at
      `).run(store, id, json(value), updatedAt);

      if (sync) enqueue(database, {
        store, id, operation, payload: value,
        version: Number(value.version ?? 0),
      });
      setMetric(database, "local_writes", 1);
    }
  });

  transaction(values);
}

export function remove(filePath, store, id, { sync = true } = {}) {
  const database = db(filePath);
  const existing = get(filePath, store, id);
  if (!existing) return false;

  const transaction = database.transaction(() => {
    database.prepare("DELETE FROM local_records WHERE store = ? AND id = ?")
      .run(store, String(id));

    if (sync) enqueue(database, {
      store,
      id,
      operation: "DELETE",
      payload: { id: String(id), deleted_at: nowIso() },
      version: Number(existing.version ?? 0) + 1,
    });

    setMetric(database, "local_deletes", 1);
  });

  transaction();
  return true;
}

export function clear(filePath, store) {
  const database = db(filePath);
  database.prepare("DELETE FROM local_records WHERE store = ?").run(store);
}

export function metaGet(filePath, key) {
  const database = db(filePath);
  const row = database.prepare("SELECT value_json FROM local_meta WHERE key = ?").get(key);
  return row ? parse(row.value_json) : undefined;
}

export function metaSet(filePath, key, value) {
  const database = db(filePath);
  database.prepare(`
    INSERT INTO local_meta(key, value_json) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(key, json(value));
}

export function getSyncQueue(filePath, limit = 100) {
  const database = db(filePath);
  return database.prepare(`
    SELECT event_id, entity_type, entity_id, operation, payload_json, version,
           created_at, retry_count, status
    FROM sync_queue
    WHERE status IN ('pending','retry')
    ORDER BY created_at ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit) || 100, 1000))).map((row) => ({
    event_id: row.event_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    payload: row.payload_json ? parse(row.payload_json) : null,
    version: row.version,
    created_at: row.created_at,
    retry_count: row.retry_count,
    status: row.status,
  }));
}

export function ackSyncQueue(filePath, eventIds = []) {
  const database = db(filePath);
  const transaction = database.transaction((ids) => {
    const stmt = database.prepare("DELETE FROM sync_queue WHERE event_id = ?");
    for (const id of ids) {
      stmt.run(String(id));
      setMetric(database, "events_acked", 1);
    }
  });
  transaction(eventIds);
}

export function retrySyncQueue(filePath, eventIds = []) {
  const database = db(filePath);
  const stmt = database.prepare(`
    UPDATE sync_queue
    SET status = 'retry', retry_count = retry_count + 1
    WHERE event_id = ?
  `);
  for (const id of eventIds) stmt.run(String(id));
}

export function recordConflict(filePath, conflict) {
  const database = db(filePath);
  database.prepare(`
    INSERT INTO sync_conflicts
      (event_id, entity_type, entity_id, local_version, remote_version, resolution, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    conflict.event_id ?? null,
    conflict.entity_type,
    String(conflict.entity_id),
    conflict.local_version ?? null,
    conflict.remote_version ?? null,
    conflict.resolution,
    nowIso(),
  );
  setMetric(database, "conflicts", 1);
}

export function incrementClock(filePath) {
  const database = db(filePath);
  const current = Number(metaGet(filePath, "sync_clock") ?? 0);
  const next = current + 1;
  metaSet(filePath, "sync_clock", next);
  return next;
}

export function getMetrics(filePath) {
  const database = db(filePath);
  const rows = database.prepare("SELECT key, value FROM sync_metrics").all();
  const metrics = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const queued = database.prepare("SELECT COUNT(*) AS count FROM sync_queue WHERE status IN ('pending','retry')").get().count;
  const records = database.prepare("SELECT COUNT(*) AS count FROM local_records").get().count;
  return { ...metrics, queued_events: queued, local_records: records };
}

export function closeDatabase() {
  if (database) {
    try { database.close(); } catch {}
  }
  database = null;
  databasePath = null;
}
