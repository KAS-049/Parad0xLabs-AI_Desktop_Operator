import type {
  AppSettings,
  BackendEvent,
  BootstrapData,
  CodexExecutionMode,
  CodexProvider,
  RunCompletion
} from "../shared/contracts";
import { AvatarScene } from "./avatar/AvatarScene";

declare global {
  interface Window {
    codexAvatar: import("../shared/contracts").CodexAvatarApi;
  }
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

const setupStorageKey = "codex-avatar-setup-complete";
const dragThreshold = 8;
const compactOpenAnimationMs = 190;

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

function setCodexPreview(text: string) {
  codexPreview.textContent = text.trim() || "Your backend-owned Codex prompt will appear here.";
}

function setState(state: BackendEvent["state"], message?: string) {
  stateBadge.textContent = state[0].toUpperCase() + state.slice(1);
  stateBadge.className = `state ${state} no-drag`;

  if (message && subtitleToggle.checked && (state === "speaking" || state === "error")) {
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

async function applySelectedCharacter() {
  const selectedCharacter = bootstrap.characters.find((item) => item.id === characterSelect.value) ?? null;
  shell.classList.toggle("fbx-active", selectedCharacter?.kind === "fbx");
  const result = await avatarScene.loadCharacter(selectedCharacter?.fileUrl ?? null, selectedCharacter?.displaySettings);
  setAvatarStatus(result.ok ? null : result.error);
}

function getSettingsFromForm(): AppSettings {
  return {
    codexProvider: providerSelect.value as CodexProvider,
    executionMode: executionModeSelect.value as CodexExecutionMode,
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
      { id: "codex-cli", label: "Local Codex Session" },
      { id: "openai-codex", label: "OpenAI Codex API" },
      { id: "mock", label: "Mock Mode" }
    ],
    bootstrap.settings.codexProvider
  );
  fillSelect(
    executionModeSelect,
    [
      { id: "backend-session", label: "Backend-Owned Session" },
      { id: "desktop-fallback", label: "Desktop Fallback" }
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
    bootstrap.latestJournalBookPath ? "Latest PDF journal is ready." : "No PDF journal has been created yet."
  ].join(" ");

  await listMicDevices(bootstrap.settings.selectedMicDeviceId);
  await applySelectedCharacter();

  const firstRun = !window.localStorage.getItem(setupStorageKey);
  if (firstRun) {
    settingsPanel.classList.remove("hidden");
    await setWindowMode("expanded");
  } else {
    await setWindowMode("compact");
  }
}

async function saveSettings() {
  if (apiKeyInput.value.trim()) {
    bootstrap = await window.codexAvatar.saveApiKey(apiKeyInput.value.trim());
    apiKeyInput.value = "";
  }

  bootstrap = await window.codexAvatar.saveSettings(getSettingsFromForm());
  window.localStorage.setItem(setupStorageKey, "true");
  settingsPanel.classList.add("hidden");
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

  if (!result.audioBase64 || !result.audioMimeType) {
    setState("idle", result.report.spokenSummary);
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
  };
}

async function beginRecording() {
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

async function finishRecording() {
  if (!mediaRecorder) {
    return;
  }

  const recorder = mediaRecorder;
  mediaRecorder = null;
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });
  recorder.stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: recorder.mimeType });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const audioBase64 = btoa(String.fromCharCode(...bytes));
  setTranscript("Transcribing what you said...");
  setCodexPreview("Waiting for the backend-owned Codex session...");
  setState("thinking", "Sending your request to Codex...");
  await setWindowMode("expanded");
  micButton.disabled = true;
  quickSpeak.disabled = true;
  micButton.textContent = "Working...";
  quickSpeak.textContent = "Working...";

  try {
    const result = await window.codexAvatar.startRun({
      audioBase64,
      mimeType: blob.type,
      typedPrompt: typedPrompt.value.trim() || null
    });
    await playResult(result);
  } finally {
    micButton.disabled = false;
    quickSpeak.disabled = false;
    micButton.textContent = "Hold / Click To Speak";
    quickSpeak.textContent = "Speak Request";
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
  avatarScene.nudgePresentationRotation(event.movementX);
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
  await applySelectedCharacter();
});

window.codexAvatar.onBackendEvent((event) => {
  if (event.kind === "wake-status") {
    if (event.state === "error") {
      setState("error", event.message);
    }
    return;
  }

  if (event.transcript) {
    setTranscript(event.transcript);
  }
  if (event.submittedPrompt) {
    setCodexPreview(event.submittedPrompt);
  }

  setState(event.state, event.message);
  if (event.stage === "complete" && event.message.includes("Journal entry finished")) {
    quickJournal.disabled = false;
  }
});

setTranscript("");
setCodexPreview("");
setAvatarStatus(null);
void loadBootstrap().then(() => setState("idle"));
