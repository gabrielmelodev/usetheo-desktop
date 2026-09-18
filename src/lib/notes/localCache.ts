/**
 * Cache local do Theo Notes (IndexedDB).
 *
 * IMPORTANTE: isto é só um CACHE para abrir rápido e funcionar
 * offline. A fonte da verdade é sempre o Google Drive. Se o cache for
 * apagado, tudo é reconstruído a partir do Google Drive na próxima sync.
 *
 * Fica num banco IndexedDB separado ("theo-notes-cache") de propósito,
 * pra não arriscar mexer no `theo-local` que o resto do app já usa.
 */

import type { Notebook, Section, NotesPage, SyncConflict } from "./types";

const DB_NAME = "theo-notes-cache";
const DB_VERSION = 1;

const STORES = {
  notebooks: "notebooks",
  sections: "sections",
  pages: "pages",
  conflicts: "conflicts",
  meta: "meta",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.notebooks)) {
        db.createObjectStore(STORES.notebooks, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.sections)) {
        const store = db.createObjectStore(STORES.sections, { keyPath: "id" });
        store.createIndex("notebookId", "notebookId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.pages)) {
        const store = db.createObjectStore(STORES.pages, { keyPath: "localId" });
        store.createIndex("sectionId", "sectionId", { unique: false });
        store.createIndex("dirty", "dirty", { unique: false });
        store.createIndex("remoteId", "id", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.conflicts)) {
        db.createObjectStore(STORES.conflicts, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);

    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, "readonly", (store) => store.getAll());
}

async function getAllByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readonly");
    const req = t.objectStore(storeName).index(indexName).getAll(value);

    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// NOTEBOOKS
// ============================================================

export async function getNotebooks(): Promise<Notebook[]> {
  return getAll<Notebook>(STORES.notebooks);
}

export async function putNotebook(notebook: Notebook): Promise<void> {
  await tx(STORES.notebooks, "readwrite", (store) => store.put(notebook));
}

export async function deleteNotebook(id: string): Promise<void> {
  await tx(STORES.notebooks, "readwrite", (store) => store.delete(id));
}

// ============================================================
// SECTIONS
// ============================================================

export async function getSections(notebookId: string): Promise<Section[]> {
  return getAllByIndex<Section>(STORES.sections, "notebookId", notebookId);
}

export async function putSection(section: Section): Promise<void> {
  await tx(STORES.sections, "readwrite", (store) => store.put(section));
}

export async function deleteSection(id: string): Promise<void> {
  await tx(STORES.sections, "readwrite", (store) => store.delete(id));
}

// ============================================================
// PAGES
// ============================================================

export async function getPages(sectionId: string): Promise<NotesPage[]> {
  const pages = await getAllByIndex<NotesPage>(STORES.pages, "sectionId", sectionId);
  return pages.filter((p) => !p.deleted);
}

export async function getAllPages(): Promise<NotesPage[]> {
  return getAll<NotesPage>(STORES.pages);
}

export async function getDirtyPages(): Promise<NotesPage[]> {
  const all = await getAll<NotesPage>(STORES.pages);
  return all.filter((p) => p.dirty);
}

export async function getPageByLocalId(localId: string): Promise<NotesPage | undefined> {
  return tx<NotesPage | undefined>(STORES.pages, "readonly", (store) => store.get(localId));
}

export async function putPage(page: NotesPage): Promise<void> {
  await tx(STORES.pages, "readwrite", (store) => store.put(page));
}

export async function deletePageHard(localId: string): Promise<void> {
  await tx(STORES.pages, "readwrite", (store) => store.delete(localId));
}

// ============================================================
// CONFLICTS
// ============================================================

export async function getConflicts(): Promise<SyncConflict[]> {
  return getAll<SyncConflict>(STORES.conflicts);
}

export async function putConflict(conflict: SyncConflict): Promise<void> {
  await tx(STORES.conflicts, "readwrite", (store) => store.put(conflict));
}

export async function dismissConflict(id: string): Promise<void> {
  await tx(STORES.conflicts, "readwrite", (store) => store.delete(id));
}

// ============================================================
// META (deltaLink, rootFolderId, etc.)
// ============================================================

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await tx<{ key: string; value: string } | undefined>(STORES.meta, "readonly", (store) =>
    store.get(key),
  );

  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await tx(STORES.meta, "readwrite", (store) => store.put({ key, value }));
}
