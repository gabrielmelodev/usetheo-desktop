import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";

import electronUpdater from "electron-updater";

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import * as localDatabase from "./localDatabase.js";
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIG
// ============================================================

const devServerUrl = process.env.ELECTRON_START_URL;

let mainWindow = null;

// NOVO:
// Janela separada para criação do card.
let cardWindow = null;

// ============================================================
// DIRETÓRIO DE DADOS / CACHE DO THEO
// ============================================================

const theoUserData = path.join(app.getPath("appData"), "Theo");

const theoCache = path.join(theoUserData, "Cache");

app.setPath("userData", theoUserData);

app.setPath("cache", theoCache);

// ============================================================
// BANCO DE DADOS LOCAL SQLITE
// ============================================================

const localDatabasePath =
  process.env.THEO_LOCAL_DB_PATH || path.join(theoUserData, "theo-local.sqlite");

console.log("[Theo DB] Banco local:", localDatabasePath);

function getCurrentLocalDatabasePath() {
  return localDatabase.getActivePath(localDatabasePath);
}

// Inicializa o SQLite local no processo principal.
// O renderer nunca recebe acesso direto ao arquivo/banco.
localDatabase.createLocalDatabase(localDatabasePath);

function registerLocalDatabaseIpc() {
  ipcMain.handle("local-db:status", () => localDatabase.getStatus(localDatabasePath));

  ipcMain.handle("local-db:switch-account", (_event, accountId) =>
    localDatabase.switchAccount(accountId ? String(accountId) : null),
  );

  ipcMain.handle("local-db:get-active-account", () => localDatabase.getActiveAccount());

  ipcMain.handle("local-db:adopt-anonymous", (_event, accountId) =>
    localDatabase.adoptAnonymousData(String(accountId)),
  );

  ipcMain.handle("local-db:migrate-from-indexeddb", (_event, records) =>
    localDatabase.importRecords(localDatabasePath, records),
  );

  ipcMain.handle("local-db:get", (_event, store, id) =>
    localDatabase.get(localDatabasePath, store, id),
  );

  ipcMain.handle("local-db:get-all", (_event, store) =>
    localDatabase.getAll(localDatabasePath, store),
  );

  ipcMain.handle("local-db:count", (_event, store) =>
    localDatabase.count(localDatabasePath, store),
  );

  ipcMain.handle("local-db:put", (_event, store, value, options) =>
    localDatabase.put(localDatabasePath, store, value, options ?? { sync: true }),
  );

  ipcMain.handle("local-db:put-many", (_event, store, values, options) =>
    localDatabase.putMany(localDatabasePath, store, values, options ?? { sync: true }),
  );

  ipcMain.handle("local-db:delete", (_event, store, id, options) =>
    localDatabase.remove(localDatabasePath, store, id, options ?? { sync: true }),
  );

  ipcMain.handle("local-db:clear", (_event, store) =>
    localDatabase.clear(localDatabasePath, store),
  );

  ipcMain.handle("local-db:meta-get", (_event, key) =>
    localDatabase.metaGet(localDatabasePath, key),
  );

  ipcMain.handle("local-db:meta-set", (_event, key, value) =>
    localDatabase.metaSet(localDatabasePath, key, value),
  );

  ipcMain.handle("local-db:sync-queue", (_event, limit) =>
    localDatabase.getSyncQueue(localDatabasePath, limit),
  );

  ipcMain.handle("local-db:sync-ack", (_event, eventIds) =>
    localDatabase.ackSyncQueue(localDatabasePath, eventIds),
  );

  ipcMain.handle("local-db:sync-retry", (_event, eventIds) =>
    localDatabase.retrySyncQueue(localDatabasePath, eventIds),
  );

  ipcMain.handle("local-db:sync-clock", () => localDatabase.incrementClock(localDatabasePath));

  ipcMain.handle("local-db:sync-conflict", (_event, conflict) =>
    localDatabase.recordConflict(localDatabasePath, conflict),
  );

  ipcMain.handle("local-db:metrics", () => localDatabase.getMetrics(localDatabasePath));
}

registerLocalDatabaseIpc();

// ============================================================
// STUDY TIMER STATE
// ============================================================

const EMPTY_TIMER = {
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

let studyTimer = {
  ...EMPTY_TIMER,
};

let timerInterval = null;

// ============================================================
// TIMER HELPERS
// ============================================================

function getCurrentStudySeconds() {
  if (!studyTimer.running || studyTimer.startedAt === null) {
    return Math.max(0, Math.floor(studyTimer.elapsedSeconds));
  }

  return Math.max(
    0,
    Math.floor(studyTimer.elapsedSeconds + (Date.now() - studyTimer.startedAt) / 1000),
  );
}

function getStudyTimerState() {
  return {
    ...studyTimer,

    elapsedSeconds: getCurrentStudySeconds(),
  };
}

// ============================================================
// BROADCAST TIMER
// ============================================================

function broadcastStudyTimer(event) {
  const payload = {
    state: getStudyTimerState(),
    event,
  };

  // Janela principal
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("study-timer:event", payload);
  }

  // NOVO:
  // A janela de card também pode receber
  // o estado do timer.
  if (cardWindow && !cardWindow.isDestroyed()) {
    cardWindow.webContents.send("study-timer:event", payload);
  }
}

// ============================================================
// TIMER INTERVAL
// ============================================================

function startTimerInterval() {
  if (timerInterval) {
    return;
  }

  timerInterval = setInterval(() => {
    if (!studyTimer.running) {
      return;
    }

    broadcastStudyTimer("tick");
  }, 1000);
}

function stopTimerInterval() {
  if (!timerInterval) {
    return;
  }

  clearInterval(timerInterval);

  timerInterval = null;
}

// ============================================================
// IPC - STUDY TIMER
// ============================================================

// ------------------------------------------------------------
// GET
// ------------------------------------------------------------

ipcMain.handle("study-timer:get", async () => {
  return getStudyTimerState();
});

// ------------------------------------------------------------
// GET CURRENT SECONDS
// ------------------------------------------------------------

ipcMain.handle("study-timer:get-current-seconds", async () => {
  return getCurrentStudySeconds();
});

// ------------------------------------------------------------
// START
// ------------------------------------------------------------

ipcMain.handle("study-timer:start", async (_event, data = {}) => {
  const now = Date.now();

  stopTimerInterval();

  studyTimer = {
    ...EMPTY_TIMER,

    ...data,

    examId: data.examId ?? null,

    topicId: data.topicId ?? null,

    subjectName: data.subjectName ?? data.subject_name ?? null,

    subject_name: data.subject_name ?? data.subjectName ?? null,

    topicName: data.topicName ?? data.topic_name ?? null,

    topic_name: data.topic_name ?? data.topicName ?? null,

    elapsedSeconds: Math.max(0, Number(data.elapsedSeconds ?? 0)),

    running: true,

    startedAt: now,

    sessionId: data.sessionId ?? crypto.randomUUID(),
  };

  startTimerInterval();

  broadcastStudyTimer("start");

  return getStudyTimerState();
});

// ------------------------------------------------------------
// PAUSE
// ------------------------------------------------------------

ipcMain.handle("study-timer:pause", async () => {
  if (!studyTimer.running) {
    return getStudyTimerState();
  }

  studyTimer = {
    ...studyTimer,

    elapsedSeconds: getCurrentStudySeconds(),

    running: false,

    startedAt: null,
  };

  stopTimerInterval();

  broadcastStudyTimer("pause");

  return getStudyTimerState();
});

// ------------------------------------------------------------
// RESUME
// ------------------------------------------------------------

ipcMain.handle("study-timer:resume", async () => {
  if (studyTimer.running) {
    return getStudyTimerState();
  }

  if (!studyTimer.examId || !studyTimer.topicId) {
    return getStudyTimerState();
  }

  studyTimer = {
    ...studyTimer,

    running: true,

    startedAt: Date.now(),
  };

  startTimerInterval();

  broadcastStudyTimer("resume");

  return getStudyTimerState();
});

// ------------------------------------------------------------
// RESET
// ------------------------------------------------------------

ipcMain.handle("study-timer:reset", async () => {
  stopTimerInterval();

  studyTimer = {
    ...EMPTY_TIMER,
  };

  broadcastStudyTimer("reset");

  return getStudyTimerState();
});

// ------------------------------------------------------------
// UPDATE
// ------------------------------------------------------------

ipcMain.handle("study-timer:update", async (_event, data = {}) => {
  const currentSeconds = getCurrentStudySeconds();

  studyTimer = {
    ...studyTimer,

    ...data,

    elapsedSeconds:
      data.elapsedSeconds !== undefined ? Math.max(0, Number(data.elapsedSeconds)) : currentSeconds,

    startedAt:
      data.running === true
        ? (data.startedAt ?? Date.now())
        : data.running === false
          ? null
          : studyTimer.startedAt,
  };

  if (studyTimer.running) {
    startTimerInterval();
  } else {
    stopTimerInterval();
  }

  broadcastStudyTimer("update");

  return getStudyTimerState();
});

// ------------------------------------------------------------
// SET
// ------------------------------------------------------------

ipcMain.handle("study-timer:set", async (_event, data = {}) => {
  const currentSeconds = getCurrentStudySeconds();

  studyTimer = {
    ...studyTimer,

    ...data,

    elapsedSeconds:
      data.elapsedSeconds !== undefined ? Math.max(0, Number(data.elapsedSeconds)) : currentSeconds,

    startedAt:
      data.running === true
        ? (data.startedAt ?? studyTimer.startedAt ?? Date.now())
        : data.running === false
          ? null
          : studyTimer.startedAt,
  };

  if (studyTimer.running) {
    startTimerInterval();
  } else {
    stopTimerInterval();
  }

  broadcastStudyTimer("set");

  return getStudyTimerState();
});

// ============================================================
// CARD WINDOW
// ============================================================

function createCardWindow(data = {}) {
  // ----------------------------------------------------------
  // Se já existe, reutilizar
  // ----------------------------------------------------------

  if (cardWindow && !cardWindow.isDestroyed()) {
    cardWindow.focus();

    cardWindow.webContents.send("card-window:data", data);

    return;
  }

  // ----------------------------------------------------------
  // CRIAR NOVA JANELA
  // ----------------------------------------------------------

  cardWindow = new BrowserWindow({
    width: 1100,

    height: 780,

    minWidth: 850,

    minHeight: 600,

    center: true,

    frame: false,

    title: "Theo — Criar card",

    backgroundColor: "#09090B",

    show: false,

    useContentSize: true,

    roundedCorners: true,

    autoHideMenuBar: true,

    resizable: true,

    maximizable: true,

    minimizable: true,

    fullscreenable: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),

      contextIsolation: true,

      sandbox: true,

      nodeIntegration: false,

      spellcheck: false,

      backgroundThrottling: false,

      devTools: !!devServerUrl,
    },
  });

  // ----------------------------------------------------------
  // READY
  // ----------------------------------------------------------

  cardWindow.once("ready-to-show", () => {
    if (!cardWindow || cardWindow.isDestroyed()) {
      return;
    }

    cardWindow.show();

    cardWindow.focus();

    cardWindow.webContents.send("card-window:data", data);
  });

  // ----------------------------------------------------------
  // LINKS EXTERNOS
  // ----------------------------------------------------------

  cardWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);

    return {
      action: "deny",
    };
  });

  // ----------------------------------------------------------
  // LOAD APP
  // ----------------------------------------------------------

  if (devServerUrl) {
    cardWindow.loadURL(`${devServerUrl}/#/cards/new-window`);
  } else {
    cardWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      hash: "/cards/new-window",
    });
  }

  // ----------------------------------------------------------
  // CLOSED
  // ----------------------------------------------------------

  cardWindow.on("closed", () => {
    cardWindow = null;
  });
}

// ============================================================
// CARD WINDOW - OPEN
// ============================================================

ipcMain.handle("card-window:open", async (_event, data = {}) => {
  createCardWindow(data);

  return {
    ok: true,
  };
});

// ============================================================
// CARD WINDOW - CLOSE
// ============================================================

ipcMain.on("card-window:close", () => {
  if (!cardWindow || cardWindow.isDestroyed()) {
    return;
  }

  cardWindow.close();
});

// ============================================================
// LOCAL DATABASE HELPERS
// ============================================================

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);

    return true;
  } catch {
    return false;
  }
}

function getDatabaseBackupName() {
  const now = new Date();

  const pad = (value) => String(value).padStart(2, "0");

  const date =
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())}_` +
    `${pad(now.getHours())}-` +
    `${pad(now.getMinutes())}-` +
    `${pad(now.getSeconds())}`;

  return `Theo-backup-${date}.sqlite`;
}

async function validateSQLiteFile(filePath) {
  let handle = null;

  try {
    handle = await fs.promises.open(filePath, "r");

    const buffer = Buffer.alloc(16);

    const result = await handle.read(buffer, 0, 16, 0);

    const header = buffer.subarray(0, result.bytesRead).toString("ascii");

    return header === "SQLite format 3\u0000";
  } catch {
    return false;
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

// ============================================================
// LOCAL DATABASE - EXPORTAR
// ============================================================

ipcMain.handle("local-db:export", async () => {
  const currentPath = getCurrentLocalDatabasePath();
  try {
    const exists = await fileExists(currentPath);

    if (!exists) {
      return {
        ok: false,

        canceled: false,

        message: "Banco local não encontrado.\n\n" + `Caminho procurado:\n${currentPath}`,
      };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exportar banco de dados do Theo",

      defaultPath: path.join(app.getPath("documents"), getDatabaseBackupName()),

      buttonLabel: "Exportar",

      filters: [
        {
          name: "Banco SQLite",

          extensions: ["sqlite", "db"],
        },

        {
          name: "Todos os arquivos",

          extensions: ["*"],
        },
      ],

      properties: ["createDirectory", "showOverwriteConfirmation"],
    });

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        canceled: true,
      };
    }

    const destination = result.filePath;

    if (path.resolve(destination).toLowerCase() === path.resolve(currentPath).toLowerCase()) {
      return {
        ok: false,

        canceled: false,

        message: "O destino não pode ser o próprio banco local.",
      };
    }

    await fs.promises.copyFile(currentPath, destination);

    console.log("[Theo DB] Exportado:", destination);

    return {
      ok: true,

      canceled: false,

      filePath: destination,

      message: "Banco local exportado com sucesso.",
    };
  } catch (error) {
    console.error("[Theo DB] Erro ao exportar:", error);

    return {
      ok: false,

      canceled: false,

      message: error instanceof Error ? error.message : "Erro ao exportar banco local.",
    };
  }
});

// ============================================================
// LOCAL DATABASE - IMPORTAR
// ============================================================

ipcMain.handle("local-db:import", async () => {
  const currentPath = getCurrentLocalDatabasePath();
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Importar banco de dados do Theo",

      buttonLabel: "Importar",

      properties: ["openFile"],

      filters: [
        {
          name: "Banco SQLite",

          extensions: ["sqlite", "db"],
        },

        {
          name: "Todos os arquivos",

          extensions: ["*"],
        },
      ],
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        ok: false,
        canceled: true,
      };
    }

    const source = result.filePaths[0];

    // ------------------------------------------------------
    // NÃO PERMITIR MESMO ARQUIVO
    // ------------------------------------------------------

    if (path.resolve(source).toLowerCase() === path.resolve(currentPath).toLowerCase()) {
      return {
        ok: false,

        canceled: false,

        message: "O arquivo selecionado já é o banco local atual.",
      };
    }

    // ------------------------------------------------------
    // VALIDAR SQLITE
    // ------------------------------------------------------

    const validSQLite = await validateSQLiteFile(source);

    if (!validSQLite) {
      return {
        ok: false,

        canceled: false,

        message: "O arquivo selecionado não é um banco SQLite válido.",
      };
    }

    // ------------------------------------------------------
    // CONFIRMAÇÃO
    // ------------------------------------------------------

    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",

      title: "Importar banco local",

      message: "Deseja substituir o banco local atual?",

      detail:
        "O Theo criará um backup automático do banco atual antes da importação.\n\n" +
        "Os dados locais atuais serão substituídos pelos dados do arquivo selecionado.",

      buttons: ["Cancelar", "Importar banco"],

      defaultId: 0,

      cancelId: 0,

      noLink: true,
    });

    if (confirmation.response !== 1) {
      return {
        ok: false,
        canceled: true,
      };
    }

    // ------------------------------------------------------
    // PARAR TIMER / FECHAR SQLITE
    // ------------------------------------------------------

    stopTimerInterval();
    localDatabase.closeDatabase();

    // ------------------------------------------------------
    // GARANTIR DIRETÓRIO
    // ------------------------------------------------------

    await fs.promises.mkdir(path.dirname(currentPath), {
      recursive: true,
    });

    // ------------------------------------------------------
    // BACKUP
    // ------------------------------------------------------

    let backupPath = null;

    const currentExists = await fileExists(currentPath);

    if (currentExists) {
      backupPath = path.join(theoUserData, getDatabaseBackupName());

      await fs.promises.copyFile(currentPath, backupPath);

      console.log("[Theo DB] Backup criado:", backupPath);
    }

    // ------------------------------------------------------
    // TEMPORÁRIO
    // ------------------------------------------------------

    const temporaryDatabasePath = `${currentPath}.importing`;

    try {
      await fs.promises.unlink(temporaryDatabasePath);
    } catch {
      // Não existia.
    }

    await fs.promises.copyFile(source, temporaryDatabasePath);

    // ------------------------------------------------------
    // SUBSTITUIR
    // ------------------------------------------------------

    if (currentExists) {
      await fs.promises.unlink(currentPath);
    }

    await fs.promises.rename(temporaryDatabasePath, currentPath);
    localDatabase.createLocalDatabase(localDatabasePath);

    console.log("[Theo DB] Banco importado:", source);

    // ------------------------------------------------------
    // RECARREGAR THEO
    // ------------------------------------------------------

    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }, 700);
    }

    return {
      ok: true,

      canceled: false,

      backupPath,

      filePath: source,

      message: "Banco local importado com sucesso.",
    };
  } catch (error) {
    console.error("[Theo DB] Erro ao importar:", error);

    return {
      ok: false,

      canceled: false,

      message: error instanceof Error ? error.message : "Erro ao importar banco local.",
    };
  }
});

// ============================================================
// LOCAL DATABASE - CAMINHO
// ============================================================

ipcMain.handle("local-db:get-path", async () => {
  return {
    path: getCurrentLocalDatabasePath(),
  };
});

// ============================================================
// AUTO UPDATE
// ============================================================

function sendUpdaterEvent(channel, data) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, data);
}

function setupAutoUpdater() {
  if (devServerUrl || !app.isPackaged) {
    console.log("[Theo Updater] Desenvolvimento: updater desativado.");

    return;
  }

  autoUpdater.autoDownload = false;

  autoUpdater.autoInstallOnAppQuit = false;

  // ----------------------------------------------------------
  // CHECKING
  // ----------------------------------------------------------

  autoUpdater.on("checking-for-update", () => {
    console.log("[Theo Updater] Verificando atualização...");

    sendUpdaterEvent("update:checking");
  });

  // ----------------------------------------------------------
  // AVAILABLE
  // ----------------------------------------------------------

  autoUpdater.on("update-available", (info) => {
    console.log(`[Theo Updater] Atualização encontrada: ${info.version}`);

    sendUpdaterEvent("update:available", {
      version: info.version,

      releaseDate: info.releaseDate ?? null,
    });
  });

  // ----------------------------------------------------------
  // NOT AVAILABLE
  // ----------------------------------------------------------

  autoUpdater.on("update-not-available", (info) => {
    console.log("[Theo Updater] Theo já está atualizado.");

    sendUpdaterEvent("update:not-available", {
      version: info.version,
    });
  });

  // ----------------------------------------------------------
  // DOWNLOAD PROGRESS
  // ----------------------------------------------------------

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent("update:progress", {
      percent: Math.round(progress.percent),

      transferred: progress.transferred,

      total: progress.total,

      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  // ----------------------------------------------------------
  // DOWNLOADED
  // ----------------------------------------------------------

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Theo Updater] Atualização baixada: ${info.version}`);

    sendUpdaterEvent("update:downloaded", {
      version: info.version,

      releaseDate: info.releaseDate ?? null,
    });
  });

  // ----------------------------------------------------------
  // ERROR
  // ----------------------------------------------------------

  autoUpdater.on("error", (error) => {
    console.error("[Theo Updater] Erro:", error);

    sendUpdaterEvent(
      "update:error",
      error instanceof Error ? error.message : "Erro desconhecido ao atualizar.",
    );
  });

  // ----------------------------------------------------------
  // PRIMEIRA VERIFICAÇÃO
  // ----------------------------------------------------------

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[Theo Updater] Falha ao verificar:", error);
    });
  }, 5000);
}

// ============================================================
// CHECK NOW
// ============================================================

ipcMain.handle("update:download-now", async () => {
  if (devServerUrl || !app.isPackaged) {
    return { ok: false, message: "Atualização desativada durante o desenvolvimento." };
  }

  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    console.error("[Theo Updater] Erro ao baixar:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erro ao baixar atualização.",
    };
  }
});

ipcMain.handle("update:check-now", async () => {
  if (devServerUrl || !app.isPackaged) {
    return {
      ok: false,

      message: "Atualização desativada durante o desenvolvimento.",
    };
  }

  try {
    const result = await autoUpdater.checkForUpdates();

    return {
      ok: true,

      version: result?.updateInfo?.version ?? null,
    };
  } catch (error) {
    console.error("[Theo Updater] Erro na verificação:", error);

    return {
      ok: false,

      message: error instanceof Error ? error.message : "Erro ao verificar atualização.",
    };
  }
});

// ============================================================
// QUIT AND INSTALL
// ============================================================

ipcMain.on("update:quit-and-install", () => {
  if (devServerUrl || !app.isPackaged) {
    return;
  }

  autoUpdater.quitAndInstall();
});

// ============================================================
// WINDOW PRINCIPAL
// ============================================================

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,

    height: 820,

    minWidth: 960,

    minHeight: 640,

    center: true,

    frame: false,

    title: "Theo",

    icon: path.join(__dirname, "../assets/icon.png"),

    backgroundColor: "#09090B",

    show: false,

    useContentSize: true,

    roundedCorners: true,

    autoHideMenuBar: true,

    resizable: true,

    maximizable: true,

    minimizable: true,

    fullscreenable: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),

      contextIsolation: true,

      sandbox: true,

      nodeIntegration: false,

      spellcheck: false,

      backgroundThrottling: false,

      devTools: !!devServerUrl,
    },
  });

  mainWindow = win;

  // ==========================================================
  // READY
  // ==========================================================

  win.once("ready-to-show", () => {
    win.show();
  });

  // ==========================================================
  // EXTERNAL LINKS
  // ==========================================================

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);

    return {
      action: "deny",
    };
  });

  // ==========================================================
  // LOAD APP
  // ==========================================================

  if (devServerUrl) {
    win.loadURL(devServerUrl);

    win.webContents.openDevTools({
      mode: "detach",
    });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // ==========================================================
  // WINDOW CLOSED
  // ==========================================================

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

// ============================================================
// ELECTRON READY
// ============================================================

app.whenReady().then(() => {
  console.log("[Theo] UserData:", app.getPath("userData"));

  console.log("[Theo] Cache:", app.getPath("cache"));

  console.log("[Theo DB] Local:", localDatabasePath);

  createWindow();

  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ============================================================
// CLOSE APP
// ============================================================

app.on("window-all-closed", () => {
  stopTimerInterval();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ============================================================
// WINDOW IPC
// ============================================================

// ============================================================
// MINIMIZE
// ============================================================

ipcMain.on("window:minimize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (window && !window.isDestroyed()) {
    window.minimize();
  }
});

// ============================================================
// MAXIMIZE / RESTORE
// ============================================================

ipcMain.on("window:maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

// ============================================================
// CLOSE
// ============================================================

ipcMain.on("window:close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (window && !window.isDestroyed()) {
    window.close();
  }
});
