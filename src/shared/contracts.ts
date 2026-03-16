export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type CodexProvider = "mock" | "openai-codex" | "codex-cli";
export type CodexExecutionMode = "backend-session" | "desktop-fallback";
export type CharacterKind = "vrm" | "image" | "fbx";
export type RunStage =
  | "transcribing"
  | "submitting"
  | "running"
  | "summarizing"
  | "journaling"
  | "speaking"
  | "complete"
  | "error";

export interface WakeSettings {
  enabled: boolean;
  phrase: string;
  bluetoothDeviceName: string;
  avatarExecutablePath: string;
}

export interface CharacterDisplaySettings {
  scale?: number;
  yOffset?: number;
  rotationY?: number;
}

export interface CharacterOption {
  id: string;
  label: string;
  kind: CharacterKind;
  absolutePath: string;
  fileUrl: string;
  fallbackOnly: boolean;
  displaySettings?: CharacterDisplaySettings;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface AppSettings {
  codexProvider: CodexProvider;
  executionMode: CodexExecutionMode;
  selectedModel: string;
  workspacePath: string;
  journalOutputFolder: string;
  characterFolder: string;
  selectedCharacterId: string | null;
  selectedVoice: string;
  selectedMicDeviceId: string | null;
  codexCliPath: string;
  subtitleBubble: boolean;
  useStoredApiKey: boolean;
  wake: WakeSettings;
}

export interface SecretStatus {
  hasStoredApiKey: boolean;
  hasEnvironmentApiKey: boolean;
}

export interface BootstrapData {
  settings: AppSettings;
  characters: CharacterOption[];
  voices: VoiceOption[];
  models: ModelOption[];
  secretStatus: SecretStatus;
  latestJournalBookPath: string | null;
}

export interface RunReport {
  timestamp: string;
  projectWorkspace: string;
  userRequest: string;
  transcript: string;
  submittedPrompt: string;
  codexProvider: CodexProvider;
  executionMode: CodexExecutionMode;
  spokenSummary: string;
  plainEnglishSummary: string;
  technicalSummary: string;
  blockers: string;
  rememberNextTime: string;
  nextSteps: string;
  memePrompt: string;
  rawCodexOutput: string;
}

export interface RunArtifacts {
  entryId: string;
  journalBookPath: string;
  entryJsonPath: string;
  memeImagePath: string;
  speechAudioPath: string | null;
}

export interface RunCompletion {
  report: RunReport;
  artifacts: RunArtifacts | null;
  journalPending: boolean;
  audioBase64: string | null;
  audioMimeType: string | null;
}

export interface StartRunPayload {
  audioBase64: string | null;
  mimeType: string | null;
  typedPrompt: string | null;
}

export interface RunProgressEvent {
  kind: "run-progress";
  runId: string;
  state: AvatarState;
  stage: RunStage;
  message: string;
  transcript?: string;
  submittedPrompt?: string;
}

export interface WakeStatusEvent {
  kind: "wake-status";
  state: "running" | "stopped" | "error";
  message: string;
}

export type BackendEvent = RunProgressEvent | WakeStatusEvent;

export interface BackendCallMessage {
  id: string;
  method: "bootstrap:get" | "settings:save" | "settings:saveApiKey" | "run:start";
  payload: unknown;
}

export interface BackendReplyMessage {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface CodexAvatarApi {
  getBootstrapData(): Promise<BootstrapData>;
  saveSettings(settings: AppSettings): Promise<BootstrapData>;
  saveApiKey(apiKey: string): Promise<BootstrapData>;
  chooseDirectory(currentPath: string | null): Promise<string | null>;
  chooseFile(currentPath: string | null): Promise<string | null>;
  startRun(payload: StartRunPayload): Promise<RunCompletion>;
  closeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  setWindowMode(mode: "compact" | "expanded"): Promise<void>;
  setWindowPosition(x: number, y: number): Promise<void>;
  openPath(targetPath: string): Promise<void>;
  onBackendEvent(callback: (event: BackendEvent) => void): () => void;
}
