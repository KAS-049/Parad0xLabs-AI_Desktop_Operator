import {
  EXTERNAL_RESOURCE_STATUS_LABELS,
  HUB_BRANDING,
  HUB_EXTERNAL_RESOURCES,
  HUB_GROUPS_BY_TAB,
  HUB_MODULES,
  HUB_OVERVIEW,
  HUB_PRODUCT_DEFINITIONS,
  HUB_SEARCH_ENTRIES,
  HUB_START_HERE_STEPS,
  HUB_VERIFIED_DESTINATION_IDS,
  HUB_SECTIONS,
  HUB_RESOURCES_BY_TAB,
  HUB_TABS,
  searchHubEntries,
  externalResourceStatusSummary,
  isVerifiedLiveResource,
  moduleSurfaceStatusLabel,
  MODULE_STORIES,
  type HubSearchEntry,
  type ModuleStory
} from "../shared/hubManifest";
import type { HubTab } from "../shared/contracts";

export type { HubSearchEntry, ModuleStory };
export {
  EXTERNAL_RESOURCE_STATUS_LABELS,
  HUB_BRANDING,
  HUB_EXTERNAL_RESOURCES,
  HUB_GROUPS_BY_TAB,
  HUB_MODULES,
  HUB_OVERVIEW,
  HUB_PRODUCT_DEFINITIONS,
  HUB_SEARCH_ENTRIES,
  HUB_RESOURCES_BY_TAB,
  HUB_START_HERE_STEPS,
  HUB_VERIFIED_DESTINATION_IDS,
  HUB_SECTIONS,
  HUB_TABS,
  MODULE_STORIES,
  searchHubEntries,
  externalResourceStatusSummary,
  isVerifiedLiveResource,
  moduleSurfaceStatusLabel
};

export function modulesForTab(tab: HubTab) {
  const ordered = [...HUB_MODULES].sort((left, right) => (left.sortOrder ?? 999) - (right.sortOrder ?? 999));
  switch (tab) {
    case "use-ai":
      return ordered.filter((module) => module.id === "nulla-operator" || module.id === "settings-runtime");
    case "learn":
      return ordered.filter((module) => module.id === "start-here" || module.id === "proof-center");
    case "explore":
      return ordered.filter((module) =>
        ["ecosystem-overview", "paradoxlabs", "openclaw-gateway", "dark-null-protocol", "dna-infrastructure", "token-utilities"].includes(module.id)
      );
    case "community":
      return ordered.filter((module) => module.id === "community");
    case "settings":
      return ordered.filter((module) => module.id === "settings-runtime" || module.id === "proof-center");
    case "hub":
    default:
      return ordered.filter((module) =>
        ["nulla-operator", "start-here", "proof-center", "ecosystem-overview", "paradoxlabs", "community", "settings-runtime"].includes(module.id)
      );
  }
}
