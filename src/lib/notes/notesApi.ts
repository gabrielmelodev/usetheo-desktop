/**
 * API de alto nível do Theo Notes, usada pelos componentes React.
 *
 * Escritas em páginas são otimistas: gravam no cache local na hora
 * (a UI nunca espera o Google Drive) e marcam `dirty`. Um agendador em
 * segundo plano (`startBackgroundSync`) envia essas mudanças.
 *
 * Criar notebook/seção precisa de conexão (cria a pasta real no
 * Google Drive na hora), porque é uma ação rara e mais previsível assim.
 */

import * as bridge from "./googleDriveBridge";
import * as cache from "./localCache";
import { getOrCreateRootFolderId, pullChanges, pushDirtyPages } from "./syncEngine";
import type { Notebook, NotesPage, Section, SyncConflict } from "./types";

// ============================================================
// NOTEBOOKS
// ============================================================

export async function listNotebooks(): Promise<Notebook[]> {
  return cache.getNotebooks();
}

export async function createNotebook(name: string): Promise<Notebook> {
  const rootId = await getOrCreateRootFolderId();

  const folder = await bridge.ensureFolder("Theo Notes", name);

  const notebook: Notebook = {
    id: folder.id,
    name: folder.name,
    eTag: folder.eTag,
    createdAt: folder.lastModifiedDateTime,
    updatedAt: folder.lastModifiedDateTime,
  };

  await cache.putNotebook(notebook);

  void rootId; // já usado implicitamente pelo ensureFolder via caminho "Theo Notes"

  return notebook;
}

export async function renameNotebook(notebook: Notebook, newName: string): Promise<void> {
  const updated = await bridge.renameItem(notebook.id, newName);

  await cache.putNotebook({ ...notebook, name: updated.name, eTag: updated.eTag });
}

export async function deleteNotebook(notebook: Notebook): Promise<void> {
  await bridge.deleteItem(notebook.id);
  await cache.deleteNotebook(notebook.id);
}

// ============================================================
// SECTIONS
// ============================================================

export async function listSections(notebookId: string): Promise<Section[]> {
  return cache.getSections(notebookId);
}

export async function createSection(notebook: Notebook, name: string): Promise<Section> {
  const folder = await bridge.ensureFolder(`Theo Notes/${notebook.name}`, name);

  const section: Section = {
    id: folder.id,
    notebookId: notebook.id,
    name: folder.name,
    eTag: folder.eTag,
    createdAt: folder.lastModifiedDateTime,
    updatedAt: folder.lastModifiedDateTime,
  };

  await cache.putSection(section);

  return section;
}

export async function renameSection(section: Section, newName: string): Promise<void> {
  const updated = await bridge.renameItem(section.id, newName);

  await cache.putSection({ ...section, name: updated.name, eTag: updated.eTag });
}

export async function deleteSection(section: Section): Promise<void> {
  await bridge.deleteItem(section.id);
  await cache.deleteSection(section.id);
}

// ============================================================
// PAGES (offline-first — sempre grava local primeiro)
// ============================================================

export async function listPages(sectionId: string): Promise<NotesPage[]> {
  const pages = await cache.getPages(sectionId);

  return pages.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getPage(localId: string): Promise<NotesPage | undefined> {
  return cache.getPageByLocalId(localId);
}

export async function createPage(section: Section, title = "Página sem título"): Promise<NotesPage> {
  const now = new Date().toISOString();

  const page: NotesPage = {
    id: null,
    localId: crypto.randomUUID(),
    sectionId: section.id,
    notebookId: section.notebookId,
    title,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    previewText: "",
    eTag: null,
    createdAt: now,
    updatedAt: now,
    dirty: true,
    deleted: false,
  };

  await cache.putPage(page);

  scheduleBackgroundPush();

  return page;
}

export async function updatePageContent(
  localId: string,
  updates: { title?: string; content?: Record<string, unknown>; previewText?: string },
): Promise<NotesPage | undefined> {
  const existing = await cache.getPageByLocalId(localId);

  if (!existing) {
    return undefined;
  }

  const updated: NotesPage = {
    ...existing,
    title: updates.title ?? existing.title,
    content: updates.content ?? existing.content,
    previewText: updates.previewText ?? existing.previewText,
    updatedAt: new Date().toISOString(),
    dirty: true,
  };

  await cache.putPage(updated);

  scheduleBackgroundPush();

  return updated;
}

export async function deletePage(localId: string): Promise<void> {
  const existing = await cache.getPageByLocalId(localId);

  if (!existing) {
    return;
  }

  await cache.putPage({ ...existing, deleted: true, dirty: true });

  scheduleBackgroundPush();
}

// ============================================================
// CONFLITOS
// ============================================================

export async function listConflicts(): Promise<SyncConflict[]> {
  return cache.getConflicts();
}

export async function dismissConflict(conflictId: string): Promise<void> {
  await cache.dismissConflict(conflictId);
}

// ============================================================
// AGENDADOR EM SEGUNDO PLANO
// ============================================================
//
// - Push "debounced": espera 2.5s de silêncio depois da última
//   edição antes de enviar (evita mandar a cada tecla digitada).
// - Pull periódico: a cada 30s, pra pegar mudanças de outros
//   dispositivos/do próprio Google Drive.

const PUSH_DEBOUNCE_MS = 2500;
const PULL_INTERVAL_MS = 30_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;

export type NotesSyncListener = (event: {
  type: "pulled" | "pushed" | "error";
  conflicts?: SyncConflict[];
  error?: string;
}) => void;

const listeners = new Set<NotesSyncListener>();

export function onNotesSyncEvent(listener: NotesSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: Parameters<NotesSyncListener>[0]): void {
  listeners.forEach((l) => l(event));
}

export function scheduleBackgroundPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  pushTimer = setTimeout(async () => {
    try {
      const result = await pushDirtyPages();

      emit({ type: "pushed", conflicts: result.conflicts });
    } catch (error) {
      emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }, PUSH_DEBOUNCE_MS);
}

export async function syncNow(): Promise<void> {
  try {
    const pull = await pullChanges();
    emit({ type: "pulled", conflicts: pull.conflicts });

    const push = await pushDirtyPages();
    emit({ type: "pushed", conflicts: push.conflicts });
  } catch (error) {
    emit({ type: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Chame uma vez (ex: quando a tela do Theo Notes monta) para ligar o
 * pull periódico. Retorna uma função para desligar.
 */
export function startBackgroundSync(): () => void {
  if (pullTimer) {
    return () => {};
  }

  void syncNow();

  pullTimer = setInterval(() => {
    void syncNow();
  }, PULL_INTERVAL_MS);

  return () => {
    if (pullTimer) {
      clearInterval(pullTimer);
      pullTimer = null;
    }
  };
}
