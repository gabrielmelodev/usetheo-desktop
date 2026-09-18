import {
  Minus,
  Square,
  X,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Server,
  XCircle,
  AlertTriangle,
  Wifi,
  HardDrive,
  Timer,
  Play,
  Pause,
  RotateCcw,
  BookOpen,
  Maximize2,
  Download,
  Package,
  Terminal,
  Volume2,
  VolumeX,
  Waves,
  Headphones,
} from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { TheoLogo } from "./TheoLogo";

import {
  formatStudyTimer,
  getStudyTimer,
  getCurrentStudySeconds,
  pauseStudyTimer,
  resumeStudyTimer,
  resetStudyTimer,
  subscribeStudyTimer,
  type StudyTimerState,
} from "../electron/studyTimer";

// ============================================================
// TYPES
// ============================================================

type ApiSource = "local" | "cloud" | "offline";

type SyncStatus = {
  server: "online" | "offline";
  source: ApiSource;
  sync: "ok" | "error" | "syncing";
  version: number;
  latency: number;
  last_sync: string | null;
};

type CloudStorageStatus = {
  plan: string;
  used_bytes: number;
  limit_bytes: number;
  used_percentage: number;
  used_formatted: string;
  limit_formatted: string;
};

type UpdateState = "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";

type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

type UpdateInfo = {
  version?: string;
  releaseDate?: string | null;
};

// ============================================================
// SOUND
// ============================================================

type SoundType = "white" | "pink" | "brown";

type StudySound = {
  id: SoundType;
  name: string;
  description: string;
};

const STUDY_SOUNDS: StudySound[] = [
  {
    id: "brown",
    name: "Ruído marrom",
    description: "Som grave e encorpado",
  },
  {
    id: "pink",
    name: "Ruído rosa",
    description: "Som equilibrado e suave",
  },
  {
    id: "white",
    name: "Ruído branco",
    description: "Som contínuo e uniforme",
  },
];

// ============================================================
// BUILD
// ============================================================

const THEO_VERSION = String(import.meta.env.VITE_THEO_VERSION || "0.0.0").trim();

const THEO_BUILD = String(import.meta.env.VITE_THEO_BUILD || "000000").trim();

const THEO_BUILD_DATE = String(import.meta.env.VITE_THEO_BUILD_DATE || "Desconhecida").trim();

const THEO_COMMIT = String(import.meta.env.VITE_THEO_COMMIT || "development").trim();

// ============================================================
// EXECUTION CODE
// ============================================================

function createExecutionCode(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `TH-${crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase()}`;
    }
  } catch {
    // fallback
  }

  try {
    return `TH-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  } catch {
    return "TH-UNKNOWN";
  }
}

// ============================================================
// API
// ============================================================

const LOCAL_API_URL = (import.meta.env.VITE_LOCAL_API_URL || "http://localhost:4000/api").replace(
  /\/$/,
  "",
);

const CLOUD_API_URL = (
  import.meta.env.VITE_API_URL || "https://usetheo-backend.onrender.com/api"
).replace(/\/$/, "");

// ============================================================
// EVENTS
// ============================================================

const TIMER_FLOATING_EVENT = "theo-study-timer-floating";

const STUDY_REGISTER_EVENT = "theo-open-study-register";

// ============================================================
// STORAGE
// ============================================================

const SOUND_STORAGE_KEY = "theo.study.sound.settings";

// ============================================================
// TOKEN
// ============================================================

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem("theo.tokens");

    if (!raw) {
      return null;
    }

    const tokens = JSON.parse(raw);

    return tokens?.access_token ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// API REQUEST
// ============================================================

async function fetchTheoApi(
  path: string,
  options: RequestInit = {},
): Promise<{
  response: Response;
  source: ApiSource;
}> {
  const token = getAccessToken();

  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
  };

  try {
    const localResponse = await fetch(`${LOCAL_API_URL}${path}`, {
      ...requestOptions,
      signal: AbortSignal.timeout(2500),
    });

    if (localResponse.ok) {
      return {
        response: localResponse,
        source: "local",
      };
    }
  } catch {
    // API local indisponível.
  }

  const cloudResponse = await fetch(`${CLOUD_API_URL}${path}`, requestOptions);

  if (cloudResponse.ok) {
    return {
      response: cloudResponse,
      source: "cloud",
    };
  }

  throw new Error(`HTTP ${cloudResponse.status}`);
}

// ============================================================
// BYTES
// ============================================================

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];

  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  const value = bytes / Math.pow(1024, index);

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

// ============================================================
// NUMBER
// ============================================================

function normalizeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

// ============================================================
// TIMER
// ============================================================

const EMPTY_TIMER: StudyTimerState = {
  examId: null,
  topicId: null,
  subjectName: null,
  subject_name: null,
  topicName: null,
  topic_name: null,
  elapsedSeconds: 0,
  running: false,
  startedAt: null,
  sessionId: null,
};

// ============================================================
// TIMER LABEL
// ============================================================

function getTimerLabel(timer: StudyTimerState): string {
  const value = timer as StudyTimerState & Record<string, unknown>;

  const names = [
    value.subjectName,
    value.subject_name,
    value.materiaName,
    value.materia_name,
    value.subjectTitle,
    value.subject_title,
    value.topicName,
    value.topic_name,
    value.topicTitle,
    value.topic_title,
    value.title,
  ];

  for (const name of names) {
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }

  return "Estudando";
}

// ============================================================
// SECONDARY TIMER LABEL
// ============================================================

function getTimerSecondaryLabel(timer: StudyTimerState): string | null {
  const value = timer as StudyTimerState & Record<string, unknown>;

  const names = [value.topicName, value.topic_name, value.topicTitle, value.topic_title];

  for (const name of names) {
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }

  return null;
}

// ============================================================
// SOUND ENGINE
// ============================================================

class StudySoundEngine {
  private context: AudioContext | null = null;

  private masterGain: GainNode | null = null;

  private noiseSource: AudioBufferSourceNode | null = null;

  private filter: BiquadFilterNode | null = null;

  private currentSound: StudySound | null = null;

  private volume = 0.12;

  private playing = false;

  // ----------------------------------------------------------
  // CONTEXT
  // ----------------------------------------------------------

  private ensureContext(): AudioContext {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API não disponível.");
      }

      this.context = new AudioContextClass();

      this.masterGain = this.context.createGain();

      this.masterGain.gain.value = 0;

      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  // ----------------------------------------------------------
  // RESUME
  // ----------------------------------------------------------

  private async resume(): Promise<void> {
    const context = this.ensureContext();

    if (context.state === "suspended") {
      await context.resume();
    }
  }

  // ----------------------------------------------------------
  // VOLUME
  // ----------------------------------------------------------

  setVolume(volume: number): void {
    const normalized = Math.min(0.18, Math.max(0, Number(volume) || 0));

    this.volume = normalized;

    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(normalized, this.context.currentTime, 0.025);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  // ----------------------------------------------------------
  // PLAY
  // ----------------------------------------------------------

  async play(sound: StudySound): Promise<void> {
    await this.resume();

    this.stopSources();

    const context = this.ensureContext();

    if (!this.masterGain) {
      return;
    }

    this.currentSound = sound;

    this.playNoise(context, sound.id);

    this.fadeIn();

    this.playing = true;
  }

  // ----------------------------------------------------------
  // NOISE
  // ----------------------------------------------------------

  private playNoise(context: AudioContext, type: SoundType): void {
    if (!this.masterGain) {
      return;
    }

    const duration = 4;

    const bufferSize = Math.floor(context.sampleRate * duration);

    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);

    const data = buffer.getChannelData(0);

    // --------------------------------------------------------
    // WHITE
    // --------------------------------------------------------

    if (type === "white") {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    // --------------------------------------------------------
    // BROWN
    // --------------------------------------------------------

    if (type === "brown") {
      let last = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;

        last += white * 0.018;

        last *= 0.995;

        data[i] = Math.max(-1, Math.min(1, last * 4));
      }
    }

    // --------------------------------------------------------
    // PINK
    // --------------------------------------------------------

    if (type === "pink") {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;

        b0 = 0.99886 * b0 + white * 0.0555179;

        b1 = 0.99332 * b1 + white * 0.0750759;

        b2 = 0.969 * b2 + white * 0.153852;

        b3 = 0.8665 * b3 + white * 0.3104856;

        b4 = 0.55 * b4 + white * 0.5329522;

        b5 = -0.7616 * b5 - white * 0.016898;

        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;

        b6 = white * 0.115926;

        data[i] = pink * 0.11;
      }
    }

    const source = context.createBufferSource();

    source.buffer = buffer;

    source.loop = true;

    // --------------------------------------------------------
    // FILTER
    // --------------------------------------------------------

    if (type === "brown") {
      const filter = context.createBiquadFilter();

      filter.type = "lowpass";

      filter.frequency.value = 650;

      filter.Q.value = 0.4;

      source.connect(filter);

      filter.connect(this.masterGain);

      this.filter = filter;
    } else if (type === "pink") {
      const filter = context.createBiquadFilter();

      filter.type = "lowpass";

      filter.frequency.value = 8000;

      filter.Q.value = 0.25;

      source.connect(filter);

      filter.connect(this.masterGain);

      this.filter = filter;
    } else {
      source.connect(this.masterGain);
    }

    source.start();

    this.noiseSource = source;
  }

  // ----------------------------------------------------------
  // FADE IN
  // ----------------------------------------------------------

  private fadeIn(): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;

    this.masterGain.gain.cancelScheduledValues(now);

    this.masterGain.gain.setValueAtTime(0, now);

    this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 0.35);
  }

  // ----------------------------------------------------------
  // FADE OUT
  // ----------------------------------------------------------

  private fadeOut(): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;

    this.masterGain.gain.cancelScheduledValues(now);

    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);

    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.12);
  }

  // ----------------------------------------------------------
  // PAUSE
  // ----------------------------------------------------------

  pause(): void {
    this.fadeOut();

    window.setTimeout(() => {
      this.stopSources();
    }, 140);

    this.playing = false;
  }

  // ----------------------------------------------------------
  // STOP
  // ----------------------------------------------------------

  stop(): void {
    this.fadeOut();

    window.setTimeout(() => {
      this.stopSources();
    }, 140);

    this.currentSound = null;

    this.playing = false;
  }

  // ----------------------------------------------------------
  // STOP SOURCES
  // ----------------------------------------------------------

  private stopSources(): void {
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
      } catch {
        // já parado
      }

      try {
        this.noiseSource.disconnect();
      } catch {
        // já desconectado
      }

      this.noiseSource = null;
    }

    if (this.filter) {
      try {
        this.filter.disconnect();
      } catch {
        // já desconectado
      }

      this.filter = null;
    }
  }

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentSound(): StudySound | null {
    return this.currentSound;
  }

  // ----------------------------------------------------------
  // DESTROY
  // ----------------------------------------------------------

  destroy(): void {
    this.stopSources();

    if (this.context) {
      void this.context.close();

      this.context = null;
    }

    this.masterGain = null;

    this.currentSound = null;

    this.playing = false;
  }
}

// ============================================================
// COMPONENT
// ============================================================

export default function TitleBar() {
  // ==========================================================
  // EXECUTION
  // ==========================================================

  const [executionCode] = useState(() => createExecutionCode());

  // ==========================================================
  // STATUS PANEL
  // ==========================================================

  const [openStatus, setOpenStatus] = useState(false);

  const statusRef = useRef<HTMLDivElement>(null);

  // ==========================================================
  // SOUND PANEL
  // ==========================================================

  const [soundPanelOpen, setSoundPanelOpen] = useState(false);

  const soundRef = useRef<HTMLDivElement>(null);

  // ==========================================================
  // SOUND ENGINE
  // ==========================================================

  const soundEngineRef = useRef<StudySoundEngine | null>(null);

  if (!soundEngineRef.current) {
    soundEngineRef.current = new StudySoundEngine();
  }

  const soundEngine = soundEngineRef.current;

  // ==========================================================
  // SOUND SETTINGS
  // ==========================================================

  const [selectedSoundId, setSelectedSoundId] = useState<SoundType>(() => {
    try {
      const raw = localStorage.getItem(SOUND_STORAGE_KEY);

      if (!raw) {
        return "brown";
      }

      const parsed = JSON.parse(raw);

      if (
        parsed?.soundId === "brown" ||
        parsed?.soundId === "pink" ||
        parsed?.soundId === "white"
      ) {
        return parsed.soundId;
      }

      return "brown";
    } catch {
      return "brown";
    }
  });

  const [soundPlaying, setSoundPlaying] = useState(false);

  const [soundVolume, setSoundVolume] = useState(() => {
    try {
      const raw = localStorage.getItem(SOUND_STORAGE_KEY);

      if (!raw) {
        return 0.12;
      }

      const parsed = JSON.parse(raw);

      if (typeof parsed?.volume === "number" && Number.isFinite(parsed.volume)) {
        return Math.min(0.18, Math.max(0, parsed.volume));
      }

      return 0.12;
    } catch {
      return 0.12;
    }
  });

  // ==========================================================
  // TIMER / STATUS
  // ==========================================================

  const [floatingTimerOpen, setFloatingTimerOpen] = useState(false);

  const [status, setStatus] = useState<SyncStatus>({
    server: "offline",
    source: "offline",
    sync: "syncing",
    version: 0,
    latency: 0,
    last_sync: null,
  });

  const [storage, setStorage] = useState<CloudStorageStatus>({
    plan: "free",
    used_bytes: 0,
    limit_bytes: 100 * 1024 * 1024,
    used_percentage: 0,
    used_formatted: "0 B",
    limit_formatted: "100 MB",
  });

  // ==========================================================
  // UPDATE
  // ==========================================================

  const [updateState, setUpdateState] = useState<UpdateState>("idle");

  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

  const [updateError, setUpdateError] = useState<string | null>(null);

  // ==========================================================
  // STUDY TIMER
  // ==========================================================

  const [studyTimer, setStudyTimerState] = useState<StudyTimerState>(EMPTY_TIMER);

  const [timerNow, setTimerNow] = useState(() => Date.now());

  const [timerPulse, setTimerPulse] = useState(false);

  const [secondTick, setSecondTick] = useState(false);

  const secondTickTimeoutRef = useRef<number | null>(null);

  const timerPulseTimeoutRef = useRef<number | null>(null);

  // ==========================================================
  // SAVE SOUND
  // ==========================================================

  useEffect(() => {
    try {
      localStorage.setItem(
        SOUND_STORAGE_KEY,
        JSON.stringify({
          soundId: selectedSoundId,
          volume: soundVolume,
        }),
      );
    } catch {
      // storage indisponível
    }
  }, [selectedSoundId, soundVolume]);

  // ==========================================================
  // VOLUME
  // ==========================================================

  useEffect(() => {
    soundEngine.setVolume(soundVolume);
  }, [soundEngine, soundVolume]);

  // ==========================================================
  // SOUND CLEANUP
  // ==========================================================

  useEffect(() => {
    return () => {
      soundEngine.destroy();
    };
  }, [soundEngine]);

  // ==========================================================
  // SELECTED SOUND
  // ==========================================================

  const selectedSound = useMemo(
    () => STUDY_SOUNDS.find((sound) => sound.id === selectedSoundId) ?? STUDY_SOUNDS[0],
    [selectedSoundId],
  );

  // ==========================================================
  // START SOUND
  // ==========================================================

  const handleStartSound = useCallback(
    async (sound: StudySound) => {
      try {
        setSelectedSoundId(sound.id);

        await soundEngine.play(sound);

        setSoundPlaying(true);
      } catch (error) {
        console.error("[Theo] Erro ao reproduzir ruído:", error);

        setSoundPlaying(false);
      }
    },
    [soundEngine],
  );

  // ==========================================================
  // PAUSE SOUND
  // ==========================================================

  const handlePauseSound = useCallback(() => {
    soundEngine.pause();

    setSoundPlaying(false);
  }, [soundEngine]);

  // ==========================================================
  // TOGGLE SOUND
  // ==========================================================

  const handleToggleSound = useCallback(async () => {
    if (soundPlaying) {
      handlePauseSound();

      return;
    }

    await handleStartSound(selectedSound);
  }, [soundPlaying, selectedSound, handlePauseSound, handleStartSound]);

  // ==========================================================
  // SELECT SOUND
  // ==========================================================

  const handleSelectSound = useCallback(
    async (sound: StudySound) => {
      setSelectedSoundId(sound.id);

      if (soundPlaying) {
        await handleStartSound(sound);
      }
    },
    [soundPlaying, handleStartSound],
  );

  // ==========================================================
  // SOUND CLICK OUTSIDE
  // ==========================================================

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (soundRef.current && target && !soundRef.current.contains(target)) {
        setSoundPanelOpen(false);
      }
    };

    if (soundPanelOpen) {
      document.addEventListener("mousedown", handleClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [soundPanelOpen]);

  // ==========================================================
  // UPDATE LISTENERS
  // ==========================================================

  useEffect(() => {
    const updater = window.theoDesktop?.updater;

    if (!updater) {
      return;
    }

    updater.onChecking(() => {
      setUpdateState("checking");
      setUpdateError(null);
    });

    updater.onAvailable((info: UpdateInfo) => {
      setUpdateState("available");
      setUpdateVersion(info?.version ?? null);
    });

    updater.onNotAvailable(() => {
      setUpdateState("idle");
      setUpdateVersion(null);
      setUpdateProgress(null);
    });

    updater.onProgress((progress: UpdateProgress) => {
      setUpdateState("downloading");
      setUpdateProgress(progress);
    });

    updater.onDownloaded((info: UpdateInfo) => {
      setUpdateState("downloaded");
      setUpdateVersion(info?.version ?? null);
      setUpdateProgress(null);
    });

    updater.onError((message: string) => {
      setUpdateState("error");
      setUpdateError(message);
    });
  }, []);

  // ==========================================================
  // CHECK UPDATE
  // ==========================================================

  const handleCheckForUpdate = useCallback(async () => {
    const updater = window.theoDesktop?.updater;

    if (!updater) {
      return;
    }

    setUpdateState("checking");

    try {
      const result = await updater.checkNow();

      if (!result?.ok && result?.message) {
        setUpdateState("error");

        setUpdateError(result.message);
      }
    } catch (error) {
      setUpdateState("error");

      setUpdateError(error instanceof Error ? error.message : "Erro ao verificar atualização.");
    }
  }, []);

  // ==========================================================
  // INSTALL UPDATE
  // ==========================================================

  const handleDownloadUpdate = useCallback(async () => {
    const updater = window.theoDesktop?.updater;
    if (!updater) return;

    setUpdateState("downloading");
    setUpdateError(null);

    try {
      const result = await updater.downloadNow();
      if (!result?.ok) {
        setUpdateState("error");
        setUpdateError(result?.message ?? "Não foi possível baixar a atualização.");
      }
    } catch (error) {
      setUpdateState("error");
      setUpdateError(error instanceof Error ? error.message : "Erro ao baixar atualização.");
    }
  }, []);

  const handleInstallUpdate = useCallback(() => {
    window.theoDesktop?.updater.quitAndInstall();
  }, []);

  // ==========================================================
  // LOAD TIMER
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    void getStudyTimer()
      .then((state) => {
        if (!mounted) {
          return;
        }

        setStudyTimerState(state);

        setTimerNow(Date.now());
      })
      .catch(() => {
        if (mounted) {
          setStudyTimerState(EMPTY_TIMER);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // ==========================================================
  // TIMER SUBSCRIPTION
  // ==========================================================

  useEffect(() => {
    const unsubscribe = subscribeStudyTimer((state, event) => {
      setStudyTimerState(state);

      setTimerNow(Date.now());

      if (event === "tick") {
        setSecondTick(true);

        if (secondTickTimeoutRef.current !== null) {
          window.clearTimeout(secondTickTimeoutRef.current);
        }

        secondTickTimeoutRef.current = window.setTimeout(() => {
          setSecondTick(false);
        }, 180);

        return;
      }

      setTimerPulse(true);

      if (timerPulseTimeoutRef.current !== null) {
        window.clearTimeout(timerPulseTimeoutRef.current);
      }

      timerPulseTimeoutRef.current = window.setTimeout(() => {
        setTimerPulse(false);
      }, 220);
    });

    return () => {
      unsubscribe();

      if (secondTickTimeoutRef.current !== null) {
        window.clearTimeout(secondTickTimeoutRef.current);
      }

      if (timerPulseTimeoutRef.current !== null) {
        window.clearTimeout(timerPulseTimeoutRef.current);
      }
    };
  }, []);

  // ==========================================================
  // DISPLAYED SECONDS
  // ==========================================================

  const displayedSeconds = useMemo(() => {
    if (!studyTimer.running || !studyTimer.startedAt) {
      return Math.max(0, Math.floor(studyTimer.elapsedSeconds));
    }

    return Math.max(
      0,
      Math.floor(studyTimer.elapsedSeconds + (timerNow - studyTimer.startedAt) / 1000),
    );
  }, [studyTimer, timerNow]);

  // ==========================================================
  // TIMER ACTIVE
  // ==========================================================

  const timerActive = Boolean(
    studyTimer.examId ||
    studyTimer.topicId ||
    studyTimer.sessionId ||
    studyTimer.running ||
    studyTimer.elapsedSeconds > 0,
  );

  // ==========================================================
  // TIMER LABEL
  // ==========================================================

  const timerLabel = useMemo(() => getTimerLabel(studyTimer), [studyTimer]);

  const timerSecondaryLabel = useMemo(() => getTimerSecondaryLabel(studyTimer), [studyTimer]);

  // ==========================================================
  // FLOATING TIMER
  // ==========================================================

  const openFloatingTimer = useCallback(() => {
    if (!timerActive) {
      return;
    }

    setFloatingTimerOpen(true);

    window.dispatchEvent(
      new CustomEvent(TIMER_FLOATING_EVENT, {
        detail: {
          open: true,
        },
      }),
    );
  }, [timerActive]);

  const closeFloatingTimer = useCallback(() => {
    setFloatingTimerOpen(false);

    window.dispatchEvent(
      new CustomEvent(TIMER_FLOATING_EVENT, {
        detail: {
          open: false,
        },
      }),
    );
  }, []);

  // ==========================================================
  // PAUSE TIMER
  // ==========================================================

  const handlePause = useCallback(() => {
    if (studyTimer.running) {
      void pauseStudyTimer();
    }
  }, [studyTimer.running]);

  // ==========================================================
  // RESUME TIMER
  // ==========================================================

  const handleResume = useCallback(() => {
    if (studyTimer.examId && studyTimer.topicId && !studyTimer.running) {
      void resumeStudyTimer();
    }
  }, [studyTimer]);

  // ==========================================================
  // RESET TIMER
  // ==========================================================

  const handleReset = useCallback(async () => {
    const seconds = await getCurrentStudySeconds();

    if (seconds <= 0) {
      await resetStudyTimer();

      closeFloatingTimer();

      return;
    }

    const confirmed = window.confirm(
      `Encerrar este estudo?\n\nTempo estudado: ${formatStudyTimer(seconds)}`,
    );

    if (!confirmed) {
      return;
    }

    await resetStudyTimer();

    closeFloatingTimer();
  }, [closeFloatingTimer]);

  // ==========================================================
  // STUDY REGISTER
  // ==========================================================

  const openStudyRegister = useCallback(() => {
    if (!timerActive) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(STUDY_REGISTER_EVENT, {
        detail: {
          examId: studyTimer.examId,
          topicId: studyTimer.topicId,
          subjectName: studyTimer.subjectName,
          topicName: studyTimer.topicName,
          elapsedSeconds: displayedSeconds,
          running: studyTimer.running,
          sessionId: studyTimer.sessionId,
        },
      }),
    );
  }, [timerActive, studyTimer, displayedSeconds]);

  // ==========================================================
  // TIMER CLOCK
  // ==========================================================

  useEffect(() => {
    if (!studyTimer.running) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [studyTimer.running]);

  // ==========================================================
  // KEYBOARD
  // ==========================================================

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (typing) {
        return;
      }

      if (event.code === "Space" && timerActive) {
        event.preventDefault();

        if (studyTimer.running) {
          handlePause();
        } else {
          handleResume();
        }
      }

      if (event.code === "Escape") {
        setSoundPanelOpen(false);

        setOpenStatus(false);

        if (floatingTimerOpen) {
          closeFloatingTimer();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    timerActive,
    studyTimer.running,
    handlePause,
    handleResume,
    floatingTimerOpen,
    closeFloatingTimer,
  ]);

  // ==========================================================
  // STATUS
  // ==========================================================

  const checkStatus = useCallback(async () => {
    const start = performance.now();

    try {
      const token = getAccessToken();

      if (!token) {
        setStatus((previous) => ({
          ...previous,
          server: "offline",
          source: "offline",
          sync: "error",
          version: 0,
          latency: 0,
        }));

        return;
      }

      const { response, source } = await fetchTheoApi("/sync/version");

      const data = await response.json();

      setStatus((previous) => ({
        ...previous,
        server: "online",
        source,
        version: normalizeNumber(data?.version),
        latency: Math.round(performance.now() - start),
        last_sync: data?.last_sync ?? previous.last_sync,
        sync: data?.sync ?? "ok",
      }));
    } catch {
      setStatus((previous) => ({
        ...previous,
        server: "offline",
        source: "offline",
        sync: "error",
        latency: 0,
      }));
    }
  }, []);

  // ==========================================================
  // STORAGE
  // ==========================================================

  const checkStorage = useCallback(async () => {
    try {
      const token = getAccessToken();

      if (!token) {
        return;
      }

      const { response, source } = await fetchTheoApi("/sync/storage");

      const data = await response.json();

      const used = normalizeNumber(data?.used_bytes);

      const limit = normalizeNumber(data?.limit_bytes);

      const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

      setStorage({
        plan: data?.plan ?? "free",
        used_bytes: used,
        limit_bytes: limit,
        used_percentage: percentage,
        used_formatted: data?.used_formatted ?? formatBytes(used),
        limit_formatted: data?.limit_formatted ?? formatBytes(limit),
      });

      setStatus((previous) => ({
        ...previous,
        server: "online",
        source,
      }));
    } catch {
      // offline
    }
  }, []);

  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshCloudStatus = useCallback(async () => {
    await Promise.all([checkStatus(), checkStorage()]);
  }, [checkStatus, checkStorage]);

  // ==========================================================
  // POLLING
  // ==========================================================

  useEffect(() => {
    void refreshCloudStatus();

    const interval = window.setInterval(() => {
      void refreshCloudStatus();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshCloudStatus]);

  // ==========================================================
  // STATUS CLICK OUTSIDE
  // ==========================================================

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (statusRef.current && target && !statusRef.current.contains(target)) {
        setOpenStatus(false);
      }
    };

    if (openStatus) {
      document.addEventListener("mousedown", handleClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [openStatus]);

  // ==========================================================
  // STATUS VALUES
  // ==========================================================

  const online = status.server === "online";

  const syncOk = status.sync === "ok";

  const connectionLabel =
    status.source === "local" ? "Local" : status.source === "cloud" ? "Cloud" : "Offline";

  const connectionColor =
    status.source === "local"
      ? "text-[#8ab4f8]"
      : status.source === "cloud"
        ? "text-[#81c995]"
        : "text-[#f28b82]";

  // ==========================================================
  // STORAGE
  // ==========================================================

  const storagePercentage = Math.min(100, Math.max(0, storage.used_percentage));

  const storageFull = storage.limit_bytes > 0 && storage.used_bytes >= storage.limit_bytes;

  // ==========================================================
  // LAST SYNC
  // ==========================================================

  const formatLastSync = () => {
    if (!status.last_sync) {
      return "Nunca";
    }

    const date = new Date(status.last_sync);

    if (Number.isNaN(date.getTime())) {
      return "Nunca";
    }

    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // ==========================================================
  // UPDATE TITLE
  // ==========================================================

  const updateTitle =
    updateState === "checking"
      ? "Verificando atualizações..."
      : updateState === "available"
        ? `Nova versão ${updateVersion ?? ""} encontrada`
        : updateState === "downloading"
          ? `Baixando ${updateProgress?.percent ?? 0}%`
          : updateState === "downloaded"
            ? "Atualização pronta"
            : updateState === "error"
              ? (updateError ?? "Erro na atualização")
              : "Atualizações";

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>
      <div
        className="
          drag
          relative
          z-50
          flex
          h-10
          items-center
          justify-between
          border-b
          border-[#3c4043]
          bg-[#202124]
          px-4
          select-none
        "
      >
        {/* ====================================================
            LEFT
        ==================================================== */}

        <div className="flex items-center gap-2.5">
          <TheoLogo className="h-5 w-5 text-[#8ab4f8]" />

          <span className="text-[13px] font-medium tracking-[-0.01em] text-[#e8eaed]">Theo</span>
        </div>

        {/* ====================================================
            CENTER
        ==================================================== */}

        <div
          ref={statusRef}
          className="
            no-drag
            absolute
            left-1/2
            flex
            -translate-x-1/2
            items-center
            gap-1.5
          "
        >
          {/* ==================================================
              TIMER
          ================================================== */}

          {timerActive && (
            <div
              className="
                flex
                items-center
                gap-1.5
                rounded-full
                border
                border-[#81c995]/20
                bg-[#81c995]/[0.07]
                px-2
                py-1
              "
            >
              <Timer
                size={13}
                className={studyTimer.running ? "text-[#81c995]" : "text-[#fdd663]"}
              />

              <button
                type="button"
                onClick={openStudyRegister}
                className="
                  max-w-[150px]
                  truncate
                  text-[10px]
                  font-medium
                  text-[#bdc1c6]
                  hover:text-[#e8eaed]
                "
              >
                {timerLabel}
              </button>

              <button
                type="button"
                onClick={openFloatingTimer}
                className={`
                  font-mono
                  text-[11px]
                  font-semibold
                  text-[#e8eaed]
                  transition
                  ${secondTick ? "scale-105" : ""}
                `}
              >
                {formatStudyTimer(displayedSeconds)}
              </button>

              <button
                type="button"
                onClick={studyTimer.running ? handlePause : handleResume}
                className="
                  flex
                  h-6
                  w-6
                  items-center
                  justify-center
                  rounded-full
                  text-[#9aa0a6]
                  transition-colors
                  hover:bg-[#3c4043]
                  hover:text-[#e8eaed]
                "
                title={studyTimer.running ? "Pausar" : "Continuar"}
              >
                {studyTimer.running ? (
                  <Pause size={11} fill="currentColor" />
                ) : (
                  <Play size={11} fill="currentColor" />
                )}
              </button>
            </div>
          )}

          {/* ==================================================
              SOUND
          ================================================== */}

          <div ref={soundRef} className="relative">
            <button
              type="button"
              onClick={() => setSoundPanelOpen((value) => !value)}
              className={`
                no-drag
                flex
                items-center
                gap-2
                rounded-full
                border
                px-3
                py-1
                text-[11px]
                font-medium
                transition-colors
                ${
                  soundPlaying
                    ? "border-[#8ab4f8]/30 bg-[#8ab4f8]/10 text-[#aecbfa]"
                    : "border-transparent bg-[#303134] text-[#bdc1c6] hover:bg-[#3c4043] hover:text-[#e8eaed]"
                }
              `}
              title="Ruídos para estudo"
            >
              {soundPlaying ? (
                <Volume2 size={14} className="text-[#8ab4f8]" />
              ) : (
                <VolumeX size={14} />
              )}

              <span>Som</span>

              {soundPlaying && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8ab4f8]" />
              )}
            </button>

            {/* ==================================================
                SOUND PANEL
            ================================================== */}

            <div
              className={`
                no-drag
                absolute
                left-1/2
                top-11
                w-[330px]
                -translate-x-1/2
                overflow-hidden
                rounded-2xl
                border
                border-[#3c4043]
                bg-[#292a2d]
                shadow-[0_10px_35px_rgba(0,0,0,0.45)]
                transition-all
                duration-150
                ${
                  soundPanelOpen
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
                }
              `}
            >
              {/* HEADER */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  border-b
                  border-[#3c4043]
                  px-4
                  py-3
                "
              >
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex
                      h-8
                      w-8
                      items-center
                      justify-center
                      rounded-xl
                      bg-[#8ab4f8]/10
                    "
                  >
                    <Headphones size={15} className="text-[#8ab4f8]" />
                  </div>

                  <div>
                    <div className="text-xs font-medium text-[#e8eaed]">Ruídos para estudo</div>

                    <div className="mt-0.5 text-[9px] text-[#9aa0a6]">Gerados localmente</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSoundPanelOpen(false)}
                  className="
                    flex
                    h-7
                    w-7
                    items-center
                    justify-center
                    rounded-full
                    text-[#9aa0a6]
                    transition-colors
                    hover:bg-[#3c4043]
                    hover:text-[#e8eaed]
                  "
                  title="Fechar"
                >
                  <X size={14} />
                </button>
              </div>

              {/* CURRENT */}

              <div
                className="
                  mx-3
                  mt-3
                  rounded-xl
                  border
                  border-[#3c4043]
                  bg-[#303134]
                  p-3
                "
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] font-medium uppercase tracking-wider text-[#9aa0a6]">
                      Selecionado
                    </div>

                    <div className="mt-1 text-sm font-medium text-[#e8eaed]">
                      {selectedSound.name}
                    </div>

                    <div className="mt-0.5 text-[9px] text-[#9aa0a6]">
                      {selectedSound.description}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleSound()}
                    className={`
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-full
                      transition-colors
                      ${
                        soundPlaying
                          ? "bg-[#8ab4f8]/15 text-[#8ab4f8]"
                          : "bg-[#3c4043] text-[#bdc1c6] hover:bg-[#45474b] hover:text-[#e8eaed]"
                      }
                    `}
                    title={soundPlaying ? "Pausar ruído" : "Reproduzir ruído"}
                  >
                    {soundPlaying ? (
                      <Pause size={15} fill="currentColor" />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                  </button>
                </div>
              </div>

              {/* LIST */}

              <div className="px-3 py-3">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Waves size={12} className="text-[#9aa0a6]" />

                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9aa0a6]">
                    Ruídos disponíveis
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {STUDY_SOUNDS.map((sound) => {
                    const active = selectedSoundId === sound.id;

                    return (
                      <button
                        key={sound.id}
                        type="button"
                        onClick={() => void handleSelectSound(sound)}
                        className={`
                            group
                            rounded-xl
                            border
                            px-3
                            py-2.5
                            text-left
                            transition-colors
                            ${
                              active
                                ? "border-[#8ab4f8]/25 bg-[#8ab4f8]/10"
                                : "border-transparent bg-transparent hover:bg-[#303134]"
                            }
                          `}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`
                                  flex
                                  h-7
                                  w-7
                                  items-center
                                  justify-center
                                  rounded-lg
                                  ${active ? "bg-[#8ab4f8]/10" : "bg-[#303134]"}
                                `}
                            >
                              <Waves
                                size={13}
                                className={active ? "text-[#8ab4f8]" : "text-[#9aa0a6]"}
                              />
                            </div>

                            <div>
                              <div
                                className={`
                                    text-[11px]
                                    font-medium
                                    ${active ? "text-[#aecbfa]" : "text-[#e8eaed]"}
                                  `}
                              >
                                {sound.name}
                              </div>

                              <div className="mt-0.5 text-[9px] text-[#9aa0a6]">
                                {sound.description}
                              </div>
                            </div>
                          </div>

                          {active && soundPlaying && (
                            <span className="flex items-end gap-0.5">
                              <span className="h-2 w-0.5 animate-pulse rounded-full bg-[#8ab4f8]" />

                              <span className="h-3 w-0.5 animate-pulse rounded-full bg-[#8ab4f8] [animation-delay:100ms]" />

                              <span className="h-2 w-0.5 animate-pulse rounded-full bg-[#8ab4f8] [animation-delay:200ms]" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* VOLUME */}

              <div
                className="
                  border-t
                  border-[#3c4043]
                  px-4
                  py-3
                "
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 size={13} className="text-[#9aa0a6]" />

                    <span className="text-[10px] text-[#bdc1c6]">Volume</span>
                  </div>

                  <span className="font-mono text-[10px] text-[#9aa0a6]">
                    {Math.round((soundVolume / 0.18) * 100)}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="0.18"
                  step="0.005"
                  value={soundVolume}
                  onChange={(event) => setSoundVolume(Number(event.target.value))}
                  className="
                    h-1
                    w-full
                    cursor-pointer
                    appearance-none
                    rounded-full
                    bg-[#3c4043]
                    accent-[#8ab4f8]
                  "
                  aria-label="Volume do ruído"
                />

                <div className="mt-2 flex justify-between text-[8px] text-[#70757a]">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* FOOTER */}

              <div
                className="
                  border-t
                  border-[#3c4043]
                  px-4
                  py-2.5
                  text-[8px]
                  leading-relaxed
                  text-[#9aa0a6]
                "
              >
                Os ruídos são sintetizados localmente pelo Theo e continuam funcionando sem conexão
                com a internet.
              </div>
            </div>
          </div>

          {/* ==================================================
              CONNECTION STATUS
          ================================================== */}

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenStatus((value) => !value)}
              className="
                no-drag
                flex
                items-center
                gap-2
                rounded-full
                border
                border-transparent
                bg-[#303134]
                px-3
                py-1
                text-[11px]
                font-medium
                text-[#bdc1c6]
                transition-colors
                hover:bg-[#3c4043]
                hover:text-[#e8eaed]
              "
            >
              {status.source === "local" ? (
                <Server size={14} className="text-[#8ab4f8]" />
              ) : status.source === "cloud" ? (
                <Cloud size={14} className="text-[#81c995]" />
              ) : (
                <XCircle size={14} className="text-[#f28b82]" />
              )}

              <span>Theo</span>

              <span
                className={`
                  h-1.5
                  w-1.5
                  rounded-full
                  ${online ? "animate-pulse bg-[#81c995]" : "bg-[#f28b82]"}
                `}
              />

              <span className={connectionColor}>{connectionLabel}</span>
            </button>

            {/* ==================================================
                STATUS PANEL
            ================================================== */}

            <div
              className={`
                absolute
                left-1/2
                top-11
                w-80
                -translate-x-1/2
                overflow-hidden
                rounded-2xl
                border
                border-[#3c4043]
                bg-[#292a2d]
                shadow-[0_10px_35px_rgba(0,0,0,0.45)]
                transition-all
                duration-150
                ${
                  openStatus
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
                }
              `}
            >
              {/* HEADER */}

              <div
                className="
                  border-b
                  border-[#3c4043]
                  px-4
                  py-3
                "
              >
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex
                      h-8
                      w-8
                      items-center
                      justify-center
                      rounded-xl
                      bg-[#8ab4f8]/10
                    "
                  >
                    <Cloud size={15} className="text-[#8ab4f8]" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[#e8eaed]">Theo</div>

                    <div className="mt-0.5 text-[9px] text-[#9aa0a6]">Estado da conexão</div>
                  </div>
                </div>
              </div>

              {/* CONTENT */}

              <div className="space-y-3 px-4 py-4 text-xs">
                <StatusRow
                  label="Servidor"
                  ok={online}
                  icon={online ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  text={connectionLabel}
                />

                <StatusRow
                  label="Sincronização"
                  ok={syncOk}
                  icon={syncOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  text={syncOk ? "Atualizado" : "Erro"}
                />

                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Versão</span>

                  <span className="font-mono text-[#e8eaed]">{THEO_VERSION}</span>
                </div>

                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-[#9aa0a6]">
                    <Package size={12} />
                    Build
                  </span>

                  <span className="font-mono text-[#bdc1c6]">#{THEO_BUILD}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[#9aa0a6]">
                    <Terminal size={12} />
                    Commit
                  </span>

                  <span
                    className="
                      max-w-[130px]
                      truncate
                      font-mono
                      text-[10px]
                      text-[#9aa0a6]
                    "
                  >
                    {THEO_COMMIT}
                  </span>
                </div>

                {/* EXECUTION CODE */}

                <div
                  className="
                    rounded-xl
                    border
                    border-[#3c4043]
                    bg-[#303134]
                    px-3
                    py-2.5
                  "
                >
                  <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-[#9aa0a6]">
                    Código de execução
                  </div>

                  <div className="font-mono text-[11px] tracking-[0.08em] text-[#e8eaed]">
                    {executionCode}
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#9aa0a6]">Compilado em</span>

                  <span className="max-w-[150px] truncate text-right text-[10px] text-[#9aa0a6]">
                    {THEO_BUILD_DATE}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Latência</span>

                  <span className="flex items-center gap-1 text-[#bdc1c6]">
                    <Wifi size={12} />
                    {status.latency}
                    ms
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Última sync</span>

                  <span className="text-[#bdc1c6]">{formatLastSync()}</span>
                </div>

                {/* STORAGE */}

                <div className="border-t border-[#3c4043] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[#9aa0a6]">
                      <HardDrive size={13} />
                      Armazenamento
                    </span>

                    <span className="text-[#bdc1c6]">
                      {storage.used_formatted}
                      {" / "}
                      {storage.limit_formatted}
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-[#3c4043]">
                    <div
                      className={`
                        h-full
                        rounded-full
                        transition-all
                        ${
                          storageFull
                            ? "bg-[#f28b82]"
                            : storagePercentage >= 90
                              ? "bg-[#f28b82]"
                              : storagePercentage >= 70
                                ? "bg-[#fdd663]"
                                : "bg-[#81c995]"
                        }
                      `}
                      style={{
                        width: `${storagePercentage}%`,
                      }}
                    />
                  </div>

                  <div className="mt-1 text-right text-[9px] text-[#9aa0a6]">
                    {storagePercentage.toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================
            RIGHT
        ==================================================== */}

        <div className="no-drag flex h-full items-center">
          {/* UPDATE */}

          {updateState !== "idle" && (
            <button
              type="button"
              onClick={
                updateState === "downloaded"
                  ? handleInstallUpdate
                  : updateState === "available"
                    ? handleDownloadUpdate
                    : handleCheckForUpdate
              }
              disabled={updateState === "checking" || updateState === "downloading"}
              title={updateTitle}
              className="
                flex
                h-full
                w-12
                items-center
                justify-center
                text-[#9aa0a6]
                transition-colors
                hover:bg-[#303134]
                hover:text-[#e8eaed]
                disabled:cursor-default
              "
            >
              {updateState === "checking" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : updateState === "available" ? (
                <Download size={14} className="text-[#8ab4f8]" />
              ) : updateState === "downloading" ? (
                <RefreshCw size={14} className="animate-spin text-[#8ab4f8]" />
              ) : updateState === "downloaded" ? (
                <CheckCircle2 size={14} className="text-[#81c995]" />
              ) : (
                <AlertTriangle size={14} className="text-[#f28b82]" />
              )}
            </button>
          )}

          {/* MINIMIZE */}

          <button
            type="button"
            onClick={() => window.theoDesktop?.window.minimize()}
            className="
              flex
              h-full
              w-12
              items-center
              justify-center
              text-[#9aa0a6]
              transition-colors
              hover:bg-[#303134]
              hover:text-[#e8eaed]
            "
            title="Minimizar"
          >
            <Minus size={16} />
          </button>

          {/* MAXIMIZE */}

          <button
            type="button"
            onClick={() => window.theoDesktop?.window.maximize()}
            className="
              flex
              h-full
              w-12
              items-center
              justify-center
              text-[#9aa0a6]
              transition-colors
              hover:bg-[#303134]
              hover:text-[#e8eaed]
            "
            title="Maximizar"
          >
            <Square size={13} />
          </button>

          {/* CLOSE */}

          <button
            type="button"
            onClick={() => window.theoDesktop?.window.close()}
            className="
              flex
              h-full
              w-12
              items-center
              justify-center
              text-[#9aa0a6]
              transition-colors
              hover:bg-[#c5221f]
              hover:text-white
            "
            title="Fechar Theo"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* ======================================================
          FLOATING TIMER
      ====================================================== */}

      {timerActive && floatingTimerOpen && (
        <FloatingStudyTimer
          timer={studyTimer}
          seconds={displayedSeconds}
          onPause={handlePause}
          onResume={handleResume}
          onReset={handleReset}
          onClose={closeFloatingTimer}
          onOpenRegister={openStudyRegister}
        />
      )}
    </>
  );
}

// ============================================================
// FLOATING TIMER
// ============================================================

function FloatingStudyTimer({
  timer,
  seconds,
  onPause,
  onResume,
  onReset,
  onClose,
  onOpenRegister,
}: {
  timer: StudyTimerState;
  seconds: number;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onClose: () => void;
  onOpenRegister: () => void;
}) {
  const label = getTimerLabel(timer);

  const secondaryLabel = getTimerSecondaryLabel(timer);

  const running = timer.running;

  return (
    <div
      className="
        no-drag
        fixed
        left-1/2
        top-14
        z-[999]
        w-[340px]
        -translate-x-1/2
      "
    >
      <div
        className={`
          overflow-hidden
          rounded-2xl
          border
          bg-[#292a2d]
          shadow-[0_12px_40px_rgba(0,0,0,0.45)]
          ${running ? "border-[#81c995]/25" : "border-[#fdd663]/25"}
        `}
      >
        {/* HEADER */}

        <div
          className="
            flex
            items-center
            justify-between
            border-b
            border-[#3c4043]
            px-4
            py-3
          "
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`
                flex
                h-7
                w-7
                items-center
                justify-center
                rounded-lg
                ${running ? "bg-[#81c995]/10" : "bg-[#fdd663]/10"}
              `}
            >
              <Timer size={14} className={running ? "text-[#81c995]" : "text-[#fdd663]"} />
            </div>

            <div>
              <div className="text-[9px] font-medium uppercase tracking-wider text-[#9aa0a6]">
                {running ? "Estudando agora" : "Estudo pausado"}
              </div>

              <div className="max-w-[180px] truncate text-[11px] text-[#e8eaed]">{label}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              flex
              h-7
              w-7
              items-center
              justify-center
              rounded-full
              text-[#9aa0a6]
              transition-colors
              hover:bg-[#3c4043]
              hover:text-[#e8eaed]
            "
            title="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        {/* TIMER */}

        <div className="px-5 pb-5 pt-5">
          <button type="button" onClick={onOpenRegister} className="block w-full text-center">
            <div className="font-mono text-[42px] font-medium tracking-[-0.04em] text-[#e8eaed]">
              {formatStudyTimer(seconds)}
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#9aa0a6]">
              <BookOpen size={12} />

              <span className="truncate">{label}</span>

              {secondaryLabel && secondaryLabel !== label && (
                <>
                  <span>•</span>

                  <span>{secondaryLabel}</span>
                </>
              )}
            </div>
          </button>

          {/* ACTIONS */}

          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={running ? onPause : onResume}
              className="
                flex
                h-10
                min-w-[110px]
                items-center
                justify-center
                gap-2
                rounded-full
                border
                border-[#3c4043]
                bg-[#303134]
                px-5
                text-xs
                font-medium
                text-[#e8eaed]
                transition-colors
                hover:bg-[#3c4043]
              "
            >
              {running ? (
                <>
                  <Pause size={14} fill="currentColor" />
                  Pausar
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  Continuar
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onReset}
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                border
                border-[#3c4043]
                bg-[#303134]
                text-[#9aa0a6]
                transition-colors
                hover:bg-[#3c4043]
                hover:text-[#f28b82]
              "
              title="Encerrar estudo"
            >
              <RotateCcw size={14} />
            </button>

            <button
              type="button"
              onClick={onOpenRegister}
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                border
                border-[#3c4043]
                bg-[#303134]
                text-[#9aa0a6]
                transition-colors
                hover:bg-[#3c4043]
                hover:text-[#e8eaed]
              "
              title="Abrir registro"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STATUS ROW
// ============================================================

function StatusRow({
  label,
  ok,
  icon,
  text,
}: {
  label: string;
  ok: boolean;
  icon: ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#9aa0a6]">{label}</span>

      <span
        className={`
          flex
          items-center
          gap-1
          font-medium
          ${ok ? "text-[#81c995]" : "text-[#f28b82]"}
        `}
      >
        {icon}

        {text}
      </span>
    </div>
  );
}
