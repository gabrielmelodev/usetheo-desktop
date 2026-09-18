import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, BrowserWindow } from "electron";

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TIMER_VERSION = 3;

const STALE_AFTER_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const SAVE_EVERY_MS = 5_000;

// ============================================================
// PERSISTÊNCIA
// ============================================================

let timerFile = null;

function getTimerFile() {
  if (!timerFile) {
    timerFile = path.join(app.getPath("userData"), "study-timer.json");
  }

  return timerFile;
}

// ============================================================
// ESTADO PADRÃO DO TIMER
// ============================================================

const DEFAULT_TIMER_STATE = {
  version: TIMER_VERSION,

  userId: null,

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

  updatedAt: null,

  lastHeartbeatAt: null,
};

// ============================================================
// BANCO LOCAL DOS TIMERS
// ============================================================

const DEFAULT_STORE = {
  version: TIMER_VERSION,

  users: {},
};

// ============================================================
// ESTADO EM MEMÓRIA
// ============================================================

let store = {
  ...DEFAULT_STORE,
};

let currentUserId = null;

// ============================================================
// TIMER ATUAL
// ============================================================

let tickInterval = null;
let watchdogInterval = null;

let lastSaveAt = 0;

// ============================================================
// LOCK
// ============================================================

let operationRunning = false;

// ============================================================
// UTILITÁRIOS
// ============================================================

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function normalizeId(value) {
  return validId(value) ? String(value).trim() : null;
}

function validTimestamp(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0;
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.floor(number));
}

// ============================================================
// TIMER VAZIO
// ============================================================

function emptyTimerState(userId = null) {
  return {
    ...DEFAULT_TIMER_STATE,

    userId: normalizeId(userId),
  };
}

// ============================================================
// NORMALIZA TIMER
// ============================================================

function normalizeTimerState(value = {}, forcedUserId = null) {
  const source = isObject(value) ? value : {};

  const userId = normalizeId(forcedUserId) ?? normalizeId(source.userId);

  const examId = normalizeId(source.examId);

  const topicId = normalizeId(source.topicId);

  const subjectName = source.subjectName ?? source.subject_name ?? null;

  const topicName = source.topicName ?? source.topic_name ?? null;

  const elapsedSeconds = safeInteger(source.elapsedSeconds, 0);

  const running = source.running === true;

  const startedAt = running && validTimestamp(source.startedAt) ? Number(source.startedAt) : null;

  const updatedAt = validTimestamp(source.updatedAt) ? Number(source.updatedAt) : null;

  const lastHeartbeatAt =
    running && validTimestamp(source.lastHeartbeatAt) ? Number(source.lastHeartbeatAt) : null;

  const sessionId = normalizeId(source.sessionId);

  return {
    ...DEFAULT_TIMER_STATE,
    ...source,

    version: TIMER_VERSION,

    userId,

    examId,
    topicId,

    subjectName,

    subject_name: source.subject_name ?? subjectName,

    topicName,

    topic_name: source.topic_name ?? topicName,

    elapsedSeconds,

    running,

    startedAt,

    sessionId,

    updatedAt,

    lastHeartbeatAt,
  };
}

// ============================================================
// NORMALIZA STORE
// ============================================================

function normalizeStore(value) {
  if (!isObject(value)) {
    return {
      ...DEFAULT_STORE,
      users: {},
    };
  }

  const users = {};

  if (isObject(value.users)) {
    for (const [userId, timer] of Object.entries(value.users)) {
      if (!validId(userId)) {
        continue;
      }

      users[String(userId)] = normalizeTimerState(timer, userId);
    }
  }

  return {
    version: TIMER_VERSION,
    users,
  };
}

// ============================================================
// TIMER DO USUÁRIO ATUAL
// ============================================================

function getUserTimer(userId = currentUserId) {
  const id = normalizeId(userId);

  if (!id) {
    return emptyTimerState();
  }

  if (!store.users[id]) {
    store.users[id] = emptyTimerState(id);
  }

  return store.users[id];
}

// ============================================================
// DEFINIR TIMER DO USUÁRIO
// ============================================================

function setUserTimer(timer, userId = currentUserId) {
  const id = normalizeId(userId);

  if (!id) {
    return false;
  }

  store.users[id] = normalizeTimerState(timer, id);

  return true;
}

// ============================================================
// ESTADO ATUAL
// ============================================================

function getCurrentState() {
  return getUserTimer();
}

// ============================================================
// DEFINIR USUÁRIO
// ============================================================

function setCurrentUser(userId) {
  const id = normalizeId(userId);

  // ----------------------------------------------------------
  // SEM USUÁRIO
  // ----------------------------------------------------------

  if (!id) {
    currentUserId = null;

    stopTick();

    return {
      ok: true,
      userId: null,
      state: emptyTimerState(),
    };
  }

  // ----------------------------------------------------------
  // TROCA DE USUÁRIO
  // ----------------------------------------------------------

  if (currentUserId !== null && currentUserId !== id) {
    stopTick();
  }

  currentUserId = id;

  const timer = getUserTimer(id);

  // ----------------------------------------------------------
  // TIMER DESSE USUÁRIO
  // ----------------------------------------------------------

  if (timer.running) {
    const recovered = recoverIfBroken("USER_SWITCH");

    if (!recovered) {
      startTick();
      startWatchdog();
    }
  }

  saveTimerStore();

  broadcast("user-changed");

  return {
    ok: true,

    userId: currentUserId,

    state: getState(),
  };
}

// ============================================================
// CARREGAR ARQUIVO
// ============================================================

function loadTimerStore() {
  try {
    const file = getTimerFile();

    if (!fs.existsSync(file)) {
      store = {
        ...DEFAULT_STORE,
        users: {},
      };

      return;
    }

    const raw = fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      store = {
        ...DEFAULT_STORE,
        users: {},
      };

      saveTimerStore();

      return;
    }

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("[StudyTimer] JSON corrompido:", error);

      // ------------------------------------------------------
      // BACKUP DO ARQUIVO CORROMPIDO
      // ------------------------------------------------------

      try {
        const backup = `${file}.corrupted-${Date.now()}`;

        fs.copyFileSync(file, backup);
      } catch {}

      store = {
        ...DEFAULT_STORE,
        users: {},
      };

      saveTimerStore();

      return;
    }

    // ========================================================
    // FORMATO NOVO
    // ========================================================

    if (isObject(parsed) && isObject(parsed.users)) {
      store = normalizeStore(parsed);

      return;
    }

    // ========================================================
    // MIGRAÇÃO DO FORMATO ANTIGO
    // ========================================================

    console.warn("[StudyTimer] Formato antigo detectado.");

    store = {
      version: TIMER_VERSION,
      users: {},
    };

    // --------------------------------------------------------
    // Não associamos automaticamente um timer antigo
    // a outro usuário.
    //
    // Ele só será migrado quando existir um usuário autenticado.
    // --------------------------------------------------------

    if (isObject(parsed) && validId(parsed.userId)) {
      const oldUserId = normalizeId(parsed.userId);

      store.users[oldUserId] = normalizeTimerState(parsed, oldUserId);
    }
  } catch (error) {
    console.error("[StudyTimer] Erro ao carregar:", error);

    store = {
      ...DEFAULT_STORE,
      users: {},
    };
  }
}

// ============================================================
// SALVAR STORE
// ============================================================

function saveTimerStore(force = false) {
  const now = Date.now();

  if (!force && now - lastSaveAt < SAVE_EVERY_MS) {
    return;
  }

  try {
    const file = getTimerFile();

    const directory = path.dirname(file);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true,
      });
    }

    const temporaryFile = `${file}.tmp`;

    const payload = JSON.stringify(store, null, 2);

    // --------------------------------------------------------
    // ESCRITA ATÔMICA
    // --------------------------------------------------------

    fs.writeFileSync(temporaryFile, payload, "utf8");

    fs.renameSync(temporaryFile, file);

    lastSaveAt = now;
  } catch (error) {
    console.error("[StudyTimer] Erro ao salvar:", error);
  }
}

// ============================================================
// TEMPO ATUAL
// ============================================================

function getCurrentSeconds() {
  const timer = getCurrentState();

  const base = safeInteger(timer.elapsedSeconds, 0);

  if (!timer.running || timer.startedAt == null) {
    return base;
  }

  const startedAt = Number(timer.startedAt);

  if (!Number.isFinite(startedAt)) {
    return base;
  }

  const additional = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

  return base + additional;
}

// ============================================================
// ESTADO PÚBLICO
// ============================================================

function getState() {
  const timer = getCurrentState();

  return {
    ...timer,

    userId: currentUserId,

    elapsedSeconds: getCurrentSeconds(),

    startedAt: timer.running ? timer.startedAt : null,
  };
}

// ============================================================
// VALIDAÇÃO
// ============================================================

function validateTimerState(value = getCurrentState()) {
  const problems = [];

  if (!isObject(value)) {
    problems.push("STATE_NOT_OBJECT");

    return {
      valid: false,
      problems,
    };
  }

  // ----------------------------------------------------------
  // TIMER PARADO
  // ----------------------------------------------------------

  if (!value.running) {
    return {
      valid: true,
      problems,
    };
  }

  // ----------------------------------------------------------
  // USUÁRIO
  // ----------------------------------------------------------

  if (!validId(value.userId)) {
    problems.push("MISSING_USER_ID");
  }

  // ----------------------------------------------------------
  // CONTEXTO
  // ----------------------------------------------------------

  if (!validId(value.examId)) {
    problems.push("MISSING_EXAM_ID");
  }

  if (!validId(value.topicId)) {
    problems.push("MISSING_TOPIC_ID");
  }

  // ----------------------------------------------------------
  // SESSÃO
  // ----------------------------------------------------------

  if (!validId(value.sessionId)) {
    problems.push("MISSING_SESSION_ID");
  }

  // ----------------------------------------------------------
  // TEMPO
  // ----------------------------------------------------------

  if (!validTimestamp(value.startedAt)) {
    problems.push("INVALID_STARTED_AT");
  }

  if (!validTimestamp(value.lastHeartbeatAt)) {
    problems.push("MISSING_HEARTBEAT");
  }

  // ----------------------------------------------------------
  // RELÓGIO NO FUTURO
  // ----------------------------------------------------------

  const now = Date.now();

  if (validTimestamp(value.startedAt) && Number(value.startedAt) > now + 60_000) {
    problems.push("STARTED_AT_IN_FUTURE");
  }

  if (validTimestamp(value.lastHeartbeatAt) && Number(value.lastHeartbeatAt) > now + 60_000) {
    problems.push("HEARTBEAT_IN_FUTURE");
  }

  return {
    valid: problems.length === 0,

    problems,
  };
}

// ============================================================
// TIMER ESTÁ VIVO?
// ============================================================

function isTimerActuallyAlive() {
  const timer = getCurrentState();

  if (!timer.running) {
    return false;
  }

  const validation = validateTimerState(timer);

  if (!validation.valid) {
    return false;
  }

  // ----------------------------------------------------------
  // SE O TICK ESTÁ RODANDO
  // ----------------------------------------------------------

  if (tickInterval !== null) {
    return true;
  }

  // ----------------------------------------------------------
  // HEARTBEAT
  // ----------------------------------------------------------

  const heartbeat = Number(timer.lastHeartbeatAt);

  if (!Number.isFinite(heartbeat)) {
    return false;
  }

  const age = Date.now() - heartbeat;

  return age >= 0 && age <= STALE_AFTER_MS;
}

// ============================================================
// RECUPERAÇÃO
// ============================================================

function recoverIfBroken(reason = "UNKNOWN") {
  const timer = getCurrentState();

  if (!timer.running) {
    return false;
  }

  const validation = validateTimerState(timer);

  // ----------------------------------------------------------
  // ESTADO INVÁLIDO
  // ----------------------------------------------------------

  if (!validation.valid) {
    console.warn("[StudyTimer] Estado inválido.", {
      reason,
      userId: currentUserId,
      problems: validation.problems,
    });

    recoverTimer(`INVALID_STATE:${validation.problems.join(",")}`);

    return true;
  }

  // ----------------------------------------------------------
  // SE O TICK ESTÁ VIVO
  // ----------------------------------------------------------

  if (tickInterval !== null) {
    return false;
  }

  // ----------------------------------------------------------
  // HEARTBEAT
  // ----------------------------------------------------------

  const heartbeat = Number(timer.lastHeartbeatAt);

  const age = Date.now() - heartbeat;

  if (!Number.isFinite(heartbeat) || age > STALE_AFTER_MS) {
    console.warn("[StudyTimer] Timer travado.", {
      reason,
      userId: currentUserId,
      heartbeatAge: age,
    });

    recoverTimer("STALE_TIMER");

    return true;
  }

  // ----------------------------------------------------------
  // TIMER NÃO ESTÁ TRAVADO.
  // REATIVA O TICK.
  // ----------------------------------------------------------

  startTick();

  return false;
}

// ============================================================
// RECUPERAR TIMER
// ============================================================

function recoverTimer(reason = "AUTO_RECOVERY") {
  console.warn(`[StudyTimer] Recuperação: ${reason}`);

  stopTick();

  const userId = currentUserId;

  if (!userId) {
    return;
  }

  // ----------------------------------------------------------
  // NÃO APAGA OUTROS USUÁRIOS.
  // ----------------------------------------------------------

  setUserTimer(
    {
      ...emptyTimerState(userId),

      updatedAt: Date.now(),
    },
    userId,
  );

  saveTimerStore(true);

  broadcast("recovered");
}

// ============================================================
// BROADCAST
// ============================================================

function broadcast(event = "state") {
  const currentState = getState();

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window || window.isDestroyed()) {
      continue;
    }

    try {
      window.webContents.send("study-timer:event", {
        event,
        state: currentState,
      });

      // ------------------------------------------------------
      // COMPATIBILIDADE
      // ------------------------------------------------------

      window.webContents.send("study-timer:state", currentState);
    } catch (error) {
      console.warn("[StudyTimer] Broadcast:", error);
    }
  }
}

// ============================================================
// TICK
// ============================================================

function startTick() {
  stopTick();

  tickInterval = setInterval(() => {
    const timer = getCurrentState();

    if (!timer.running) {
      stopTick();
      return;
    }

    const now = Date.now();

    // ----------------------------------------------------
    // HEARTBEAT
    // ----------------------------------------------------

    setUserTimer({
      ...timer,

      lastHeartbeatAt: now,

      updatedAt: now,
    });

    // ----------------------------------------------------
    // PERSISTÊNCIA
    // ----------------------------------------------------

    saveTimerStore();

    // ----------------------------------------------------
    // BROADCAST
    // ----------------------------------------------------

    broadcast("tick");
  }, 1000);
}

// ============================================================
// STOP TICK
// ============================================================

function stopTick() {
  if (tickInterval) {
    clearInterval(tickInterval);

    tickInterval = null;
  }
}

// ============================================================
// WATCHDOG
// ============================================================

function startWatchdog() {
  stopWatchdog();

  watchdogInterval = setInterval(() => {
    try {
      const timer = getCurrentState();

      if (!timer.running) {
        return;
      }

      // --------------------------------------------------
      // ESTADO INVÁLIDO
      // --------------------------------------------------

      const validation = validateTimerState(timer);

      if (!validation.valid) {
        recoverTimer(`WATCHDOG_INVALID:${validation.problems.join(",")}`);

        return;
      }

      // --------------------------------------------------
      // TICK SUMIU
      // --------------------------------------------------

      if (tickInterval === null) {
        const heartbeat = Number(timer.lastHeartbeatAt);

        const age = Date.now() - heartbeat;

        if (!Number.isFinite(heartbeat) || age > STALE_AFTER_MS) {
          recoverTimer("WATCHDOG_STALE");

          return;
        }

        // ----------------------------------------------
        // AINDA VIVO → REINICIA
        // ----------------------------------------------

        startTick();

        broadcast("watchdog-resume");
      }
    } catch (error) {
      console.error("[StudyTimer] Watchdog:", error);
    }
  }, WATCHDOG_INTERVAL_MS);
}

// ============================================================
// STOP WATCHDOG
// ============================================================

function stopWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);

    watchdogInterval = null;
  }
}

// ============================================================
// LOCK DE OPERAÇÃO
// ============================================================

function withOperationLock(callback) {
  if (operationRunning) {
    return {
      ok: false,

      reason: "TIMER_OPERATION_BUSY",

      message: "O cronômetro está processando outra operação.",

      state: getState(),
    };
  }

  operationRunning = true;

  try {
    return callback();
  } finally {
    operationRunning = false;
  }
}

// ============================================================
// START
// ============================================================

function startTimer(data = {}) {
  return withOperationLock(() => {
    const input = isObject(data) ? data : {};

    // ======================================================
    // 1. USUÁRIO OBRIGATÓRIO
    // ======================================================

    if (!currentUserId) {
      return {
        ok: false,

        reason: "USER_NOT_AUTHENTICATED",

        message: "Não existe um usuário autenticado para iniciar o cronômetro.",

        state: getState(),
      };
    }

    // ======================================================
    // 2. RECUPERA ESTADO QUEBRADO
    // ======================================================

    recoverIfBroken("START_REQUEST");

    const timer = getCurrentState();

    // ======================================================
    // 3. VERIFICA TIMER DO MESMO USUÁRIO
    // ======================================================

    if (timer.running) {
      if (isTimerActuallyAlive()) {
        const activeState = getState();

        const activeTopic = activeState.topicName || activeState.topic_name || "outro estudo";

        return {
          ok: false,

          reason: "TIMER_ALREADY_RUNNING",

          message: `Existe um cronômetro ativo para ${activeTopic}. Pause-o antes de iniciar este estudo.`,

          activeTimer: activeState,

          state: activeState,
        };
      }

      // ----------------------------------------------------
      // TIMER MORTO → RECUPERA
      // ----------------------------------------------------

      recoverTimer("START_DETECTED_DEAD_TIMER");
    }

    // ======================================================
    // 4. CONTEXTO
    // ======================================================

    const examId = normalizeId(input.examId);

    const topicId = normalizeId(input.topicId);

    if (!examId) {
      return {
        ok: false,

        reason: "INVALID_EXAM_ID",

        message: "Não é possível iniciar o cronômetro sem um examId válido.",

        state: getState(),
      };
    }

    if (!topicId) {
      return {
        ok: false,

        reason: "INVALID_TOPIC_ID",

        message: "Não é possível iniciar o cronômetro sem um topicId válido.",

        state: getState(),
      };
    }

    // ======================================================
    // 5. NOVA SESSÃO
    // ======================================================

    const now = Date.now();

    const elapsedSeconds = safeInteger(input.elapsedSeconds, 0);

    const subjectName = input.subjectName ?? input.subject_name ?? null;

    const topicName = input.topicName ?? input.topic_name ?? null;

    const sessionId = normalizeId(input.sessionId) ?? crypto.randomUUID();

    // ======================================================
    // 6. NOVO ESTADO
    // ======================================================

    const nextState = normalizeTimerState(
      {
        ...emptyTimerState(currentUserId),

        ...input,

        version: TIMER_VERSION,

        userId: currentUserId,

        examId,

        topicId,

        subjectName,

        subject_name: input.subject_name ?? subjectName,

        topicName,

        topic_name: input.topic_name ?? topicName,

        elapsedSeconds,

        running: true,

        startedAt: now,

        sessionId,

        updatedAt: now,

        lastHeartbeatAt: now,
      },

      currentUserId,
    );

    // ======================================================
    // 7. VALIDAÇÃO FINAL
    // ======================================================

    const validation = validateTimerState(nextState);

    if (!validation.valid) {
      console.error("[StudyTimer] Sessão rejeitada:", validation.problems);

      return {
        ok: false,

        reason: "INVALID_TIMER_STATE",

        message: "A sessão do cronômetro não passou na validação de segurança.",

        problems: validation.problems,

        state: getState(),
      };
    }

    // ======================================================
    // 8. COMMIT
    // ======================================================

    setUserTimer(nextState, currentUserId);

    saveTimerStore(true);

    startTick();

    startWatchdog();

    broadcast("start");

    return {
      ok: true,

      state: getState(),
    };
  });
}

// ============================================================
// PAUSE
// ============================================================

function pauseTimer() {
  return withOperationLock(() => {
    if (!currentUserId) {
      return {
        ok: false,

        reason: "USER_NOT_AUTHENTICATED",

        message: "Não existe usuário autenticado.",

        state: getState(),
      };
    }

    const timer = getCurrentState();

    // ------------------------------------------------------
    // NADA ATIVO
    // ------------------------------------------------------

    if (!timer.running) {
      stopTick();

      return {
        ok: true,

        state: getState(),
      };
    }

    // ------------------------------------------------------
    // VALIDA
    // ------------------------------------------------------

    const validation = validateTimerState(timer);

    if (!validation.valid) {
      recoverTimer(`PAUSE_INVALID:${validation.problems.join(",")}`);

      return {
        ok: true,

        recovered: true,

        state: getState(),
      };
    }

    // ------------------------------------------------------
    // CAPTURA TEMPO
    // ------------------------------------------------------

    const currentSeconds = getCurrentSeconds();

    const now = Date.now();

    const nextState = normalizeTimerState(
      {
        ...timer,

        elapsedSeconds: currentSeconds,

        running: false,

        startedAt: null,

        updatedAt: now,

        lastHeartbeatAt: null,
      },

      currentUserId,
    );

    setUserTimer(nextState, currentUserId);

    stopTick();

    saveTimerStore(true);

    broadcast("pause");

    return {
      ok: true,

      state: getState(),
    };
  });
}

// ============================================================
// RESUME
// ============================================================

function resumeTimer() {
  return withOperationLock(() => {
    if (!currentUserId) {
      return {
        ok: false,

        reason: "USER_NOT_AUTHENTICATED",

        message: "Não existe usuário autenticado.",

        state: getState(),
      };
    }

    recoverIfBroken("RESUME_REQUEST");

    const timer = getCurrentState();

    // ------------------------------------------------------
    // JÁ ESTÁ RODANDO
    // ------------------------------------------------------

    if (timer.running && isTimerActuallyAlive()) {
      return {
        ok: true,

        state: getState(),
      };
    }

    // ------------------------------------------------------
    // TIMER MORTO
    // ------------------------------------------------------

    if (timer.running) {
      recoverTimer("RESUME_DEAD_TIMER");
    }

    const currentTimer = getCurrentState();

    // ------------------------------------------------------
    // CONTEXTO
    // ------------------------------------------------------

    if (!validId(currentTimer.examId) || !validId(currentTimer.topicId)) {
      return {
        ok: false,

        reason: "INVALID_STUDY_CONTEXT",

        message: "Não existe um estudo válido para continuar.",

        state: getState(),
      };
    }

    // ------------------------------------------------------
    // NOVA ÂNCORA
    // ------------------------------------------------------

    const now = Date.now();

    const nextState = normalizeTimerState(
      {
        ...currentTimer,

        userId: currentUserId,

        running: true,

        startedAt: now,

        updatedAt: now,

        lastHeartbeatAt: now,

        sessionId: validId(currentTimer.sessionId) ? currentTimer.sessionId : crypto.randomUUID(),
      },

      currentUserId,
    );

    // ------------------------------------------------------
    // VALIDA
    // ------------------------------------------------------

    const validation = validateTimerState(nextState);

    if (!validation.valid) {
      recoverTimer(`RESUME_INVALID:${validation.problems.join(",")}`);

      return {
        ok: false,

        reason: "INVALID_TIMER_STATE",

        problems: validation.problems,

        state: getState(),
      };
    }

    setUserTimer(nextState, currentUserId);

    saveTimerStore(true);

    startTick();

    startWatchdog();

    broadcast("resume");

    return {
      ok: true,

      state: getState(),
    };
  });
}

// ============================================================
// RESET
// ============================================================

function resetTimer() {
  return withOperationLock(() => {
    if (!currentUserId) {
      return {
        ok: false,

        reason: "USER_NOT_AUTHENTICATED",

        message: "Não existe usuário autenticado.",

        state: getState(),
      };
    }

    stopTick();

    setUserTimer(
      {
        ...emptyTimerState(currentUserId),

        updatedAt: Date.now(),
      },

      currentUserId,
    );

    saveTimerStore(true);

    broadcast("reset");

    return {
      ok: true,

      state: getState(),
    };
  });
}

// ============================================================
// SET / UPDATE
// ============================================================

function setTimer(data = {}) {
  return withOperationLock(() => {
    if (!currentUserId) {
      return {
        ok: false,

        reason: "USER_NOT_AUTHENTICATED",

        message: "Não existe usuário autenticado.",

        state: getState(),
      };
    }

    const input = isObject(data) ? data : {};

    recoverIfBroken("SET_REQUEST");

    const current = getCurrentState();

    const wasRunning = current.running;

    const currentSeconds = getCurrentSeconds();

    const nextRunning = input.running !== undefined ? input.running === true : wasRunning;

    let nextElapsed =
      input.elapsedSeconds !== undefined ? Number(input.elapsedSeconds) : currentSeconds;

    if (!Number.isFinite(nextElapsed)) {
      nextElapsed = currentSeconds;
    }

    nextElapsed = Math.max(0, Math.floor(nextElapsed));

    const now = Date.now();

    let nextStartedAt = null;

    if (nextRunning) {
      if (validTimestamp(input.startedAt)) {
        nextStartedAt = Number(input.startedAt);
      } else if (wasRunning && validTimestamp(current.startedAt)) {
        nextStartedAt = Number(current.startedAt);
      } else {
        nextStartedAt = now;
      }
    }

    const nextHeartbeat = nextRunning ? now : null;

    const nextSessionId = nextRunning
      ? (normalizeId(input.sessionId) ?? normalizeId(current.sessionId) ?? crypto.randomUUID())
      : current.sessionId;

    const nextState = normalizeTimerState(
      {
        ...current,

        ...input,

        userId: currentUserId,

        elapsedSeconds: nextElapsed,

        running: nextRunning,

        startedAt: nextStartedAt,

        updatedAt: now,

        lastHeartbeatAt: nextHeartbeat,

        sessionId: nextSessionId,
      },

      currentUserId,
    );

    const validation = validateTimerState(nextState);

    if (nextRunning && !validation.valid) {
      recoverTimer(`SET_INVALID:${validation.problems.join(",")}`);

      return {
        ok: false,

        reason: "INVALID_TIMER_STATE",

        problems: validation.problems,

        state: getState(),
      };
    }

    setUserTimer(nextState, currentUserId);

    if (nextState.running) {
      startTick();
      startWatchdog();
    } else {
      stopTick();
    }

    saveTimerStore(true);

    broadcast("update");

    return {
      ok: true,

      state: getState(),
    };
  });
}

// ============================================================
// LOGOUT
// ============================================================

function logoutTimerUser() {
  stopTick();

  currentUserId = null;

  broadcast("user-logout");

  return {
    ok: true,

    state: emptyTimerState(),
  };
}

// ============================================================
// IPC
// ============================================================

function registerStudyTimerIPC(ipcMain) {
  const channels = [
    "study-timer:get",
    "study-timer:get-current-seconds",

    "study-timer:set-user",
    "study-timer:logout",

    "study-timer:start",
    "study-timer:pause",
    "study-timer:resume",
    "study-timer:reset",

    "study-timer:update",
    "study-timer:set",
  ];

  // ----------------------------------------------------------
  // REMOVE HANDLERS DUPLICADOS
  // ----------------------------------------------------------

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  // ==========================================================
  // SET USER
  // ==========================================================

  ipcMain.handle("study-timer:set-user", (_event, userId) => {
    return setCurrentUser(userId);
  });

  // ==========================================================
  // LOGOUT
  // ==========================================================

  ipcMain.handle("study-timer:logout", () => {
    return logoutTimerUser();
  });

  // ==========================================================
  // GET
  // ==========================================================

  ipcMain.handle("study-timer:get", () => {
    if (currentUserId) {
      recoverIfBroken("GET");
    }

    return getState();
  });

  // ==========================================================
  // CURRENT SECONDS
  // ==========================================================

  ipcMain.handle("study-timer:get-current-seconds", () => {
    if (currentUserId) {
      recoverIfBroken("GET_CURRENT");
    }

    return getCurrentSeconds();
  });

  // ==========================================================
  // START
  // ==========================================================

  ipcMain.handle("study-timer:start", (_event, data = {}) => {
    return startTimer(data);
  });

  // ==========================================================
  // PAUSE
  // ==========================================================

  ipcMain.handle("study-timer:pause", () => {
    return pauseTimer();
  });

  // ==========================================================
  // RESUME
  // ==========================================================

  ipcMain.handle("study-timer:resume", () => {
    return resumeTimer();
  });

  // ==========================================================
  // RESET
  // ==========================================================

  ipcMain.handle("study-timer:reset", () => {
    return resetTimer();
  });

  // ==========================================================
  // UPDATE
  // ==========================================================

  ipcMain.handle("study-timer:update", (_event, data = {}) => {
    return setTimer(data);
  });

  // ==========================================================
  // SET
  // ==========================================================

  ipcMain.handle("study-timer:set", (_event, data = {}) => {
    return setTimer(data);
  });
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

function initializeStudyTimer() {
  loadTimerStore();

  stopTick();

  startWatchdog();
}

// ============================================================
// ENCERRAMENTO
// ============================================================

function destroyStudyTimer() {
  stopTick();

  stopWatchdog();

  if (currentUserId) {
    const timer = getCurrentState();

    if (timer.running) {
      const currentSeconds = getCurrentSeconds();

      const now = Date.now();

      setUserTimer(
        normalizeTimerState(
          {
            ...timer,

            elapsedSeconds: currentSeconds,

            running: true,

            startedAt: now,

            updatedAt: now,

            lastHeartbeatAt: now,
          },

          currentUserId,
        ),

        currentUserId,
      );
    }
  }

  saveTimerStore(true);
}

// ============================================================
// EXPORTS
// ============================================================

export {
  initializeStudyTimer,
  registerStudyTimerIPC,
  destroyStudyTimer,
  setCurrentUser,
  getState as getStudyTimer,
  getCurrentSeconds as getCurrentStudySeconds,
  startTimer as startStudyTimer,
  pauseTimer as pauseStudyTimer,
  resumeTimer as resumeStudyTimer,
  resetTimer as resetStudyTimer,
  setTimer as setStudyTimer,
};
