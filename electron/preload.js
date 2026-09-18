// electron/preload.js

import { contextBridge, ipcRenderer, webUtils } from "electron";
import os from "node:os";

contextBridge.exposeInMainWorld("theoDesktop", {
  platform: process.platform,

  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
  },
  googleDrive: {
    status: () => ipcRenderer.invoke("googledrive:status"),
    signIn: () => ipcRenderer.invoke("googledrive:signIn"),
    signOut: () => ipcRenderer.invoke("googledrive:signOut"),
    ensureRootFolder: () => ipcRenderer.invoke("googledrive:ensureRootFolder"),
    ensureFolder: (parentPath, name) =>
      ipcRenderer.invoke("googledrive:ensureFolder", parentPath, name),
    listChildren: (itemId) =>
      ipcRenderer.invoke("googledrive:listChildren", itemId),
    renameItem: (itemId, newName) =>
      ipcRenderer.invoke("googledrive:renameItem", itemId, newName),
    deleteItem: (itemId) => ipcRenderer.invoke("googledrive:deleteItem", itemId),
    createFile: (parentItemId, fileName, contentJson) =>
      ipcRenderer.invoke("googledrive:createFile", parentItemId, fileName, contentJson),
    updateFileContent: (itemId, contentJson, expectedETag) =>
      ipcRenderer.invoke("googledrive:updateFileContent", itemId, contentJson, expectedETag),
    getFileContent: (itemId) =>
      ipcRenderer.invoke("googledrive:getFileContent", itemId),
    fetchChanges: (pageToken) =>
      ipcRenderer.invoke("googledrive:fetchChanges", pageToken),
  },

  // ============================================================
  // STUDY TIMER
  // ============================================================

  studyTimer: {
    get: () => ipcRenderer.invoke("study-timer:get"),

    start: (data) => ipcRenderer.invoke("study-timer:start", data),

    pause: () => ipcRenderer.invoke("study-timer:pause"),

    resume: () => ipcRenderer.invoke("study-timer:resume"),

    reset: () => ipcRenderer.invoke("study-timer:reset"),

    set: (data) => ipcRenderer.invoke("study-timer:update", data),

    getCurrentSeconds: () => ipcRenderer.invoke("study-timer:get-current-seconds"),

    subscribe: (callback) => {
      const listener = (_event, payload) => {
        if (!payload) return;

        callback(payload.state, payload.event);
      };

      ipcRenderer.on("study-timer:event", listener);

      return () => {
        ipcRenderer.removeListener("study-timer:event", listener);
      };
    },
  },

  // ============================================================
  // AUTO UPDATE
  // ============================================================

  updater: {
    checkNow: () => ipcRenderer.invoke("update:check-now"),

    quitAndInstall: () => ipcRenderer.send("update:quit-and-install"),

    onChecking: (cb) => ipcRenderer.on("update:checking", () => cb()),

    onAvailable: (cb) => ipcRenderer.on("update:available", (_event, info) => cb(info)),

    onNotAvailable: (cb) => ipcRenderer.on("update:not-available", (_event, info) => cb(info)),

    onError: (cb) => ipcRenderer.on("update:error", (_event, message) => cb(message)),

    onProgress: (cb) => ipcRenderer.on("update:progress", (_event, progress) => cb(progress)),

    onDownloaded: (cb) => ipcRenderer.on("update:downloaded", (_event, info) => cb(info)),
  },
});
