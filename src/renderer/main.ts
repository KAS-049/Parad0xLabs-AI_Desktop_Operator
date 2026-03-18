import type {
  AppSettings,
  BackendEvent,
  BootstrapData,
  CodexExecutionMode,
  CodexProvider,
  ExecutionPolicyConfig,
  RunCompletion
} from "../shared/contracts";
import { AvatarScene } from "./avatar/AvatarScene";

declare global {
  interface Window {
    codexAvatar: import("../shared/contracts").CodexAvatarApi;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

const shell = document.getElementById("shell") as HTMLDivElement;
const stateBadge = document.getElementById("stateBadge") as HTMLDivElement;
const subtitleBubble = document.getElementById("subtitleBubble") as HTMLDivElement;
const settingsPanel = document.getElementById("settingsPanel") as HTMLDivElement;
const consolePanel = document.getElementById("consolePanel") as HTMLDivElement;
const settingsToggle = document.getElementById("settingsToggle") as HTMLButtonElement;
const collapseButton = document.getElementById("collapseButton") as HTMLButtonElement;
const closeButton = document.getElementById("closeButton") as HTMLButtonElement;
const minimizeButton = document.getElementById("minimizeButton") as HTMLButtonElement;
const avatarStage = document.getElementById("avatarStage") as HTMLButtonElement;
const avatarStatus = document.getElementById("avatarStatus") as HTMLDivElement;
const micButton = document.getElementById("micButton") as HTMLButtonElement;
const quickSpeak = document.getElementById("quickSpeak") as HTMLButtonElement;
const quickType = document.getElementById("quickType") as HTMLButtonElement;
const quickJournal = document.getElementById("quickJournal") as HTMLButtonElement;
const quickSettings = document.getElementById("quickSettings") as HTMLButtonElement;
const typedPrompt = document.getElementById("typedPrompt") as HTMLTextAreaElement;
const requestPreview = document.getElementById("requestPreview") as HTMLDivElement;
const codexPreview = document.getElementById("codexPreview") as HTMLDivElement;
const policyPreview = document.getElementById("policyPreview") as HTMLDivElement;
const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement;
const executionModeSelect = document.getElementById("executionModeSelect") as HTMLSelectElement;
const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
const characterSelect = document.getElementById("characterSelect") as HTMLSelectElement;
const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
const micSelect = document.getElementById("micSelect") as HTMLSelectElement;
const workspacePath = document.getElementById("workspacePath") as HTMLInputElement;
const journalPath = document.getElementById("journalPath") as HTMLInputElement;
const characterPath = document.getElementById("characterPath") as HTMLInputElement;
const codexCliPath = document.getElementById("codexCliPath") as HTMLInputElement;
const wakeEnabled = document.getElementById("wakeEnabled") as HTMLInputElement;
const wakePhrase = document.getElementById("wakePhrase") as HTMLInputElement;
const wakeBluetoothDeviceName = document.getElementById("wakeBluetoothDeviceName") as HTMLInputElement;
const avatarExecutablePath = document.getElementById("avatarExecutablePath") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const useStoredApiKey = document.getElementById("useStoredApiKey") as HTMLInputElement;
const secretStatus = document.getElementById("secretStatus") as HTMLDivElement;
const subtitleToggle = document.getElementById("subtitleToggle") as HTMLInputElement;
const saveSettingsButton = document.getElementById("saveSettings") as HTMLButtonElement;

const avatarScene = new AvatarScene(document.getElementById("avatarMount") as HTMLDivElement);
const audio = new Audio();
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let bootstrap: BootstrapData;
let latestSubmittedPrompt = "";
let latestExecutionPolicy: ExecutionPolicyConfig | null = null;
let windowMode: "compact" | "expanded" = "compact";
let dragState:
  | {
      pointerId: number;
      startPointerX: number;
      startPointerY: number;
      startWindowX: number;
      startWindowY: number;
      moved: boolean;
    }
  | null = null;
let wakeRecognition: SpeechRecognitionLike | null = null;
let wakeCommandRecognition: SpeechRecognitionLike | null = null;
let wakeListenerEnabled = false;
let wakeListenerShouldRun = false;
let wakeCommandActive = false;
let wakeCooldownUntil = 0;
let wakeCommandTimeoutHandle: number | null = null;
let wakeFollowupStopHandle: number | null = null;
let activeRunCount = 0;
let wakeLoopReturnPending = false;
let useTypedPromptFallback = true;
let wakeVoiceMonitorStop: (() => void) | null = null;

const setupStorageKey = "codex-avatar-setup-complete";
const dragThreshold = 8;
const compactOpenAnimationMs = 190;
const wakeCooldownMs = 8000;
const wakeCommandTimeoutMs = 6000;
const wakeRestartDelayMs = 900;
const wakeCaptureLeadInMs = 900;
const wakeSilenceStopMs = 3000;
const wakeMaxCaptureMs = 14000;
const wakeVoiceActivityThreshold = 0.025;
const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

function fillSelect<T extends { id: string; label: string }>(element: HTMLSelectElement, items: T[], selected: string | null) {
  element.innerHTML = "";
  if (!items.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Not available yet";
    element.appendChild(option);
    return;
  }

  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selected;
    element.appendChild(option);
  }
}

async function listMicDevices(selected: string | null) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((item) => item.kind === "audioinput");
  fillSelect(
    micSelect,
    mics.map((mic, index) => ({ id: mic.deviceId, label: mic.label || `Microphone ${index + 1}` })),
    selected
  );
}

async function setWindowMode(mode: "compact" | "expanded") {
  windowMode = mode;
  shell.classList.toggle("compact", mode === "compact");
  shell.classList.toggle("expanded", mode === "expanded");
  consolePanel.classList.toggle("hidden", mode === "compact");
  collapseButton.classList.toggle("hidden", mode === "compact");
  avatarStage.title = mode === "compact" ? "Open Console" : "Hide Console";
  avatarScene.setCompactMode(mode === "compact");
  await window.codexAvatar.setWindowMode(mode);
}

async function toggleConsole(force?: "compact" | "expanded") {
  const next = force ?? (windowMode === "compact" ? "expanded" : "compact");
  await setWindowMode(next);
}

async function playCompactOpenAnimation() {
  if (windowMode !== "compact") {
    return;
  }

  shell.classList.remove("opening-console");
  void shell.offsetWidth;
  shell.classList.add("opening-console");
  await new Promise((resolve) => window.setTimeout(resolve, compactOpenAnimationMs));
  shell.classList.remove("opening-console");
}

function setTranscript(text: string) {
  requestPreview.textContent = text.trim() || "Press the microphone and speak.";
}

function renderCodexPreview(statusMessage?: string) {
  const parts: string[] = [];
  if (latestSubmittedPrompt) {
    parts.push(`Prompt: ${latestSubmittedPrompt}`);
  }
  if (statusMessage?.trim()) {
    parts.push(`Status: ${statusMessage.trim()}`);
  }

  codexPreview.textContent = parts.join("\n\n") || "Your live Codex desktop submission will appear here.";
}

function setCodexPreview(text: string) {
  latestSubmittedPrompt = text.trim();
  renderCodexPreview();
}

function setCodexStatus(statusMessage?: string) {
  renderCodexPreview(statusMessage);
}

function setPolicyPreview(message: string, tone: "safe" | "approval" | "blocked" | "neutral" = "neutral") {
  policyPreview.textContent = message;
  policyPreview.dataset.tone = tone;
}

function logWake(message: string) {
  console.info(`[wake] ${message}`);
}

function normalizeWakePhrase(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

function getWakePhrase() {
  return normalizeWakePhrase(wakePhrase.value || bootstrap?.settings.wake.phrase || "");
}

function updateWakeVisualState() {
  const armed = wakeListenerEnabled && !wakeCommandActive && activeRunCount === 0;
  shell.classList.toggle("wake-armed", armed);
}

function clearWakeTimeout() {
  if (wakeCommandTimeoutHandle !== null) {
    window.clearTimeout(wakeCommandTimeoutHandle);
    wakeCommandTimeoutHandle = null;
  }
}

function clearWakeFollowupStop() {
  if (wakeFollowupStopHandle !== null) {
    window.clearTimeout(wakeFollowupStopHandle);
    wakeFollowupStopHandle = null;
  }
}

function stopWakeVoiceMonitor() {
  if (wakeVoiceMonitorStop) {
    wakeVoiceMonitorStop();
    wakeVoiceMonitorStop = null;
  }
  shell.classList.remove("wake-voice-active");
  avatarScene.setMouthOpen(0);
}

function queueWakeListenerRestart() {
  updateWakeVisualState();
}

async function restoreWakeReadyState() {
  updateWakeVisualState();
  if (!wakeEnabled.checked || !wakeListenerEnabled || wakeCommandActive || activeRunCount > 0) {
    return;
  }

  if (wakeLoopReturnPending) {
    wakeLoopReturnPending = false;
    await setWindowMode("compact");
  }

  setState("wake-listening");
  setAvatarStatus(null);
}

function syncExecutionControls() {
  const desktopPrimary = executionModeSelect.value === "desktop-primary";
  providerSelect.disabled = desktopPrimary;
  providerSelect.title = desktopPrimary
    ? "Live Codex desktop companion mode is the primary path and uses the visible Codex app."
    : "Choose the secondary/debug backend provider.";
}

function setState(state: BackendEvent["state"], message?: string) {
  const labels: Record<string, string> = {
    idle: "Idle",
    "wake-listening": "Wake Ready",
    "wake-detected": "Wake Heard",
    "command-listening": "Listening",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    error: "Error"
  };

  stateBadge.textContent = labels[state] ?? (state[0].toUpperCase() + state.slice(1));
  stateBadge.className = `state ${state} no-drag`;

  if (message && subtitleToggle.checked && (state === "speaking" || state === "error" || state === "wake-detected")) {
    subtitleBubble.textContent = message;
    subtitleBubble.classList.remove("hidden");
  } else {
    subtitleBubble.classList.add("hidden");
  }
}

function setAvatarStatus(message: string | null) {
  if (message) {
    avatarStatus.textContent = message;
    avatarStatus.classList.remove("hidden");
  } else {
    avatarStatus.textContent = "";
    avatarStatus.classList.add("hidden");
  }
}

function clearRunErrorUi() {
  setAvatarStatus(null);
  if (!subtitleToggle.checked || subtitleBubble.classList.contains("hidden")) {
    return;
  }

  if (stateBadge.classList.contains("error")) {
    subtitleBubble.classList.add("hidden");
  }
}

async function applySelectedCharacter() {
  const selectedCharacter = bootstrap.characters.find((item) => item.id === characterSelect.value) ?? null;
  shell.classList.toggle("fbx-active", selectedCharacter?.kind === "fbx");
  const result = await avatarScene.loadCharacter(selectedCharacter?.fileUrl ?? null, selectedCharacter?.displaySettings);
  setAvatarStatus(result.ok ? null : result.error);
}

function getSettingsFromForm(): AppSettings {
  const selectedExecutionMode = executionModeSelect.value as CodexExecutionMode;
  const selectedProvider =
    selectedExecutionMode === "desktop-primary"
      ? ("desktop-codex" as CodexProvider)
      : (providerSelect.value as CodexProvider);
  return {
    codexProvider: selectedProvider,
    executionMode: selectedExecutionMode,
    selectedModel: modelSelect.value || "gpt-5.3-codex",
    workspacePath: workspacePath.value,
    journalOutputFolder: journalPath.value,
    characterFolder: characterPath.value,
    selectedCharacterId: characterSelect.value || null,
    selectedVoice: voiceSelect.value,
    selectedMicDeviceId: micSelect.value || null,
    codexCliPath: codexCliPath.value,
    subtitleBubble: subtitleToggle.checked,
    useStoredApiKey: useStoredApiKey.checked,
    executionPolicy: {
      ...(latestExecutionPolicy ?? bootstrap.settings.executionPolicy),
      allowedWorkspaceRoots: [workspacePath.value]
    },
    wake: {
      enabled: wakeEnabled.checked,
      phrase: wakePhrase.value,
      bluetoothDeviceName: wakeBluetoothDeviceName.value,
      avatarExecutablePath: avatarExecutablePath.value
    }
  };
}

async function chooseAndApply(target: HTMLInputElement) {
  const next = await window.codexAvatar.chooseDirectory(target.value || null);
  if (next) {
    target.value = next;
  }
}

async function chooseFileAndApply(target: HTMLInputElement) {
  const next = await window.codexAvatar.chooseFile(target.value || null);
  if (next) {
    target.value = next;
  }
}

async function loadBootstrap() {
  bootstrap = await window.codexAvatar.getBootstrapData();
  fillSelect(
    providerSelect,
    [
      { id: "desktop-codex", label: "Live Codex Desktop App (Primary)" },
      { id: "codex-cli", label: "Direct Backend Codex CLI (Secondary / Debug)" },
      { id: "openai-codex", label: "Direct Backend OpenAI Codex API (Secondary / Debug)" },
      { id: "mock", label: "Mock Mode" }
    ],
    bootstrap.settings.codexProvider
  );
  fillSelect(
    executionModeSelect,
    [
      { id: "desktop-primary", label: "Live Codex Desktop Companion (Primary)" },
      { id: "direct-backend-debug", label: "Direct Backend Session (Secondary / Debug)" }
    ],
    bootstrap.settings.executionMode
  );
  fillSelect(modelSelect, bootstrap.models, bootstrap.settings.selectedModel);
  fillSelect(characterSelect, bootstrap.characters, bootstrap.settings.selectedCharacterId);
  fillSelect(voiceSelect, bootstrap.voices, bootstrap.settings.selectedVoice);

  workspacePath.value = bootstrap.settings.workspacePath;
  journalPath.value = bootstrap.settings.journalOutputFolder;
  characterPath.value = bootstrap.settings.characterFolder;
  codexCliPath.value = bootstrap.settings.codexCliPath;
  wakeEnabled.checked = bootstrap.settings.wake.enabled;
  wakePhrase.value = bootstrap.settings.wake.phrase;
  wakeBluetoothDeviceName.value = bootstrap.settings.wake.bluetoothDeviceName;
  avatarExecutablePath.value = bootstrap.settings.wake.avatarExecutablePath;
  useStoredApiKey.checked = bootstrap.settings.useStoredApiKey;
  subtitleToggle.checked = bootstrap.settings.subtitleBubble;

  secretStatus.textContent = [
    bootstrap.secretStatus.hasEnvironmentApiKey ? "Environment API key detected." : "No environment API key detected.",
    bootstrap.secretStatus.hasStoredApiKey ? "Stored local API key available." : "No stored local API key saved yet.",
    bootstrap.latestJournalBookPath ? "Latest engineering log document is ready." : "No engineering log document has been created yet."
  ].join(" ");
  latestExecutionPolicy = bootstrap.settings.executionPolicy;
  setPolicyPreview("Policy status will appear here.", "neutral");
  syncExecutionControls();

  await listMicDevices(bootstrap.settings.selectedMicDeviceId);
  await applySelectedCharacter();
  wakeListenerShouldRun = wakeEnabled.checked;
  updateWakeVisualState();

  const firstRun = !window.localStorage.getItem(setupStorageKey);
  if (firstRun) {
    settingsPanel.classList.remove("hidden");
    await setWindowMode("expanded");
  } else {
    await setWindowMode("compact");
  }

  refreshWakeListener();
}

async function saveSettings() {
  if (apiKeyInput.value.trim()) {
    bootstrap = await window.codexAvatar.saveApiKey(apiKeyInput.value.trim());
    apiKeyInput.value = "";
  }

  bootstrap = await window.codexAvatar.saveSettings(getSettingsFromForm());
  window.localStorage.setItem(setupStorageKey, "true");
  settingsPanel.classList.add("hidden");
  clearRunErrorUi();
  await loadBootstrap();
  await setWindowMode("compact");
}

async function ensureAudioAnalyser() {
  if (!audioContext) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }
}

function animateLipSync() {
  if (!analyser) {
    return;
  }

  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    if (audio.paused || audio.ended) {
      avatarScene.setMouthOpen(0);
      return;
    }

    analyser!.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    avatarScene.setMouthOpen(Math.min(1, average / 80));
    requestAnimationFrame(tick);
  };
  tick();
}

async function playResult(result: RunCompletion) {
  setTranscript(result.report.transcript);
  setCodexPreview(result.report.submittedPrompt);
  setCodexStatus("Codex finished. Preparing voice playback...");

  if (!result.audioBase64 || !result.audioMimeType) {
    setState("idle", result.report.spokenSummary);
    queueWakeListenerRestart();
    await restoreWakeReadyState();
    return;
  }

  await ensureAudioAnalyser();
  const bytes = Uint8Array.from(atob(result.audioBase64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: result.audioMimeType });
  audio.src = URL.createObjectURL(blob);
  setState("speaking", result.report.spokenSummary);
  await audio.play();
  animateLipSync();

  audio.onended = () => {
    avatarScene.setMouthOpen(0);
    setState("idle");
    queueWakeListenerRestart();
    void restoreWakeReadyState();
  };
}

function triggerWakeAnimation() {
  shell.classList.remove("wake-triggered");
  void shell.offsetWidth;
  shell.classList.add("wake-triggered");
  window.setTimeout(() => shell.classList.remove("wake-triggered"), 460);
}

function buildWakeRecognition() {
  if (!SpeechRecognitionCtor) {
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}

function buildWakeCommandRecognition() {
  if (!SpeechRecognitionCtor) {
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  return recognition;
}

function stopWakeListener(reason = "stopped") {
  if (!wakeRecognition) {
    wakeListenerEnabled = false;
    updateWakeVisualState();
    return;
  }

  logWake(`listener stopping (${reason})`);
  const recognition = wakeRecognition;
  wakeRecognition = null;
  wakeListenerEnabled = false;
  updateWakeVisualState();
  recognition.onstart = null;
  recognition.onend = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.abort();
}

function stopWakeCommandRecognition(reason = "stopped") {
  clearWakeTimeout();
  if (!wakeCommandRecognition) {
    wakeCommandActive = false;
    updateWakeVisualState();
    return;
  }

  logWake(`command capture stopping (${reason})`);
  const recognition = wakeCommandRecognition;
  wakeCommandRecognition = null;
  wakeCommandActive = false;
  updateWakeVisualState();
  recognition.onstart = null;
  recognition.onend = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.abort();
}

async function submitWakeCommand(transcript: string) {
  const command = transcript.trim();
  if (!command) {
    return;
  }

  wakeLoopReturnPending = true;
  clearRunErrorUi();
  setTranscript(command);
  latestSubmittedPrompt = "";
  setCodexStatus("Wake phrase heard. Sending your request to Codex...");
  setPolicyPreview("Waiting for policy review...", "neutral");
  setState("thinking", "Sending your request to Codex...");
  setAvatarStatus(null);
  await setWindowMode("expanded");
  micButton.disabled = true;
  quickSpeak.disabled = true;
  micButton.textContent = "Working...";
  quickSpeak.textContent = "Working...";
  activeRunCount += 1;
  updateWakeVisualState();

  try {
    logWake(`transcription complete (${command.length} chars)`);
    logWake("desktop submit invoked");
    const result = await window.codexAvatar.startRun({
      audioBase64: null,
      mimeType: null,
      typedPrompt: command,
      executionApproval: { granted: false }
    });
    await playResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWake(`failure reason: ${message}`);
    setState("error", message);
    setAvatarStatus(message);
    queueWakeListenerRestart();
  } finally {
    activeRunCount = Math.max(0, activeRunCount - 1);
    updateWakeVisualState();
    void restoreWakeReadyState();
    micButton.disabled = false;
    quickSpeak.disabled = false;
    micButton.textContent = "Hold / Click To Speak";
    quickSpeak.textContent = "Speak Request";
  }
}

function handleWakeCommandTimeout() {
  stopWakeCommandRecognition("timeout");
  setState("idle");
  setAvatarStatus("Wake phrase heard, but no follow-up command was captured.");
  setCodexStatus("Wake command timed out. Say the wake phrase again when you are ready.");
  logWake("command capture timed out");
  queueWakeListenerRestart();
}

function startWakeCommandCapture() {
  if (!SpeechRecognitionCtor) {
    setState("error", "In-app wake listening is not available on this build.");
    setAvatarStatus("In-app wake listening is not available on this build.");
    logWake("speech recognition unavailable");
    return;
  }

  stopWakeCommandRecognition("restart");
  clearWakeTimeout();
  wakeCommandActive = true;
  updateWakeVisualState();
  const recognition = buildWakeCommandRecognition();
  if (!recognition) {
    wakeCommandActive = false;
    updateWakeVisualState();
    return;
  }

  let transcript = "";
  let finished = false;
  wakeCommandRecognition = recognition;
  wakeCommandTimeoutHandle = window.setTimeout(() => {
    if (!finished) {
      handleWakeCommandTimeout();
    }
  }, wakeCommandTimeoutMs);

  recognition.onstart = () => {
    logWake("command capture started");
    setState("command-listening", "Wake phrase heard. Listening for your command.");
    setAvatarStatus("Wake phrase heard. Listening for your command.");
    setCodexStatus("Wake phrase heard. Listening for your command...");
  };

  recognition.onresult = (event) => {
    const parts: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const piece = result?.[0]?.transcript?.trim();
      if (piece) {
        parts.push(piece);
      }
    }

    if (parts.length) {
      transcript = parts.join(" ").trim();
      setTranscript(transcript);
    }
  };

  recognition.onerror = (event) => {
    const message = event.error === "no-speech"
      ? "No follow-up command was heard after the wake phrase."
      : `Wake command capture failed: ${event.error}`;
    finished = true;
    stopWakeCommandRecognition("error");
    setState("error", message);
    setAvatarStatus(message);
    logWake(`command capture failed (${event.error})`);
    queueWakeListenerRestart();
  };

  recognition.onend = () => {
    const captured = transcript.trim();
    stopWakeCommandRecognition("ended");
    if (finished) {
      return;
    }

    if (!captured) {
      handleWakeCommandTimeout();
      return;
    }

    finished = true;
    void submitWakeCommand(captured);
  };

  try {
    recognition.start();
  } catch (error) {
    stopWakeCommandRecognition("start failure");
    const message = error instanceof Error ? error.message : String(error);
    setState("error", `Wake command capture could not start: ${message}`);
    setAvatarStatus(`Wake command capture could not start: ${message}`);
    logWake(`command capture start failed (${message})`);
    queueWakeListenerRestart();
  }
}

function handleWakePhraseRecognized(transcript: string) {
  if (Date.now() < wakeCooldownUntil) {
    logWake("cooldown active");
    return;
  }

  wakeCooldownUntil = Date.now() + wakeCooldownMs;
  stopWakeListener("wake phrase recognized");
  triggerWakeAnimation();
  setState("wake-detected", `Wake phrase heard: ${transcript}`);
  setAvatarStatus(`Wake phrase heard: ${transcript}`);
  setCodexStatus("Wake phrase heard. Preparing to capture your command...");
  logWake(`wake phrase recognized (${transcript})`);
  startWakeCommandCapture();
}

async function startWakeListener() {
  if (!wakeListenerShouldRun || mediaRecorder || wakeCommandActive || activeRunCount > 0) {
    return;
  }

  if (!SpeechRecognitionCtor) {
    wakeListenerEnabled = false;
    updateWakeVisualState();
    setAvatarStatus("In-app wake listening is not available on this build.");
    logWake("listener unavailable: speech recognition unsupported");
    return;
  }

  const phrase = getWakePhrase();
  if (!phrase) {
    wakeListenerEnabled = false;
    updateWakeVisualState();
    setAvatarStatus("Wake listening is enabled, but no wake phrase is configured.");
    logWake("listener blocked: missing wake phrase");
    return;
  }

  if (wakeRecognition) {
    return;
  }

  const recognition = buildWakeRecognition();
  if (!recognition) {
    return;
  }

  wakeRecognition = recognition;
  recognition.onstart = () => {
    wakeListenerEnabled = true;
    updateWakeVisualState();
    logWake("listener started");
    if (activeRunCount === 0 && !wakeCommandActive && !mediaRecorder) {
      setState("wake-listening");
    }
  };

  recognition.onresult = (event) => {
    const parts: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const piece = result?.[0]?.transcript?.trim();
      if (piece) {
        parts.push(piece);
      }
    }

    if (!parts.length) {
      return;
    }

    const transcript = parts.join(" ").trim();
    const normalizedTranscript = normalizeWakePhrase(transcript);
    if (!normalizedTranscript.includes(phrase)) {
      logWake(`wake phrase not recognized (${transcript})`);
      return;
    }

    handleWakePhraseRecognized(transcript);
  };

  recognition.onerror = (event) => {
    wakeRecognition = null;
    wakeListenerEnabled = false;
    updateWakeVisualState();
    const message =
      event.error === "audio-capture"
        ? "Wake listening could not access a microphone."
        : event.error === "not-allowed"
          ? "Wake listening does not have microphone permission."
          : `Wake listening stopped: ${event.error}`;
    setAvatarStatus(message);
    logWake(`listener error (${event.error})`);
    if (event.error !== "aborted") {
      queueWakeListenerRestart();
    }
  };

  recognition.onend = () => {
    wakeRecognition = null;
    wakeListenerEnabled = false;
    updateWakeVisualState();
    logWake("listener stopped");
    if (activeRunCount === 0 && !wakeCommandActive && !mediaRecorder && !stateBadge.classList.contains("error")) {
      setState("idle");
    }
    queueWakeListenerRestart();
  };

  try {
    recognition.start();
  } catch (error) {
    wakeRecognition = null;
    wakeListenerEnabled = false;
    updateWakeVisualState();
    const message = error instanceof Error ? error.message : String(error);
    setAvatarStatus(`Wake listening could not start: ${message}`);
    logWake(`listener start failed (${message})`);
  }
}

function refreshWakeListener() {
  wakeListenerShouldRun = wakeEnabled.checked;
  wakeListenerEnabled = wakeListenerShouldRun;
  updateWakeVisualState();
  if (!wakeListenerShouldRun && (stateBadge.classList.contains("wake-listening") || stateBadge.classList.contains("wake-detected") || stateBadge.classList.contains("command-listening"))) {
    setState("idle");
  }
}

async function beginRecording() {
  clearRunErrorUi();
  wakeLoopReturnPending = false;
  useTypedPromptFallback = true;
  clearWakeFollowupStop();
  stopWakeVoiceMonitor();
  stopWakeListener("manual recording");
  stopWakeCommandRecognition("manual recording");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }
  });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
  mediaRecorder.start();
  setState("listening", "Listening...");
  micButton.textContent = "Stop Recording";
  quickSpeak.textContent = "Stop Recording";
}

async function beginWakeFollowupRecording() {
  clearRunErrorUi();
  wakeLoopReturnPending = true;
  useTypedPromptFallback = false;
  clearWakeFollowupStop();
  stopWakeVoiceMonitor();
  setState("wake-detected", "Wake phrase heard. Get ready...");
  setAvatarStatus("Wake phrase heard. Starting command capture...");
  setCodexStatus("Wake phrase heard. Starting command capture...");
  await new Promise((resolve) => window.setTimeout(resolve, wakeCaptureLeadInMs));

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }
  });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
  mediaRecorder.start();
  setState("command-listening", "Wake phrase heard. Listening for your command.");
  setAvatarStatus("Wake phrase heard. Listening for your command.");
  setCodexStatus("Wake phrase heard. Listening for your command...");
  let silenceStartedAt = 0;
  let monitorStopped = false;
  const monitorContext = new AudioContext();
  const source = monitorContext.createMediaStreamSource(stream);
  const monitorAnalyser = monitorContext.createAnalyser();
  monitorAnalyser.fftSize = 1024;
  source.connect(monitorAnalyser);
  const data = new Uint8Array(monitorAnalyser.fftSize);

  const stopMonitor = () => {
    if (monitorStopped) {
      return;
    }
    monitorStopped = true;
    source.disconnect();
    monitorAnalyser.disconnect();
    void monitorContext.close().catch(() => undefined);
  };

  wakeVoiceMonitorStop = stopMonitor;
  const monitorVoice = () => {
    if (!mediaRecorder || mediaRecorder.stream !== stream || monitorStopped) {
      stopWakeVoiceMonitor();
      return;
    }

    monitorAnalyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const speaking = rms >= wakeVoiceActivityThreshold;
    shell.classList.toggle("wake-voice-active", speaking);
    avatarScene.setMouthOpen(Math.min(1, rms * 7));

    const now = performance.now();
    if (speaking) {
      silenceStartedAt = 0;
    } else if (!silenceStartedAt) {
      silenceStartedAt = now;
    } else if (now - silenceStartedAt >= wakeSilenceStopMs) {
      void finishRecording();
      return;
    }

    requestAnimationFrame(monitorVoice);
  };

  requestAnimationFrame(monitorVoice);
  wakeFollowupStopHandle = window.setTimeout(() => {
    if (mediaRecorder) {
      void finishRecording();
    }
  }, wakeMaxCaptureMs);
}

async function finishRecording() {
  if (!mediaRecorder) {
    return;
  }

  const recorder = mediaRecorder;
  mediaRecorder = null;
  clearWakeFollowupStop();
  stopWakeVoiceMonitor();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });
  recorder.stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: recorder.mimeType });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const audioBase64 = btoa(String.fromCharCode(...bytes));
  setTranscript("Transcribing what you said...");
  latestSubmittedPrompt = "";
  setCodexStatus("Waiting to send your request to Codex...");
  setPolicyPreview("Waiting for policy review...", "neutral");
  setState("thinking", "Sending your request to Codex...");
  await setWindowMode("expanded");
  micButton.disabled = true;
  quickSpeak.disabled = true;
  micButton.textContent = "Working...";
  quickSpeak.textContent = "Working...";
  activeRunCount += 1;
  updateWakeVisualState();

  try {
    const result = await window.codexAvatar.startRun({
      audioBase64,
      mimeType: blob.type,
      typedPrompt: useTypedPromptFallback ? typedPrompt.value.trim() || null : null,
      executionApproval: { granted: false }
    });
    await playResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState("error", message);
    setAvatarStatus(message);
    queueWakeListenerRestart();
  } finally {
    activeRunCount = Math.max(0, activeRunCount - 1);
    updateWakeVisualState();
    void restoreWakeReadyState();
    micButton.disabled = false;
    quickSpeak.disabled = false;
    micButton.textContent = "Hold / Click To Speak";
    quickSpeak.textContent = "Speak Request";
    useTypedPromptFallback = true;
  }
}

function beginAvatarDrag(event: PointerEvent) {
  dragState = {
    pointerId: event.pointerId,
    startPointerX: event.screenX,
    startPointerY: event.screenY,
    startWindowX: window.screenX,
    startWindowY: window.screenY,
    moved: false
  };
  avatarStage.setPointerCapture(event.pointerId);
}

function updateAvatarPresentation(event: PointerEvent) {
  if (windowMode !== "compact" || dragState?.moved) {
    return;
  }

  avatarScene.setPresentationPointer(true);
  const rect = avatarStage.getBoundingClientRect();
  const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  const normalizedX = (relativeX - 0.5) * 2;
  avatarScene.setPresentationPointerHorizontal(normalizedX);
}

async function updateAvatarDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.screenX - dragState.startPointerX;
  const deltaY = event.screenY - dragState.startPointerY;
  if (!dragState.moved && Math.hypot(deltaX, deltaY) >= dragThreshold) {
    dragState.moved = true;
  }

  if (!dragState.moved) {
    return;
  }

  await window.codexAvatar.setWindowPosition(dragState.startWindowX + deltaX, dragState.startWindowY + deltaY);
}

async function endAvatarDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const wasDrag = dragState.moved;
  dragState = null;
  if (avatarStage.hasPointerCapture(event.pointerId)) {
    avatarStage.releasePointerCapture(event.pointerId);
  }

  if (!wasDrag) {
    await playCompactOpenAnimation();
    await toggleConsole();
  }
}

settingsToggle.addEventListener("click", async () => {
  await setWindowMode("expanded");
  settingsPanel.classList.toggle("hidden");
});
collapseButton.addEventListener("click", () => void toggleConsole("compact"));
closeButton.addEventListener("click", () => void window.codexAvatar.closeWindow());
minimizeButton.addEventListener("click", () => void window.codexAvatar.minimizeWindow());
saveSettingsButton.addEventListener("click", () => void saveSettings());
avatarStage.addEventListener("pointerdown", (event) => beginAvatarDrag(event));
avatarStage.addEventListener("pointermove", (event) => {
  updateAvatarPresentation(event);
  void updateAvatarDrag(event);
});
avatarStage.addEventListener("pointerup", (event) => void endAvatarDrag(event));
avatarStage.addEventListener("pointercancel", () => {
  dragState = null;
  avatarScene.setPresentationPointer(false);
});
avatarStage.addEventListener("pointerleave", () => {
  avatarScene.setPresentationPointer(false);
});

quickSpeak.addEventListener("click", () => void (mediaRecorder ? finishRecording() : beginRecording()));
micButton.addEventListener("click", () => void (mediaRecorder ? finishRecording() : beginRecording()));
quickType.addEventListener("click", async () => {
  await setWindowMode("expanded");
  typedPrompt.classList.toggle("hidden");
  if (!typedPrompt.classList.contains("hidden")) {
    typedPrompt.focus();
  }
});
quickJournal.addEventListener("click", async () => {
  if (bootstrap.latestJournalBookPath) {
    await window.codexAvatar.openPath(bootstrap.latestJournalBookPath);
  }
});
quickSettings.addEventListener("click", async () => {
  await setWindowMode("expanded");
  settingsPanel.classList.remove("hidden");
});

document.getElementById("workspaceBrowse")?.addEventListener("click", () => void chooseAndApply(workspacePath));
document.getElementById("journalBrowse")?.addEventListener("click", () => void chooseAndApply(journalPath));
document.getElementById("characterBrowse")?.addEventListener("click", () => void chooseAndApply(characterPath));
document.getElementById("avatarExecutableBrowse")?.addEventListener("click", () => void chooseFileAndApply(avatarExecutablePath));

characterSelect.addEventListener("change", async () => {
  clearRunErrorUi();
  await applySelectedCharacter();
});

executionModeSelect.addEventListener("change", () => {
  syncExecutionControls();
});

wakeEnabled.addEventListener("change", () => {
  wakeListenerShouldRun = wakeEnabled.checked;
  if (!wakeEnabled.checked) {
    setAvatarStatus(null);
  }
  refreshWakeListener();
});

wakePhrase.addEventListener("change", () => {
  if (wakeListenerShouldRun) {
    stopWakeListener("wake phrase changed");
    refreshWakeListener();
  }
});

window.codexAvatar.onBackendEvent((event) => {
  if (event.kind === "policy-status") {
    const tone =
      event.decision.status === "safe-to-run"
        ? "safe"
        : event.decision.status === "requires-approval"
          ? "approval"
          : "blocked";
    const suffix = event.decision.dryRun ? " Dry-run only." : "";
    setPolicyPreview(`${event.message}${suffix}`, tone);
    if (event.decision.status !== "safe-to-run") {
      setAvatarStatus(event.message);
    }
    return;
  }

  if (event.kind === "wake-status") {
    if (event.state === "running") {
      wakeListenerEnabled = wakeEnabled.checked;
      wakeCommandActive = false;
      updateWakeVisualState();
      if (activeRunCount === 0 && !mediaRecorder) {
        setState("wake-listening");
      }
      setAvatarStatus(null);
      return;
    }

    if (event.state === "heard") {
      wakeCommandActive = true;
      wakeListenerEnabled = false;
      updateWakeVisualState();
      triggerWakeAnimation();
      setState("wake-detected", event.message);
      setAvatarStatus(event.message);
      setCodexStatus("Wake phrase heard. Preparing to capture your command...");
      void beginWakeFollowupRecording().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setState("error", message);
        setAvatarStatus(message);
      });
      return;
    }

    if (event.state === "command-listening") {
      wakeCommandActive = true;
      wakeListenerEnabled = false;
      updateWakeVisualState();
      setState("command-listening", event.message);
      setAvatarStatus(event.message);
      setCodexStatus(event.message);
      return;
    }

    if (event.state === "timeout") {
      wakeCommandActive = false;
      wakeListenerEnabled = wakeEnabled.checked;
      updateWakeVisualState();
      setState(wakeEnabled.checked ? "wake-listening" : "idle", event.message);
      setAvatarStatus(event.message);
      setCodexStatus(event.message);
      return;
    }

    if (event.state === "stopped") {
      wakeListenerEnabled = false;
      wakeCommandActive = false;
      updateWakeVisualState();
      if (wakeEnabled.checked === false && activeRunCount === 0) {
        setState("idle");
      }
      return;
    }

    if (event.state === "error") {
      wakeListenerEnabled = false;
      wakeCommandActive = false;
      updateWakeVisualState();
      setState("error", event.message);
      setAvatarStatus(event.message);
    }
    return;
  }

  if (event.transcript) {
    setTranscript(event.transcript);
  }
  if (event.submittedPrompt) {
    setCodexPreview(event.submittedPrompt);
  }
  if (event.message) {
    setCodexStatus(event.message);
  }

  setState(event.state, event.message);
  if (event.stage === "complete" && event.message.includes("Journal entry finished")) {
    quickJournal.disabled = false;
  }
});

setTranscript("");
setCodexPreview("");
setPolicyPreview("Policy status will appear here.");
setAvatarStatus(null);
window.addEventListener("beforeunload", () => {
  stopWakeListener("window closing");
  stopWakeCommandRecognition("window closing");
});
void loadBootstrap().then(() => setState(wakeEnabled.checked && SpeechRecognitionCtor ? "wake-listening" : "idle"));
