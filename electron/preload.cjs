const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("theoDesktop", {
  // ========================================================
  // PLATFORM
  // ========================================================

  platform: process.platform,

  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  // ========================================================
  // WINDOW
  // ========================================================

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),

    maximize: () => ipcRenderer.send("window:maximize"),

    close: () => ipcRenderer.send("window:close"),
  },

  // ========================================================
  // GOOGLE DRIVE
  // ========================================================

  googleDrive: {
    status: () => ipcRenderer.invoke("googledrive:status"),
    signIn: () => ipcRenderer.invoke("googledrive:signIn"),
    signOut: () => ipcRenderer.invoke("googledrive:signOut"),
    ensureRootFolder: () => ipcRenderer.invoke("googledrive:ensureRootFolder"),
    ensureFolder: (parentPath, name) =>
      ipcRenderer.invoke("googledrive:ensureFolder", parentPath, name),
    listChildren: (itemId) => ipcRenderer.invoke("googledrive:listChildren", itemId),
    renameItem: (itemId, newName) =>
      ipcRenderer.invoke("googledrive:renameItem", itemId, newName),
    deleteItem: (itemId) => ipcRenderer.invoke("googledrive:deleteItem", itemId),
    createFile: (parentItemId, fileName, contentJson) =>
      ipcRenderer.invoke("googledrive:createFile", parentItemId, fileName, contentJson),
    updateFileContent: (itemId, contentJson, expectedETag) =>
      ipcRenderer.invoke("googledrive:updateFileContent", itemId, contentJson, expectedETag),
    getFileContent: (itemId) => ipcRenderer.invoke("googledrive:getFileContent", itemId),
    fetchChanges: (pageToken) =>
      ipcRenderer.invoke("googledrive:fetchChanges", pageToken),
  },

  // ========================================================
  // STUDY TIMER
  // ========================================================

  studyTimer: {
    get: () => ipcRenderer.invoke("study-timer:get"),

    start: (data) => ipcRenderer.invoke("study-timer:start", data),

    pause: () => ipcRenderer.invoke("study-timer:pause"),

    resume: () => ipcRenderer.invoke("study-timer:resume"),

    reset: () => ipcRenderer.invoke("study-timer:reset"),

    set: (data) => ipcRenderer.invoke("study-timer:set", data),

    getCurrentSeconds: () => ipcRenderer.invoke("study-timer:get-current-seconds"),

    subscribe: (callback) => {
      const listener = (_event, payload) => {
        if (!payload) {
          return;
        }

        callback(payload.state, payload.event);
      };

      ipcRenderer.on("study-timer:event", listener);

      return () => {
        ipcRenderer.removeListener("study-timer:event", listener);
      };
    },
  },

  // ========================================================
  // CARD WINDOW
  // ========================================================
  //
  // ADICIONADO:
  // Permite abrir o editor do verso em uma
  // nova janela do Electron.
  //
  // ========================================================

  cardWindow: {
    /**
     * Abre a janela de card.
     *
     * Exemplo:
     *
     * window.theoDesktop.cardWindow.open({
     *   step: "back",
     *   front: "<p>Texto da frente</p>",
     * });
     */
    open: (data = {}) => ipcRenderer.invoke("card-window:open", data),

    /**
     * Fecha a janela do card.
     */
    close: () => ipcRenderer.send("card-window:close"),

    /**
     * Recebe os dados enviados pelo Electron
     * para a janela do card.
     */
    onData: (callback) => {
      const listener = (_event, data) => {
        callback(data);
      };

      ipcRenderer.on("card-window:data", listener);

      return () => {
        ipcRenderer.removeListener("card-window:data", listener);
      };
    },
  },

  // ========================================================
  // AUTO UPDATE
  // ========================================================

  updater: {
    checkNow: () => ipcRenderer.invoke("update:check-now"),
    downloadNow: () => ipcRenderer.invoke("update:download-now"),

    quitAndInstall: () => ipcRenderer.send("update:quit-and-install"),

    onChecking: (cb) => {
      const listener = () => cb();

      ipcRenderer.on("update:checking", listener);

      return () => {
        ipcRenderer.removeListener("update:checking", listener);
      };
    },

    onAvailable: (cb) => {
      const listener = (_event, info) => {
        cb(info);
      };

      ipcRenderer.on("update:available", listener);

      return () => {
        ipcRenderer.removeListener("update:available", listener);
      };
    },

    onNotAvailable: (cb) => {
      const listener = (_event, info) => {
        cb(info);
      };

      ipcRenderer.on("update:not-available", listener);

      return () => {
        ipcRenderer.removeListener("update:not-available", listener);
      };
    },

    onError: (cb) => {
      const listener = (_event, message) => {
        cb(message);
      };

      ipcRenderer.on("update:error", listener);

      return () => {
        ipcRenderer.removeListener("update:error", listener);
      };
    },

    onProgress: (cb) => {
      const listener = (_event, progress) => {
        cb(progress);
      };

      ipcRenderer.on("update:progress", listener);

      return () => {
        ipcRenderer.removeListener("update:progress", listener);
      };
    },

    onDownloaded: (cb) => {
      const listener = (_event, info) => {
        cb(info);
      };

      ipcRenderer.on("update:downloaded", listener);

      return () => {
        ipcRenderer.removeListener("update:downloaded", listener);
      };
    },
  },

  // ========================================================
  // BANCO LOCAL SQLITE
  // ========================================================

  localDatabase: {
    // Operações locais são expostas por IPC; o renderer nunca abre o arquivo SQLite.
    getStatus: () => ipcRenderer.invoke("local-db:status"),
    switchAccount: (accountId) => ipcRenderer.invoke("local-db:switch-account", accountId),
    getActiveAccount: () => ipcRenderer.invoke("local-db:get-active-account"),
    adoptAnonymousData: (accountId) => ipcRenderer.invoke("local-db:adopt-anonymous", accountId),
    migrateFromIndexedDB: (records) =>
      ipcRenderer.invoke("local-db:migrate-from-indexeddb", records),
    get: (store, id) => ipcRenderer.invoke("local-db:get", store, id),
    getAll: (store) => ipcRenderer.invoke("local-db:get-all", store),
    count: (store) => ipcRenderer.invoke("local-db:count", store),
    put: (store, value, options) =>
      ipcRenderer.invoke("local-db:put", store, value, options),
    putMany: (store, values, options) =>
      ipcRenderer.invoke("local-db:put-many", store, values, options),
    delete: (store, id, options) =>
      ipcRenderer.invoke("local-db:delete", store, id, options),
    clear: (store) => ipcRenderer.invoke("local-db:clear", store),
    metaGet: (key) => ipcRenderer.invoke("local-db:meta-get", key),
    metaSet: (key, value) => ipcRenderer.invoke("local-db:meta-set", key, value),
    getSyncQueue: (limit) => ipcRenderer.invoke("local-db:sync-queue", limit),
    ackSyncQueue: (eventIds) => ipcRenderer.invoke("local-db:sync-ack", eventIds),
    retrySyncQueue: (eventIds) => ipcRenderer.invoke("local-db:sync-retry", eventIds),
    incrementClock: () => ipcRenderer.invoke("local-db:sync-clock"),
    recordConflict: (conflict) => ipcRenderer.invoke("local-db:sync-conflict", conflict),
    getMetrics: () => ipcRenderer.invoke("local-db:metrics"),

    // Compatibilidade com a exportação/importação já existente.
    export: () => ipcRenderer.invoke("local-db:export"),
    import: () => ipcRenderer.invoke("local-db:import"),
    getPath: () => ipcRenderer.invoke("local-db:get-path"),
  },
});
