import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type {
  AppSettings,
  BackendCallMessage,
  BackendEvent,
  BackendReplyMessage,
  BootstrapData,
  CharacterOption,
  CodexAdapterKind,
  ExecutionPolicyConfig,
  ExecutionPolicyDecision,
  ModelOption,
  NormalizedRunResult,
  RunArtifacts,
  RunCompletion,
  RunProgressEvent,
  RunReport,
  RunStage,
  SecretStatus,
  StartRunPayload,
  VoiceOption,
  WakeSettings
} from "../shared/contracts";
import { buildEngineeringLogDocx, buildFixDiagramSvg } from "./journalBook";
import { evaluateExecutionPolicy, extractTargetPaths } from "./executionPolicy";
import { getProviderFlowLabel, normalizeProviderResult, resolveProviderKind, retryProvider, withTimeout, type CodexProviderAdapter } from "./providers";
import { runDesktopCodexAutomation } from "./desktopCodexAutomation";

const APP_ROOT = process.env.CODEX_AVATAR_APP_ROOT ?? process.cwd();
const USER_DATA = process.env.CODEX_AVATAR_USER_DATA ?? path.join(APP_ROOT, ".codex-avatar-data");
const LEGACY_USER_DATA = path.join(process.env.APPDATA ?? path.dirname(USER_DATA), "codex-avatar");
const STATE_DIR = path.join(USER_DATA, "state");
const LOG_DIR = path.join(USER_DATA, "logs");
const SETTINGS_PATH = path.join(STATE_DIR, "settings.json");
const SECRETS_PATH = path.join(STATE_DIR, "secrets.json");
const WAKE_PID_PATH = path.join(STATE_DIR, "wake-helper.pid");
const DEFAULT_JOURNAL_DIR = path.join(USER_DATA, "journal");
const DEFAULT_CHARACTER_DIR = path.join(APP_ROOT, "characters");
const DEFAULT_WAKE_HELPER_PATH = path.join(APP_ROOT, "Run-Codex-Avatar.vbs");
const VENDORED_CODEX_PATH = path.join(
  APP_ROOT,
  "node_modules",
  "@openai",
  "codex-win32-x64",
  "vendor",
  "x86_64-pc-windows-msvc",
  "codex",
  "codex.exe"
);
function resolveAppHelperPath(...segments: string[]) {
  const directPath = path.join(APP_ROOT, ...segments);
  if (!APP_ROOT.includes("app.asar")) {
    return directPath;
  }

  const unpackedRoot = APP_ROOT.replace("app.asar", "app.asar.unpacked");
  return path.join(unpackedRoot, ...segments);
}

const DESKTOP_HELPER_PATH = resolveAppHelperPath("automation", "submit_to_codex_window.py");
const WAKE_HELPER_PATH = resolveAppHelperPath("automation", "in_app_wake_listener.ps1");
const CHARACTER_METADATA_PATH = path.join(DEFAULT_CHARACTER_DIR, "display-metadata.json");
const LEGACY_SETTINGS_PATH = path.join(LEGACY_USER_DATA, "state", "settings.json");
const LEGACY_SECRETS_PATH = path.join(LEGACY_USER_DATA, "state", "secrets.json");
const DIRECT_BACKEND_TIMEOUT_MS = 120000;
const DIRECT_BACKEND_RETRIES = 1;
const LEGACY_DESKTOP_TIMEOUT_MS = 70000;
let wakeHelperProcess: ChildProcess | null = null;

const WAKE_SCHEMA = z.object({
  enabled: z.boolean(),
  phrase: z.string(),
  bluetoothDeviceName: z.string(),
  avatarExecutablePath: z.string()
});

const EXECUTION_POLICY_SCHEMA = z.object({
  allowedWorkspaceRoots: z.array(z.string()),
  enforceWorkspaceAllowlist: z.boolean(),
  protectedSystemRoots: z.array(z.string()),
  defaultReadOnlySandbox: z.enum(["read-only", "workspace-write"]),
  defaultWriteSandbox: z.enum(["read-only", "workspace-write"]),
  approvalPolicy: z.enum(["never", "on-request"]),
  dryRunForRiskLevels: z.array(z.enum(["read-only", "reversible-write", "privileged-destructive"])),
  approvalRequiredForRiskLevels: z.array(z.enum(["read-only", "reversible-write", "privileged-destructive"]))
});

const SETTINGS_SCHEMA = z.object({
  codexProvider: z.enum(["desktop-codex", "mock", "openai-codex", "codex-cli"]),
  executionMode: z.enum(["desktop-primary", "direct-backend-debug"]),
  selectedModel: z.string(),
  workspacePath: z.string(),
  journalOutputFolder: z.string(),
  characterFolder: z.string(),
  selectedCharacterId: z.string().nullable(),
  selectedVoice: z.string(),
  selectedMicDeviceId: z.string().nullable(),
  codexCliPath: z.string(),
  subtitleBubble: z.boolean(),
  useStoredApiKey: z.boolean(),
  executionPolicy: EXECUTION_POLICY_SCHEMA,
  wake: WAKE_SCHEMA
});

const SECRET_SCHEMA = z.object({
  openAiApiKey: z.string().optional()
});

const voices: VoiceOption[] = [
  { id: "alloy", label: "Alloy" },
  { id: "verse", label: "Verse" },
  { id: "ash", label: "Ash" },
  { id: "sage", label: "Sage" }
];

const models: ModelOption[] = [
  { id: "gpt-5.3-codex", label: "Codex Latest" },
  { id: "gpt-5.2-codex", label: "Codex Stable" },
  { id: "gpt-4o-mini", label: "Fast General Helper" }
];

const SUMMARY_SCHEMA = z.object({
  plainEnglishSummary: z.string().optional(),
  technicalSummary: z.string().optional(),
  whatCodexDid: z.string().optional(),
  problemOccurred: z.string().optional(),
  howItWasFixed: z.string().optional(),
  blockers: z.string().optional(),
  rememberNextTime: z.string().optional(),
  nextSteps: z.string().optional(),
  fixDiagramSpec: z.string().optional(),
  fixDiagramSource: z.string().optional()
});

const defaultWakeSettings: WakeSettings = {
  enabled: false,
  phrase: "wake up codex avatar",
  bluetoothDeviceName: "soundcore P30i",
  avatarExecutablePath: DEFAULT_WAKE_HELPER_PATH
};

type EngineeringSummary = Pick<
  RunReport,
  | "plainEnglishSummary"
  | "technicalSummary"
  | "whatCodexDid"
  | "problemOccurred"
  | "howItWasFixed"
  | "blockers"
  | "rememberNextTime"
  | "nextSteps"
  | "filesChanged"
  | "commandsRun"
  | "fixDiagramSpec"
  | "fixDiagramSource"
>;

function getDefaultExecutionPolicy(workspacePath: string): ExecutionPolicyConfig {
  return {
    allowedWorkspaceRoots: [workspacePath],
    enforceWorkspaceAllowlist: true,
    protectedSystemRoots: ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"],
    defaultReadOnlySandbox: "read-only",
    defaultWriteSandbox: "workspace-write",
    approvalPolicy: "never",
    dryRunForRiskLevels: ["privileged-destructive"],
    approvalRequiredForRiskLevels: ["privileged-destructive"]
  };
}

function getDefaultFbxDisplaySettings(): CharacterOption["displaySettings"] {
  return {
    rotationY: 0
  };
}

function sendToParent(message: BackendReplyMessage | { event: BackendEvent }) {
  if (!process.send || !process.connected) {
    return;
  }

  try {
    process.send(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ERR_IPC_CHANNEL_CLOSED") || message.includes("Channel closed")) {
      return;
    }
    throw error;
  }
}

function emit(event: BackendEvent) {
  sendToParent({ event });
}

function emitRunProgress(runId: string, state: RunProgressEvent["state"], stage: RunStage, message: string, extras?: Partial<RunProgressEvent>) {
  emit({
    kind: "run-progress",
    runId,
    state,
    stage,
    message,
    ...extras
  });
}

function emitPolicyStatus(runId: string, decision: ExecutionPolicyDecision, message: string) {
  emit({
    kind: "policy-status",
    runId,
    decision,
    message
  });
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

async function appendDiagnosticLog(message: string) {
  try {
    await ensureDir(LOG_DIR);
    const logPath = path.join(LOG_DIR, "backend-diagnostics.log");
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await writeFile(logPath, line, { encoding: "utf8", flag: "a" });
  } catch {
    // Ignore logging failures.
  }
}

async function logPolicyDecision(runId: string, request: string, decision: ExecutionPolicyDecision) {
  await appendDiagnosticLog(
    JSON.stringify({
      type: "execution-policy",
      runId,
      requestedAction: request,
      actionKind: decision.actionKind,
      status: decision.status,
      riskLevel: decision.riskLevel,
      dryRun: decision.dryRun,
      workspaceAllowed: decision.workspaceAllowed,
      targetPaths: decision.targetPaths,
      rollbackHints: decision.rollbackHints,
      reasons: decision.reasons
    })
  );
}

function fireAndForget(task: Promise<unknown>, options?: { surfaceError?: boolean }) {
  void task.catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await appendDiagnosticLog(`background-task-error ${message}`);
    if (options?.surfaceError ?? true) {
      emit({ kind: "wake-status", state: "error", message });
    }
  });
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(targetPath: string): Promise<T | null> {
  try {
    const raw = stripBom(await readFile(targetPath, "utf8"));
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toSingleLine(value: string | undefined, fallback: string) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function extractFilesChanged(rawCodexOutput: string) {
  const matches = rawCodexOutput.match(/(?:[A-Za-z]:\\|\.{0,2}\/)?[A-Za-z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|md|css|html|ps1|cmd|py|yml|yaml|svg|docx)\b/g) ?? [];
  return [...new Set(matches.map((item) => item.replace(/^\.?[\\/]/, "").trim()))].slice(0, 16);
}

function extractCommandsRun(rawCodexOutput: string) {
  const lines = rawCodexOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const commands = lines.filter((line) => /^(?:[$>#]|npm |node |python |git |powershell |cmd |tsc |vite )/i.test(line));
  return [...new Set(commands)].slice(0, 16);
}

function buildEngineeringDiagramSpec(userRequest: string, whatCodexDid: string, problemOccurred: string, howItWasFixed: string, nextSteps: string) {
  return [
    "flowchart TD",
    `A[Request: ${toSingleLine(userRequest, "Request").slice(0, 72)}]`,
    `B[Work: ${toSingleLine(whatCodexDid, "Work completed").slice(0, 72)}]`,
    `C[Problem: ${toSingleLine(problemOccurred, "No major problem recorded").slice(0, 72)}]`,
    `D[Fix: ${toSingleLine(howItWasFixed, "Fix not recorded").slice(0, 72)}]`,
    `E[Next: ${toSingleLine(nextSteps, "Continue from the latest completed step").slice(0, 72)}]`,
    "A --> B --> C --> D --> E"
  ].join("\n");
}

function normalizeCapturedCodexText(value: string) {
  return value
    .replace(/IÃ¢â‚¬â„¢/g, "Iâ€™m")
    .replace(/Ã¢â‚¬â„¢/g, "â€™")
    .replace(/Ã¢â‚¬Å“/g, "\"")
    .replace(/Ã¢â‚¬Â/g, "\"")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getDefaultSettings(): AppSettings {
  return {
    codexProvider: "desktop-codex",
    executionMode: "desktop-primary",
    selectedModel: "gpt-5.3-codex",
    workspacePath: APP_ROOT,
    journalOutputFolder: DEFAULT_JOURNAL_DIR,
    characterFolder: DEFAULT_CHARACTER_DIR,
    selectedCharacterId: null,
    selectedVoice: "alloy",
    selectedMicDeviceId: null,
    codexCliPath: VENDORED_CODEX_PATH,
    subtitleBubble: true,
    useStoredApiKey: true,
    executionPolicy: getDefaultExecutionPolicy(APP_ROOT),
    wake: defaultWakeSettings
  };
}

function normalizeExecutionSelection(settings: AppSettings): AppSettings {
  if (settings.codexProvider === "mock") {
    return settings;
  }

  if (settings.executionMode === "desktop-primary") {
    return {
      ...settings,
      codexProvider: "desktop-codex"
    };
  }

  if (settings.codexProvider === "desktop-codex") {
    return {
      ...settings,
      codexProvider: "codex-cli"
    };
  }

  return settings;
}

function migrateSettings(value: unknown): AppSettings {
  const candidate = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const legacyProvider = candidate.codexProvider;
  const legacyExecutionMode = candidate.executionMode;
  if (legacyProvider === "codex-cli" && legacyExecutionMode === "desktop-fallback") {
    candidate.codexProvider = "desktop-codex";
    candidate.executionMode = "desktop-primary";
  } else if (legacyExecutionMode === "backend-session") {
    candidate.executionMode = "direct-backend-debug";
  } else if (legacyExecutionMode === "desktop-fallback") {
    candidate.executionMode = "desktop-primary";
  }
  const workspacePathCandidate = typeof candidate.workspacePath === "string" && candidate.workspacePath.trim() ? candidate.workspacePath : APP_ROOT;
  const defaultExecutionPolicy = getDefaultExecutionPolicy(workspacePathCandidate);
  const merged = {
    ...getDefaultSettings(),
    ...candidate,
    executionPolicy: {
      ...defaultExecutionPolicy,
      ...(typeof candidate.executionPolicy === "object" && candidate.executionPolicy ? (candidate.executionPolicy as Record<string, unknown>) : {})
    },
    wake: {
      ...defaultWakeSettings,
      ...(typeof candidate.wake === "object" && candidate.wake ? (candidate.wake as Record<string, unknown>) : {})
    }
  };

  if (typeof merged.codexCliPath !== "string" || !merged.codexCliPath.trim()) {
    merged.codexCliPath = VENDORED_CODEX_PATH;
  }

  merged.executionPolicy = EXECUTION_POLICY_SCHEMA.parse({
    ...defaultExecutionPolicy,
    ...merged.executionPolicy,
    allowedWorkspaceRoots:
      Array.isArray(merged.executionPolicy.allowedWorkspaceRoots) && merged.executionPolicy.allowedWorkspaceRoots.length
        ? merged.executionPolicy.allowedWorkspaceRoots
        : [merged.workspacePath]
  });

  return normalizeExecutionSelection(SETTINGS_SCHEMA.parse(merged));
}

async function getSettings(): Promise<AppSettings> {
  await ensureDir(STATE_DIR);
  try {
    const raw = stripBom(await readFile(SETTINGS_PATH, "utf8"));
    const parsed = migrateSettings(JSON.parse(raw));
    await saveSettings(parsed);
    return parsed;
  } catch {
    const legacy = await readJsonIfExists<unknown>(LEGACY_SETTINGS_PATH);
    if (legacy) {
      const imported = migrateSettings(legacy);
      imported.workspacePath = APP_ROOT;
      imported.journalOutputFolder = DEFAULT_JOURNAL_DIR;
      imported.characterFolder = DEFAULT_CHARACTER_DIR;
      imported.codexCliPath = VENDORED_CODEX_PATH;
      imported.executionPolicy = getDefaultExecutionPolicy(imported.workspacePath);
      imported.wake.avatarExecutablePath = DEFAULT_WAKE_HELPER_PATH;
      await saveSettings(imported);
      return imported;
    }

    const defaults = getDefaultSettings();
    await saveSettings(defaults);
    return defaults;
  }
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await ensureDir(STATE_DIR);
  const normalized = normalizeExecutionSelection(migrateSettings(settings));
  await writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2), "utf8");
  await syncWakeHelper(normalized);
  return normalized;
}

async function getSecrets(): Promise<z.infer<typeof SECRET_SCHEMA>> {
  await ensureDir(STATE_DIR);
  try {
    const raw = stripBom(await readFile(SECRETS_PATH, "utf8"));
    return SECRET_SCHEMA.parse(JSON.parse(raw));
  } catch {
    const legacy = await readJsonIfExists<unknown>(LEGACY_SECRETS_PATH);
    return legacy ? SECRET_SCHEMA.parse(legacy) : {};
  }
}

async function saveApiKey(apiKey: string) {
  await ensureDir(STATE_DIR);
  const next = SECRET_SCHEMA.parse({
    ...(await getSecrets()),
    openAiApiKey: apiKey.trim() || undefined
  });
  await writeFile(SECRETS_PATH, JSON.stringify(next, null, 2), "utf8");
}

async function getSecretStatus(): Promise<SecretStatus> {
  const secrets = await getSecrets();
  return {
    hasStoredApiKey: Boolean(secrets.openAiApiKey),
    hasEnvironmentApiKey: Boolean(process.env.OPENAI_API_KEY)
  };
}

async function getResolvedApiKey(settings: AppSettings): Promise<string | null> {
  const secrets = await getSecrets();

  if (settings.useStoredApiKey && secrets.openAiApiKey) {
    await appendDiagnosticLog(`api-key-source=stored useStored=${settings.useStoredApiKey}`);
    return secrets.openAiApiKey;
  }

  if (process.env.OPENAI_API_KEY) {
    await appendDiagnosticLog(`api-key-source=env useStored=${settings.useStoredApiKey}`);
    return process.env.OPENAI_API_KEY;
  }

  if (secrets.openAiApiKey) {
    await appendDiagnosticLog(`api-key-source=stored-fallback useStored=${settings.useStoredApiKey}`);
    return secrets.openAiApiKey;
  }

  await appendDiagnosticLog(`api-key-source=missing useStored=${settings.useStoredApiKey}`);
  return null;
}

async function listCharacters(characterFolder: string): Promise<CharacterOption[]> {
  await ensureDir(characterFolder);
  const files = await readdir(characterFolder, { withFileTypes: true });
  const displayMetadata = (await readJsonIfExists<Record<string, { scale?: number; yOffset?: number; rotationY?: number }>>(path.join(characterFolder, "display-metadata.json"))) ?? {};
  const supportedExtensions = [".vrm", ".fbx", ".png", ".jpg", ".jpeg", ".webp"];
  const items = files
    .filter((entry) => entry.isFile() && supportedExtensions.some((ext) => entry.name.toLowerCase().endsWith(ext)))
    .map((entry) => {
      const absolutePath = path.join(characterFolder, entry.name);
      const lower = entry.name.toLowerCase();
      const kind = lower.endsWith(".vrm") ? "vrm" : lower.endsWith(".fbx") ? "fbx" : "image";
      const baseDisplaySettings = kind === "fbx" ? getDefaultFbxDisplaySettings() : undefined;
      return {
        id: entry.name,
        label: entry.name.replace(/\.(vrm|fbx|png|jpe?g|webp)$/i, kind === "image" ? " (fallback image)" : ""),
        kind,
        absolutePath,
        fileUrl: pathToFileURL(absolutePath).href,
        fallbackOnly: kind === "image",
        displaySettings: {
          ...baseDisplaySettings,
          ...(displayMetadata[entry.name] ?? {})
        }
      } satisfies CharacterOption;
    });

  return items.sort((left, right) => {
    const rank = (item: CharacterOption) => {
      if (item.kind === "fbx") {
        return 0;
      }
      if (item.kind === "vrm") {
        return 1;
      }
      return 2;
    };
    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (left.kind === right.kind) {
      return left.label.localeCompare(right.label);
    }
    return left.kind === "vrm" ? -1 : 1;
  });
}

async function getLatestJournalBookPath(journalOutputFolder: string) {
  const targetPath = path.join(journalOutputFolder, "Codex-Avatar-Engineering-Log.docx");
  return (await pathExists(targetPath)) ? targetPath : null;
}

async function getBootstrapData(): Promise<BootstrapData> {
  const settings = await getSettings();
  await syncWakeHelper(settings);
  const characters = await listCharacters(settings.characterFolder);
  const selectedCharacter = characters.find((item) => item.id === settings.selectedCharacterId) ?? null;
  const preferredCharacter = characters.find((item) => item.kind === "fbx") ?? characters[0] ?? null;
  if ((!selectedCharacter || selectedCharacter.fallbackOnly) && preferredCharacter) {
    settings.selectedCharacterId = preferredCharacter.id;
    await saveSettings(settings);
  }

  return {
    settings,
    characters,
    voices,
    models,
    secretStatus: await getSecretStatus(),
    latestJournalBookPath: await getLatestJournalBookPath(settings.journalOutputFolder)
  };
}

async function openAiJson<T>(payload: object, settings: AppSettings): Promise<T> {
  const apiKey = await getResolvedApiKey(settings);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function extractResponseText(response: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  const direct = response.output_text?.trim();
  if (direct) {
    return direct;
  }

  const parts = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean) ?? [];

  return parts.join("\n\n").trim();
}

async function transcribeAudio(payload: StartRunPayload, settings: AppSettings, runId: string): Promise<string> {
  if (payload.typedPrompt?.trim()) {
    const typed = payload.typedPrompt.trim();
    emitRunProgress(runId, "thinking", "transcribing", "Using your typed request.", {
      transcript: typed,
      submittedPrompt: typed
    });
    return typed;
  }

  if (settings.codexProvider === "mock") {
    const mock = "Mock request: explain what the app just did and what should happen next.";
    emitRunProgress(runId, "thinking", "transcribing", "Mock transcript created.", {
      transcript: mock
    });
    return mock;
  }

  if (!payload.audioBase64 || !payload.mimeType) {
    throw new Error("No microphone audio was captured.");
  }

  const apiKey = await getResolvedApiKey(settings);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const bytes = Buffer.from(payload.audioBase64, "base64");
  const form = new FormData();
  const audioExtension =
    payload.mimeType === "audio/wav"
      ? "wav"
      : payload.mimeType === "audio/webm"
        ? "webm"
        : payload.mimeType === "audio/mp3" || payload.mimeType === "audio/mpeg"
          ? "mp3"
          : payload.mimeType === "audio/mp4" || payload.mimeType === "audio/m4a" || payload.mimeType === "audio/x-m4a"
            ? "m4a"
            : "bin";
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes], { type: payload.mimeType }), `mic.${audioExtension}`);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = (await response.json()) as { text: string };
  const heard = json.text.trim();
  emitRunProgress(runId, "thinking", "transcribing", "Transcript captured.", {
    transcript: heard
  });
  return heard;
}

function runCommand(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || stdout || `Command failed with code ${code}.`));
      }
    });
  });
}

async function evaluateAndAnnouncePolicy(
  runId: string,
  settings: AppSettings,
  userRequest: string,
  actionKind: ExecutionPolicyDecision["actionKind"],
  approval: StartRunPayload["executionApproval"] | undefined,
  targetPaths?: string[]
) {
  const decision = evaluateExecutionPolicy({
    actionKind,
    userRequest,
    workspacePath: settings.workspacePath,
    config: settings.executionPolicy,
    targetPaths,
    approval
  });
  const policyMessage =
    decision.status === "safe-to-run"
      ? `Policy: safe to run (${decision.riskLevel}).`
      : decision.status === "requires-approval"
        ? `Policy: requires approval (${decision.riskLevel}).`
        : `Policy: blocked by policy (${decision.riskLevel}).`;
  emitPolicyStatus(runId, decision, policyMessage);
  await logPolicyDecision(runId, userRequest, decision);
  return decision;
}

function buildPolicyEnforcementError(decision: ExecutionPolicyDecision) {
  if (decision.status === "blocked-by-policy") {
    return new Error(`Blocked by policy: ${decision.reasons.join(" ")}`);
  }

  return new Error(`Approval required: ${decision.reasons.join(" ")}`);
}

function resolveCodexCliPath(settings: AppSettings) {
  return settings.codexCliPath?.trim() || VENDORED_CODEX_PATH;
}

async function runCodexCliSession(userRequest: string, settings: AppSettings, decision: ExecutionPolicyDecision): Promise<string> {
  const codexPath = resolveCodexCliPath(settings);
  const outputPath = path.join(STATE_DIR, `codex-last-message-${randomUUID()}.txt`);
  const systemPrompt = [
    "You are the secondary direct-backend debug Codex session for Codex Avatar.",
    "Do the user's software work in the provided workspace if needed.",
    "Stay inside the allowed workspace and avoid destructive or system-level actions unless the user has already granted explicit approval.",
    "At the end, produce a concise but useful final response in plain language first, then technical detail."
  ].join(" ");

  if (decision.status !== "safe-to-run") {
    throw buildPolicyEnforcementError(decision);
  }

  if (decision.dryRun) {
    return [
      "Security policy dry-run only.",
      `Risk level: ${decision.riskLevel}.`,
      `Requested action: ${userRequest}`,
      `Rollback hints: ${decision.rollbackHints.join(" ")}`
    ].join("\n");
  }

  try {
    await runCommand(
      codexPath,
      [
        "exec",
        "--sandbox",
        decision.sandboxMode,
        "--ask-for-approval",
        decision.approvalPolicy,
        "--skip-git-repo-check",
        "-C",
        settings.workspacePath,
        "-o",
        outputPath,
        `${systemPrompt}\n\nUser request:\n${userRequest}`
      ],
      settings.workspacePath
    );

    if (await pathExists(outputPath)) {
      const lastMessage = await readFile(outputPath, "utf8");
      return lastMessage.trim();
    }

    return "";
  } finally {
    await rm(outputPath, { force: true }).catch(() => undefined);
  }
}

async function runOpenAiCodex(userRequest: string, settings: AppSettings): Promise<string> {
  const response = await openAiJson<{ output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }>(
    {
      model: settings.selectedModel || "gpt-5.3-codex",
      input: [
        {
          role: "system",
          content: "You are Codex Avatar's secondary direct-backend debug Codex session. Solve the user's software request and produce a useful final answer."
        },
        {
          role: "user",
          content: `Workspace: ${settings.workspacePath}\n\nRequest:\n${userRequest}`
        }
      ]
    },
    settings
  );

  return extractResponseText(response);
}

function getActionKindForAdapter(adapterKind: CodexAdapterKind, settings: AppSettings): ExecutionPolicyDecision["actionKind"] {
  if (adapterKind === "desktop-codex-primary") {
    return "desktop-submit";
  }

  if (adapterKind === "direct-backend-debug") {
    return settings.codexProvider === "codex-cli" ? "codex-cli-session" : "remote-codex-session";
  }

  return "remote-codex-session";
}

function createMockAdapter(): CodexProviderAdapter {
  return {
    kind: "mock",
    async execute(context) {
      return {
        providerKind: "mock",
        submittedPrompt: context.transcript.trim(),
        rawCodexOutput: [
          `User request: ${context.transcript.trim()}`,
          "Work completed: mock mode stitched together a believable app run for UI testing.",
          "Technical notes: no real Codex execution occurred in mock mode."
        ].join("\n")
      };
    }
  };
}

function createDirectBackendAdapter(decision: ExecutionPolicyDecision): CodexProviderAdapter {
  return {
    kind: "direct-backend-debug",
    async execute(context) {
      const submittedPrompt = context.transcript.trim();
      await context.log(
        `submit-pipeline desktop-submit-skipped runId=${context.runId} executionMode=${context.settings.executionMode} codexProvider=${context.settings.codexProvider} adapter=direct-backend-debug`
      );
      context.submitPrompt(`Policy approved. Running through ${getProviderFlowLabel("direct-backend-debug")}...`);

      const rawCodexOutput =
        context.settings.codexProvider === "codex-cli"
          ? await runCodexCliSession(submittedPrompt, context.settings, decision)
          : await runOpenAiCodex(submittedPrompt, context.settings);

      if (!rawCodexOutput.trim()) {
        throw new Error("The direct backend session returned no result text.");
      }

      return {
        providerKind: "direct-backend-debug",
        submittedPrompt,
        rawCodexOutput: rawCodexOutput.trim()
      };
    }
  };
}

function createPrimaryDesktopAdapter(): CodexProviderAdapter {
  return {
    kind: "desktop-codex-primary",
    async execute(context) {
      const submittedPrompt = context.transcript.trim();
      context.submitPrompt("Running preflight checks against the visible Codex desktop window...");
      await context.log(`submit-pipeline desktop-submit-adapter-invoked runId=${context.runId} promptChars=${submittedPrompt.length}`);
      await context.log("desktop-automation preflight-start");
      let automation;
      try {
        automation = await runDesktopCodexAutomation(DESKTOP_HELPER_PATH, submittedPrompt, context.settings.workspacePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await context.log(`desktop-automation preflight-failed ${message}`);
        context.submitPrompt(message);
        throw error;
      }
      for (const line of automation.report.debugLog ?? []) {
        await context.log(`submit-pipeline ${line}`);
      }
      await context.log("desktop-automation submit-complete");
      await context.log(automation.report.partialCapture ? "desktop-automation capture-partial" : "desktop-automation capture-full");
      await context.log(
        `desktop-automation window=${automation.report.windowTitle ?? "unknown"} confidence=${automation.report.confidence} clipboard=${automation.report.usedClipboard} coordinateFallback=${automation.report.usedCoordinateFallback} partialCapture=${automation.report.partialCapture} checks=${automation.report.checks.map((check) => `${check.name}:${check.passed}`).join(",")}`
      );
      return {
        providerKind: "desktop-codex-primary",
        submittedPrompt: automation.submitted,
        rawCodexOutput: automation.reply.trim(),
        desktopAutomationReport: automation.report
      };
    }
  };
}

async function executeProvider(
  userRequest: string,
  settings: AppSettings,
  runId: string,
  approval: StartRunPayload["executionApproval"] | undefined
) {
  const submittedPrompt = userRequest.trim();
  const providerKind = resolveProviderKind(settings);
  await appendDiagnosticLog(
    `submit-pipeline run-request-created runId=${runId} executionMode=${settings.executionMode} codexProvider=${settings.codexProvider} resolvedAdapter=${providerKind} promptChars=${submittedPrompt.length}`
  );
  const targetPaths = [...new Set([settings.workspacePath, ...extractTargetPaths(submittedPrompt)])];
  const decision = await evaluateAndAnnouncePolicy(
    runId,
    settings,
    submittedPrompt,
    getActionKindForAdapter(providerKind, settings),
    approval,
    targetPaths
  );

  emitRunProgress(runId, "thinking", "submitting", `Prompt ready. Preparing ${getProviderFlowLabel(providerKind)}...`, {
    transcript: userRequest,
    submittedPrompt
  });

  if (decision.status !== "safe-to-run" && providerKind !== "mock") {
    throw buildPolicyEnforcementError(decision);
  }

  const adapter =
    providerKind === "mock"
      ? createMockAdapter()
      : providerKind === "desktop-codex-primary"
        ? createPrimaryDesktopAdapter()
        : createDirectBackendAdapter(decision);

  if (adapter.kind !== "desktop-codex-primary" && adapter.kind !== "mock") {
    await appendDiagnosticLog(
      `submit-pipeline desktop-submit-skipped runId=${runId} executionMode=${settings.executionMode} codexProvider=${settings.codexProvider} adapter=${adapter.kind}`
    );
  }

  emitRunProgress(runId, "thinking", "running", `${getProviderFlowLabel(adapter.kind)} is working on your request...`);

  const timeoutMs = adapter.kind === "desktop-codex-primary" ? LEGACY_DESKTOP_TIMEOUT_MS : DIRECT_BACKEND_TIMEOUT_MS;

  return retryProvider(
    () =>
      withTimeout(
        adapter.execute({
          settings,
          runId,
          transcript: userRequest,
          policyDecision: decision,
          log: appendDiagnosticLog,
          submitPrompt: (message) =>
            emitRunProgress(runId, "thinking", "running", message, {
              transcript: userRequest,
              submittedPrompt
            })
        }),
        timeoutMs,
        `${getProviderFlowLabel(adapter.kind)}`
      ),
    adapter.kind === "desktop-codex-primary" ? 0 : DIRECT_BACKEND_RETRIES,
    async (attempt, error) => {
      await appendDiagnosticLog(`provider-retry kind=${adapter.kind} attempt=${attempt} error=${error.message}`);
      emitRunProgress(runId, "thinking", "running", `${getProviderFlowLabel(adapter.kind)} hit a partial failure. Retrying...`, {
        transcript: userRequest,
        submittedPrompt
      });
    }
  );
}

function buildFallbackSummary(
  userRequest: string,
  rawCodexOutput: string
): EngineeringSummary {
  const shortRequest = toSingleLine(userRequest, "your request");
  const shortOutput = toSingleLine(rawCodexOutput, "Codex completed work but returned a thin summary.").slice(0, 280);

  return {
    plainEnglishSummary: `Codex worked on ${shortRequest} and produced a result, but the automatic recap needed a fallback.`,
    technicalSummary: shortOutput,
    whatCodexDid: shortOutput,
    problemOccurred: "The structured recap was incomplete, so the app fell back to a local engineering summary.",
    howItWasFixed: "The app filled the missing journal fields locally so the run could still be logged.",
    blockers: "The summary formatter returned incomplete data, so the app filled in a safe fallback summary.",
    rememberNextTime: "When the summary is incomplete, keep the run moving by filling missing fields locally instead of failing the whole workflow.",
    nextSteps: `Review the result for ${shortRequest} and continue from the latest completed step.`,
    filesChanged: extractFilesChanged(rawCodexOutput),
    commandsRun: extractCommandsRun(rawCodexOutput),
    fixDiagramSpec: buildEngineeringDiagramSpec(shortRequest, shortOutput, "Fallback summary path was used.", "Local fallback fields were generated.", `Review the result for ${shortRequest}.`),
    fixDiagramSource: "mermaid"
  };
}

async function summarizeRun(
  userRequest: string,
  rawCodexOutput: string,
  settings: AppSettings,
  providerKind: CodexAdapterKind,
  partialCapture = false
): Promise<EngineeringSummary> {
  if (providerKind === "mock") {
    return {
      plainEnglishSummary: "The app ran a full fake Codex cycle so the avatar, voice, and journal flow could be tested safely.",
      technicalSummary: "Mock mode bypassed live Codex execution and created a structured result locally.",
      whatCodexDid: "Created a simulated Codex run so the avatar and engineering log flow could be tested safely.",
      problemOccurred: "No live problem occurred because this was a mock run.",
      howItWasFixed: "No fix was needed in mock mode.",
      blockers: "No live blocker. This was a dry run for UI validation.",
      rememberNextTime: "Mock mode is only for interface testing. Switch providers for real work.",
      nextSteps: "Try the real Codex provider or refine the avatar and voice settings.",
      filesChanged: [],
      commandsRun: [],
      fixDiagramSpec: buildEngineeringDiagramSpec(
        userRequest,
        "Simulated the run locally.",
        "No live issue occurred.",
        "No fix was needed.",
        "Switch back to a live provider when ready."
      ),
      fixDiagramSource: "mermaid"
    };
  }

  if (providerKind === "desktop-codex-primary") {
    const normalizedOutput = normalizeCapturedCodexText(rawCodexOutput);
    const fallback = buildFallbackSummary(userRequest, normalizedOutput);
    const plainEnglishSummary = partialCapture
      ? `Partial Codex capture: ${normalizedOutput || fallback.plainEnglishSummary}`
      : normalizedOutput || fallback.plainEnglishSummary;
    return {
      plainEnglishSummary,
      technicalSummary: toSingleLine(normalizedOutput, fallback.technicalSummary),
      whatCodexDid: toSingleLine(normalizedOutput, fallback.whatCodexDid),
      problemOccurred: partialCapture
        ? "The live Codex desktop reply was only partially captured before the helper could verify a fully stable result."
        : "No explicit problem was recorded beyond anything described in the captured Codex reply.",
      howItWasFixed: partialCapture
        ? "The app preserved the partial reply instead of discarding it, so the current result could still be spoken and logged."
        : "No separate fix note was extracted beyond the live Codex response.",
      blockers: partialCapture
        ? "The live Codex desktop capture path returned only a partial result."
        : "No blocker was detected in the live Codex desktop capture path.",
      rememberNextTime: partialCapture
        ? "If the desktop capture is partial, keep the visible Codex window stable long enough for the helper to confirm the final reply."
        : "This run depended on the visible Codex desktop window, so keep that window stable and focused while the avatar works.",
      nextSteps: partialCapture ? "Review the partial reply in Codex and ask again if you need the missing detail." : "Ask the next request when you are ready.",
      filesChanged: extractFilesChanged(normalizedOutput),
      commandsRun: extractCommandsRun(normalizedOutput),
      fixDiagramSpec: buildEngineeringDiagramSpec(
        userRequest,
        normalizedOutput || fallback.whatCodexDid,
        partialCapture ? "The live desktop capture was partial." : "No explicit problem extracted from the live desktop capture.",
        partialCapture ? "The app preserved the partial reply for speech and logging." : "No separate fix note extracted from the live desktop capture.",
        partialCapture ? "Review the partial reply in Codex and ask again if needed." : "Ask the next request when you are ready."
      ),
      fixDiagramSource: "mermaid"
    };
  }

  const fallback = buildFallbackSummary(userRequest, rawCodexOutput);
  const response = await openAiJson<{ output_text?: string }>(
    {
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "Return valid JSON only with keys: plainEnglishSummary, technicalSummary, whatCodexDid, problemOccurred, howItWasFixed, blockers, rememberNextTime, nextSteps, fixDiagramSpec, fixDiagramSource. Every key must be present and every value must be a non-empty string. Keep the values concise and useful for a fast engineering log."
        },
        {
          role: "user",
          content: `User request:\n${userRequest}\n\nCodex output:\n${rawCodexOutput}`
        }
      ]
    },
    settings
  );

  try {
    const parsed = SUMMARY_SCHEMA.parse(JSON.parse(response.output_text ?? "{}"));
    return {
      plainEnglishSummary: toSingleLine(parsed.plainEnglishSummary, fallback.plainEnglishSummary),
      technicalSummary: toSingleLine(parsed.technicalSummary, fallback.technicalSummary),
      whatCodexDid: toSingleLine(parsed.whatCodexDid, fallback.whatCodexDid),
      problemOccurred: toSingleLine(parsed.problemOccurred, fallback.problemOccurred),
      howItWasFixed: toSingleLine(parsed.howItWasFixed, fallback.howItWasFixed),
      blockers: toSingleLine(parsed.blockers, fallback.blockers),
      rememberNextTime: toSingleLine(parsed.rememberNextTime, fallback.rememberNextTime),
      nextSteps: toSingleLine(parsed.nextSteps, fallback.nextSteps),
      fixDiagramSpec: toSingleLine(parsed.fixDiagramSpec, fallback.fixDiagramSpec),
      filesChanged: extractFilesChanged(rawCodexOutput),
      commandsRun: extractCommandsRun(rawCodexOutput),
      fixDiagramSource: toSingleLine(parsed.fixDiagramSource, fallback.fixDiagramSource)
    };
  } catch {
    return fallback;
  }
}

async function synthesizeSpeech(text: string, voice: string, settings: AppSettings): Promise<Buffer | null> {
  if (settings.codexProvider === "mock") {
    return null;
  }

  const apiKey = await getResolvedApiKey(settings);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format: "mp3"
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function saveJournalEntry(report: RunReport, audioBytes: Buffer | null, settings: AppSettings): Promise<RunArtifacts> {
  const entryId = `${report.timestamp.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const entryDir = path.join(settings.journalOutputFolder, "entries", entryId);
  await ensureDir(entryDir);

  const audioPath = audioBytes ? path.join(entryDir, "summary.mp3") : null;
  const jsonPath = path.join(entryDir, "entry.json");
  const fixDiagramOutputPath = path.join(entryDir, "fix-diagram.svg");
  if (audioBytes && audioPath) {
    await writeFile(audioPath, audioBytes);
  }
  try {
    const svg = buildFixDiagramSvg(report.fixDiagramSpec);
    await writeFile(fixDiagramOutputPath, svg, "utf8");
    report.fixDiagramOutputPath = fixDiagramOutputPath;
  } catch {
    report.fixDiagramOutputPath = null;
  }
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const journalBookPath = await buildEngineeringLogDocx(settings.journalOutputFolder);

  return {
    entryId,
    journalBookPath,
    entryJsonPath: jsonPath,
    fixDiagramOutputPath: report.fixDiagramOutputPath,
    speechAudioPath: audioPath
  };
}

async function readWakePid() {
  try {
    const value = (await readFile(WAKE_PID_PATH, "utf8")).trim();
    return Number.parseInt(value, 10);
  } catch {
    return null;
  }
}

async function stopWakeHelper() {
  if (wakeHelperProcess && !wakeHelperProcess.killed) {
    wakeHelperProcess.kill();
  }
  wakeHelperProcess = null;
  await rm(WAKE_PID_PATH, { force: true }).catch(() => undefined);
  emit({ kind: "wake-status", state: "stopped", message: "Wake listener stopped." });
}

async function startWakeHelper(settings: AppSettings) {
  if (!(await pathExists(WAKE_HELPER_PATH))) {
    emit({ kind: "wake-status", state: "error", message: "Wake listener script is missing." });
    return;
  }

  await stopWakeHelper();
  const phrase = settings.wake.phrase.trim();
  if (!phrase) {
    emit({ kind: "wake-status", state: "error", message: "Wake listening is enabled, but no wake phrase is configured." });
    return;
  }

  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WAKE_HELPER_PATH, "-WakePhrase", phrase];
  const child = spawn("powershell.exe", args, {
    stdio: ["ignore", "pipe", "pipe"]
  });
  wakeHelperProcess = child;
  let stdoutBuffer = "";

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const payload = JSON.parse(trimmed) as { state?: string; message?: string; transcript?: string };
        if (!payload.state || !payload.message) {
          continue;
        }
        void appendDiagnosticLog(`wake-helper-event state=${payload.state} message=${payload.message}`);
        emit({
          kind: "wake-status",
          state: payload.state as "running" | "stopped" | "heard" | "command-listening" | "command-captured" | "timeout" | "error",
          message: payload.message,
          transcript: payload.transcript
        });
      } catch {
        void appendDiagnosticLog(`wake-helper-nonjson ${trimmed}`);
      }
    }
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    void appendDiagnosticLog(`wake-helper-stderr ${chunk.trim()}`);
  });

  child.on("exit", (code, signal) => {
    wakeHelperProcess = null;
    void appendDiagnosticLog(`wake-helper-exit code=${code ?? "null"} signal=${signal ?? "null"}`);
  });
}

async function syncWakeHelper(settings: AppSettings) {
  if (!settings.wake.enabled) {
    await stopWakeHelper();
    return;
  }

  await startWakeHelper(settings);
}

function buildSpokenSummary(report: Pick<RunReport, "plainEnglishSummary" | "nextSteps">) {
  return [report.plainEnglishSummary, report.nextSteps].filter(Boolean).join(" ").trim();
}

async function startRun(payload: StartRunPayload): Promise<RunCompletion> {
  const runId = randomUUID();
  const settings = await getSettings();
  const startedAt = new Date();

  emitRunProgress(runId, "thinking", "transcribing", "Transcribing your request...");
  const transcript = await transcribeAudio(payload, settings, runId);
  await appendDiagnosticLog(`submit-pipeline transcription-complete runId=${runId} chars=${transcript.trim().length}`);

  const providerResult = await executeProvider(transcript, settings, runId, payload.executionApproval);

  emitRunProgress(runId, "thinking", "summarizing", "Normalizing the Codex result...", {
    transcript,
    submittedPrompt: providerResult.submittedPrompt
  });
  const normalizedResult = normalizeProviderResult(
    providerResult,
    await summarizeRun(
      transcript,
      providerResult.rawCodexOutput,
      settings,
      providerResult.providerKind,
      Boolean(providerResult.desktopAutomationReport?.partialCapture)
    )
  );

  const baseReport: Omit<RunReport, "timestamp"> = {
    startedAt: startedAt.toISOString(),
    completedAt: "",
    durationMs: 0,
    status: providerResult.desktopAutomationReport?.partialCapture ? "partial" : "completed",
    projectWorkspace: settings.workspacePath,
    userRequest: transcript,
    transcript,
    submittedPrompt: normalizedResult.submittedPrompt,
    codexProvider: settings.codexProvider,
    executionMode: settings.executionMode,
    rawCodexOutput: normalizeCapturedCodexText(normalizedResult.rawCodexOutput),
    spokenSummary: "",
    plainEnglishSummary: normalizedResult.plainEnglishSummary,
    technicalSummary: normalizedResult.technicalSummary,
    whatCodexDid: normalizedResult.whatCodexDid,
    problemOccurred: normalizedResult.problemOccurred,
    howItWasFixed: normalizedResult.howItWasFixed,
    blockers: normalizedResult.blockers,
    rememberNextTime: normalizedResult.rememberNextTime,
    nextSteps: normalizedResult.nextSteps,
    filesChanged: normalizedResult.filesChanged,
    commandsRun: normalizedResult.commandsRun,
    fixDiagramSpec: normalizedResult.fixDiagramSpec,
    fixDiagramSource: normalizedResult.fixDiagramSource,
    fixDiagramOutputPath: null
  };
  const completedAt = new Date();
  const report: RunReport = {
    ...baseReport,
    timestamp: completedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    spokenSummary: buildSpokenSummary(baseReport)
  };

  emitRunProgress(
    runId,
    "thinking",
    "speaking",
    report.status === "partial" ? "Turning the partially captured Codex reply into voice..." : "Turning the finished Codex reply into voice..."
  );
  const speechBytes = await synthesizeSpeech(report.spokenSummary, settings.selectedVoice, settings);

  emitRunProgress(runId, "thinking", "journaling", "Saving the engineering log in the background...");
  fireAndForget(
    (async () => {
      await saveJournalEntry(report, speechBytes, settings);
      emitRunProgress(runId, "idle", "complete", "Engineering log entry finished.");
    })(),
    { surfaceError: false }
  );

  emitRunProgress(runId, "speaking", "speaking", report.spokenSummary, {
    transcript,
    submittedPrompt: report.submittedPrompt
  });

  return {
    report,
    artifacts: null,
    journalPending: true,
    audioBase64: speechBytes ? speechBytes.toString("base64") : null,
    audioMimeType: speechBytes ? "audio/mpeg" : null,
    desktopAutomationReport: providerResult.desktopAutomationReport ?? null
  };
}

process.on("message", async (message: BackendCallMessage) => {
  try {
    let result: unknown;
    if (message.method === "bootstrap:get") {
      result = await getBootstrapData();
    } else if (message.method === "settings:save") {
      if (message.payload) {
        await saveSettings(SETTINGS_SCHEMA.parse(message.payload));
      }
      result = await getBootstrapData();
    } else if (message.method === "settings:saveApiKey") {
      await saveApiKey(String(message.payload ?? ""));
      result = await getBootstrapData();
    } else if (message.method === "run:start") {
      result = await startRun(message.payload as StartRunPayload);
    } else {
      throw new Error(`Unsupported method: ${message.method}`);
    }

    sendToParent({ id: message.id, ok: true, result } satisfies BackendReplyMessage);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Unknown backend failure.";
    await appendDiagnosticLog(`backend-request-error ${text}`);
    emit({ kind: "wake-status", state: "error", message: text });
    sendToParent({ id: message.id, ok: false, error: text } satisfies BackendReplyMessage);
  }
});

process.on("exit", () => {
  if (wakeHelperProcess && !wakeHelperProcess.killed) {
    wakeHelperProcess.kill();
  }
});
