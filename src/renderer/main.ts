import type {
  AppSettings,
  AvatarState,
  BackendEvent,
  BootstrapData,
  CodexExecutionMode,
  CodexProvider,
  ExecutionPolicyConfig,
  HubTab,
  RunCompletion,
  ShellMode,
  StartRunPayload
} from "../shared/contracts";
import { AvatarScene } from "./avatar/AvatarScene";
import {
  EXTERNAL_RESOURCE_STATUS_LABELS,
  HUB_BRANDING,
  HUB_EXTERNAL_RESOURCES,
  HUB_GROUPS_BY_TAB,
  HUB_MODULES,
  HUB_OVERVIEW,
  HUB_PRODUCT_DEFINITIONS,
  HUB_RESOURCES_BY_TAB,
  HUB_SECTIONS,
  HUB_START_HERE_STEPS,
  HUB_TABS,
  HUB_VERIFIED_DESTINATION_IDS,
  MODULE_STORIES,
  type HubSearchEntry,
  externalResourceStatusSummary,
  isVerifiedLiveResource,
  moduleSurfaceStatusLabel,
  searchHubEntries,
  modulesForTab
} from "./modules";

declare global {
  interface Window {
    codexAvatar: import("../shared/contracts").CodexAvatarApi;
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shell = $("shell");
const navStrip = $("navStrip");
const trustStrip = $("trustStrip");
const hubSearchInput = $("hubSearchInput") as HTMLInputElement;
const hubSearchResults = $("hubSearchResults");
const brandEyebrow = $("brandEyebrow");
const brandTitle = $("brandTitle");
const shellModeBadge = $("shellModeBadge");
const stateBadge = $("stateBadge");
const settingsPanel = $("settingsPanel");
const subtitleBubble = $("subtitleBubble");
const avatarStage = $("avatarStage") as HTMLButtonElement;
const avatarStatus = $("avatarStatus");
const avatarMessage = $("avatarMessage");
const companionSurface = $("companionSurface");
const companionTitle = $("companionTitle");
const companionCopy = $("companionCopy");
const hubSurface = $("hubSurface");
const actionSurface = $("actionSurface");
const hubHomeHero = $("hubHomeHero");
const moduleGrid = $("moduleGrid");
const actionModuleEyebrow = $("actionModuleEyebrow");
const actionModuleTitle = $("actionModuleTitle");
const actionModuleSubtitle = $("actionModuleSubtitle");
const actionStoryCard = $("actionStoryCard");
const operatorWorkspace = $("operatorWorkspace");
const infoWorkspace = $("infoWorkspace");
const settingsWorkspace = $("settingsWorkspace");
const infoModuleBody = $("infoModuleBody");
const settingsModuleCopy = $("settingsModuleCopy");
const typedPrompt = $("typedPrompt") as HTMLTextAreaElement;
const submitPromptButton = $("submitPromptButton") as HTMLButtonElement;
const micButton = $("micButton") as HTMLButtonElement;
const openLatestJournalButton = $("openLatestJournalButton") as HTMLButtonElement;
const requestPreview = $("requestPreview");
const codexPreview = $("codexPreview");
const policyPreview = $("policyPreview");
const operatorSummary = $("operatorSummary");
const operatorTechnical = $("operatorTechnical");
const providerSelect = $("providerSelect") as HTMLSelectElement;
const executionModeSelect = $("executionModeSelect") as HTMLSelectElement;
const modelSelect = $("modelSelect") as HTMLSelectElement;
const characterSelect = $("characterSelect") as HTMLSelectElement;
const voiceSelect = $("voiceSelect") as HTMLSelectElement;
const micSelect = $("micSelect") as HTMLSelectElement;
const workspacePath = $("workspacePath") as HTMLInputElement;
const journalPath = $("journalPath") as HTMLInputElement;
const characterPath = $("characterPath") as HTMLInputElement;
const codexCliPath = $("codexCliPath") as HTMLInputElement;
const wakeEnabled = $("wakeEnabled") as HTMLInputElement;
const wakePhrase = $("wakePhrase") as HTMLInputElement;
const wakeBluetoothDeviceName = $("wakeBluetoothDeviceName") as HTMLInputElement;
const avatarExecutablePath = $("avatarExecutablePath") as HTMLInputElement;
const apiKeyInput = $("apiKeyInput") as HTMLInputElement;
const useStoredApiKey = $("useStoredApiKey") as HTMLInputElement;
const secretStatus = $("secretStatus");
const subtitleToggle = $("subtitleToggle") as HTMLInputElement;

const avatarScene = new AvatarScene($("avatarMount"));
const audio = new Audio();
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let bootstrap: BootstrapData;
let latestExecutionPolicy: ExecutionPolicyConfig | null = null;
let latestSubmittedPrompt = "";
let shellMode: ShellMode = "companion";
let activeTab: HubTab = "hub";
let activeModuleId = "nulla-operator";
let activeResourceId: string | null = null;
let activeHubGroupId = "all";
let activeJumpGroup: { tab: HubTab; groupId: string } | null = null;
let currentState: AvatarState = "idle";
let activeRunCount = 0;
let wakeListenerEnabled = false;
let wakeCommandActive = false;
let wakeLoopReturnPending = false;
let useTypedPromptFallback = true;
let wakeFollowupStopHandle: number | null = null;
let wakeVoiceMonitorStop: (() => void) | null = null;
let visibleSearchResults: HubSearchEntry[] = [];

brandEyebrow.textContent = HUB_BRANDING.eyebrow;
brandTitle.textContent = HUB_BRANDING.productName;
companionTitle.textContent = "Open the live operator, then learn, browse, or connect safely.";
companionCopy.textContent = HUB_START_HERE_STEPS.map((step) => `${step.title}: ${step.body}`).join(" ");

const setupStorageKey = "codex-avatar-setup-complete";
const lastTabStorageKey = "nulla-hub-last-tab";
const wakeCaptureLeadInMs = 900;
const wakeSilenceStopMs = 3000;
const wakeMaxCaptureMs = 14000;
const wakeVoiceActivityThreshold = 0.025;

const moduleById = (id: string) => HUB_MODULES.find((entry) => entry.id === id) ?? HUB_MODULES[0];
const storyById = (id: string) => MODULE_STORIES[id];
const resourceById = (id: string) => HUB_EXTERNAL_RESOURCES[id] ?? null;
const isSpeaking = () => Boolean(audio.src) && !audio.paused && !audio.ended;
const isWakeBusy = () => Boolean(mediaRecorder) || activeRunCount > 0 || isSpeaking();

function moduleIntentLabel(module: ReturnType<typeof moduleById>) {
  return moduleSurfaceStatusLabel(module);
}

function moduleCardBadgeLabel(module: ReturnType<typeof moduleById>) {
  return module.id === "nulla-operator" ? "Live" : module.badge ?? moduleIntentLabel(module);
}

function focusOperatorWorkspace() {
  typedPrompt.focus();
  typedPrompt.select();
  setAvatarStatus(null);
}

function setState(state: AvatarState, message?: string) {
  currentState = state;
  const labels: Record<AvatarState, string> = { idle: "Idle", "wake-listening": "Wake Ready", "wake-detected": "Wake Heard", "command-listening": "Listening", listening: "Listening", thinking: "Thinking", speaking: "Speaking", error: "Error" };
  stateBadge.textContent = labels[state];
  stateBadge.className = `state ${state} no-drag`;
  subtitleBubble.classList.toggle("hidden", !(message && subtitleToggle.checked && (state === "speaking" || state === "error" || state === "wake-detected")));
  subtitleBubble.textContent = message ?? "";
}

function setAvatarStatus(message: string | null) {
  avatarStatus.textContent = message ?? "";
  avatarStatus.classList.toggle("hidden", !message);
}

function setTranscript(text: string) {
  requestPreview.textContent = text.trim() || "Press the microphone and speak, or send a typed request.";
}

function setCodexStatus(message = "") {
  const parts = [];
  if (latestSubmittedPrompt) parts.push(`Prompt: ${latestSubmittedPrompt}`);
  if (message.trim()) parts.push(`Status: ${message.trim()}`);
  codexPreview.textContent = parts.join("\n\n") || "Your live Codex desktop submission will appear here.";
}

function setPolicyPreview(message: string, tone: "safe" | "approval" | "blocked" | "neutral" = "neutral") {
  policyPreview.textContent = message;
  policyPreview.dataset.tone = tone;
}

function fillSelect<T extends { id: string; label: string }>(element: HTMLSelectElement, items: T[], selected: string | null) {
  element.innerHTML = "";
  for (const item of items.length ? items : [{ id: "", label: "Not available yet" } as T]) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selected;
    element.appendChild(option);
  }
}

async function listMicDevices(selected: string | null) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  fillSelect(micSelect, devices.filter((d) => d.kind === "audioinput").map((mic, index) => ({ id: mic.deviceId, label: mic.label || `Microphone ${index + 1}` })), selected);
}

function updateTrustStrip() {
  const activeResource = activeResourceId ? resourceById(activeResourceId) : null;
  const activeModule = activeResourceId ? null : moduleById(activeModuleId);
  const surfaceLabel = activeResource
    ? (isVerifiedLiveResource(activeResource) ? "Verified" : resourceStatusLabel(activeResource.status))
    : activeModule
      ? moduleIntentLabel(activeModule)
      : "Read Only";
  const items = [
    shellMode === "companion" ? "Companion mode" : shellMode === "hub" ? `Hub: ${HUB_TABS.find((tab) => tab.id === activeTab)?.label ?? "Hub"}` : "Action mode",
    executionModeSelect.value === "desktop-primary" ? "Live Codex desktop primary" : "Direct backend debug",
    wakeEnabled.checked ? (wakeListenerEnabled ? "Wake live" : "Wake configured") : "Wake off",
    useStoredApiKey.checked ? "Stored local key selected" : bootstrap?.secretStatus.hasEnvironmentApiKey ? "Environment key available" : "No API key detected",
    activeResource ? "External" : activeModule?.internal ? "Internal" : "External",
    surfaceLabel
  ];
  trustStrip.innerHTML = items.map((item) => `<span class="trust-pill">${item}</span>`).join("");
}

async function setShellMode(mode: ShellMode) {
  shellMode = mode;
  shell.classList.add("shell");
  shell.classList.toggle("mode-companion", mode === "companion");
  shell.classList.toggle("mode-hub", mode === "hub");
  shell.classList.toggle("mode-action", mode === "action");
  shell.classList.toggle("compact", mode === "companion");
  shell.classList.toggle("expanded", mode !== "companion");
  shellModeBadge.textContent = mode === "companion" ? "Companion" : mode === "hub" ? "Hub" : "Action";
  companionSurface.classList.toggle("hidden", mode !== "companion");
  hubSurface.classList.toggle("hidden", mode !== "hub");
  actionSurface.classList.toggle("hidden", mode !== "action");
  $("collapseButton").classList.toggle("hidden", mode === "companion");
  avatarScene.setCompactMode(mode === "companion");
  avatarMessage.textContent = mode === "companion"
    ? "The avatar stays present as a guide, wake layer, and quick-entry point while the hub expands when you need more."
    : mode === "hub"
      ? HUB_PRODUCT_DEFINITIONS.hub.trustSentence
      : activeResourceId
        ? resourceById(activeResourceId)?.description ?? moduleById(activeModuleId).description
        : moduleById(activeModuleId).description;
  await window.codexAvatar.setWindowMode(mode === "companion" ? "compact" : "expanded");
  updateTrustStrip();
}

function renderNav() {
  navStrip.innerHTML = HUB_TABS.map((tab) => `<button class="nav-pill ${tab.id === activeTab ? "active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("");
  navStrip.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => button.addEventListener("click", () => { activeJumpGroup = null; activeTab = button.dataset.tab as HubTab; window.localStorage.setItem(lastTabStorageKey, activeTab); void openHub(); }));
}

function renderResourceCards(tab: HubTab) {
  const resourceIds = HUB_RESOURCES_BY_TAB[tab] ?? [];
  return resourceIds
    .map((resourceId) => {
      const resource = resourceById(resourceId);
      if (!resource) return "";
      const available = isVerifiedLiveResource(resource);
      return `<article class="module-card ${available ? "resource-card" : "resource-card unavailable"} ${resourceStatusClass(resource.status)}">
        <div class="module-icon ${resourceIconToneClass(resource)}">${resourceIcon(resource)}</div>
        <div class="module-meta">
          <div class="module-topline">
            <div class="module-title">${resource.label}</div>
            <div class="module-badge ${resourceStatusClass(resource.status)}">${resourceStatusLabel(resource.status)}</div>
          </div>
          <div class="module-subtitle">${externalResourceStatusSummary(resource.status)}</div>
          <div class="module-description">${resource.note}</div>
          <div class="module-footer">
            <span class="trust-pill">External</span>
            <span class="trust-pill">${resourceStatusLabel(resource.status)}</span>
          </div>
          <button class="secondary-button" data-open-resource-detail="${resource.id}">Details</button>
        </div>
      </article>`;
    })
    .join("");
}

async function openExternalResource(resourceId: string) {
  const resource = resourceById(resourceId);
  if (!resource) {
    return setAvatarStatus("That hub card is not available right now.");
  }
  if (!isVerifiedLiveResource(resource)) {
    return setAvatarStatus(`${resource.label} is ${resourceStatusLabel(resource.status)}. ${resource.note}`);
  }
  try {
    setAvatarStatus(null);
    await window.codexAvatar.openPath(resource.href);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setAvatarStatus(`Could not open ${resource.label}. ${message}`);
  }
}

function buildResourceButtons(resourceIds: string[]) {
  const buttons = resourceIds
    .map((resourceId) => {
      const resource = resourceById(resourceId);
      if (!resource) return "";
      const available = isVerifiedLiveResource(resource);
      return `<button class="secondary-button" data-open-resource-link="${resource.id}" ${available ? "" : "disabled"}>${resourceActionButtonLabel(resource.id)}</button>`;
    })
    .filter(Boolean)
    .join("");
  return buttons ? `<div class="button-row">${buttons}</div>` : "";
}

function resourceIcon(resource: NonNullable<ReturnType<typeof resourceById>>) {
  if (resource.icon === "DC") {
    return `<svg class="resource-logo logo-discord" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.191.328-.403.77-.554 1.116a18.27 18.27 0 0 0-5.487 0A11.64 11.64 0 0 0 9.29 3a19.736 19.736 0 0 0-4.433 1.369C2.053 8.613 1.289 12.752 1.67 16.833a19.9 19.9 0 0 0 5.44 2.736 13.23 13.23 0 0 0 1.164-1.873 12.955 12.955 0 0 1-1.836-.878c.154-.114.304-.233.45-.357 3.545 1.655 7.389 1.655 10.892 0 .147.124.297.243.45.357-.586.342-1.2.636-1.838.879.34.655.73 1.28 1.165 1.872a19.86 19.86 0 0 0 5.442-2.736c.456-4.731-.781-8.832-3.247-12.464ZM8.013 14.596c-1.06 0-1.932-.966-1.932-2.156 0-1.19.852-2.156 1.932-2.156 1.09 0 1.95.975 1.931 2.156 0 1.19-.852 2.156-1.931 2.156Zm7.974 0c-1.06 0-1.932-.966-1.932-2.156 0-1.19.852-2.156 1.932-2.156 1.09 0 1.95.975 1.931 2.156 0 1.19-.842 2.156-1.931 2.156Z"/>
    </svg>`;
  }
  if (resource.icon === "X") {
    return `<svg class="resource-logo logo-x" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18.901 2H21.98l-6.728 7.69L23.167 22h-6.195l-4.853-6.35L6.56 22H3.478l7.198-8.229L1.833 2h6.352l4.387 5.79L18.901 2Zm-1.08 18.16h1.706L7.26 3.744H5.43L17.82 20.16Z"/>
    </svg>`;
  }
  if (resource.icon) return resource.icon;
  if (resource.id === "github_repositories") return "GH";
  if (resource.id === "docs_learn_null") return "DK";
  if (resource.id === "paradoxlabs_portal") return "PX";
  if (resource.id === "jupiter_token_link") return "JT";
  if (resource.kind === "community") return "CM";
  if (resource.kind === "portal") return "PX";
  if (resource.kind === "token") return "JT";
  return "EO";
}

function resourceIconToneClass(resource: NonNullable<ReturnType<typeof resourceById>>) {
  if (resource.icon === "DC") return "icon-discord";
  if (resource.icon === "X") return "icon-x";
  return "";
}

function resourceStatusClass(status: keyof typeof EXTERNAL_RESOURCE_STATUS_LABELS) {
  return `status-${status.replace(/_/g, "-")}`;
}

function resourceStatusLabel(status: keyof typeof EXTERNAL_RESOURCE_STATUS_LABELS) {
  return EXTERNAL_RESOURCE_STATUS_LABELS[status];
}

function resourceActionButtonLabel(resourceId: string) {
  const resource = resourceById(resourceId);
  if (!resource) return "Unavailable";
  return isVerifiedLiveResource(resource) ? `Open ${resource.label}` : `${resourceStatusLabel(resource.status)} only`;
}

function searchEntryTypeLabel(entry: HubSearchEntry) {
  switch (entry.kind) {
    case "section":
      return "section";
    case "module":
      return "internal";
    case "learning-topic":
      return "topic";
    case "resource":
      return entry.actionable ? "verified external" : "external";
    default:
      return "entry";
  }
}

function renderSearchResults() {
  const query = hubSearchInput.value.trim();
  visibleSearchResults = searchHubEntries(query, 8);
  if (!query || !visibleSearchResults.length) {
    hubSearchResults.innerHTML = query
      ? `<div class="search-empty">No manifest-backed results matched "${query}".</div>`
      : "";
    hubSearchResults.classList.toggle("hidden", !query);
    return;
  }
  hubSearchResults.innerHTML = visibleSearchResults
    .map(
      (entry, index) => `<button class="search-result ${entry.actionable ? "" : "disabled"} tone-${entry.tone}" data-search-index="${index}" ${entry.actionable ? "" : "disabled"}>
        <div class="search-result-topline">
          <span class="search-result-title">${entry.title}</span>
          <span class="module-badge ${entry.tone === "live" ? "status-verified-live" : entry.tone === "pending" ? "status-placeholder" : entry.tone === "disabled" ? "status-unavailable" : ""}">${entry.statusLabel}</span>
        </div>
        <div class="search-result-subtitle">${entry.subtitle}</div>
        <div class="search-result-description">${entry.description}</div>
        <div class="search-result-footer">
          <span class="trust-pill">${searchEntryTypeLabel(entry)}</span>
          <span class="trust-pill">${HUB_TABS.find((tab) => tab.id === entry.tab)?.label ?? entry.tab}</span>
        </div>
      </button>`
    )
    .join("");
  hubSearchResults.classList.remove("hidden");
  hubSearchResults.querySelectorAll<HTMLButtonElement>("[data-search-index]").forEach((button) =>
    button.addEventListener("click", () => {
      const entry = visibleSearchResults[Number(button.dataset.searchIndex ?? -1)];
      if (entry) void executeSearchEntry(entry);
    })
  );
}

function clearSearchResults() {
  hubSearchInput.value = "";
  visibleSearchResults = [];
  hubSearchResults.innerHTML = "";
  hubSearchResults.classList.add("hidden");
}

async function executeSearchEntry(entry: HubSearchEntry) {
  if (!entry.actionable && entry.kind === "resource") {
    const resource = resourceById(entry.target.resourceId);
    setAvatarStatus(resource ? `${resource.label} is ${resourceStatusLabel(resource.status)}. ${resource.note}` : "That destination is not available right now.");
    return;
  }
  clearSearchResults();
  activeJumpGroup = null;
  if (entry.target.kind === "tab") {
    activeTab = entry.target.tab;
    window.localStorage.setItem(lastTabStorageKey, activeTab);
    return openHub();
  }
  if (entry.target.kind === "module") {
    return openModule(entry.target.moduleId);
  }
  if (entry.target.kind === "resource") {
    return openExternalResource(entry.target.resourceId);
  }
  if (entry.target.kind === "group") {
    activeTab = entry.target.tab;
    activeJumpGroup = { tab: entry.target.tab, groupId: entry.target.groupId };
    window.localStorage.setItem(lastTabStorageKey, activeTab);
    return openHub();
  }
}

function renderModuleCard(moduleId: string) {
  const module = moduleById(moduleId);
  return `<article class="module-card ${!module.enabled ? "muted" : ""}"><div class="module-icon">${module.icon}</div><div class="module-meta"><div class="module-topline"><div class="module-title">${module.title}</div><div class="module-badge">${moduleCardBadgeLabel(module)}</div></div><div class="module-subtitle">${module.subtitle}</div><div class="module-description">${module.description}</div><div class="module-footer"><span class="trust-pill">${module.internal ? "Internal" : "External"}</span><span class="trust-pill">${moduleIntentLabel(module)}</span></div><button class="secondary-button" data-open-module="${module.id}">${module.id === "nulla-operator" ? "Open live operator" : module.actionType === "placeholder" ? "Preview" : module.id === "settings-runtime" ? "Open controls" : "Open"}</button></div></article>`;
}

function renderResourceCard(resourceId: string) {
  const resource = resourceById(resourceId);
  if (!resource) return "";
  const available = isVerifiedLiveResource(resource);
  return `<article class="module-card ${available ? "resource-card" : "resource-card unavailable"} ${resourceStatusClass(resource.status)}">
    <div class="module-icon ${resourceIconToneClass(resource)}">${resourceIcon(resource)}</div>
    <div class="module-meta">
      <div class="module-topline">
        <div class="module-title">${resource.label}</div>
        <div class="module-badge ${resourceStatusClass(resource.status)}">${resourceStatusLabel(resource.status)}</div>
      </div>
      <div class="module-subtitle">${externalResourceStatusSummary(resource.status)}</div>
      <div class="module-description">${resource.note}</div>
      <div class="module-footer">
        <span class="trust-pill">External</span>
        <span class="trust-pill">${resourceStatusLabel(resource.status)}</span>
      </div>
      <button class="secondary-button" data-open-resource-detail="${resource.id}">Details</button>
    </div>
  </article>`;
}

function sectionByTab(tab: HubTab) {
  return HUB_SECTIONS[tab];
}

function openSettingsPanel() {
  settingsPanel.classList.remove("hidden");
}

function buildSectionPrimaryAction(tab: HubTab) {
  const section = sectionByTab(tab);
  if (section.primaryAction.kind === "open-module") {
    return `<button class="primary-button" data-open-module="${section.primaryAction.moduleId}">${section.primaryAction.label}</button>`;
  }
  if (section.primaryAction.kind === "open-settings") {
    return `<button class="primary-button" data-open-settings-panel>${section.primaryAction.label}</button>`;
  }
  return "";
}

function collectGroupModules(groups: Array<{ moduleIds: string[] }>) {
  return [...new Set(groups.flatMap((group) => group.moduleIds))].map((id) => moduleById(id));
}

function collectGroupResources(groups: Array<{ resourceIds: string[] }>) {
  return [...new Set(groups.flatMap((group) => group.resourceIds))]
    .map((id) => resourceById(id))
    .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource));
}

function renderSectionInsightCards(
  cards: Array<{ eyebrow: string; title: string; body: string; actions?: string }>
) {
  return `<section class="section-insight-grid">${cards
    .map(
      (card) => `<article class="panel-card section-insight-card">
        <div class="surface-eyebrow">${card.eyebrow}</div>
        <h3>${card.title}</h3>
        <p class="surface-copy">${card.body}</p>
        ${card.actions ?? ""}
      </article>`
    )
    .join("")}</section>`;
}

type HubRenderableGroup = { id: string; label: string; description: string; moduleIds: string[]; resourceIds: string[] };

function renderHubGroupSection(group: HubRenderableGroup) {
  const cards = `${group.moduleIds.map(renderModuleCard).join("")}${group.resourceIds.map(renderResourceCard).join("")}`;
  const body = cards || `<article class="panel-card section-empty-card"><div class="surface-eyebrow">Pending</div><p class="surface-copy">This section is visible now, but there are no manifest-backed entries to show yet.</p></article>`;
  const highlighted = activeJumpGroup?.groupId === group.id;
  return `<section class="hub-section ${highlighted ? "section-highlighted" : ""}" data-group-id="${group.id}">
    <div class="hub-section-header">
      <div>
        <div class="surface-eyebrow">${group.label}</div>
        <h3>${group.label}</h3>
      </div>
      <p class="surface-copy">${group.description}</p>
    </div>
    <div class="module-grid">${body}</div>
  </section>`;
}

function renderVerifiedDestinationPanel(resourceIds: string[], emptyMessage: string) {
  const resources = resourceIds
    .map((resourceId) => resourceById(resourceId))
    .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource) && isVerifiedLiveResource(resource));
  return `<section class="panel-card verified-destination-panel">
    <div class="surface-eyebrow">Verified destinations</div>
    <h3>${resources.length ? `${resources.length} trusted exits are live now.` : "No verified destinations are live yet."}</h3>
    <p class="surface-copy">Use these when you want a real external exit from the hub. Everything else stays visible but locked until its source is verified.</p>
    <div class="quick-access-row">${resources.length ? resources.map((resource) => `<button class="secondary-button" data-open-resource-link="${resource.id}">Open ${resource.label}</button>`).join("") : `<div class="quick-access-empty">${emptyMessage}</div>`}</div>
  </section>`;
}

function renderLearnSection(groups: HubRenderableGroup[]) {
  const modules = collectGroupModules(groups);
  const liveNow = modules.filter((module) => module.status === "ready" && module.actionType === "workflow").length;
  const informational = modules.filter((module) => module.actionType === "informational").length;
  const comingSoon = modules.filter((module) => module.status === "coming-soon" || module.actionType === "placeholder" || !module.enabled).length;
  const recommendedOrder = groups.map((group) => `<span class="trust-pill">${group.label}</span>`).join("");
  return `${renderSectionInsightCards([
    {
      eyebrow: "Live now",
      title: `${liveNow} working action path`,
      body: "NULLA Operator remains the only live execution workflow in the learning path. Everything else here is for orientation, trust framing, or future visibility."
    },
    {
      eyebrow: "Informational now",
      title: `${informational} read-only explainers`,
      body: "Use these modules to understand the shell, the trust model, and the ecosystem structure before treating unfinished surfaces like they already exist."
    },
    {
      eyebrow: "Coming soon",
      title: `${comingSoon} future surfaces`,
      body: "These entries are intentionally visible, but they stay read-only until their source references or runtime adapters are actually ready."
    }
  ])}
  <section class="panel-card section-path-card">
    <div class="surface-eyebrow">Recommended path</div>
    <h3>Move from orientation to trust, then browse the deeper ecosystem.</h3>
    <p class="surface-copy">The learning surface should answer what NULLA is, what is already real, and what still belongs to future releases.</p>
    <div class="quick-access-row">${recommendedOrder}</div>
  </section>
  ${groups.map(renderHubGroupSection).join("")}`;
}

function renderCommunitySection(groups: HubRenderableGroup[]) {
  const resources = collectGroupResources(groups);
  const verified = resources.filter((resource) => isVerifiedLiveResource(resource));
  const awaitingVerification = resources.filter((resource) => resource.status === "placeholder");
  const pending = resources.filter((resource) => !isVerifiedLiveResource(resource));
  return `${renderSectionInsightCards([
    {
      eyebrow: "Verification",
      title: `${verified.length} verified destinations`,
      body: verified.length
        ? "Only verified community destinations can open from this section, and they use the same safe external helper path as the rest of the hub."
        : "No community destinations are verified yet. This section stays read-only until real source URLs are added to the shared manifest."
    },
    {
      eyebrow: "Pending",
      title: `${pending.length} placeholders remain locked`,
      body: "Placeholders stay visible so the social surface is understandable, but they remain clearly unavailable instead of pretending to work."
    }
  ])}
  <section class="panel-card section-path-card">
    <div class="surface-eyebrow">Awaiting verification</div>
    <h3>${awaitingVerification.length} community destinations still need a trusted source.</h3>
    <p class="surface-copy">These stay visible for orientation, but they do not become clickable until the shared manifest contains a verified live destination.</p>
    <div class="quick-access-row">${awaitingVerification.length ? awaitingVerification.map((resource) => `<span class="trust-pill">${resource.label}</span>`).join("") : `<div class="quick-access-empty">No community placeholders are currently awaiting verification.</div>`}</div>
  </section>
  <section class="panel-card section-path-card">
    <div class="surface-eyebrow">Verified destinations</div>
    <h3>Community links open only when their destination is actually verified.</h3>
    <p class="surface-copy">Until then, use the detail cards to see what each entry is for and what still needs to be filled in.</p>
    <div class="quick-access-row">${verified.length ? verified.map((resource) => `<button class="secondary-button" data-open-resource-link="${resource.id}">Open ${resource.label}</button>`).join("") : `<div class="quick-access-empty">No verified community destinations are available yet.</div>`}</div>
  </section>
  ${groups.map(renderHubGroupSection).join("")}`;
}

function renderExploreSection(groups: HubRenderableGroup[]) {
  const modules = collectGroupModules(groups);
  const resources = collectGroupResources(groups);
  const readyModules = modules.filter((module) => module.enabled && module.status !== "coming-soon").length;
  const placeholderModules = modules.filter((module) => module.status === "coming-soon" || module.actionType === "placeholder" || !module.enabled).length;
  const verifiedResources = resources.filter((resource) => isVerifiedLiveResource(resource));
  const awaitingVerification = resources.filter((resource) => resource.status === "placeholder");
  return `${renderSectionInsightCards([
    {
      eyebrow: "Browse",
      title: `${readyModules} discovery surfaces`,
      body: "Explore should feel like ecosystem browsing. These cards explain products and portals without widening execution scope."
    },
    {
      eyebrow: "Links",
      title: `${resources.length} linked reference slots`,
      body: "External destinations stay grouped here so the ecosystem remains understandable even before every source has been verified."
    },
    {
      eyebrow: "Future",
      title: `${placeholderModules} deeper placeholders`,
      body: "Protocol, infrastructure, and advanced utility surfaces remain visible, but stay read-only until their references or adapters are ready."
    }
  ])}
  <section class="panel-card section-path-card">
    <div class="surface-eyebrow">Verified destinations</div>
    <h3>${verifiedResources.length} verified live destinations, ${awaitingVerification.length} awaiting verification.</h3>
    <p class="surface-copy">Explore keeps trusted destinations separate from roadmap placeholders so browsing does not feel like fake functionality.</p>
    <div class="quick-access-row">${verifiedResources.length ? verifiedResources.map((resource) => `<button class="secondary-button" data-open-resource-link="${resource.id}">Open ${resource.label}</button>`).join("") : `<div class="quick-access-empty">No verified Explore destinations are available yet.</div>`}</div>
  </section>
  ${groups.map(renderHubGroupSection).join("")}`;
}

function renderHub() {
  const operator = moduleById("nulla-operator");
  const startHere = moduleById("start-here");
  const proofCenter = moduleById("proof-center");
  const hubGroups = HUB_GROUPS_BY_TAB[activeTab] ?? [];
  const section = sectionByTab(activeTab);
  const quickAccessResources = section.featuredResourceIds.map((resourceId) => resourceById(resourceId)).filter((resource) => Boolean(resource));
  const verifiedQuickAccess = quickAccessResources.filter((resource) => resource && isVerifiedLiveResource(resource));
  hubHomeHero.innerHTML = activeTab === "hub"
    ? `<div class="hero-card hero-card-primary hero-card-operator"><div class="hero-card-top"><div><div class="surface-eyebrow">Primary action</div><h2>${operator.title}</h2><p class="hero-subtitle">${operator.subtitle}</p></div><div class="module-badge">Live</div></div><p class="surface-copy">${operator.description}</p><div class="hero-actions"><button class="primary-button" data-open-module="nulla-operator">Open live operator</button><button class="secondary-button" data-tab-select="learn">Start here</button></div><div class="quick-access-row"><span class="trust-pill">Internal</span><span class="trust-pill">Live workflow</span><span class="trust-pill">Guided desktop path</span></div></div><div class="hero-card-grid"><button class="hero-card hero-card-support" data-open-module="start-here"><div class="surface-eyebrow">${startHere.badge ?? "Start"}</div><h3>${startHere.title}</h3><p>${startHere.description}</p></button><button class="hero-card hero-card-support" data-open-module="proof-center"><div class="surface-eyebrow">${proofCenter.badge ?? "Trust"}</div><h3>${proofCenter.title}</h3><p>${proofCenter.description}</p></button></div>`
    : `<div class="hero-card hero-card-primary"><div class="hero-card-top"><div><div class="surface-eyebrow">${section.eyebrow}</div><h2>${section.title}</h2></div><div class="module-badge">${activeTab}</div></div><p class="surface-copy">${section.description}</p><div class="hero-actions">${buildSectionPrimaryAction(activeTab)}</div><div class="quick-access-row">${verifiedQuickAccess.length ? verifiedQuickAccess.map((resource) => `<button class="secondary-button" data-open-resource-link="${resource!.id}">Open ${resource!.label}</button>`).join("") : `<div class="quick-access-empty">No verified quick links are available yet in this section. Use the detail cards to see what is live and what is still pending.</div>`}</div></div>`;
  if (activeTab === "hub" && hubGroups.length) {
    const chipBar = [`<button class="nav-pill ${activeHubGroupId === "all" ? "active" : ""}" data-hub-group="all">All</button>`]
      .concat(hubGroups.map((group) => `<button class="nav-pill ${activeHubGroupId === group.id ? "active" : ""}" data-hub-group="${group.id}">${group.label}</button>`))
      .join("");
    const visibleGroups = activeHubGroupId === "all" ? hubGroups : hubGroups.filter((group) => group.id === activeHubGroupId);
    moduleGrid.innerHTML = `${renderVerifiedDestinationPanel(HUB_VERIFIED_DESTINATION_IDS, "No verified destinations are available yet. Keep using Start Here and module details until more official exits are confirmed.")}<div class="hub-section-filter">${chipBar}</div>${visibleGroups.map(renderHubGroupSection).join("")}`;
  } else if (["learn", "community", "explore"].includes(activeTab)) {
    const sectionGroups = HUB_GROUPS_BY_TAB[activeTab] ?? [];
    if (activeTab === "learn") {
      moduleGrid.innerHTML = renderLearnSection(sectionGroups);
    } else if (activeTab === "community") {
      moduleGrid.innerHTML = renderCommunitySection(sectionGroups);
    } else {
      moduleGrid.innerHTML = renderExploreSection(sectionGroups);
    }
  } else {
    const sectionModuleIds = new Set(section.featuredModuleIds);
    const moduleCards = modulesForTab(activeTab)
      .filter((module) => !(activeTab === "hub" && ["nulla-operator", "start-here", "proof-center"].includes(module.id)))
      .filter((module) => sectionModuleIds.size === 0 || sectionModuleIds.has(module.id) || activeTab === "explore")
      .map((module) => renderModuleCard(module.id))
      .join("");
    const resourceCards = activeTab === "use-ai" || activeTab === "settings" ? "" : renderResourceCards(activeTab);
    moduleGrid.innerHTML = `${moduleCards}${resourceCards}`;
  }
  shell.querySelectorAll<HTMLElement>("[data-hub-group]").forEach((button) => button.addEventListener("click", () => { activeHubGroupId = button.dataset.hubGroup ?? "all"; renderHub(); }));
  shell.querySelectorAll<HTMLElement>("[data-open-module]").forEach((button) => button.addEventListener("click", () => void openModule(button.dataset.openModule ?? "nulla-operator")));
  shell.querySelectorAll<HTMLElement>("[data-open-resource-detail]").forEach((button) => button.addEventListener("click", () => void openResourceDetail(button.dataset.openResourceDetail ?? "")));
  shell.querySelectorAll<HTMLElement>("[data-open-resource-link]").forEach((button) => button.addEventListener("click", () => void openExternalResource(button.dataset.openResourceLink ?? "")));
  shell.querySelectorAll<HTMLElement>("[data-open-settings-panel]").forEach((button) => button.addEventListener("click", () => openSettingsPanel()));
  shell.querySelectorAll<HTMLElement>("[data-tab-select]").forEach((button) => button.addEventListener("click", () => { activeJumpGroup = null; activeTab = button.dataset.tabSelect as HubTab; void openHub(); }));
  if (activeJumpGroup?.tab === activeTab) {
    const target = moduleGrid.querySelector<HTMLElement>(`[data-group-id="${activeJumpGroup.groupId}"]`);
    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }
}

function renderAction() {
  if (activeResourceId) {
    const resource = resourceById(activeResourceId);
    if (!resource) {
      activeResourceId = null;
      return renderAction();
    }
    const available = isVerifiedLiveResource(resource);
    actionModuleEyebrow.textContent = resource.kind;
    actionModuleTitle.textContent = resource.label;
    actionModuleSubtitle.textContent = resource.subtitle;
    actionStoryCard.innerHTML = `<div class="story-eyebrow">${resourceStatusLabel(resource.status)}</div><div class="story-body">${resource.description}</div><div class="panel-label">Status</div><div class="panel-copy">${externalResourceStatusSummary(resource.status)}</div>`;
    operatorWorkspace.classList.add("hidden");
    settingsWorkspace.classList.add("hidden");
    infoWorkspace.classList.remove("hidden");
    infoModuleBody.innerHTML = `<div class="surface-eyebrow">${resource.kind}</div><h3>${resource.label}</h3><p>${resource.description}</p><div class="panel-label top-gap">Availability</div><div class="panel-copy">${resourceStatusLabel(resource.status)} / ${externalResourceStatusSummary(resource.status)}</div><div class="panel-label top-gap">Manifest note</div><div class="panel-copy">${resource.note}</div>${buildResourceButtons([resource.id])}`;
    shell.querySelectorAll<HTMLElement>("[data-open-resource-link]").forEach((button) => button.addEventListener("click", () => void openExternalResource(button.dataset.openResourceLink ?? "")));
    return;
  }
  const activeModule = moduleById(activeModuleId);
  const story = storyById(activeModule.id);
  actionModuleEyebrow.textContent = activeModule.badge ?? "Action Mode";
  actionModuleTitle.textContent = activeModule.title;
  actionModuleSubtitle.textContent = activeModule.subtitle;
  actionStoryCard.innerHTML = `<div class="story-eyebrow">${story?.eyebrow ?? activeModule.category}</div><div class="story-body">${story?.body ?? activeModule.description}</div>${story?.statusNote ? `<div class="panel-label">Current status</div><div class="panel-copy">${story.statusNote}</div>` : ""}${story?.workflowSupport?.length ? `<div class="panel-label top-gap">Workflow support</div><ul class="story-list">${story.workflowSupport.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}${story?.highlights?.length ? `<div class="panel-label top-gap">What matters here</div><ul class="story-list">${story.highlights.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}${story?.trustNotes?.length ? `<div class="panel-label top-gap">Trust boundary</div><ul class="story-list">${story.trustNotes.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}${activeModule.id === "nulla-operator" ? `<div class="button-row top-gap"><button class="primary-button" data-enter-operator>${story?.cta ?? "Enter live operator"}</button></div>` : ""}`;
  operatorWorkspace.classList.toggle("hidden", activeModule.id !== "nulla-operator");
  settingsWorkspace.classList.toggle("hidden", activeModule.id !== "settings-runtime");
  infoWorkspace.classList.toggle("hidden", activeModule.id === "nulla-operator" || activeModule.id === "settings-runtime");
  if (activeModule.id === "settings-runtime") settingsModuleCopy.textContent = `${bootstrap.latestJournalBookPath ? "A journal artifact already exists in this workspace." : "No journal artifact has been produced in this session yet."} Review runtime readiness, provider selection, wake controls, and local trust surfaces before running workflows.`;
  if (!infoWorkspace.classList.contains("hidden")) {
    infoModuleBody.innerHTML = `<div class="surface-eyebrow">${story?.eyebrow ?? activeModule.category}</div><h3>${activeModule.title}</h3><p>${story?.body ?? activeModule.description}</p><div class="panel-label top-gap">Module status</div><div class="panel-copy">${moduleIntentLabel(activeModule)} / ${activeModule.internal ? "Internal" : "External"} / ${activeModule.status === "ready" ? "Ready now" : activeModule.status === "coming-soon" ? "Coming soon" : activeModule.status}</div>${activeModule.resourceIds?.length ? `<div class="panel-label top-gap">Available links and related entries</div>${buildResourceButtons(activeModule.resourceIds)}` : `<div class="panel-label top-gap">Availability</div><div class="panel-copy">No verified linked resources are available for this module yet.</div>`}`;
    shell.querySelectorAll<HTMLElement>("[data-open-resource-link]").forEach((button) => button.addEventListener("click", () => void openExternalResource(button.dataset.openResourceLink ?? "")));
  }
  shell.querySelectorAll<HTMLElement>("[data-enter-operator]").forEach((button) => button.addEventListener("click", () => focusOperatorWorkspace()));
}

async function openHub() { activeResourceId = null; activeHubGroupId = "all"; renderNav(); renderHub(); await setShellMode("hub"); }
async function openModule(id: string) { activeResourceId = null; activeModuleId = id; renderAction(); await setShellMode("action"); }
async function openResourceDetail(id: string) { activeResourceId = id; renderAction(); await setShellMode("action"); }

function syncExecutionControls() {
  const desktopPrimary = executionModeSelect.value === "desktop-primary";
  providerSelect.disabled = desktopPrimary;
  providerSelect.title = desktopPrimary ? "Live Codex desktop companion mode is the primary path and uses the visible Codex app." : "Choose the secondary or debug backend provider.";
}

function updateWakeVisualState() {
  shell.classList.toggle("wake-armed", wakeEnabled.checked && wakeListenerEnabled && !wakeCommandActive && !isWakeBusy());
  updateTrustStrip();
}

async function applySelectedCharacter() {
  const selected = bootstrap.characters.find((entry) => entry.id === characterSelect.value) ?? null;
  shell.classList.toggle("fbx-active", selected?.kind === "fbx");
  const result = await avatarScene.loadCharacter(selected?.fileUrl ?? null, selected?.displaySettings);
  setAvatarStatus(result.ok ? null : result.error);
}

function getSettingsFromForm(): AppSettings {
  const executionMode = executionModeSelect.value as CodexExecutionMode;
  return {
    codexProvider: executionMode === "desktop-primary" ? "desktop-codex" : (providerSelect.value as CodexProvider),
    executionMode,
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
    executionPolicy: { ...(latestExecutionPolicy ?? bootstrap.settings.executionPolicy), allowedWorkspaceRoots: [workspacePath.value] },
    wake: { enabled: wakeEnabled.checked, phrase: wakePhrase.value, bluetoothDeviceName: wakeBluetoothDeviceName.value, avatarExecutablePath: avatarExecutablePath.value }
  };
}

async function loadBootstrap() {
  bootstrap = await window.codexAvatar.getBootstrapData();
  fillSelect(providerSelect, [{ id: "desktop-codex", label: "Live Codex Desktop App (Primary)" }, { id: "codex-cli", label: "Direct Backend Codex CLI (Secondary / Debug)" }, { id: "openai-codex", label: "Direct Backend OpenAI Codex API (Secondary / Debug)" }, { id: "mock", label: "Mock Mode" }], bootstrap.settings.codexProvider);
  fillSelect(executionModeSelect, [{ id: "desktop-primary", label: "Live Codex Desktop Companion (Primary)" }, { id: "direct-backend-debug", label: "Direct Backend Session (Secondary / Debug)" }], bootstrap.settings.executionMode);
  fillSelect(modelSelect, bootstrap.models, bootstrap.settings.selectedModel);
  fillSelect(characterSelect, bootstrap.characters, bootstrap.settings.selectedCharacterId);
  fillSelect(voiceSelect, bootstrap.voices, bootstrap.settings.selectedVoice);
  workspacePath.value = bootstrap.settings.workspacePath; journalPath.value = bootstrap.settings.journalOutputFolder; characterPath.value = bootstrap.settings.characterFolder; codexCliPath.value = bootstrap.settings.codexCliPath;
  wakeEnabled.checked = bootstrap.settings.wake.enabled; wakePhrase.value = bootstrap.settings.wake.phrase; wakeBluetoothDeviceName.value = bootstrap.settings.wake.bluetoothDeviceName; avatarExecutablePath.value = bootstrap.settings.wake.avatarExecutablePath;
  useStoredApiKey.checked = bootstrap.settings.useStoredApiKey; subtitleToggle.checked = bootstrap.settings.subtitleBubble;
  secretStatus.textContent = [bootstrap.secretStatus.hasEnvironmentApiKey ? "Environment API key detected." : "No environment API key detected.", bootstrap.secretStatus.hasStoredApiKey ? "Stored local API key available." : "No stored local API key saved yet.", bootstrap.latestJournalBookPath ? "Latest engineering log document is ready." : "No engineering log document has been created yet."].join(" ");
  latestExecutionPolicy = bootstrap.settings.executionPolicy;
  setPolicyPreview("Policy status will appear here."); syncExecutionControls(); await listMicDevices(bootstrap.settings.selectedMicDeviceId); await applySelectedCharacter();
  openLatestJournalButton.disabled = !bootstrap.latestJournalBookPath;
  activeTab = (window.localStorage.getItem(lastTabStorageKey) as HubTab | null) ?? "hub";
  renderNav(); renderHub(); updateTrustStrip();
  await setShellMode(window.localStorage.getItem(setupStorageKey) ? "companion" : "hub");
}

async function saveSettings() {
  if (apiKeyInput.value.trim()) { await window.codexAvatar.saveApiKey(apiKeyInput.value.trim()); apiKeyInput.value = ""; }
  await window.codexAvatar.saveSettings(getSettingsFromForm());
  window.localStorage.setItem(setupStorageKey, "true");
  settingsPanel.classList.add("hidden");
  await loadBootstrap();
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
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => { if (audio.paused || audio.ended) { avatarScene.setMouthOpen(0); return; } analyser.getByteFrequencyData(data); avatarScene.setMouthOpen(Math.min(1, data.reduce((sum, value) => sum + value, 0) / data.length / 80)); requestAnimationFrame(tick); };
  tick();
}

async function playResult(result: RunCompletion) {
  bootstrap.latestJournalBookPath = result.artifacts?.journalBookPath ?? bootstrap.latestJournalBookPath;
  openLatestJournalButton.disabled = !bootstrap.latestJournalBookPath;
  setTranscript(result.report.transcript); latestSubmittedPrompt = result.report.submittedPrompt; setCodexStatus("Codex finished. Preparing voice playback...");
  operatorSummary.textContent = result.report.spokenSummary || result.report.plainEnglishSummary || "No spoken summary was returned.";
  operatorTechnical.textContent = [result.report.technicalSummary || "No technical notes were returned.", result.desktopAutomationReport ? `Desktop automation: ${result.desktopAutomationReport.abortReason ? "Capture failed" : result.desktopAutomationReport.partialCapture ? "Partial capture" : "Full capture"}. Confidence ${Math.round(result.desktopAutomationReport.confidence * 100)}%.` : ""].filter(Boolean).join("\n\n");
  if (!result.audioBase64 || !result.audioMimeType) { setState("idle", result.report.spokenSummary); return restoreWakeReadyState(); }
  await ensureAudioAnalyser();
  audio.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(result.audioBase64), (char) => char.charCodeAt(0))], { type: result.audioMimeType }));
  setState("speaking", result.report.spokenSummary); await audio.play(); animateLipSync();
  audio.onended = () => { avatarScene.setMouthOpen(0); setState("idle"); void restoreWakeReadyState(); };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let binary = ""; const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

async function runOperator(payload: StartRunPayload, status: string) {
  latestSubmittedPrompt = payload.typedPrompt?.trim() ?? ""; setCodexStatus(status); setPolicyPreview("Waiting for policy review..."); setState("thinking", status); setAvatarStatus(null);
  submitPromptButton.disabled = true; micButton.disabled = true; activeRunCount += 1; updateWakeVisualState();
  try { await openModule("nulla-operator"); await playResult(await window.codexAvatar.startRun(payload)); } catch (error) { const message = error instanceof Error ? error.message : String(error); setState("error", message); setAvatarStatus(message); } finally { activeRunCount = Math.max(0, activeRunCount - 1); wakeCommandActive = false; submitPromptButton.disabled = false; micButton.disabled = false; micButton.textContent = "Hold / Click To Speak"; updateWakeVisualState(); await restoreWakeReadyState(); }
}

async function submitTypedPrompt() {
  const prompt = typedPrompt.value.trim();
  if (!prompt) return setAvatarStatus("Type a request before sending it to NULLA Operator.");
  setTranscript(prompt);
  await runOperator({ audioBase64: null, mimeType: null, typedPrompt: prompt, executionApproval: { granted: false } }, "Sending your typed request to Codex...");
}

async function beginRecording() {
  wakeLoopReturnPending = false; useTypedPromptFallback = true; setAvatarStatus(null); wakeCommandActive = false; updateWakeVisualState();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined } });
  const preferred = ["audio/webm;codecs=opus", "audio/webm"].find((value) => MediaRecorder.isTypeSupported(value));
  chunks = []; mediaRecorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => chunks.push(event.data); mediaRecorder.start();
  await openModule("nulla-operator"); setState("listening", "Listening..."); micButton.textContent = "Stop Recording"; submitPromptButton.disabled = true; updateWakeVisualState();
}

async function beginWakeFollowupRecording() {
  wakeLoopReturnPending = true; useTypedPromptFallback = false; wakeCommandActive = true; updateWakeVisualState();
  setState("wake-detected", "Wake phrase heard. Get ready..."); setAvatarStatus("Wake phrase heard. Starting command capture..."); setCodexStatus("Wake phrase heard. Starting command capture...");
  await new Promise((resolve) => window.setTimeout(resolve, wakeCaptureLeadInMs)); await openModule("nulla-operator");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined } });
  const preferred = ["audio/webm;codecs=opus", "audio/webm"].find((value) => MediaRecorder.isTypeSupported(value));
  chunks = []; mediaRecorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => chunks.push(event.data); mediaRecorder.start();
  setState("command-listening", "Wake phrase heard. Listening for your command."); setAvatarStatus("Wake phrase heard. Listening for your command."); setCodexStatus("Wake phrase heard. Listening for your command...");
  let silenceStartedAt = 0; let monitorStopped = false; const context = new AudioContext(); const source = context.createMediaStreamSource(stream); const monitor = context.createAnalyser(); const data = new Uint8Array(1024); monitor.fftSize = 1024; source.connect(monitor);
  wakeVoiceMonitorStop = () => { if (monitorStopped) return; monitorStopped = true; source.disconnect(); monitor.disconnect(); void context.close().catch(() => undefined); shell.classList.remove("wake-voice-active"); avatarScene.setMouthOpen(0); };
  const loop = () => {
    if (!mediaRecorder || mediaRecorder.stream !== stream || monitorStopped) return wakeVoiceMonitorStop?.();
    monitor.getByteTimeDomainData(data); let sumSquares = 0; for (const sample of data) { const centered = (sample - 128) / 128; sumSquares += centered * centered; }
    const rms = Math.sqrt(sumSquares / data.length); const speaking = rms >= wakeVoiceActivityThreshold; shell.classList.toggle("wake-voice-active", speaking); avatarScene.setMouthOpen(Math.min(1, rms * 7));
    const now = performance.now(); if (speaking) silenceStartedAt = 0; else if (!silenceStartedAt) silenceStartedAt = now; else if (now - silenceStartedAt >= wakeSilenceStopMs) return void finishRecording();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop); wakeFollowupStopHandle = window.setTimeout(() => mediaRecorder && void finishRecording(), wakeMaxCaptureMs);
}

async function finishRecording() {
  if (!mediaRecorder) return;
  const recorder = mediaRecorder; mediaRecorder = null; if (wakeFollowupStopHandle !== null) window.clearTimeout(wakeFollowupStopHandle); wakeFollowupStopHandle = null; wakeVoiceMonitorStop?.(); wakeVoiceMonitorStop = null;
  await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); recorder.stop(); }); recorder.stream.getTracks().forEach((track) => track.stop());
  const mimeType = recorder.mimeType || "audio/webm";
  setTranscript("Transcribing what you said...");
  await runOperator({ audioBase64: arrayBufferToBase64(await new Blob(chunks, { type: mimeType }).arrayBuffer()), mimeType, typedPrompt: useTypedPromptFallback ? typedPrompt.value.trim() || null : null, executionApproval: { granted: false } }, "Sending your request to Codex...");
  useTypedPromptFallback = true;
}

function refreshWakeListener() {
  if (!wakeEnabled.checked) { wakeListenerEnabled = false; wakeCommandActive = false; if (["wake-listening", "wake-detected", "command-listening"].includes(currentState)) setState("idle"); }
  updateWakeVisualState();
}

async function restoreWakeReadyState() {
  if (!wakeEnabled.checked || !wakeListenerEnabled || wakeCommandActive || isWakeBusy()) return;
  if (wakeLoopReturnPending) { wakeLoopReturnPending = false; await setShellMode("companion"); }
  setState("wake-listening"); setAvatarStatus(null);
}

$("settingsToggle").addEventListener("click", async () => { if (shellMode === "companion") await openHub(); settingsPanel.classList.toggle("hidden"); });
$("collapseButton").addEventListener("click", () => { settingsPanel.classList.add("hidden"); void setShellMode("companion"); });
$("minimizeButton").addEventListener("click", () => void window.codexAvatar.minimizeWindow());
$("closeButton").addEventListener("click", () => void window.codexAvatar.closeWindow());
$("saveSettings").addEventListener("click", () => void saveSettings());
$("expandHubButton").addEventListener("click", () => void openHub());
$("quickOperatorButton").addEventListener("click", () => void openModule("nulla-operator"));
$("backToHubButton").addEventListener("click", () => void openHub());
$("openSettingsPanelButton").addEventListener("click", () => settingsPanel.classList.remove("hidden"));
avatarStage.addEventListener("click", () => void openHub());
avatarStage.addEventListener("pointermove", (event) => { const rect = avatarStage.getBoundingClientRect(); avatarScene.setPresentationPointer(true); avatarScene.setPresentationPointerHorizontal((((event.clientX - rect.left) / Math.max(rect.width, 1)) - 0.5) * 2); });
avatarStage.addEventListener("pointerleave", () => avatarScene.setPresentationPointer(false));
hubSearchInput.addEventListener("input", () => renderSearchResults());
hubSearchInput.addEventListener("focus", () => renderSearchResults());
hubSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearSearchResults();
    return;
  }
  if (event.key === "Enter" && visibleSearchResults.length) {
    event.preventDefault();
    void executeSearchEntry(visibleSearchResults[0]);
  }
});
document.addEventListener("click", (event) => {
  const target = event.target as Node | null;
  if (!target) return;
  if (!hubSearchInput.contains(target) && !hubSearchResults.contains(target)) {
    hubSearchResults.classList.add("hidden");
  }
});
submitPromptButton.addEventListener("click", () => void submitTypedPrompt());
micButton.addEventListener("click", () => void (mediaRecorder ? finishRecording() : beginRecording()));
openLatestJournalButton.addEventListener("click", () => bootstrap.latestJournalBookPath && void window.codexAvatar.openPath(bootstrap.latestJournalBookPath));
typedPrompt.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submitTypedPrompt(); } });
characterSelect.addEventListener("change", () => void applySelectedCharacter());
executionModeSelect.addEventListener("change", () => { syncExecutionControls(); updateTrustStrip(); });
voiceSelect.addEventListener("change", updateTrustStrip);
useStoredApiKey.addEventListener("change", updateTrustStrip);
wakeEnabled.addEventListener("change", refreshWakeListener);
$("workspaceBrowse")?.addEventListener("click", () => void window.codexAvatar.chooseDirectory(workspacePath.value || null).then((next) => next && (workspacePath.value = next)));
$("journalBrowse")?.addEventListener("click", () => void window.codexAvatar.chooseDirectory(journalPath.value || null).then((next) => next && (journalPath.value = next)));
$("characterBrowse")?.addEventListener("click", () => void window.codexAvatar.chooseDirectory(characterPath.value || null).then((next) => next && (characterPath.value = next)));
$("avatarExecutableBrowse")?.addEventListener("click", () => void window.codexAvatar.chooseFile(avatarExecutablePath.value || null).then((next) => next && (avatarExecutablePath.value = next)));

window.codexAvatar.onBackendEvent((event: BackendEvent) => {
  if (event.kind === "policy-status") {
    const tone = event.decision.status === "safe-to-run" ? "safe" : event.decision.status === "requires-approval" ? "approval" : "blocked";
    setPolicyPreview(`${event.message}${event.decision.dryRun ? " Dry-run only." : ""}`, tone);
    if (event.decision.status !== "safe-to-run") setAvatarStatus(event.message);
    return;
  }

  if (event.kind === "wake-status") {
    if (event.state === "running") {
      wakeListenerEnabled = wakeEnabled.checked;
      if (!isWakeBusy()) {
        wakeCommandActive = false;
        setState("wake-listening");
        setAvatarStatus(null);
      }
      updateWakeVisualState();
      return;
    }

    if (event.state === "heard") {
      if (!wakeEnabled.checked || isWakeBusy() || wakeCommandActive) {
        console.info("[wake] helper wake event ignored while busy");
        return;
      }
      wakeCommandActive = true;
      wakeListenerEnabled = false;
      updateWakeVisualState();
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
      updateWakeVisualState();
      setState(wakeListenerEnabled ? "wake-listening" : "idle", event.message);
      setAvatarStatus(event.message);
      setCodexStatus(event.message);
      return;
    }

    if (event.state === "stopped") {
      wakeListenerEnabled = false;
      wakeCommandActive = false;
      updateWakeVisualState();
      if (activeRunCount === 0 && currentState !== "error") {
        setState("idle");
      }
      return;
    }

    wakeListenerEnabled = false;
    wakeCommandActive = false;
    updateWakeVisualState();
    setState("error", event.message);
    setAvatarStatus(event.message);
    return;
  }

  if (event.transcript) setTranscript(event.transcript);
  if (event.submittedPrompt) latestSubmittedPrompt = event.submittedPrompt;
  if (event.message) setCodexStatus(event.message);
  setState(event.state, event.message);
});

setTranscript("");
latestSubmittedPrompt = "";
setCodexStatus("");
setPolicyPreview("Policy status will appear here.");
operatorSummary.textContent = "The flagship workflow has not run yet in this session.";
operatorTechnical.textContent = "Technical details will appear here after a run.";
setAvatarStatus(null);
window.addEventListener("beforeunload", () => {
  if (wakeFollowupStopHandle !== null) window.clearTimeout(wakeFollowupStopHandle);
  wakeVoiceMonitorStop?.();
});

void loadBootstrap().then(() => setState("idle"));

