import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PNG } from "pngjs";
import type {
  AppSettings,
  BackendCallMessage,
  BackendEvent,
  BackendReplyMessage,
  BootstrapData,
  CharacterOption,
  ModelOption,
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
import { buildJournalPdf } from "./journalBook";

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
const DESKTOP_HELPER_PATH = path.join(APP_ROOT, "automation", "submit_to_codex_window.py");
const WAKE_HELPER_PATH = path.join(APP_ROOT, "automation", "wake_helper.ps1");
const CHARACTER_METADATA_PATH = path.join(DEFAULT_CHARACTER_DIR, "display-metadata.json");
const LEGACY_SETTINGS_PATH = path.join(LEGACY_USER_DATA, "state", "settings.json");
const LEGACY_SECRETS_PATH = path.join(LEGACY_USER_DATA, "state", "secrets.json");

const WAKE_SCHEMA = z.object({
  enabled: z.boolean(),
  phrase: z.string(),
  bluetoothDeviceName: z.string(),
  avatarExecutablePath: z.string()
});

const SETTINGS_SCHEMA = z.object({
  codexProvider: z.enum(["mock", "openai-codex", "codex-cli"]),
  executionMode: z.enum(["backend-session", "desktop-fallback"]),
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
  blockers: z.string().optional(),
  rememberNextTime: z.string().optional(),
  nextSteps: z.string().optional(),
  memePrompt: z.string().optional()
});

const defaultWakeSettings: WakeSettings = {
  enabled: false,
  phrase: "wake up codex avatar",
  bluetoothDeviceName: "soundcore P30i",
  avatarExecutablePath: DEFAULT_WAKE_HELPER_PATH
};

function emit(event: BackendEvent) {
  process.send?.({ event });
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

function fireAndForget(task: Promise<unknown>) {
  void task.catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await appendDiagnosticLog(`background-task-error ${message}`);
    emit({ kind: "wake-status", state: "error", message });
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
    codexProvider: "codex-cli",
    executionMode: "backend-session",
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
    wake: defaultWakeSettings
  };
}

function migrateSettings(value: unknown): AppSettings {
  const candidate = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const merged = {
    ...getDefaultSettings(),
    ...candidate,
    wake: {
      ...defaultWakeSettings,
      ...(typeof candidate.wake === "object" && candidate.wake ? (candidate.wake as Record<string, unknown>) : {})
    }
  };

  if (typeof merged.codexCliPath !== "string" || !merged.codexCliPath.trim()) {
    merged.codexCliPath = VENDORED_CODEX_PATH;
  }

  return SETTINGS_SCHEMA.parse(merged);
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
  const normalized = migrateSettings(settings);
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
    await appendDiagnosticLog(`api-key-source=stored suffix=${secrets.openAiApiKey.slice(-4)} useStored=${settings.useStoredApiKey}`);
    return secrets.openAiApiKey;
  }

  if (process.env.OPENAI_API_KEY) {
    await appendDiagnosticLog(`api-key-source=env suffix=${process.env.OPENAI_API_KEY.slice(-4)} useStored=${settings.useStoredApiKey}`);
    return process.env.OPENAI_API_KEY;
  }

  if (secrets.openAiApiKey) {
    await appendDiagnosticLog(`api-key-source=stored-fallback suffix=${secrets.openAiApiKey.slice(-4)} useStored=${settings.useStoredApiKey}`);
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
      return {
        id: entry.name,
        label: entry.name.replace(/\.(vrm|fbx|png|jpe?g|webp)$/i, kind === "image" ? " (fallback image)" : ""),
        kind,
        absolutePath,
        fileUrl: pathToFileURL(absolutePath).href,
        fallbackOnly: kind === "image",
        displaySettings: displayMetadata[entry.name]
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
  const targetPath = path.join(journalOutputFolder, "Codex-Avatar-Storybook.pdf");
  return (await pathExists(targetPath)) ? targetPath : null;
}

async function getBootstrapData(): Promise<BootstrapData> {
  const settings = await getSettings();
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
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes], { type: payload.mimeType }), "mic.webm");

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

function resolveCodexCliPath(settings: AppSettings) {
  return settings.codexCliPath?.trim() || VENDORED_CODEX_PATH;
}

async function runCodexCliSession(userRequest: string, settings: AppSettings): Promise<string> {
  const codexPath = resolveCodexCliPath(settings);
  const outputPath = path.join(STATE_DIR, `codex-last-message-${randomUUID()}.txt`);
  const systemPrompt = [
    "You are the backend-owned Codex session for Codex Avatar.",
    "Do the user's software work in the provided workspace if needed.",
    "At the end, produce a concise but useful final response in plain language first, then technical detail."
  ].join(" ");

  try {
    await runCommand(
      codexPath,
      [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
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
          content: "You are Codex Avatar's backend-owned Codex session. Solve the user's software request and produce a useful final answer."
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

async function submitToLiveCodexDesktop(userRequest: string, cwd: string): Promise<string> {
  const stdout = await runCommand("python", [DESKTOP_HELPER_PATH, userRequest], cwd);
  try {
    const parsed = JSON.parse(stdout) as { reply?: string };
    return parsed.reply?.trim() ?? "";
  } catch {
    return stdout.trim();
  }
}

async function runCodex(userRequest: string, settings: AppSettings, runId: string): Promise<{ rawCodexOutput: string; submittedPrompt: string }> {
  const submittedPrompt = userRequest.trim();
  emitRunProgress(runId, "thinking", "submitting", "Submitted to Codex.", {
    transcript: userRequest,
    submittedPrompt
  });

  if (settings.codexProvider === "mock") {
    const mockOutput = [
      `User request: ${submittedPrompt}`,
      "Work completed: mock mode stitched together a believable app run for UI testing.",
      "Technical notes: no real Codex execution occurred in mock mode."
    ].join("\n");
    return { rawCodexOutput: mockOutput, submittedPrompt };
  }

  emitRunProgress(runId, "thinking", "running", "Running Codex in the backend...");

  let rawCodexOutput = "";
  if (settings.codexProvider === "openai-codex") {
    await appendDiagnosticLog("provider=openai-codex route=desktop-submit");
    emitRunProgress(runId, "thinking", "running", "Sending the request to the local Codex desktop window...");
    rawCodexOutput = await submitToLiveCodexDesktop(submittedPrompt, settings.workspacePath);
  } else if (settings.executionMode === "desktop-fallback") {
    await appendDiagnosticLog("execution-mode=desktop-fallback");
    rawCodexOutput = await submitToLiveCodexDesktop(submittedPrompt, settings.workspacePath);
  } else if (settings.codexProvider === "codex-cli") {
    await appendDiagnosticLog("execution-mode=backend-session provider=codex-cli");
    rawCodexOutput = await runCodexCliSession(submittedPrompt, settings);
  } else {
    await appendDiagnosticLog("execution-mode=backend-session provider=openai-codex");
    rawCodexOutput = await runOpenAiCodex(submittedPrompt, settings);
    if (!rawCodexOutput.trim()) {
      await appendDiagnosticLog("backend-session returned empty output, retrying desktop fallback");
      emitRunProgress(runId, "thinking", "running", "Retrying through the live Codex desktop window...");
      rawCodexOutput = await submitToLiveCodexDesktop(submittedPrompt, settings.workspacePath);
    }
  }

  return {
    rawCodexOutput: rawCodexOutput.trim(),
    submittedPrompt
  };
}

function buildFallbackSummary(userRequest: string, rawCodexOutput: string): Omit<RunReport, "timestamp" | "projectWorkspace" | "userRequest" | "transcript" | "submittedPrompt" | "codexProvider" | "executionMode" | "rawCodexOutput" | "spokenSummary"> {
  const shortRequest = toSingleLine(userRequest, "your request");
  const shortOutput = toSingleLine(rawCodexOutput, "Codex completed work but returned a thin summary.").slice(0, 280);

  return {
    plainEnglishSummary: `Codex worked on ${shortRequest} and produced a result, but the automatic recap needed a fallback.`,
    technicalSummary: shortOutput,
    blockers: "The summary formatter returned incomplete data, so the app filled in a safe fallback summary.",
    rememberNextTime: "When the summary is incomplete, keep the run moving by filling missing fields locally instead of failing the whole workflow.",
    nextSteps: `Review the result for ${shortRequest} and continue from the latest completed step.`,
    memePrompt: `Funny cinematic scene of Kas and Codex finishing a software task about ${shortRequest}, command center mood, clear visual storytelling, no text.`
  };
}

async function summarizeRun(userRequest: string, rawCodexOutput: string, settings: AppSettings): Promise<Omit<RunReport, "timestamp" | "projectWorkspace" | "userRequest" | "transcript" | "submittedPrompt" | "codexProvider" | "executionMode" | "rawCodexOutput" | "spokenSummary">> {
  if (settings.codexProvider === "mock") {
    return {
      plainEnglishSummary: "The app ran a full fake Codex cycle so the avatar, voice, and journal flow could be tested safely.",
      technicalSummary: "Mock mode bypassed live Codex execution and created a structured result locally.",
      blockers: "No live blocker. This was a dry run for UI validation.",
      rememberNextTime: "Mock mode is only for interface testing. Switch providers for real work.",
      nextSteps: "Try the real Codex provider or refine the avatar and voice settings.",
      memePrompt: "Kas and Codex celebrating a successful fake test run in a transparent desktop command center, funny cinematic energy."
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
            "Return valid JSON only with keys: plainEnglishSummary, technicalSummary, blockers, rememberNextTime, nextSteps, memePrompt. Every key must be present and every value must be a non-empty string. The layman summary should be easy to speak aloud."
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
      blockers: toSingleLine(parsed.blockers, fallback.blockers),
      rememberNextTime: toSingleLine(parsed.rememberNextTime, fallback.rememberNextTime),
      nextSteps: toSingleLine(parsed.nextSteps, fallback.nextSteps),
      memePrompt: toSingleLine(parsed.memePrompt, fallback.memePrompt)
    };
  } catch {
    return fallback;
  }
}

function createMockPng(): Buffer {
  const png = new PNG({ width: 960, height: 540 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 34;
      png.data[idx + 1] = Math.floor(90 + (x / png.width) * 120);
      png.data[idx + 2] = Math.floor(120 + (y / png.height) * 90);
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function generateMeme(memePrompt: string, settings: AppSettings): Promise<Buffer> {
  if (settings.codexProvider === "mock") {
    return createMockPng();
  }

  const safePrompt = toSingleLine(
    memePrompt,
    "Funny cinematic scene of Kas and Codex completing a software task together, command center mood, no text."
  );

  const apiKey = await getResolvedApiKey(settings);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: safePrompt,
      size: "1536x1024",
      quality: "high",
      output_format: "png"
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Image generation did not return image data.");
  }
  return Buffer.from(b64, "base64");
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

async function saveJournalEntry(report: RunReport, memeBytes: Buffer, audioBytes: Buffer | null, settings: AppSettings): Promise<RunArtifacts> {
  const entryId = `${report.timestamp.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const entryDir = path.join(settings.journalOutputFolder, "entries", entryId);
  await ensureDir(entryDir);

  const memePath = path.join(entryDir, "meme.png");
  const audioPath = audioBytes ? path.join(entryDir, "summary.mp3") : null;
  const jsonPath = path.join(entryDir, "entry.json");
  await writeFile(memePath, memeBytes);
  if (audioBytes && audioPath) {
    await writeFile(audioPath, audioBytes);
  }
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const journalBookPath = await buildJournalPdf(settings.journalOutputFolder);

  return {
    entryId,
    journalBookPath,
    entryJsonPath: jsonPath,
    memeImagePath: memePath,
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
  const pid = await readWakePid();
  if (!pid || Number.isNaN(pid)) {
    await rm(WAKE_PID_PATH, { force: true }).catch(() => undefined);
    return;
  }

  try {
    process.kill(pid);
  } catch {
    // Ignore stale pid failures.
  }

  await rm(WAKE_PID_PATH, { force: true }).catch(() => undefined);
  emit({ kind: "wake-status", state: "stopped", message: "Wake helper stopped." });
}

async function startWakeHelper(settings: AppSettings) {
  if (!(await pathExists(WAKE_HELPER_PATH))) {
    emit({ kind: "wake-status", state: "error", message: "Wake helper script is missing." });
    return;
  }

  await stopWakeHelper();
  await ensureDir(LOG_DIR);

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-File",
    WAKE_HELPER_PATH,
    "-PidFile",
    WAKE_PID_PATH,
    "-LogFile",
    path.join(LOG_DIR, "wake-helper.log"),
    "-DeviceName",
    settings.wake.bluetoothDeviceName,
    "-WakePhrase",
    settings.wake.phrase,
    "-AvatarPath",
    settings.wake.avatarExecutablePath
  ];

  const child = spawn("powershell.exe", args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  emit({ kind: "wake-status", state: "running", message: "Wake helper is running." });
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

  emitRunProgress(runId, "thinking", "transcribing", "Transcribing your request...");
  const transcript = await transcribeAudio(payload, settings, runId);

  const { rawCodexOutput, submittedPrompt } = await runCodex(transcript, settings, runId);

  emitRunProgress(runId, "thinking", "summarizing", "Summarizing the result...", {
    transcript,
    submittedPrompt
  });
  const summary = await summarizeRun(transcript, rawCodexOutput, settings);

  const baseReport: Omit<RunReport, "timestamp"> = {
    projectWorkspace: settings.workspacePath,
    userRequest: transcript,
    transcript,
    submittedPrompt,
    codexProvider: settings.codexProvider,
    executionMode: settings.executionMode,
    rawCodexOutput: normalizeCapturedCodexText(rawCodexOutput),
    spokenSummary: "",
    ...summary
  };
  const report: RunReport = {
    ...baseReport,
    timestamp: new Date().toISOString(),
    spokenSummary: buildSpokenSummary(baseReport)
  };

  emitRunProgress(runId, "thinking", "speaking", "Preparing the voice response...");
  const speechBytes = await synthesizeSpeech(report.spokenSummary, settings.selectedVoice, settings);

  emitRunProgress(runId, "thinking", "journaling", "Finishing the journal and image in the background...");
  fireAndForget(
    (async () => {
      const memeBytes = await generateMeme(report.memePrompt, settings);
      await saveJournalEntry(report, memeBytes, speechBytes, settings);
      emitRunProgress(runId, "idle", "complete", "Journal entry finished.");
    })()
  );

  emitRunProgress(runId, "speaking", "speaking", report.spokenSummary, {
    transcript,
    submittedPrompt
  });

  return {
    report,
    artifacts: null,
    journalPending: true,
    audioBase64: speechBytes ? speechBytes.toString("base64") : null,
    audioMimeType: speechBytes ? "audio/mpeg" : null
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

    process.send?.({ id: message.id, ok: true, result } satisfies BackendReplyMessage);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Unknown backend failure.";
    emit({ kind: "wake-status", state: "error", message: text });
    process.send?.({ id: message.id, ok: false, error: text } satisfies BackendReplyMessage);
  }
});
