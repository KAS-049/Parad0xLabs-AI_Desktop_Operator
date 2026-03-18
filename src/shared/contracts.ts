export type AvatarState =
  | "idle"
  | "wake-listening"
  | "wake-detected"
  | "command-listening"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";
export type CodexProvider = "desktop-codex" | "mock" | "openai-codex" | "codex-cli";
export type CodexExecutionMode = "desktop-primary" | "direct-backend-debug";
export type CharacterKind = "vrm" | "image" | "fbx";
export type CodexAdapterKind = "mock" | "desktop-codex-primary" | "direct-backend-debug";
export type ExecutionRiskLevel = "read-only" | "reversible-write" | "privileged-destructive";
export type ExecutionActionKind = "codex-cli-session" | "desktop-submit" | "remote-codex-session";
export type ExecutionPolicyStatus = "safe-to-run" | "requires-approval" | "blocked-by-policy";
export type ExecutionSandboxMode = "read-only" | "workspace-write";
export type ExecutionApprovalPolicy = "never" | "on-request";
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

export interface ExecutionPolicyConfig {
  allowedWorkspaceRoots: string[];
  enforceWorkspaceAllowlist: boolean;
  protectedSystemRoots: string[];
  defaultReadOnlySandbox: ExecutionSandboxMode;
  defaultWriteSandbox: ExecutionSandboxMode;
  approvalPolicy: ExecutionApprovalPolicy;
  dryRunForRiskLevels: ExecutionRiskLevel[];
  approvalRequiredForRiskLevels: ExecutionRiskLevel[];
}

export interface ExecutionApprovalRequest {
  granted: boolean;
  note?: string | null;
}

export interface ExecutionPolicyDecision {
  actionKind: ExecutionActionKind;
  status: ExecutionPolicyStatus;
  riskLevel: ExecutionRiskLevel;
  sandboxMode: ExecutionSandboxMode;
  approvalPolicy: ExecutionApprovalPolicy;
  dryRun: boolean;
  requiresApproval: boolean;
  workspaceAllowed: boolean;
  targetPaths: string[];
  reasons: string[];
  rollbackHints: string[];
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
  executionPolicy: ExecutionPolicyConfig;
  wake: WakeSettings;
}

export interface NormalizedRunResult {
  providerKind: CodexAdapterKind;
  rawCodexOutput: string;
  submittedPrompt: string;
  plainEnglishSummary: string;
  technicalSummary: string;
  blockers: string;
  rememberNextTime: string;
  nextSteps: string;
  whatCodexDid: string;
  problemOccurred: string;
  howItWasFixed: string;
  filesChanged: string[];
  commandsRun: string[];
  fixDiagramSpec: string;
  fixDiagramSource: string;
}

export type DesktopAutomationCheckName =
  | "codex-window-found"
  | "codex-window-visible"
  | "codex-window-focused"
  | "input-target-found"
  | "result-region-found"
  | "prompt-non-empty"
  | "confidence-threshold";

export interface DesktopAutomationCheck {
  name: DesktopAutomationCheckName;
  passed: boolean;
  message: string;
}

export interface DesktopAutomationReport {
  adapterKind: "desktop-codex-primary";
  windowTitle: string | null;
  confidence: number;
  usedClipboard: boolean;
  usedCoordinateFallback: boolean;
  partialCapture: boolean;
  checks: DesktopAutomationCheck[];
  abortReason: string | null;
  debugLog?: string[];
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
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "failed";
  projectWorkspace: string;
  userRequest: string;
  transcript: string;
  submittedPrompt: string;
  codexProvider: CodexProvider;
  executionMode: CodexExecutionMode;
  spokenSummary: string;
  plainEnglishSummary: string;
  technicalSummary: string;
  whatCodexDid: string;
  problemOccurred: string;
  howItWasFixed: string;
  blockers: string;
  rememberNextTime: string;
  nextSteps: string;
  filesChanged: string[];
  commandsRun: string[];
  fixDiagramSpec: string;
  fixDiagramSource: string;
  fixDiagramOutputPath: string | null;
  rawCodexOutput: string;
}

export interface RunArtifacts {
  entryId: string;
  journalBookPath: string;
  entryJsonPath: string;
  fixDiagramOutputPath: string | null;
  speechAudioPath: string | null;
}

export interface RunCompletion {
  report: RunReport;
  artifacts: RunArtifacts | null;
  journalPending: boolean;
  audioBase64: string | null;
  audioMimeType: string | null;
  desktopAutomationReport?: DesktopAutomationReport | null;
}

export interface StartRunPayload {
  audioBase64: string | null;
  mimeType: string | null;
  typedPrompt: string | null;
  executionApproval?: ExecutionApprovalRequest | null;
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

export interface PolicyStatusEvent {
  kind: "policy-status";
  runId: string;
  decision: ExecutionPolicyDecision;
  message: string;
}

export interface WakeStatusEvent {
  kind: "wake-status";
  state: "running" | "stopped" | "heard" | "command-listening" | "command-captured" | "timeout" | "error";
  message: string;
  transcript?: string;
}

export type BackendEvent = RunProgressEvent | WakeStatusEvent | PolicyStatusEvent;

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
