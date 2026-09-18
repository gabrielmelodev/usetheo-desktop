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

// ============================================================
// DESKTOP TIMER
// ============================================================

function getDesktopTimer(): TheoDesktopStudyTimer {
  if (typeof window === "undefined") {
    throw new Error("Study Timer só está disponível no ambiente do navegador/Electron.");
  }

  const timer = window.theoDesktop?.studyTimer;

  if (!timer) {
    throw new Error("Theo Desktop Study Timer IPC não está disponível.");
  }

  return timer;
}

// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizeTimerState(state: StudyTimerState): StudyTimerState {
  return {
    ...state,

    examId: state.examId ?? null,
    topicId: state.topicId ?? null,

    subjectName:
      state.subjectName ?? state.subject_name ?? state.subjectTitle ?? state.subject_title ?? null,

    subject_name:
      state.subject_name ?? state.subjectName ?? state.subjectTitle ?? state.subject_title ?? null,

    subjectTitle:
      state.subjectTitle ?? state.subject_title ?? state.subjectName ?? state.subject_name ?? null,

    subject_title:
      state.subject_title ?? state.subjectTitle ?? state.subjectName ?? state.subject_name ?? null,

    topicName: state.topicName ?? state.topic_name ?? state.topicTitle ?? state.topic_title ?? null,

    topic_name:
      state.topic_name ?? state.topicName ?? state.topicTitle ?? state.topic_title ?? null,

    topicTitle:
      state.topicTitle ?? state.topic_title ?? state.topicName ?? state.topic_name ?? null,

    topic_title:
      state.topic_title ?? state.topicTitle ?? state.topicName ?? state.topic_name ?? null,

    title: state.title ?? null,

    elapsedSeconds: Number(state.elapsedSeconds ?? 0),

    running: Boolean(state.running),

    startedAt: state.startedAt ?? null,

    sessionId: state.sessionId ?? null,

    updatedAt: state.updatedAt ?? null,
  };
}

// ============================================================
// FORMATAÇÃO
// ============================================================

export function formatStudyTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor((seconds % 3600) / 60);

  const remainingSeconds = seconds % 60;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    remainingSeconds.toString().padStart(2, "0"),
  ].join(":");
}

// ============================================================
// GET
// ============================================================

export async function getStudyTimer(): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.get();

  return normalizeTimerState(state);
}

// ============================================================
// CURRENT SECONDS
// ============================================================

export async function getCurrentStudySeconds(): Promise<number> {
  const timer = getDesktopTimer();

  return timer.getCurrentSeconds();
}

// ============================================================
// START
// ============================================================

export async function startStudyTimer(data?: Partial<StudyTimerState>): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.start(data);

  return normalizeTimerState(state);
}

// ============================================================
// PAUSE
// ============================================================

export async function pauseStudyTimer(): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.pause();

  return normalizeTimerState(state);
}

// ============================================================
// RESUME
// ============================================================

export async function resumeStudyTimer(): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.resume();

  return normalizeTimerState(state);
}

// ============================================================
// RESET
// ============================================================

export async function resetStudyTimer(): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.reset();

  return normalizeTimerState(state);
}

// ============================================================
// SET
// ============================================================

export async function setStudyTimer(data?: Partial<StudyTimerState>): Promise<StudyTimerState> {
  const timer = getDesktopTimer();

  const state = await timer.set(data);

  return normalizeTimerState(state);
}

// ============================================================
// SUBSCRIBE
// ============================================================

export function subscribeStudyTimer(callback: StudyTimerListener): () => void {
  const timer = getDesktopTimer();

  return timer.subscribe((state, event) => {
    callback(normalizeTimerState(state), event);
  });
}

// ============================================================
// COMPATIBILIDADE
// ============================================================

export function getTimerState(): StudyTimerState {
  throw new Error("getTimerState() é assíncrono. Use getTimerStateAsync().");
}

export async function getTimerStateAsync(): Promise<StudyTimerState> {
  return getStudyTimer();
}

// ============================================================
// GLOBAL TIMER
// ============================================================

export async function startGlobalTimer(data?: Partial<StudyTimerState>): Promise<StudyTimerState> {
  return startStudyTimer(data);
}

export async function pauseGlobalTimer(): Promise<StudyTimerState> {
  return pauseStudyTimer();
}

export async function resumeGlobalTimer(): Promise<StudyTimerState> {
  return resumeStudyTimer();
}

export async function resetGlobalTimer(): Promise<StudyTimerState> {
  return resetStudyTimer();
}

export async function getCurrentElapsedSeconds(): Promise<number> {
  return getCurrentStudySeconds();
}

export function subscribeGlobalTimer(callback: StudyTimerListener): () => void {
  return subscribeStudyTimer(callback);
}
