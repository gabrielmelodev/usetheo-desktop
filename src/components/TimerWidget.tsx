import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, Pause, Play, Timer as TimerIcon, Volume2, VolumeX, X } from "lucide-react";

import { Button, ErrorBanner, Input, Label, Panel, Textarea } from "./ui";

import {
  cancelTimer,
  extractErrorMessage,
  finishTimer,
  getCurrentTimer,
  listExamSubjects,
  listExamTopics,
  listExams,
  pauseTimer,
  resumeTimer,
  startTimer,
} from "../lib/api";

import type { ActiveTimer, Exam, ExamSubject, ExamTopic } from "../lib/types";

// =====================================================
// ESTILOS / ANIMAÇÕES
// =====================================================

const timerStyles = `
  @keyframes timerButtonEnter {
    0% {
      opacity: 0;
      transform: translateY(12px) scale(.96);
    }

    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes timerWidgetEnter {
    0% {
      opacity: 0;
      transform: translateY(18px) scale(.94);
    }

    60% {
      opacity: 1;
    }

    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes timerRunningGlow {
    0%,
    100% {
      opacity: .16;
      transform: scale(.92);
    }

    50% {
      opacity: .46;
      transform: scale(1.08);
    }
  }

  @keyframes timerLockGlow {
    0%,
    100% {
      opacity: .18;
      transform: scale(.94);
    }

    50% {
      opacity: .38;
      transform: scale(1.04);
    }
  }

  @keyframes timerPulse {
    0%,
    100% {
      opacity: .55;
      transform: scale(.85);
    }

    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }

  @keyframes timerNumber {
    0% {
      opacity: .45;
      transform: translateY(2px) scale(.985);
    }

    60% {
      opacity: .88;
      transform: translateY(0) scale(1.01);
    }

    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes timerNumberGlow {
    0% {
      text-shadow: 0 0 0 rgba(167, 201, 87, 0);
    }

    45% {
      text-shadow:
        0 0 22px rgba(167, 201, 87, .12),
        0 0 50px rgba(167, 201, 87, .05);
    }

    100% {
      text-shadow: 0 0 0 rgba(167, 201, 87, 0);
    }
  }

  @keyframes timerSecondPulse {
    0% {
      transform: scale(.985);
      opacity: .72;
    }

    45% {
      transform: scale(1.012);
      opacity: 1;
    }

    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes timerModalBackdrop {
    0% {
      opacity: 0;
    }

    100% {
      opacity: 1;
    }
  }

  @keyframes timerModalEnter {
    0% {
      opacity: 0;
      transform: translateY(14px) scale(.965);
    }

    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes timerLockEnter {
    0% {
      opacity: 0;
      transform: scale(1.02);
    }

    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes timerAudioPulse {
    0%,
    100% {
      opacity: .4;
      transform: scale(.9);
    }

    50% {
      opacity: .9;
      transform: scale(1.08);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .theo-timer-motion,
    .theo-timer-motion *,
    .theo-timer-modal,
    .theo-timer-modal *,
    .theo-timer-lock,
    .theo-timer-lock * {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// =====================================================
// FORMATAR TEMPO
// =====================================================

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// =====================================================
// MODO POMODORO
// =====================================================

type TimerMode = "cronometro" | "pomodoro";
type PomodoroPhase = "study" | "break";

type PomodoroConfig = {
  studyMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
};

const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  studyMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

// =====================================================
// ÁUDIO DO TIMER
// =====================================================

type TimerAudioEngine = {
  context: AudioContext;
  master: GainNode;
  noiseGain: GainNode;
  frequencyGain: GainNode;
  noiseSource: AudioBufferSourceNode;
  oscillators: OscillatorNode[];
  started: boolean;
};

function createBrownNoiseBuffer(context: AudioContext, durationSeconds = 3): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));

  const buffer = context.createBuffer(1, length, sampleRate);

  const data = buffer.getChannelData(0);

  let lastOut = 0;

  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;

    lastOut = (lastOut + 0.02 * white) / 1.02;

    data[i] = lastOut * 3.5;
  }

  return buffer;
}

function stopTimerAudio(engineRef: React.MutableRefObject<TimerAudioEngine | null>) {
  const engine = engineRef.current;

  if (!engine) {
    return;
  }

  try {
    engine.master.gain.cancelScheduledValues(engine.context.currentTime);

    engine.master.gain.setTargetAtTime(0, engine.context.currentTime, 0.08);

    window.setTimeout(() => {
      try {
        engine.noiseSource.stop();
      } catch {
        // Fonte já parada.
      }

      for (const oscillator of engine.oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Oscilador já parado.
        }
      }

      void engine.context.close();
    }, 180);
  } catch {
    // O contexto já pode ter sido encerrado.
  }

  engineRef.current = null;
}

async function startTimerAudio(engineRef: React.MutableRefObject<TimerAudioEngine | null>) {
  if (engineRef.current) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();

    if (context.state === "suspended") {
      await context.resume();
    }

    const master = context.createGain();
    const noiseGain = context.createGain();
    const frequencyGain = context.createGain();

    master.gain.value = 0.0001;

    // Ruído marrom extremamente suave.
    noiseGain.gain.value = 0.045;

    // Frequências harmônicas quase imperceptíveis.
    frequencyGain.gain.value = 0.012;

    const noiseSource = context.createBufferSource();

    noiseSource.buffer = createBrownNoiseBuffer(context, 4);

    noiseSource.loop = true;

    const frequencies = [130.81, 196.0, 261.63, 329.63];

    const oscillators = frequencies.map((frequency) => {
      const oscillator = context.createOscillator();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const individualGain = context.createGain();

      individualGain.gain.value = 0.22;

      oscillator.connect(individualGain);
      individualGain.connect(frequencyGain);

      return oscillator;
    });

    noiseSource.connect(noiseGain);
    noiseGain.connect(master);

    frequencyGain.connect(master);
    master.connect(context.destination);

    noiseSource.start();

    for (const oscillator of oscillators) {
      oscillator.start();
    }

    const now = context.currentTime;

    master.gain.cancelScheduledValues(now);

    master.gain.setValueAtTime(0.0001, now);

    master.gain.exponentialRampToValueAtTime(0.055, now + 0.9);

    engineRef.current = {
      context,
      master,
      noiseGain,
      frequencyGain,
      noiseSource,
      oscillators,
      started: true,
    };
  } catch (error) {
    console.warn("[Theo] Não foi possível iniciar o áudio:", error);
  }
}

async function playStartSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();

    if (context.state === "suspended") {
      await context.resume();
    }

    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    const now = context.currentTime;

    const frequencies = [261.63, 329.63, 392.0];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();

      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const startAt = now + index * 0.055;

      gain.gain.setValueAtTime(0.0001, startAt);

      gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.04);

      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.5);

      oscillator.connect(gain);
      gain.connect(master);

      oscillator.start(startAt);
      oscillator.stop(startAt + 0.52);
    });

    master.gain.setValueAtTime(0.0001, now);

    master.gain.exponentialRampToValueAtTime(0.5, now + 0.035);

    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

    window.setTimeout(() => {
      void context.close();
    }, 800);
  } catch {
    // O navegador pode bloquear áudio.
  }
}

async function playPauseSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();

    if (context.state === "suspended") {
      await context.resume();
    }

    const master = context.createGain();

    master.connect(context.destination);

    const now = context.currentTime;

    master.gain.setValueAtTime(0.0001, now);

    master.gain.exponentialRampToValueAtTime(0.35, now + 0.025);

    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    const oscillator = context.createOscillator();

    const gain = context.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(392, now);

    oscillator.frequency.exponentialRampToValueAtTime(196, now + 0.28);

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.025);

    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    oscillator.connect(gain);
    gain.connect(master);

    oscillator.start(now);
    oscillator.stop(now + 0.4);

    window.setTimeout(() => {
      void context.close();
    }, 650);
  } catch {
    // O navegador pode bloquear áudio.
  }
}

// =====================================================
// TIMER WIDGET
// =====================================================

export default function TimerWidget() {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);

  const [displaySeconds, setDisplaySeconds] = useState(0);

  const [starting, setStarting] = useState(false);

  const [finishing, setFinishing] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const [minimized, setMinimized] = useState(false);

  const [subjectName, setSubjectName] = useState("");

  const [audioEnabled, setAudioEnabled] = useState(true);

  // Configuração do Pomodoro — definida pelo usuário ao iniciar.
  const [pomodoroConfig, setPomodoroConfig] = useState<PomodoroConfig>(DEFAULT_POMODORO_CONFIG);

  const [timerMode, setTimerMode] = useState<TimerMode>("cronometro");

  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("study");

  const [pomodoroRemaining, setPomodoroRemaining] = useState(
    DEFAULT_POMODORO_CONFIG.studyMinutes * 60,
  );

  const [pomodoroCount, setPomodoroCount] = useState(0);

  const pomodoroTransitionRef = useRef(false);

  const tickRef = useRef<number | null>(null);

  const hadTimerRef = useRef(false);

  const audioRef = useRef<TimerAudioEngine | null>(null);

  // ===================================================
  // BUSCAR MATÉRIA DO TIMER
  // ===================================================

  async function loadTimerSubject(current: ActiveTimer) {
    try {
      if (!current.exam_id) {
        setSubjectName("");
        return;
      }

      const subjects = await listExamSubjects(current.exam_id);

      // Quando houver tópico, mantém o comportamento original:
      // descobre a matéria a partir do tópico.
      if (current.topic_id) {
        const topics = await listExamTopics(current.exam_id);
        const currentTopic = topics.find((topic) => topic.id === current.topic_id);

        if (currentTopic) {
          const currentSubject = subjects.find((subject) => subject.id === currentTopic.subject_id);

          setSubjectName(currentSubject?.name?.trim() || "");
          return;
        }
      }

      if (!current.topic_id) {
        const storedSubject = window.localStorage.getItem(`theo-timer-subject:${current.id}`);
        setSubjectName(storedSubject?.trim() || "");
      } else {
        setSubjectName("");
      }
    } catch (error) {
      console.error("[Theo] Erro ao carregar matéria do cronômetro:", error);

      setSubjectName("");
    }
  }

  // ===================================================
  // BUSCAR TIMER ATUAL
  // ===================================================

  async function refresh() {
    try {
      const current = await getCurrentTimer();

      setTimer(current);

      if (current) {
        if (!hadTimerRef.current) {
          setMinimized(false);
        }

        hadTimerRef.current = true;

        void loadTimerSubject(current);
      } else {
        hadTimerRef.current = false;
        setSubjectName("");
        setDisplaySeconds(0);

        if (audioRef.current) {
          stopTimerAudio(audioRef);
        }
      }
    } catch {
      // Mantém a interface atual.
    }
  }

  // ===================================================
  // CARREGAMENTO INICIAL
  // ===================================================

  useEffect(() => {
    void refresh();

    const poll = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      window.clearInterval(poll);
    };
  }, []);

  // ===================================================
  // RELÓGIO LOCAL PRECISO
  // ===================================================

  useEffect(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);

      tickRef.current = null;
    }

    if (!timer) {
      setDisplaySeconds(0);
      return undefined;
    }

    const updateDisplay = () => {
      const baseSeconds = Math.max(0, Number(timer.elapsed_seconds) || 0);

      if (!timer.running_since) {
        setDisplaySeconds(baseSeconds);

        return;
      }

      const runningSinceMs = new Date(timer.running_since).getTime();

      if (!Number.isFinite(runningSinceMs)) {
        setDisplaySeconds(baseSeconds);

        return;
      }

      const runningSeconds = Math.max(0, Math.floor((Date.now() - runningSinceMs) / 1000));

      setDisplaySeconds(baseSeconds + runningSeconds);
    };

    updateDisplay();

    tickRef.current = window.setInterval(updateDisplay, 250);

    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);

        tickRef.current = null;
      }
    };
  }, [timer?.id, timer?.elapsed_seconds, timer?.running_since]);

  // ===================================================
  // CONTAGEM DO POMODORO
  // ===================================================

  useEffect(() => {
    if (!timer || timerMode !== "pomodoro") {
      return undefined;
    }

    if (!timer.running_since && pomodoroPhase === "study") {
      return undefined;
    }

    if (pomodoroTransitionRef.current) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setPomodoroRemaining((current) => {
        if (current > 1) {
          return current - 1;
        }

        if (pomodoroTransitionRef.current) {
          return 0;
        }

        pomodoroTransitionRef.current = true;

        void (async () => {
          try {
            if (pomodoroPhase === "study") {
              const updated = await pauseTimer();
              setTimer(updated);

              const completedPomodoros = pomodoroCount + 1;
              const isLongBreak = completedPomodoros % pomodoroConfig.cyclesBeforeLongBreak === 0;

              setPomodoroCount(completedPomodoros);
              setPomodoroPhase("break");
              setPomodoroRemaining(
                (isLongBreak ? pomodoroConfig.longBreakMinutes : pomodoroConfig.shortBreakMinutes) *
                  60,
              );

              if (audioEnabled) {
                await playPauseSound();
              }
            } else {
              const updated = await resumeTimer();
              setTimer(updated);
              setPomodoroPhase("study");
              setPomodoroRemaining(pomodoroConfig.studyMinutes * 60);

              if (audioEnabled) {
                await playStartSound();
              }
            }
          } catch (error) {
            console.error("[Theo] Erro na transição do Pomodoro:", error);
            setPomodoroRemaining(1);
          } finally {
            pomodoroTransitionRef.current = false;
          }
        })();

        return 0;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    timer?.id,
    timer?.running_since,
    timerMode,
    pomodoroPhase,
    pomodoroCount,
    pomodoroConfig,
    audioEnabled,
  ]);

  // ===================================================
  // ÁUDIO ENQUANTO ESTUDA
  // ===================================================

  useEffect(() => {
    const shouldPlay = Boolean(timer && timer.running_since && audioEnabled);

    if (!shouldPlay) {
      if (audioRef.current) {
        stopTimerAudio(audioRef);
      }

      return undefined;
    }

    void startTimerAudio(audioRef);

    return undefined;
  }, [timer?.id, timer?.running_since, audioEnabled]);

  // ===================================================
  // LIMPEZA DO ÁUDIO
  // ===================================================

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
      }

      if (audioRef.current) {
        stopTimerAudio(audioRef);
      }
    };
  }, []);

  // ===================================================
  // TRAVAR SAÍDA DA ABA
  // ===================================================

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (timer && timer.running_since) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [timer]);

  // ===================================================
  // ESC — SAIR DA TELA DE FOCO
  // ===================================================

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !timer || starting || finishing) {
        return;
      }

      if (minimized) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setMinimized(true);
    }

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [timer, minimized, starting, finishing]);

  // ===================================================
  // TRAVAR SCROLL
  // ===================================================

  useEffect(() => {
    const shouldLockScroll = (Boolean(timer) && !minimized) || starting || finishing;

    if (!shouldLockScroll) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    const previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;

      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [timer, minimized, starting, finishing]);

  // ===================================================
  // PAUSAR
  // ===================================================

  async function onPause() {
    if (actionLoading) {
      return;
    }

    setActionLoading(true);

    try {
      const updated = await pauseTimer();

      if (audioRef.current) {
        stopTimerAudio(audioRef);
      }

      if (audioEnabled) {
        void playPauseSound();
      }

      setTimer(updated);

      setDisplaySeconds(updated.elapsed_seconds);
    } catch (error) {
      console.error("[Theo] Erro ao pausar cronômetro:", error);
    } finally {
      setActionLoading(false);
    }
  }

  // ===================================================
  // RETOMAR
  // ===================================================

  async function onResume() {
    if (actionLoading) {
      return;
    }

    setActionLoading(true);

    try {
      const updated = await resumeTimer();

      setTimer(updated);

      setDisplaySeconds(updated.elapsed_seconds);

      if (audioEnabled) {
        await playStartSound();
        await startTimerAudio(audioRef);
      }
    } catch (error) {
      console.error("[Theo] Erro ao retomar cronômetro:", error);
    } finally {
      setActionLoading(false);
    }
  }

  // ===================================================
  // CANCELAR
  // ===================================================

  async function onCancel() {
    if (actionLoading) {
      return;
    }

    const confirmed = window.confirm("Cancelar o cronômetro sem registrar o estudo?");

    if (!confirmed) {
      return;
    }

    setActionLoading(true);

    try {
      await cancelTimer();

      if (timer) {
        window.localStorage.removeItem(`theo-timer-subject:${timer.id}`);
      }

      if (audioRef.current) {
        stopTimerAudio(audioRef);
      }

      setTimer(null);
      setDisplaySeconds(0);
      setMinimized(false);
      setSubjectName("");
      setTimerMode("cronometro");
      setPomodoroPhase("study");
      setPomodoroConfig(DEFAULT_POMODORO_CONFIG);
      setPomodoroRemaining(DEFAULT_POMODORO_CONFIG.studyMinutes * 60);
      setPomodoroCount(0);
      pomodoroTransitionRef.current = false;
      setFinishing(false);
      setStarting(false);

      hadTimerRef.current = false;
    } catch (error) {
      console.error("[Theo] Erro ao cancelar cronômetro:", error);
    } finally {
      setActionLoading(false);
    }
  }

  // ===================================================
  // ALTERNAR ÁUDIO
  // ===================================================

  async function toggleAudio() {
    const nextEnabled = !audioEnabled;

    setAudioEnabled(nextEnabled);

    if (!nextEnabled) {
      if (audioRef.current) {
        stopTimerAudio(audioRef);
      }

      return;
    }

    if (timer && timer.running_since) {
      await startTimerAudio(audioRef);
    }
  }

  // ===================================================
  // INICIAR TIMER
  // ===================================================

  function handleStarted(
    startedTimer: ActiveTimer,
    startedSubjectName: string,
    startedMode: TimerMode,
    startedPomodoroConfig?: PomodoroConfig,
  ) {
    setStarting(false);

    setTimer(startedTimer);

    setDisplaySeconds(startedTimer.elapsed_seconds);

    setMinimized(false);

    hadTimerRef.current = true;

    setTimerMode(startedMode);
    setPomodoroPhase("study");

    const config = startedPomodoroConfig ?? DEFAULT_POMODORO_CONFIG;

    setPomodoroConfig(config);
    setPomodoroRemaining(config.studyMinutes * 60);
    setPomodoroCount(0);
    pomodoroTransitionRef.current = false;

    // Se iniciou sem tópico, a matéria escolhida no modal continua
    // aparecendo na tela de foco. Se houver tópico, mantém a resolução original.
    if (startedTimer.topic_id) {
      void loadTimerSubject(startedTimer);
    } else {
      setSubjectName(startedSubjectName);

      if (startedSubjectName.trim()) {
        window.localStorage.setItem(
          `theo-timer-subject:${startedTimer.id}`,
          startedSubjectName.trim(),
        );
      }
    }

    if (audioEnabled) {
      void playStartSound().then(() => startTimerAudio(audioRef));
    }
  }

  // ===================================================
  // CONCLUIR TIMER
  // ===================================================

  function handleFinished() {
    const finishedTimerId = timer?.id;

    setFinishing(false);

    if (finishedTimerId) {
      window.localStorage.removeItem(`theo-timer-subject:${finishedTimerId}`);
    }

    if (audioRef.current) {
      stopTimerAudio(audioRef);
    }

    setTimer(null);
    setDisplaySeconds(0);
    setMinimized(false);
    setSubjectName("");
    setTimerMode("cronometro");
    setPomodoroPhase("study");
    setPomodoroConfig(DEFAULT_POMODORO_CONFIG);
    setPomodoroRemaining(DEFAULT_POMODORO_CONFIG.studyMinutes * 60);
    setPomodoroCount(0);
    pomodoroTransitionRef.current = false;

    hadTimerRef.current = false;
  }

  // ===================================================
  // CONTEÚDO BASE
  // ===================================================

  let mainContent: React.ReactNode;

  // ---------------------------------------------------
  // SEM TIMER
  // ---------------------------------------------------

  if (!timer) {
    mainContent = (
      <button
        type="button"
        onClick={() => setStarting(true)}
        className="
          group
          fixed
          bottom-6
          right-6
          z-40
          flex
          items-center
          gap-2.5
          overflow-hidden
          rounded-full
          border
          border-[#A7C957]/20
          bg-[#556B2F]/95
          px-5
          py-3
          text-sm
          font-medium
          text-white
          shadow-[0_10px_35px_rgba(0,0,0,.35)]
          backdrop-blur-xl
          transition-all
          duration-300
          hover:-translate-y-1
          hover:scale-[1.02]
          hover:bg-[#617C34]
          hover:shadow-[0_14px_40px_rgba(85,107,47,.32)]
          active:translate-y-0
          active:scale-[.98]
        "
        style={{
          animation: "timerButtonEnter .35s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <span
          className="
            pointer-events-none
            absolute
            -left-10
            top-1/2
            h-20
            w-20
            -translate-y-1/2
            rounded-full
            bg-[#A7C957]/10
            blur-2xl
            transition-transform
            duration-700
            group-hover:translate-x-4
          "
        />

        <span
          className="
            relative
            flex
            h-5
            w-5
            items-center
            justify-center
          "
        >
          <TimerIcon
            className="
              relative
              h-4
              w-4
              transition-transform
              duration-300
              group-hover:rotate-12
            "
          />
        </span>

        <span className="relative">Iniciar cronômetro</span>
      </button>
    );
  } else {
    const isRunning = Boolean(timer.running_since);

    // -------------------------------------------------
    // TELA DE FOCO
    // -------------------------------------------------

    const activeDisplaySeconds = timerMode === "pomodoro" ? pomodoroRemaining : displaySeconds;

    if (!minimized) {
      mainContent = (
        <TimerLockScreen
          isRunning={isRunning}
          displaySeconds={activeDisplaySeconds}
          totalStudySeconds={displaySeconds}
          subjectName={subjectName}
          timerMode={timerMode}
          pomodoroPhase={pomodoroPhase}
          pomodoroCount={pomodoroCount}
          actionLoading={actionLoading}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
          onPause={onPause}
          onResume={onResume}
          onFinish={() => setFinishing(true)}
          onCancel={onCancel}
        />
      );
    } else {
      // -----------------------------------------------
      // WIDGET COMPACTO
      // -----------------------------------------------

      mainContent = (
        <div
          className="
            theo-timer-motion
            fixed
            bottom-6
            right-6
            z-40
          "
          style={{
            animation: "timerWidgetEnter .42s cubic-bezier(.22,1,.36,1)",
          }}
        >
          {isRunning && (
            <span
              className="
                pointer-events-none
                absolute
                -inset-5
                rounded-[28px]
                bg-[#556B2F]/20
                blur-2xl
              "
              style={{
                animation: "timerRunningGlow 3s ease-in-out infinite",
              }}
            />
          )}

          <div
            className={`
              relative
              flex
              items-center
              gap-3
              overflow-hidden
              rounded-2xl
              border
              bg-ink-soft/95
              px-3
              py-2.5
              shadow-[0_18px_50px_rgba(0,0,0,.42)]
              backdrop-blur-2xl
              transition-all
              duration-300
              ${isRunning ? "border-[#A7C957]/15" : "border-white/[0.08]"}
            `}
          >
            <span
              className="
                pointer-events-none
                absolute
                inset-y-0
                left-0
                w-16
                bg-gradient-to-r
                from-[#A7C957]/[0.06]
                to-transparent
              "
            />

            <button
              type="button"
              onClick={() => setMinimized(false)}
              title="Expandir para a tela de foco"
              aria-label="Expandir para a tela de foco"
              className="
                relative
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                border
                border-white/[0.06]
                bg-white/[0.025]
                transition
                hover:bg-white/[0.06]
              "
            >
              {isRunning && (
                <span
                  className="
                    absolute
                    h-2
                    w-2
                    rounded-full
                    bg-[#A7C957]
                    shadow-[0_0_12px_rgba(167,201,87,.8)]
                  "
                  style={{
                    animation: "timerPulse 1.8s ease-in-out infinite",
                  }}
                />
              )}

              <TimerIcon
                className={`
                  relative
                  h-4
                  w-4
                  transition-all
                  duration-300
                  ${isRunning ? "text-[#A7C957]" : "text-text-muted"}
                `}
              />
            </button>

            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="
                relative
                min-w-[74px]
                text-left
              "
              title="Expandir para a tela de foco"
            >
              <div
                className="
                  text-[8px]
                  font-medium
                  uppercase
                  tracking-[0.16em]
                  text-text-faint
                "
              >
                {timerMode === "pomodoro"
                  ? pomodoroPhase === "study"
                    ? `Pomodoro ${pomodoroCount + 1}`
                    : "Pausa"
                  : isRunning
                    ? "Estudando"
                    : "Pausado"}
              </div>

              <div
                key={activeDisplaySeconds}
                className="
                  mt-0.5
                  font-mono
                  text-xl
                  font-semibold
                  tabular-nums
                  tracking-tight
                  text-text
                "
                style={{
                  animation: "timerNumber .18s ease-out",
                }}
              >
                {formatDuration(activeDisplaySeconds)}
              </div>
            </button>

            <div
              className="
                h-8
                w-px
                bg-white/[0.07]
              "
            />

            <div
              className="
                relative
                flex
                items-center
                gap-1
              "
            >
              {isRunning ? (
                <button
                  type="button"
                  onClick={onPause}
                  disabled={actionLoading}
                  aria-label="Pausar cronômetro"
                  title="Pausar"
                  className="
                    group
                    flex
                    h-9
                    w-9
                    items-center
                    justify-center
                    rounded-xl
                    text-text-muted
                    transition-all
                    duration-200
                    hover:bg-white/[0.06]
                    hover:text-text
                    active:scale-90
                    disabled:pointer-events-none
                    disabled:opacity-40
                  "
                >
                  <Pause
                    className="
                      h-4
                      w-4
                      transition-transform
                      duration-200
                      group-hover:scale-110
                    "
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onResume}
                  disabled={actionLoading}
                  aria-label="Retomar cronômetro"
                  title="Retomar"
                  className="
                    group
                    flex
                    h-9
                    w-9
                    items-center
                    justify-center
                    rounded-xl
                    text-[#A7C957]
                    transition-all
                    duration-200
                    hover:bg-[#A7C957]/[0.08]
                    hover:text-[#C6DE91]
                    active:scale-90
                    disabled:pointer-events-none
                    disabled:opacity-40
                  "
                >
                  <Play
                    className="
                      h-4
                      w-4
                      fill-current
                      transition-transform
                      duration-200
                      group-hover:scale-110
                    "
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setFinishing(true)}
                disabled={actionLoading}
                className="
                  group
                  flex
                  h-9
                  items-center
                  gap-1.5
                  rounded-xl
                  bg-[#556B2F]/90
                  px-3
                  text-[11px]
                  font-semibold
                  text-white
                  shadow-[0_5px_18px_rgba(85,107,47,.18)]
                  transition-all
                  duration-200
                  hover:-translate-y-0.5
                  hover:bg-[#647F38]
                  hover:shadow-[0_8px_22px_rgba(85,107,47,.28)]
                  active:translate-y-0
                  active:scale-95
                  disabled:pointer-events-none
                  disabled:opacity-40
                "
              >
                <CheckCircle2
                  className="
                    h-3.5
                    w-3.5
                    transition-transform
                    duration-200
                    group-hover:scale-110
                  "
                />

                <span>Concluir</span>
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={actionLoading}
                aria-label="Cancelar cronômetro"
                title="Cancelar"
                className="
                  group
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-xl
                  text-zinc-600
                  transition-all
                  duration-200
                  hover:bg-red-500/[0.06]
                  hover:text-red-400
                  active:scale-90
                  disabled:pointer-events-none
                  disabled:opacity-40
                "
              >
                <X
                  className="
                    h-4
                    w-4
                    transition-transform
                    duration-200
                    group-hover:rotate-90
                  "
                />
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // ===================================================
  // RENDER PRINCIPAL
  // ===================================================

  return (
    <>
      <style>{timerStyles}</style>

      {mainContent}

      {starting &&
        createPortal(
          <StartTimerModal onClose={() => setStarting(false)} onStarted={handleStarted} />,
          document.body,
        )}

      {finishing &&
        timer &&
        createPortal(
          <FinishTimerModal onClose={() => setFinishing(false)} onFinished={handleFinished} />,
          document.body,
        )}
    </>
  );
}

// =====================================================
// TELA DE FOCO
// =====================================================

function TimerLockScreen({
  isRunning,
  displaySeconds,
  totalStudySeconds,
  subjectName,
  timerMode,
  pomodoroPhase,
  pomodoroCount,
  actionLoading,
  audioEnabled,
  onToggleAudio,
  onPause,
  onResume,
  onFinish,
  onCancel,
}: {
  isRunning: boolean;
  displaySeconds: number;
  totalStudySeconds: number;
  subjectName: string;
  timerMode: TimerMode;
  pomodoroPhase: PomodoroPhase;
  pomodoroCount: number;
  actionLoading: boolean;
  audioEnabled: boolean;
  onToggleAudio: () => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="
        theo-timer-lock
        fixed
        inset-0
        z-40
        flex
        flex-col
        items-center
        justify-center
        overflow-hidden
        bg-ink-soft/[0.985]
        backdrop-blur-2xl
      "
      style={{
        animation: "timerLockEnter .4s cubic-bezier(.22,1,.36,1)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Cronômetro de estudo em andamento"
    >
      {isRunning && (
        <span
          className="
            pointer-events-none
            absolute
            inset-0
            flex
            items-center
            justify-center
          "
          aria-hidden="true"
        >
          <span
            className="
              h-[420px]
              w-[420px]
              rounded-full
              bg-[#556B2F]/25
              blur-[100px]
            "
            style={{
              animation: "timerLockGlow 4s ease-in-out infinite",
            }}
          />
        </span>
      )}

      <div
        className="
          pointer-events-none
          absolute
          inset-x-0
          top-0
          h-40
          bg-gradient-to-b
          from-[#556B2F]/[0.06]
          to-transparent
        "
      />

      <div
        className="
          relative
          flex
          flex-col
          items-center
          px-6
          text-center
        "
      >
        <div
          className={`
            mb-4
            flex
            items-center
            gap-2
            rounded-full
            border
            px-3.5
            py-1.5
            text-[11px]
            font-semibold
            uppercase
            tracking-[0.16em]
            ${
              isRunning
                ? "border-[#A7C957]/25 bg-[#A7C957]/10 text-[#A7C957]"
                : "border-white/10 bg-white/[0.04] text-text-muted"
            }
          `}
        >
          <span
            className={`
              h-1.5
              w-1.5
              rounded-full
              ${isRunning ? "bg-[#A7C957]" : "bg-text-faint"}
            `}
            style={
              isRunning
                ? {
                    animation: "timerPulse 1.8s ease-in-out infinite",
                  }
                : undefined
            }
          />

          {timerMode === "pomodoro"
            ? pomodoroPhase === "study"
              ? `Pomodoro ${pomodoroCount + 1} · ${isRunning ? "Estudo" : "Estudo pausado"}`
              : "Pausa"
            : isRunning
              ? "Sessão em andamento"
              : "Sessão pausada"}
        </div>

        {subjectName && (
          <div
            className="
              mb-6
              max-w-xl
              text-center
            "
          >
            <div
              className="
                mb-1
                text-[9px]
                font-medium
                uppercase
                tracking-[0.18em]
                text-text-faint
              "
            >
              Matéria
            </div>

            <div
              className="
                text-lg
                font-medium
                text-text
                sm:text-xl
              "
            >
              {subjectName}
            </div>
          </div>
        )}

        {timerMode === "pomodoro" && (
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-text-faint">
            {pomodoroPhase === "study"
              ? `Ciclos concluídos: ${pomodoroCount}`
              : "Descanse um pouco antes do próximo ciclo"}
          </div>
        )}

        <div
          key={displaySeconds}
          className="
            font-mono
            text-7xl
            font-semibold
            tabular-nums
            tracking-tight
            text-text
            sm:text-8xl
          "
          style={{
            animation: "timerNumber .18s ease-out, timerNumberGlow .7s ease-out",
          }}
          aria-live="off"
        >
          {formatDuration(displaySeconds)}
        </div>

        {timerMode === "pomodoro" && (
          <div className="mt-2 text-[10px] text-text-faint">
            Estudo acumulado: {formatDuration(totalStudySeconds)}
          </div>
        )}

        <div
          className="
            mt-10
            flex
            items-center
            gap-3
          "
        >
          {timerMode === "pomodoro" && pomodoroPhase === "break" ? (
            <div
              className="
                flex
                h-14
                items-center
                rounded-2xl
                border
                border-[#A7C957]/15
                bg-[#A7C957]/[0.05]
                px-5
                text-xs
                font-medium
                text-[#A7C957]
              "
            >
              Pausa em andamento
            </div>
          ) : isRunning ? (
            <button
              type="button"
              onClick={onPause}
              disabled={actionLoading}
              className="
                flex
                h-14
                w-14
                items-center
                justify-center
                rounded-2xl
                border
                border-white/10
                bg-white/[0.04]
                text-text
                transition-all
                duration-200
                hover:bg-white/[0.08]
                active:scale-95
                disabled:pointer-events-none
                disabled:opacity-40
              "
              aria-label="Pausar cronômetro"
              title="Pausar"
            >
              <Pause className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onResume}
              disabled={actionLoading}
              className="
                flex
                h-14
                w-14
                items-center
                justify-center
                rounded-2xl
                border
                border-[#A7C957]/25
                bg-[#A7C957]/10
                text-[#A7C957]
                transition-all
                duration-200
                hover:bg-[#A7C957]/20
                active:scale-95
                disabled:pointer-events-none
                disabled:opacity-40
              "
              aria-label="Retomar cronômetro"
              title="Retomar"
            >
              <Play
                className="
                  h-5
                  w-5
                  fill-current
                "
              />
            </button>
          )}

          <button
            type="button"
            onClick={onFinish}
            disabled={actionLoading}
            className="
              flex
              h-14
              items-center
              gap-2.5
              rounded-2xl
              bg-[#556B2F]
              px-7
              text-sm
              font-semibold
              text-white
              shadow-[0_10px_30px_rgba(85,107,47,.3)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#647F38]
              hover:shadow-[0_14px_36px_rgba(85,107,47,.4)]
              active:translate-y-0
              active:scale-[.98]
              disabled:pointer-events-none
              disabled:opacity-40
            "
          >
            <CheckCircle2 className="h-4.5 w-4.5" />
            Concluir estudo
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={actionLoading}
            className="
              flex
              h-14
              w-14
              items-center
              justify-center
              rounded-2xl
              text-zinc-600
              transition-all
              duration-200
              hover:bg-red-500/[0.06]
              hover:text-red-400
              active:scale-95
              disabled:pointer-events-none
              disabled:opacity-40
            "
            aria-label="Cancelar cronômetro"
            title="Cancelar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="
            mt-6
            flex
            items-center
            gap-2
          "
        >
          <button
            type="button"
            onClick={() => void onToggleAudio()}
            className={`
              group
              flex
              items-center
              gap-2
              rounded-xl
              border
              px-3
              py-2
              text-[11px]
              transition-all
              duration-200
              ${
                audioEnabled
                  ? "border-[#A7C957]/15 bg-[#A7C957]/[0.05] text-[#A7C957]"
                  : "border-white/[0.06] bg-white/[0.025] text-text-faint"
              }
            `}
            aria-label={audioEnabled ? "Desligar som ambiente" : "Ligar som ambiente"}
            title={audioEnabled ? "Desligar som ambiente" : "Ligar som ambiente"}
          >
            {audioEnabled ? (
              <>
                <span
                  className="
                    relative
                    flex
                    h-4
                    w-4
                    items-center
                    justify-center
                  "
                >
                  <span
                    className="
                      absolute
                      inset-0
                      rounded-full
                      bg-[#A7C957]/10
                    "
                    style={{
                      animation: "timerAudioPulse 2.2s ease-in-out infinite",
                    }}
                  />

                  <Volume2 className="relative h-3.5 w-3.5" />
                </span>

                <span>Som ambiente</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5" />

                <span>Som desligado</span>
              </>
            )}
          </button>
        </div>

        <div
          className="
            mt-7
            flex
            items-center
            gap-2
            text-xs
            text-text-faint
          "
        >
          <kbd
            className="
              rounded-md
              border
              border-white/10
              bg-white/[0.04]
              px-2
              py-1
              font-mono
              text-[10px]
              text-text-muted
            "
          >
            Esc
          </kbd>

          <span>sair da tela de foco</span>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MODAL — INICIAR TIMER
// =====================================================

function StartTimerModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (
    t: ActiveTimer,
    subjectName: string,
    mode: TimerMode,
    pomodoroConfig?: PomodoroConfig,
  ) => void;
}) {
  const [exams, setExams] = useState<Exam[]>([]);

  const [subjects, setSubjects] = useState<ExamSubject[]>([]);

  const [topics, setTopics] = useState<ExamTopic[]>([]);

  const [examId, setExamId] = useState("");

  const [subjectId, setSubjectId] = useState("");

  const [topicId, setTopicId] = useState("");

  const [category, setCategory] = useState("teoria");

  const [mode, setMode] = useState<TimerMode>("cronometro");

  const [studyMinutes, setStudyMinutes] = useState(25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);
  const [cyclesBeforeLongBreak, setCyclesBeforeLongBreak] = useState(4);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listExams()
      .then(setExams)
      .catch((e) => {
        setError(extractErrorMessage(e));
      });
  }, []);

  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      setTopics([]);
      setSubjectId("");
      setTopicId("");

      return;
    }

    setSubjectId("");
    setTopicId("");

    listExamSubjects(examId)
      .then(setSubjects)
      .catch(() => {
        setSubjects([]);
      });

    listExamTopics(examId)
      .then(setTopics)
      .catch(() => {
        setTopics([]);
      });
  }, [examId]);

  const topicsForSubject = topics.filter((topic) => topic.subject_id === subjectId);

  async function submit() {
    if (!examId || !subjectId) {
      setError("Selecione o edital e a matéria.");

      return;
    }

    if (loading) {
      return;
    }

    if (
      mode === "pomodoro" &&
      (studyMinutes < 1 ||
        shortBreakMinutes < 1 ||
        longBreakMinutes < 1 ||
        cyclesBeforeLongBreak < 1)
    ) {
      setError("Os tempos do Pomodoro devem ser maiores que zero.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const timer = await startTimer({
        exam_id: examId,
        topic_id: topicId || undefined,
        category,
      } as Parameters<typeof startTimer>[0]);

      const selectedSubject = subjects.find((subject) => subject.id === subjectId);

      onStarted(
        timer,
        selectedSubject?.name?.trim() || "",
        mode,
        mode === "pomodoro"
          ? {
              studyMinutes,
              shortBreakMinutes,
              longBreakMinutes,
              cyclesBeforeLongBreak,
            }
          : undefined,
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="
        theo-timer-modal
        fixed
        inset-0
        z-[9999]
        flex
        items-center
        justify-center
        overflow-y-auto
        bg-black/70
        p-4
        backdrop-blur-md
      "
      style={{
        animation: "timerModalBackdrop .22s ease-out",
      }}
      role="presentation"
    >
      <div
        className="
          theo-timer-modal
          w-full
          max-w-md
          max-h-[calc(100vh-2rem)]
          overflow-y-auto
        "
        style={{
          animation: "timerModalEnter .32s cubic-bezier(.22,1,.36,1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-timer-title"
      >
        <Panel
          className="
            border-white/[0.08]
            shadow-[0_25px_80px_rgba(0,0,0,.55)]
          "
        >
          <div
            className="
              mb-5
              flex
              items-center
              justify-between
            "
          >
            <div>
              <div
                className="
                  mb-1
                  text-[8px]
                  font-semibold
                  uppercase
                  tracking-[0.18em]
                  text-[#A7C957]
                "
              >
                Sessão de estudo
              </div>

              <h3
                id="start-timer-title"
                className="
                  font-display
                  text-lg
                  text-text
                "
              >
                Iniciar cronômetro
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-lg
                text-text-muted
                transition-all
                duration-200
                hover:bg-white/[0.05]
                hover:text-text
                active:scale-90
              "
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-3">
              <ErrorBanner message={error} />
            </div>
          )}

          <div className="space-y-3.5">
            <div>
              <Label>Edital</Label>

              <select
                value={examId}
                onChange={(event) => setExamId(event.target.value)}
                className="
                  w-full
                  rounded-lg
                  border
                  border-white/10
                  bg-ink-softer
                  px-3
                  py-2.5
                  text-sm
                  text-text
                  outline-none
                  transition-all
                  focus:border-[#A7C957]/30
                  focus:ring-2
                  focus:ring-[#A7C957]/10
                "
              >
                <option value="">Selecione</option>

                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Matéria</Label>

              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={!examId}
                className="
                  w-full
                  rounded-lg
                  border
                  border-white/10
                  bg-ink-softer
                  px-3
                  py-2.5
                  text-sm
                  text-text
                  outline-none
                  transition-all
                  focus:border-[#A7C957]/30
                  focus:ring-2
                  focus:ring-[#A7C957]/10
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <option value="">Selecione</option>

                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>
                Tópico <span className="text-text-faint">(opcional)</span>
              </Label>

              <select
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                disabled={!subjectId}
                className="
                  w-full
                  rounded-lg
                  border
                  border-white/10
                  bg-ink-softer
                  px-3
                  py-2.5
                  text-sm
                  text-text
                  outline-none
                  transition-all
                  focus:border-[#A7C957]/30
                  focus:ring-2
                  focus:ring-[#A7C957]/10
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <option value="">Sem tópico — estudar a matéria</option>

                {topicsForSubject.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.number} {topic.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Modo de estudo</Label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("cronometro")}
                  className={`
                    rounded-xl border px-3 py-2.5 text-sm font-medium transition-all
                    ${
                      mode === "cronometro"
                        ? "border-[#A7C957]/30 bg-[#A7C957]/10 text-[#A7C957]"
                        : "border-white/10 bg-ink-softer text-text-muted hover:bg-white/[0.04]"
                    }
                  `}
                >
                  Cronômetro
                </button>

                <button
                  type="button"
                  onClick={() => setMode("pomodoro")}
                  className={`
                    rounded-xl border px-3 py-2.5 text-sm font-medium transition-all
                    ${
                      mode === "pomodoro"
                        ? "border-[#A7C957]/30 bg-[#A7C957]/10 text-[#A7C957]"
                        : "border-white/10 bg-ink-softer text-text-muted hover:bg-white/[0.04]"
                    }
                  `}
                >
                  Pomodoro
                </button>
              </div>
            </div>

            {mode === "pomodoro" && (
              <div className="rounded-2xl border border-[#A7C957]/10 bg-[#A7C957]/[0.025] p-3.5">
                <div className="mb-3">
                  <div className="text-xs font-semibold text-text">Configurar Pomodoro</div>
                  <div className="mt-0.5 text-[10px] text-text-faint">
                    Defina os tempos como preferir.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Estudo (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={240}
                      value={studyMinutes}
                      onChange={(event) =>
                        setStudyMinutes(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </div>

                  <div>
                    <Label>Pausa curta (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={shortBreakMinutes}
                      onChange={(event) =>
                        setShortBreakMinutes(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </div>

                  <div>
                    <Label>Pausa longa (min)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={180}
                      value={longBreakMinutes}
                      onChange={(event) =>
                        setLongBreakMinutes(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </div>

                  <div>
                    <Label>Ciclos p/ pausa longa</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={cyclesBeforeLongBreak}
                      onChange={(event) =>
                        setCyclesBeforeLongBreak(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-[10px] leading-relaxed text-text-faint">
                  Exemplo: <span className="text-text-muted">{studyMinutes} min</span> de estudo →{" "}
                  <span className="text-text-muted">{shortBreakMinutes} min</span> de pausa → após{" "}
                  <span className="text-text-muted">{cyclesBeforeLongBreak}</span> ciclos, pausa de{" "}
                  <span className="text-text-muted">{longBreakMinutes} min</span>.
                </div>
              </div>
            )}

            <div>
              <Label>Categoria</Label>

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="
                  w-full
                  rounded-lg
                  border
                  border-white/10
                  bg-ink-softer
                  px-3
                  py-2.5
                  text-sm
                  text-text
                  outline-none
                  transition-all
                  focus:border-[#A7C957]/30
                  focus:ring-2
                  focus:ring-[#A7C957]/10
                "
              >
                <option value="teoria">Teoria</option>

                <option value="revisao">Revisão</option>

                <option value="questoes">Questões</option>

                <option value="videoaula">Videoaula</option>

                <option value="leitura">Leitura</option>
              </select>
            </div>

            <Button
              className="
                w-full
                transition-all
                duration-300
                hover:-translate-y-0.5
              "
              disabled={loading}
              onClick={submit}
            >
              {loading ? (
                <span
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                  "
                >
                  <RefreshSpinner />
                  Iniciando...
                </span>
              ) : (
                <span
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                  "
                >
                  <Play className="h-4 w-4" />
                  Iniciar estudo
                </span>
              )}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// =====================================================
// MODAL — CONCLUIR TIMER
// =====================================================

function FinishTimerModal({
  onClose,
  onFinished,
}: {
  onClose: () => void;
  onFinished: () => void;
}) {
  const [pages, setPages] = useState<number | "">("");

  const [videoMinutes, setVideoMinutes] = useState<number | "">("");

  const [questionsTotal, setQuestionsTotal] = useState<number | "">("");

  const [questionsCorrect, setQuestionsCorrect] = useState<number | "">("");

  const [notes, setNotes] = useState("");

  const [scheduleReviews, setScheduleReviews] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (questionsCorrect !== "" && questionsTotal !== "" && questionsCorrect > questionsTotal) {
      setError("A quantidade de acertos não pode ser maior que o total de questões.");

      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await finishTimer({
        pages: pages === "" ? undefined : pages,

        video_minutes: videoMinutes === "" ? undefined : videoMinutes,

        questions_total: questionsTotal === "" ? undefined : questionsTotal,

        questions_correct: questionsCorrect === "" ? undefined : questionsCorrect,

        notes: notes.trim() || undefined,

        schedule_reviews: scheduleReviews,
      });

      onFinished();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="
        theo-timer-modal
        fixed
        inset-0
        z-[9999]
        flex
        items-center
        justify-center
        overflow-y-auto
        bg-black/70
        p-4
        backdrop-blur-md
      "
      style={{
        animation: "timerModalBackdrop .22s ease-out",
      }}
      role="presentation"
    >
      <div
        className="
          theo-timer-modal
          w-full
          max-w-md
          max-h-[calc(100vh-2rem)]
          overflow-y-auto
        "
        style={{
          animation: "timerModalEnter .32s cubic-bezier(.22,1,.36,1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-timer-title"
      >
        <Panel
          className="
            border-white/[0.08]
            shadow-[0_25px_80px_rgba(0,0,0,.55)]
          "
        >
          <div
            className="
              mb-5
              flex
              items-center
              justify-between
            "
          >
            <div>
              <div
                className="
                  mb-1
                  text-[8px]
                  font-semibold
                  uppercase
                  tracking-[0.18em]
                  text-[#A7C957]
                "
              >
                Sessão concluída
              </div>

              <h3
                id="finish-timer-title"
                className="
                  font-display
                  text-lg
                  text-text
                "
              >
                Concluir estudo
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-lg
                text-text-muted
                transition-all
                duration-200
                hover:bg-white/[0.05]
                hover:text-text
                active:scale-90
                disabled:pointer-events-none
                disabled:opacity-40
              "
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-3">
              <ErrorBanner message={error} />
            </div>
          )}

          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Páginas</Label>

                <Input
                  type="number"
                  min={0}
                  value={pages}
                  onChange={(event) =>
                    setPages(event.target.value === "" ? "" : Number(event.target.value))
                  }
                />
              </div>

              <div>
                <Label>Vídeo (min)</Label>

                <Input
                  type="number"
                  min={0}
                  value={videoMinutes}
                  onChange={(event) =>
                    setVideoMinutes(event.target.value === "" ? "" : Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Questões feitas</Label>

                <Input
                  type="number"
                  min={0}
                  value={questionsTotal}
                  onChange={(event) =>
                    setQuestionsTotal(event.target.value === "" ? "" : Number(event.target.value))
                  }
                />
              </div>

              <div>
                <Label>Acertos</Label>

                <Input
                  type="number"
                  min={0}
                  value={questionsCorrect}
                  onChange={(event) =>
                    setQuestionsCorrect(event.target.value === "" ? "" : Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Notas (opcional)</Label>

              <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>

            <label
              className="
                group
                flex
                cursor-pointer
                items-center
                gap-3
                rounded-xl
                border
                border-white/[0.05]
                bg-white/[0.015]
                px-3
                py-2.5
                text-sm
                text-text-muted
                transition-all
                duration-200
                hover:border-[#A7C957]/10
                hover:bg-[#A7C957]/[0.025]
              "
            >
              <input
                type="checkbox"
                checked={scheduleReviews}
                onChange={(event) => setScheduleReviews(event.target.checked)}
                className="
                  h-4
                  w-4
                  accent-[#A7C957]
                "
              />

              <span>Programar revisões</span>
            </label>

            <Button
              className="
                w-full
                transition-all
                duration-300
                hover:-translate-y-0.5
              "
              disabled={loading}
              onClick={submit}
            >
              {loading ? (
                <span
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                  "
                >
                  <RefreshSpinner />
                  Salvando...
                </span>
              ) : (
                <span
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                  "
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Salvar e concluir
                </span>
              )}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// =====================================================
// SPINNER
// =====================================================

function RefreshSpinner() {
  return (
    <span
      className="
        inline-block
        h-3.5
        w-3.5
        animate-spin
        rounded-full
        border-2
        border-white/20
        border-t-white
      "
    />
  );
}
