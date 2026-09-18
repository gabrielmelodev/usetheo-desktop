export type StudyTimerState = {
  examId: string | null;
  topicId: string | null;

  subjectName?: string | null;
  subject_name?: string | null;
  subjectTitle?: string | null;
  subject_title?: string | null;

  topicName?: string | null;
  topic_name?: string | null;
  topicTitle?: string | null;
  topic_title?: string | null;

  title?: string | null;

  elapsedSeconds: number;
  running: boolean;
  startedAt: number | null;
  sessionId: string | null;
  updatedAt?: number | null;
};

export type StudyTimerEvent = "tick" | "state";

export type StudyTimerListener = (state: StudyTimerState, event?: StudyTimerEvent) => void;

export type TheoDesktopStudyTimer = {
  get(): Promise<StudyTimerState>;

  start(data?: Partial<StudyTimerState>): Promise<StudyTimerState>;

  pause(): Promise<StudyTimerState>;

  resume(): Promise<StudyTimerState>;

  reset(): Promise<StudyTimerState>;

  set(data?: Partial<StudyTimerState>): Promise<StudyTimerState>;

  getCurrentSeconds(): Promise<number>;

  subscribe(callback: StudyTimerListener): () => void;
};

export type UpdateInfo = {
  version?: string;
  releaseDate?: string | null;
};

export type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type TheoDesktopUpdater = {
  checkNow(): Promise<{
    ok: boolean;
    version?: string | null;
    message?: string;
  }>;

  downloadNow(): Promise<{ ok: boolean; message?: string }>;
  quitAndInstall(): void;

  onChecking(callback: () => void): void;

  onAvailable(callback: (info: UpdateInfo) => void): void;

  onNotAvailable(callback: (info: UpdateInfo) => void): void;

  onProgress(callback: (progress: UpdateProgress) => void): void;

  onDownloaded(callback: (info: UpdateInfo) => void): void;

  onError(callback: (message: string) => void): void;
};

export type TheoDesktopWindow = {
  minimize(): void;
  maximize(): void;
  close(): void;
};

export type TheoDesktopVersions = {
  electron: string;
  chrome: string;
  node: string;
};

// ============================================================
// GOOGLE DRIVE (THEO NOTES)
// ============================================================

export type GoogleDriveDriveItem = {
  id: string;
  name: string;
  eTag: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id: string };
  deleted?: { state: string };
};

export type GoogleDriveIpcError = { code: "CONFLICT" | "NOT_FOUND" | "UNKNOWN"; message: string };

export type GoogleDriveIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GoogleDriveIpcError };

export type GoogleDriveAuthStatus = {
  connected: boolean;
  accountEmail: string | null;
};

export type GoogleDriveAccount = {
  accountEmail: string | null;
};

export type GoogleDriveChangesResult = {
  items: GoogleDriveDriveItem[];
  nextPageToken: string | null;
};

export type TheoDesktopGoogleDrive = {
  status(): Promise<GoogleDriveIpcResult<GoogleDriveAuthStatus>>;
  signIn(): Promise<GoogleDriveIpcResult<GoogleDriveAccount>>;
  signOut(): Promise<GoogleDriveIpcResult<void>>;
  ensureRootFolder(): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem>>;
  ensureFolder(parentPath: string, name: string): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem>>;
  listChildren(itemId: string): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem[]>>;
  renameItem(itemId: string, newName: string): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem>>;
  deleteItem(itemId: string): Promise<GoogleDriveIpcResult<void>>;
  createFile(
    parentItemId: string,
    fileName: string,
    contentJson: unknown,
  ): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem>>;
  updateFileContent(
    itemId: string,
    contentJson: unknown,
    expectedETag: string,
  ): Promise<GoogleDriveIpcResult<GoogleDriveDriveItem>>;
  getFileContent(
    itemId: string,
  ): Promise<GoogleDriveIpcResult<{ item: GoogleDriveDriveItem; data: unknown }>>;
  fetchChanges(
    pageToken: string | null,
  ): Promise<GoogleDriveIpcResult<GoogleDriveChangesResult>>;
};

export type TheoDesktopLocalDatabase = {
  getStatus(): Promise<{ initialized: boolean; path: string }>;
  migrateFromIndexedDB(records: Record<string, unknown[]>): Promise<unknown>;
  get(store: string, id: string): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
  count(store: string): Promise<number>;
  put(store: string, value: unknown, options?: { sync?: boolean }): Promise<unknown>;
  putMany(store: string, values: unknown[], options?: { sync?: boolean }): Promise<void>;
  delete(store: string, id: string, options?: { sync?: boolean }): Promise<void>;
  clear(store: string): Promise<void>;
  metaGet(key: string): Promise<unknown>;
  metaSet(key: string, value: unknown): Promise<void>;
  getSyncQueue(limit?: number): Promise<unknown[]>;
  ackSyncQueue(eventIds: string[]): Promise<void>;
  retrySyncQueue(eventIds: string[]): Promise<void>;
  incrementClock(): Promise<number>;
  recordConflict(conflict: Record<string, unknown>): Promise<void>;
  getMetrics(): Promise<Record<string, number>>;
  export(): Promise<unknown>;
  import(): Promise<unknown>;
  getPath(): Promise<string>;
};

export type TheoDesktop = {
  platform: string;
  versions: TheoDesktopVersions;
  window: TheoDesktopWindow;
  studyTimer: TheoDesktopStudyTimer;
  updater: TheoDesktopUpdater;
  localDatabase: TheoDesktopLocalDatabase;
  googleDrive: TheoDesktopGoogleDrive;
};

declare global {
  interface Window {
    theoDesktop?: TheoDesktop;
  }
}

export {};
