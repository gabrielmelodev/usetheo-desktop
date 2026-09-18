/**
 * Tipos centrais do Theo Notes.
 *
 * O Google Drive é a fonte da verdade: cada Notebook/Seção é uma pasta
 * real, cada Página é um arquivo .json real. O `remoteId` é sempre o
 * id do arquivo na Drive API — usamos ele como identidade estável.
 */

/** Conteúdo de uma página no formato de documento do TipTap. */
export type TiptapDoc = Record<string, unknown>;

export interface Notebook {
  /** id do Google Drive da pasta do notebook (== identidade estável). */
  id: string;
  name: string;
  eTag: string;
  updatedAt: string;
  createdAt: string;
}

export interface Section {
  id: string;
  notebookId: string;
  name: string;
  eTag: string;
  updatedAt: string;
  createdAt: string;
}

/**
 * Uma página, como fica guardada no cache local (IndexedDB).
 *
 * `dirty` = tem edição local que ainda não foi enviada ao Google Drive.
 * `deleted` = marcada para exclusão (tombstone local até confirmar no Google Drive).
 */
export interface NotesPage {
  /** id do arquivo .json no Google Drive. Nulo enquanto ainda não foi criado lá. */
  id: string | null;
  /** Id local temporário, usado antes da página existir no Google Drive. */
  localId: string;
  sectionId: string;
  notebookId: string;
  title: string;
  content: TiptapDoc;
  previewText: string;
  eTag: string | null;
  createdAt: string;
  updatedAt: string;
  dirty: boolean;
  deleted: boolean;
}

export interface PageFileContent {
  schemaVersion: 1;
  title: string;
  content: TiptapDoc;
  previewText: string;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncConflict {
  id: string;
  pageLocalId: string;
  originalTitle: string;
  duplicateTitle: string;
  detectedAt: string;
  reason: "remote_changed" | "remote_deleted" | "create_collision";
}
