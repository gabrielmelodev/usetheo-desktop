/**
 * Camada fina sobre `window.theoDesktop.oneDrive`.
 *
 * Desembrulha o formato { ok, data | error } vindo do IPC e transforma
 * erros de conflito em `OneDriveConflictError`, para o sync engine
 * conseguir reagir especificamente a eles.
 */

import type {
  OneDriveAccount,
  OneDriveAuthStatus,
  OneDriveDeltaResult,
  OneDriveDriveItem,
} from "../../electron";

export class OneDriveConflictError extends Error {}
export class OneDriveNotFoundError extends Error {}
export class OneDriveUnavailableError extends Error {}

function getBridge() {
  const bridge = typeof window !== "undefined" ? window.theoDesktop?.oneDrive : undefined;

  if (!bridge) {
    throw new OneDriveUnavailableError(
      "OneDrive só está disponível na versão desktop do Theo.",
    );
  }

  return bridge;
}

async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }>): Promise<T> {
  const result = await promise;

  if (result.ok) {
    return result.data;
  }

  if (result.error.code === "CONFLICT") {
    throw new OneDriveConflictError(result.error.message);
  }

  if (result.error.code === "NOT_FOUND") {
    throw new OneDriveNotFoundError(result.error.message);
  }

  throw new Error(result.error.message);
}

export function isOneDriveAvailable(): boolean {
  return typeof window !== "undefined" && !!window.theoDesktop?.oneDrive;
}

export async function getAuthStatus(): Promise<OneDriveAuthStatus> {
  return unwrap(getBridge().status());
}

export async function signIn(): Promise<OneDriveAccount> {
  return unwrap(getBridge().signIn());
}

export async function signOut(): Promise<void> {
  return unwrap(getBridge().signOut());
}

export async function ensureRootFolder(): Promise<OneDriveDriveItem> {
  return unwrap(getBridge().ensureRootFolder());
}

export async function ensureFolder(parentPath: string, name: string): Promise<OneDriveDriveItem> {
  return unwrap(getBridge().ensureFolder(parentPath, name));
}

export async function listChildren(itemId: string): Promise<OneDriveDriveItem[]> {
  return unwrap(getBridge().listChildren(itemId));
}

export async function renameItem(itemId: string, newName: string): Promise<OneDriveDriveItem> {
  return unwrap(getBridge().renameItem(itemId, newName));
}

export async function deleteItem(itemId: string): Promise<void> {
  return unwrap(getBridge().deleteItem(itemId));
}

export async function createFile(
  parentItemId: string,
  fileName: string,
  contentJson: unknown,
): Promise<OneDriveDriveItem> {
  return unwrap(getBridge().createFile(parentItemId, fileName, contentJson));
}

export async function updateFileContent(
  itemId: string,
  contentJson: unknown,
  expectedETag: string,
): Promise<OneDriveDriveItem> {
  return unwrap(getBridge().updateFileContent(itemId, contentJson, expectedETag));
}

export async function getFileContent<T = unknown>(
  itemId: string,
): Promise<{ item: OneDriveDriveItem; data: T }> {
  return unwrap(getBridge().getFileContent(itemId)) as Promise<{ item: OneDriveDriveItem; data: T }>;
}

export async function fetchDelta(
  rootItemId: string,
  deltaLink: string | null,
): Promise<OneDriveDeltaResult> {
  return unwrap(getBridge().fetchDelta(rootItemId, deltaLink));
}
