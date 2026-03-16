import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  BackendEvent,
  BootstrapData,
  CodexAvatarApi,
  RunCompletion,
  StartRunPayload
} from "../shared/contracts";

const api: CodexAvatarApi = {
  getBootstrapData: () => ipcRenderer.invoke("bootstrap:get") as Promise<BootstrapData>,
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings) as Promise<BootstrapData>,
  saveApiKey: (apiKey: string) => ipcRenderer.invoke("settings:saveApiKey", apiKey) as Promise<BootstrapData>,
  chooseDirectory: (currentPath: string | null) => ipcRenderer.invoke("dialog:chooseDirectory", currentPath) as Promise<string | null>,
  chooseFile: (currentPath: string | null) => ipcRenderer.invoke("dialog:chooseFile", currentPath) as Promise<string | null>,
  startRun: (payload: StartRunPayload) => ipcRenderer.invoke("run:start", payload) as Promise<RunCompletion>,
  closeWindow: () => ipcRenderer.invoke("window:close") as Promise<void>,
  minimizeWindow: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
  setWindowMode: (mode: "compact" | "expanded") => ipcRenderer.invoke("window:setMode", mode) as Promise<void>,
  setWindowPosition: (x: number, y: number) => ipcRenderer.invoke("window:setPosition", x, y) as Promise<void>,
  openPath: (targetPath: string) => ipcRenderer.invoke("path:open", targetPath) as Promise<void>,
  onBackendEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: BackendEvent) => callback(payload);
    ipcRenderer.on("backend:event", handler);
    return () => ipcRenderer.removeListener("backend:event", handler);
  }
};

contextBridge.exposeInMainWorld("codexAvatar", api);
