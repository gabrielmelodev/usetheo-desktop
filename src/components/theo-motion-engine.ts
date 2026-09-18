import type { TheoState } from "./TheoState";

export type TheoEvent =
  | "app_start"
  | "navigation"
  | "study_open"
  | "study_empty"
  | "sync_start"
  | "sync_success"
  | "sync_error"
  | "login"
  | "logout"
  | "letter_open"
  | "deck_open"
  | "planning_open"
  | "stats_open"
  | "error_open"
  | "admin_open"
  | "idle"
  | "success"
  | "warning";

export type TheoMotion =
  | "idle"
  | "float"
  | "look"
  | "look_left"
  | "look_right"
  | "bounce"
  | "celebrate"
  | "thinking"
  | "alert"
  | "studying"
  | "tired"
  | "waiting";

export interface TheoReaction {
  state: TheoState;
  motion: TheoMotion;
  duration: number;
}

const reactions: Record<TheoEvent, TheoReaction> = {
  app_start: {
    state: "motivated",
    motion: "float",
    duration: 900,
  },

  navigation: {
    state: "focused",
    motion: "look",
    duration: 450,
  },

  study_open: {
    state: "studying",
    motion: "studying",
    duration: 700,
  },

  study_empty: {
    state: "waiting",
    motion: "waiting",
    duration: 900,
  },

  sync_start: {
    state: "focused",
    motion: "look_right",
    duration: 500,
  },

  sync_success: {
    state: "success",
    motion: "bounce",
    duration: 850,
  },

  sync_error: {
    state: "warning",
    motion: "alert",
    duration: 900,
  },

  login: {
    state: "motivated",
    motion: "bounce",
    duration: 700,
  },

  logout: {
    state: "idle",
    motion: "look",
    duration: 500,
  },

  letter_open: {
    state: "letter",
    motion: "float",
    duration: 800,
  },

  deck_open: {
    state: "focused",
    motion: "look_left",
    duration: 550,
  },

  planning_open: {
    state: "thinking",
    motion: "thinking",
    duration: 800,
  },

  stats_open: {
    state: "focused",
    motion: "look",
    duration: 600,
  },

  error_open: {
    state: "thinking",
    motion: "thinking",
    duration: 700,
  },

  admin_open: {
    state: "alert",
    motion: "alert",
    duration: 750,
  },

  idle: {
    state: "idle",
    motion: "float",
    duration: 1200,
  },

  success: {
    state: "success",
    motion: "celebrate",
    duration: 1000,
  },

  warning: {
    state: "warning",
    motion: "alert",
    duration: 800,
  },
};

export function getTheoReaction(event: TheoEvent): TheoReaction {
  return reactions[event] ?? reactions.idle;
}
