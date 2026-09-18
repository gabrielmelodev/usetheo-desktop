/**
 * Motor de sincronização do Theo Notes.
 *
 * PULL: busca o que mudou no Google Drive (via /changes) e atualiza o
 *       cache local — inclusive pastas criadas/renomeadas/apagadas
 *       direto pelo Google Drive (fora do Theo).
 *
 * PUSH: envia páginas com edições locais (`dirty`) para o Google Drive.
 *       Se o Google Drive rejeitar por conflito (alguém mudou o
 *       arquivo depois da última vez que lemos), a página local é
 *       DUPLICADA (igual o OneNote/Google Docs fazem) em vez de
 *       sobrescrever ou perder dados.
 *
 * Este arquivo não sabe nada de React — é puro TS, chamado pela API
 * de alto nível (notesApi.ts) e por um hook de sync em background.
 */

import * as bridge from "./googleDriveBridge";
import * as cache from "./localCache";
import type { Notebook, NotesPage, PageFileContent, Section, SyncConflict } from "./types";
import { GoogleDriveConflictError, GoogleDriveNotFoundError } from "./googleDriveBridge";

// ============================================================
// DEVICE ID / NOME
// ============================================================

const DEVICE_ID_KEY = "theo-notes-device-id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }

  return id;
}

export function getDeviceLabel(): string {
  const platform = window.theoDesktop?.platform ?? navigator.platform ?? "dispositivo";
  return platform;
}

// ============================================================
// NOME DE ARQUIVO
// ============================================================

function sanitizeForFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || "Sem título";
}

function pageFileName(page: Pick<NotesPage, "title" | "localId">): string {
  const shortId = page.localId.slice(0, 8);
  return `${sanitizeForFileName(page.title)} ${shortId}.json`;
}

function conflictTitle(originalTitle: string): string {
  const date = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${originalTitle} (conflito de sincronização - ${getDeviceLabel()} - ${date})`;
}

function toFileContent(page: NotesPage): PageFileContent {
  return {
    schemaVersion: 1,
    title: page.title,
    content: page.content,
    previewText: page.previewText,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    deviceId: getDeviceId(),
  };
}

// ============================================================
// GARANTIR ESTRUTURA (raiz / notebooks / seções)
// ============================================================

export async function getOrCreateRootFolderId(): Promise<string> {
  const cached = await cache.getMeta("rootFolderId");

  if (cached) {
    return cached;
  }

  const root = await bridge.ensureRootFolder();
  await cache.setMeta("rootFolderId", root.id);
  await cache.setMeta("pageToken", "");

  return root.id;
}

// ============================================================
// PUSH — envia edições locais
// ============================================================

export interface PushResult {
  pushed: number;
  conflicts: SyncConflict[];
}

export async function pushDirtyPages(): Promise<PushResult> {
  const dirtyPages = await cache.getDirtyPages();

  let pushed = 0;
  const conflicts: SyncConflict[] = [];

  for (const page of dirtyPages) {
    try {
      if (page.deleted) {
        if (page.id) {
          try {
            await bridge.deleteItem(page.id);
          } catch (error) {
            if (!(error instanceof GoogleDriveNotFoundError)) {
              throw error;
            }
          }
        }

        await cache.deletePageHard(page.localId);
        pushed += 1;
        continue;
      }

      if (!page.id) {
        // Página nova — ainda não existe no Google Drive.
        const section = await requireSectionFolderId(page.sectionId);

        const created = await bridge.createFile(section, pageFileName(page), toFileContent(page));

        await cache.putPage({
          ...page,
          id: created.id,
          eTag: created.eTag,
          dirty: false,
        });

        pushed += 1;
        continue;
      }

      // Página existente — atualiza, condicionado ao eTag conhecido.
      try {
        const updated = await bridge.updateFileContent(
          page.id,
          toFileContent(page),
          page.eTag ?? "",
        );

        await cache.putPage({ ...page, eTag: updated.eTag, dirty: false });

        pushed += 1;
      } catch (error) {
        if (error instanceof GoogleDriveConflictError) {
          const conflict = await resolveEditConflict(page);
          conflicts.push(conflict);
          pushed += 1;
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("[Theo Notes] Erro ao enviar página para o Google Drive:", page.title, error);
      // Deixa `dirty` como está — tenta de novo na próxima sync.
    }
  }

  return { pushed, conflicts };
}

/**
 * Alguém mudou o arquivo no Google Drive depois da última vez que
 * lemos. Estilo OneNote: NUNCA sobrescreve nem descarta — duplica a
 * versão local como uma página nova, e adota a versão remota como a
 * "oficial".
 */
async function resolveEditConflict(localPage: NotesPage): Promise<SyncConflict> {
  const remote = await bridge.getFileContent<PageFileContent>(localPage.id!);

  // 1) A versão remota vira a verdade local.
  const reconciled: NotesPage = {
    ...localPage,
    title: remote.data.title,
    content: remote.data.content,
    previewText: remote.data.previewText,
    updatedAt: remote.data.updatedAt,
    eTag: remote.item.eTag,
    dirty: false,
  };

  await cache.putPage(reconciled);

  // 2) A versão local (que ia ser perdida) vira uma página nova.
  const duplicateLocalId = crypto.randomUUID();

  const duplicate: NotesPage = {
    id: null,
    localId: duplicateLocalId,
    sectionId: localPage.sectionId,
    notebookId: localPage.notebookId,
    title: conflictTitle(localPage.title),
    content: localPage.content,
    previewText: localPage.previewText,
    eTag: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dirty: true,
    deleted: false,
  };

  await cache.putPage(duplicate);

  const conflict: SyncConflict = {
    id: crypto.randomUUID(),
    pageLocalId: duplicateLocalId,
    originalTitle: localPage.title,
    duplicateTitle: duplicate.title,
    detectedAt: new Date().toISOString(),
    reason: "remote_changed",
  };

  await cache.putConflict(conflict);

  return conflict;
}

async function requireSectionFolderId(sectionId: string): Promise<string> {
  // O id local da seção JÁ é o id do Google Drive da pasta (ver notesApi.createSection).
  return sectionId;
}

// ============================================================
// PULL — traz mudanças do Google Drive
// ============================================================

export interface PullResult {
  notebooksChanged: number;
  sectionsChanged: number;
  pagesChanged: number;
  conflicts: SyncConflict[];
}

export async function pullChanges(): Promise<PullResult> {
  const rootFolderId = await getOrCreateRootFolderId();
  const storedPageToken = (await cache.getMeta("pageToken")) || null;

  const { items, nextPageToken } = await bridge.fetchChanges(storedPageToken || null);

  const [existingNotebooks, dirtyPages] = await Promise.all([
    cache.getNotebooks(),
    cache.getDirtyPages(),
  ]);

  const notebookIds = new Set(existingNotebooks.map((n) => n.id));
  const dirtyByRemoteId = new Map(dirtyPages.filter((p) => p.id).map((p) => [p.id as string, p]));

  // Precisamos descobrir seções conhecidas para classificar pastas.
  const allSections = await Promise.all(existingNotebooks.map((n) => cache.getSections(n.id)));
  const sectionIds = new Set(allSections.flat().map((s) => s.id));

  let notebooksChanged = 0;
  let sectionsChanged = 0;
  let pagesChanged = 0;
  const conflicts: SyncConflict[] = [];

  // Processa pastas primeiro (notebooks, depois seções), depois arquivos.
  // A Changes API da Google não é escopada por pasta (ver comentário no
  // driveClient) — itens fora da árvore "Theo Notes" simplesmente não
  // batem com nenhum id conhecido abaixo e são ignorados.
  const folders = items.filter((i) => i.folder && !i.deleted);
  const files = items.filter((i) => i.file && !i.deleted);
  const removed = items.filter((i) => i.deleted);

  for (const folder of folders) {
    const parentId = folder.parentReference?.id;

    if (parentId === rootFolderId) {
      await cache.putNotebook({
        id: folder.id,
        name: folder.name,
        eTag: folder.eTag,
        updatedAt: folder.lastModifiedDateTime,
        createdAt: folder.lastModifiedDateTime,
      });

      notebookIds.add(folder.id);
      notebooksChanged += 1;
      continue;
    }

    if (parentId && notebookIds.has(parentId)) {
      await cache.putSection({
        id: folder.id,
        notebookId: parentId,
        name: folder.name,
        eTag: folder.eTag,
        updatedAt: folder.lastModifiedDateTime,
        createdAt: folder.lastModifiedDateTime,
      });

      sectionIds.add(folder.id);
      sectionsChanged += 1;
    }
  }

  for (const file of files) {
    const parentId = file.parentReference?.id;

    if (!parentId || !sectionIds.has(parentId)) {
      continue; // Arquivo fora da estrutura de seções conhecida — ignora.
    }

    const localDirty = dirtyByRemoteId.get(file.id);

    if (localDirty) {
      // Existe edição local não enviada E o arquivo mudou no Google
      // Drive. Resolvido no próximo push() (resolveEditConflict), pra
      // evitar duplicar lógica. Só marcamos e seguimos.
      continue;
    }

    const { data } = await bridge.getFileContent<PageFileContent>(file.id);

    // Acha o localId já usado por essa página, se já existir no cache.
    const existing = await findPageByRemoteId(file.id);

    const page: NotesPage = {
      id: file.id,
      localId: existing?.localId ?? crypto.randomUUID(),
      sectionId: parentId,
      notebookId: (await sectionNotebookId(parentId)) ?? "",
      title: data.title,
      content: data.content,
      previewText: data.previewText,
      eTag: file.eTag,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      dirty: false,
      deleted: false,
    };

    await cache.putPage(page);
    pagesChanged += 1;
  }

  for (const gone of removed) {
    const dirty = dirtyByRemoteId.get(gone.id);

    if (dirty) {
      // Apagado no Google Drive, mas tinha edição local não enviada.
      // Mantém a versão local como página nova (não perde o conteúdo).
      const conflict = await keepLocalAfterRemoteDelete(dirty);
      conflicts.push(conflict);
      continue;
    }

    const existing = await findPageByRemoteId(gone.id);

    if (existing) {
      await cache.deletePageHard(existing.localId);
      pagesChanged += 1;
    }

    if (notebookIds.has(gone.id)) {
      await cache.deleteNotebook(gone.id);
      notebookIds.delete(gone.id);
      notebooksChanged += 1;
    }

    if (sectionIds.has(gone.id)) {
      await cache.deleteSection(gone.id);
      sectionIds.delete(gone.id);
      sectionsChanged += 1;
    }
  }

  if (nextPageToken) {
    await cache.setMeta("pageToken", nextPageToken);
  }

  return { notebooksChanged, sectionsChanged, pagesChanged, conflicts };
}

async function keepLocalAfterRemoteDelete(localPage: NotesPage): Promise<SyncConflict> {
  const reconnected: NotesPage = {
    ...localPage,
    id: null,
    eTag: null,
    dirty: true,
  };

  await cache.putPage(reconnected);

  const conflict: SyncConflict = {
    id: crypto.randomUUID(),
    pageLocalId: localPage.localId,
    originalTitle: localPage.title,
    duplicateTitle: localPage.title,
    detectedAt: new Date().toISOString(),
    reason: "remote_deleted",
  };

  await cache.putConflict(conflict);

  return conflict;
}

async function findPageByRemoteId(remoteId: string): Promise<NotesPage | undefined> {
  const all = await cache.getAllPages();
  return all.find((p) => p.id === remoteId);
}

async function sectionNotebookId(sectionId: string): Promise<string | undefined> {
  const notebooks = await cache.getNotebooks();

  for (const notebook of notebooks) {
    const sections = await cache.getSections(notebook.id);

    if (sections.some((s) => s.id === sectionId)) {
      return notebook.id;
    }
  }

  return undefined;
}

// ============================================================
// SYNC COMPLETO (pull + push)
// ============================================================

export interface FullSyncResult {
  pull: PullResult;
  push: PushResult;
}

export async function runFullSync(): Promise<FullSyncResult> {
  const pull = await pullChanges();
  const push = await pushDirtyPages();

  return { pull, push };
}
