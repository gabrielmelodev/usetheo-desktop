/// <reference types="vite/client" />

// ============================================================
// THEO STUDY TIMER
// ============================================================

type TheoStudyTimerEvent = "start" | "pause" | "resume" | "reset" | "set" | "tick";

type TheoStudyTimerState = {
  examId: string | null;
  topicId: string | null;

  subjectName?: string | null;
  subject_name?: string | null;

  topicName?: string | null;
  topic_name?: string | null;

  subjectTitle?: string | null;
  subject_title?: string | null;

  topicTitle?: string | null;
  topic_title?: string | null;

  title?: string | null;

  elapsedSeconds: number;
  running: boolean;
  startedAt: number | null;
  sessionId: string | null;
};

type TheoDesktopStudyTimer = {
  get(): Promise<TheoStudyTimerState>;

  start(payload?: Partial<TheoStudyTimerState>): Promise<TheoStudyTimerState>;

  pause(): Promise<TheoStudyTimerState>;

  resume(): Promise<TheoStudyTimerState>;

  reset(): Promise<TheoStudyTimerState>;

  set(payload?: Partial<TheoStudyTimerState>): Promise<TheoStudyTimerState>;

  getCurrentSeconds(): Promise<number>;

  subscribe(listener: (state: TheoStudyTimerState, event: TheoStudyTimerEvent) => void): () => void;
};

// ============================================================
// ELECTRON DESKTOP BRIDGE
// ============================================================

declare global {
  interface Window {
    theoDesktop: {
      platform: string;

      versions: {
        electron: string;
        chrome: string;
        node: string;
      };

      window: {
        minimize(): void;
        maximize(): void;
        close(): void;
      };

      studyTimer: TheoDesktopStudyTimer;
    };
  }
}

export {};
