/**
 * Camada fina sobre `window.theoDesktop.googleDrive`.
 *
 * Desembrulha o formato { ok, data | error } vindo do IPC e transforma
 * erros de conflito em `GoogleDriveConflictError`, para o sync engine
 * conseguir reagir especificamente a eles.
 */

import type {
  GoogleDriveAccount,
  GoogleDriveAuthStatus,
  GoogleDriveChangesResult,
  GoogleDriveDriveItem,
  GoogleDriveIpcResult,
} from "../../electron";

export class GoogleDriveConflictError extends Error {}
export class GoogleDriveNotFoundError extends Error {}
export class GoogleDriveUnavailableError extends Error {}

function getBridge() {
  const bridge = typeof window !== "undefined" ? window.theoDesktop?.googleDrive : undefined;

  if (!bridge) {
    throw new GoogleDriveUnavailableError(
      "Google Drive só está disponível na versão desktop do Theo.",
    );
  }

  return bridge;
}

function isFailureResult<T>(
  result: GoogleDriveIpcResult<T>,
): result is { ok: false; error: { code: "CONFLICT" | "NOT_FOUND" | "UNKNOWN"; message: string } } {
  return result.ok === false;
}

async function unwrap<T>(promise: Promise<GoogleDriveIpcResult<T>>): Promise<T> {
  const result = await promise;

  if (isFailureResult(result)) {
    if (result.error.code === "CONFLICT") {
      throw new GoogleDriveConflictError(result.error.message);
    }

    if (result.error.code === "NOT_FOUND") {
      throw new GoogleDriveNotFoundError(result.error.message);
    }

    throw new Error(result.error.message);
  }

  return result.data;
}

export function isGoogleDriveAvailable(): boolean {
  return typeof window !== "undefined" && !!window.theoDesktop?.googleDrive;
}

export async function getAuthStatus(): Promise<GoogleDriveAuthStatus> {
  return unwrap(getBridge().status());
}

export async function signIn(): Promise<GoogleDriveAccount> {
  return unwrap(getBridge().signIn());
}

export async function signOut(): Promise<void> {
  return unwrap(getBridge().signOut());
}

export async function ensureRootFolder(): Promise<GoogleDriveDriveItem> {
  return unwrap(getBridge().ensureRootFolder());
}

export async function ensureFolder(parentPath: string, name: string): Promise<GoogleDriveDriveItem> {
  return unwrap(getBridge().ensureFolder(parentPath, name));
}

export async function listChildren(itemId: string): Promise<GoogleDriveDriveItem[]> {
  return unwrap(getBridge().listChildren(itemId));
}

export async function renameItem(itemId: string, newName: string): Promise<GoogleDriveDriveItem> {
  return unwrap(getBridge().renameItem(itemId, newName));
}

export async function deleteItem(itemId: string): Promise<void> {
  return unwrap(getBridge().deleteItem(itemId));
}

export async function createFile(
  parentItemId: string,
  fileName: string,
  contentJson: unknown,
): Promise<GoogleDriveDriveItem> {
  return unwrap(getBridge().createFile(parentItemId, fileName, contentJson));
}

export async function updateFileContent(
  itemId: string,
  contentJson: unknown,
  expectedETag: string,
): Promise<GoogleDriveDriveItem> {
  return unwrap(getBridge().updateFileContent(itemId, contentJson, expectedETag));
}

export async function getFileContent<T = unknown>(
  itemId: string,
): Promise<{ item: GoogleDriveDriveItem; data: T }> {
  return unwrap(getBridge().getFileContent(itemId)) as Promise<{ item: GoogleDriveDriveItem; data: T }>;
}

export async function fetchChanges(
  pageToken: string | null,
): Promise<GoogleDriveChangesResult> {
  return unwrap(getBridge().fetchChanges(pageToken));
}
