import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppSettings,
  BackendCallMessage,
  BackendEvent,
  BackendReplyMessage,
  BootstrapData,
  RunCompletion,
  StartRunPayload
} from "../shared/contracts";

const pending = new Map<string, { resolve(value: unknown): void; reject(reason?: unknown): void }>();
let backend: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
const BACKEND_UNAVAILABLE_ERROR = "Backend process is not available.";

const WINDOW_BOUNDS = {
  compact: { width: 470, height: 760, minWidth: 420, minHeight: 700 },
  expanded: { width: 1360, height: 920, minWidth: 1180, minHeight: 820 }
} as const;

function getAppRoot() {
  return path.resolve(__dirname, "../..");
}

function getPinnedUserDataPath() {
  return path.join(app.getPath("appData"), "codex-avatar-fbx-test");
}

function sendToBackend<T>(method: BackendCallMessage["method"], payload: unknown): Promise<T> {
  if (!backend?.connected) {
    return Promise.reject(new Error(BACKEND_UNAVAILABLE_ERROR));
  }

  const id = randomUUID();
  backend.send({ id, method, payload } satisfies BackendCallMessage);

  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function rejectPendingBackendRequests(message: string) {
  if (!pending.size) {
    return;
  }

  const error = new Error(message);
  for (const [id, request] of pending.entries()) {
    pending.delete(id);
    request.reject(error);
  }
}

function createWindow() {
  const compact = WINDOW_BOUNDS.compact;
  mainWindow = new BrowserWindow({
    width: compact.width,
    height: compact.height,
    minWidth: compact.minWidth,
    minHeight: compact.minHeight,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  const indexPath = path.join(__dirname, "../renderer/index.html");
  void mainWindow.loadFile(indexPath);
}

function setWindowMode(mode: "compact" | "expanded") {
  if (!mainWindow) {
    return;
  }

  const bounds = WINDOW_BOUNDS[mode];
  mainWindow.setMinimumSize(bounds.minWidth, bounds.minHeight);
  mainWindow.setSize(bounds.width, bounds.height, true);
  mainWindow.webContents.send("window:modeChanged", mode);
}

function launchBackend() {
  const backendEnv = {
    ...process.env,
    CODEX_AVATAR_APP_ROOT: getAppRoot(),
    CODEX_AVATAR_USER_DATA: getPinnedUserDataPath()
  };

  backend = fork(path.join(__dirname, "../backend/index.js"), {
    env: backendEnv
  });
  const activeBackend = backend;

  backend.on("message", (message: BackendReplyMessage | { event: BackendEvent }) => {
    if ("event" in message) {
      BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("backend:event", message.event));
      return;
    }

    const request = pending.get(message.id);
    if (!request) {
      return;
    }

    pending.delete(message.id);
    if (message.ok) {
      request.resolve(message.result);
    } else {
      request.reject(new Error(message.error ?? "Unknown backend error."));
    }
  });

  backend.on("disconnect", () => {
    if (backend === activeBackend) {
      backend = null;
    }
    rejectPendingBackendRequests("Backend process disconnected during the request.");
  });

  backend.on("exit", (code, signal) => {
    if (backend === activeBackend) {
      backend = null;
    }
    rejectPendingBackendRequests(`Backend process exited during the request. Code: ${code ?? "null"}, Signal: ${signal ?? "null"}.`);
  });

  backend.on("error", (error) => {
    if (backend === activeBackend) {
      backend = null;
    }
    rejectPendingBackendRequests(`Backend process failed during the request. ${error.message}`);
  });
}

app.whenReady().then(() => {
  app.setPath("userData", getPinnedUserDataPath());
  launchBackend();
  createWindow();

  ipcMain.handle("bootstrap:get", () => sendToBackend<BootstrapData>("bootstrap:get", null));
  ipcMain.handle("settings:save", (_event, settings: AppSettings) => sendToBackend<BootstrapData>("settings:save", settings));
  ipcMain.handle("settings:saveApiKey", (_event, apiKey: string) => sendToBackend<BootstrapData>("settings:saveApiKey", apiKey));
  ipcMain.handle("run:start", (_event, payload: StartRunPayload) => sendToBackend<RunCompletion>("run:start", payload));
  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("window:setMode", (_event, mode: "compact" | "expanded") => {
    setWindowMode(mode);
  });
  ipcMain.handle("window:setPosition", (_event, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y), true);
  });
  ipcMain.handle("path:open", async (_event, targetPath: string) => {
    if (!targetPath) {
      return;
    }
    await shell.openPath(targetPath);
  });
  ipcMain.handle("dialog:chooseDirectory", async (_event, currentPath: string | null) => {
    const options: OpenDialogOptions = {
      defaultPath: currentPath ?? undefined,
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("dialog:chooseFile", async (_event, currentPath: string | null) => {
    const options: OpenDialogOptions = {
      defaultPath: currentPath ?? undefined,
      properties: ["openFile"],
      filters: [{ name: "Launchers", extensions: ["exe", "cmd", "bat", "vbs", "ps1"] }]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
