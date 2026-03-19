import test from "node:test";
import assert from "node:assert/strict";

import {
  HUB_BRANDING,
  HUB_EXTERNAL_RESOURCES,
  HUB_GITHUB_REPOSITORY_DESTINATIONS,
  HUB_GROUPS_BY_TAB,
  HUB_MODULES,
  HUB_OFFICIAL_DESTINATIONS,
  HUB_OVERVIEW,
  HUB_PRODUCT_DEFINITIONS,
  HUB_SEARCH_ENTRIES,
  HUB_RESOURCES_BY_TAB,
  HUB_SECTIONS,
  HUB_START_HERE_STEPS,
  HUB_TABS,
  HUB_VERIFIED_DESTINATION_IDS,
  MODULE_STORIES,
  searchHubEntries,
  isVerifiedLiveResource
} from "../dist/shared/hubManifest.js";

test("hub branding and navigation stay defined", () => {
  assert.equal(HUB_BRANDING.productName, "NULLA Hub");
  assert.equal(HUB_BRANDING.ecosystem, "Parad0x Labs / NULL");
  assert.ok(HUB_BRANDING.eyebrow.length > 0);
  assert.ok(HUB_OVERVIEW.title.length > 0);

  const tabIds = HUB_TABS.map((tab) => tab.id);
  assert.equal(new Set(tabIds).size, tabIds.length);
  assert.ok(tabIds.includes("hub"));
  assert.ok(tabIds.includes("use-ai"));
  assert.equal(HUB_TABS.find((tab) => tab.id === "use-ai")?.label, "Operator");
});

test("canonical product copy and onboarding stay defined", () => {
  assert.ok(HUB_PRODUCT_DEFINITIONS.hub.sentence.length > 0);
  assert.ok(HUB_PRODUCT_DEFINITIONS.operator.sentence.length > 0);
  assert.equal(HUB_START_HERE_STEPS.length, 3);
  for (const step of HUB_START_HERE_STEPS) {
    assert.ok(step.title.length > 0);
    assert.ok(step.body.length > 0);
  }
});

test("hub modules keep unique ids and required flagship entries", () => {
  const moduleIds = HUB_MODULES.map((module) => module.id);
  assert.equal(new Set(moduleIds).size, moduleIds.length);
  assert.ok(moduleIds.includes("nulla-operator"));
  assert.ok(moduleIds.includes("start-here"));
  assert.ok(moduleIds.includes("proof-center"));
  assert.ok(moduleIds.includes("ecosystem-overview"));
});

test("external resource states stay valid and only verified live entries are actionable", () => {
  for (const resource of Object.values(HUB_EXTERNAL_RESOURCES)) {
    assert.ok(resource.subtitle.length > 0);
    assert.ok(resource.description.length > 0);
    if (resource.status === "verified_live") {
      assert.ok(resource.href, `${resource.id} must provide a URL when marked verified_live`);
      assert.equal(isVerifiedLiveResource(resource), true);
    } else {
      assert.equal(resource.href, null);
      assert.match(resource.note, /TODO:/);
      assert.equal(isVerifiedLiveResource(resource), false);
    }
  }
});

test("verified live destinations stay surfaced through the hub manifest", () => {
  const surfacedResourceIds = new Set([
    ...Object.values(HUB_RESOURCES_BY_TAB).flatMap((ids) => ids ?? []),
    ...HUB_MODULES.flatMap((module) => module.resourceIds ?? []),
    ...Object.values(HUB_GROUPS_BY_TAB).flatMap((groups) => (groups ?? []).flatMap((group) => group.resourceIds)),
    ...HUB_OVERVIEW.quickAccessResourceIds
  ]);

  for (const resource of Object.values(HUB_EXTERNAL_RESOURCES).filter((entry) => entry.status === "verified_live")) {
    assert.ok(surfacedResourceIds.has(resource.id), `Expected verified destination ${resource.id} to be surfaced through the hub`);
  }
});

test("GitHub repository entries stay present as individual verified destinations", () => {
  const repoResourceIds = [
    "github_repo_nulla_hive_mind",
    "github_repo_dna_x402",
    "github_repo_dark_null_protocol",
    "github_repo_liquefy_openclaw_integration",
    "github_repo_parad0x_command",
    "github_repo_paradox_compress_support",
    "github_repo_parad0x_compress_solana_mobile",
    "github_repo_parad0x_labs_github_io",
    "github_repo_parad0x_compress_android"
  ];

  const exploreGroups = HUB_GROUPS_BY_TAB.explore ?? [];
  const githubGroup = exploreGroups.find((group) => group.id === "explore-github");
  assert.ok(githubGroup, "Expected an Explore GitHub group");
  assert.equal(HUB_GITHUB_REPOSITORY_DESTINATIONS.length, repoResourceIds.length);

  for (const [index, resourceId] of repoResourceIds.entries()) {
    const resource = HUB_EXTERNAL_RESOURCES[resourceId];
    assert.ok(resource, `Missing GitHub repo resource: ${resourceId}`);
    assert.equal(resource.status, HUB_GITHUB_REPOSITORY_DESTINATIONS[index].status);
    assert.equal(resource.href, HUB_GITHUB_REPOSITORY_DESTINATIONS[index].url);
    assert.ok(githubGroup.resourceIds.includes(resourceId), `Expected ${resourceId} in the Explore GitHub group`);
  }
});

test("Discord is now a verified live official destination", () => {
  const discord = HUB_EXTERNAL_RESOURCES.community_discord;
  assert.equal(discord.status, "verified_live");
  assert.equal(discord.href, HUB_OFFICIAL_DESTINATIONS.discord);
  assert.equal(isVerifiedLiveResource(discord), true);
  assert.match(discord.note, /Official Parad0x Labs Discord invite/);
});

test("official destination constants stay aligned with verified live manifest entries", () => {
  assert.equal(HUB_EXTERNAL_RESOURCES.paradoxlabs_portal.href, HUB_OFFICIAL_DESTINATIONS.website);
  assert.equal(HUB_EXTERNAL_RESOURCES.docs_learn_null.href, HUB_OFFICIAL_DESTINATIONS.docs);
  assert.equal(HUB_EXTERNAL_RESOURCES.liquefy_page.href, HUB_OFFICIAL_DESTINATIONS.liquefy);
  assert.equal(HUB_EXTERNAL_RESOURCES.private_payments_page.href, HUB_OFFICIAL_DESTINATIONS.privatePayments);
  assert.equal(HUB_EXTERNAL_RESOURCES.github_repositories.href, HUB_OFFICIAL_DESTINATIONS.githubOrg);
  assert.equal(HUB_EXTERNAL_RESOURCES.community_discord.href, HUB_OFFICIAL_DESTINATIONS.discord);
  assert.equal(HUB_EXTERNAL_RESOURCES.community_x.href, HUB_OFFICIAL_DESTINATIONS.xParad0xLabs);
  assert.equal(HUB_EXTERNAL_RESOURCES.dev_x.href, HUB_OFFICIAL_DESTINATIONS.xDev);
  assert.equal(HUB_EXTERNAL_RESOURCES.community_linktree.href, HUB_OFFICIAL_DESTINATIONS.linktree);
});

test("hub resource placements only reference known manifest resources", () => {
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));
  for (const ids of Object.values(HUB_RESOURCES_BY_TAB)) {
    for (const id of ids ?? []) {
      assert.ok(resourceIds.has(id), `Unknown resource id: ${id}`);
    }
  }
});

test("module-linked resources only reference known manifest resources", () => {
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));
  for (const module of HUB_MODULES) {
    for (const resourceId of module.resourceIds ?? []) {
      assert.ok(resourceIds.has(resourceId), `Unknown module-linked resource id: ${resourceId}`);
    }
  }
});

test("hub overview and groups only reference known modules and resources", () => {
  const moduleIds = new Set(HUB_MODULES.map((module) => module.id));
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));

  for (const moduleId of HUB_OVERVIEW.featuredModuleIds) {
    assert.ok(moduleIds.has(moduleId), `Unknown featured module id: ${moduleId}`);
  }
  for (const resourceId of HUB_OVERVIEW.quickAccessResourceIds) {
    assert.ok(resourceIds.has(resourceId), `Unknown quick access resource id: ${resourceId}`);
  }

  for (const groups of Object.values(HUB_GROUPS_BY_TAB)) {
    for (const group of groups ?? []) {
      for (const moduleId of group.moduleIds) {
        assert.ok(moduleIds.has(moduleId), `Unknown grouped module id: ${moduleId}`);
      }
      for (const resourceId of group.resourceIds) {
        assert.ok(resourceIds.has(resourceId), `Unknown grouped resource id: ${resourceId}`);
      }
    }
  }
});

test("hub keeps NULLA Operator first and verified destinations manifest-backed", () => {
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));
  assert.equal(HUB_OVERVIEW.featuredModuleIds[0], "nulla-operator");
  assert.ok(HUB_VERIFIED_DESTINATION_IDS.length > 0);
  for (const resourceId of HUB_VERIFIED_DESTINATION_IDS) {
    assert.ok(resourceIds.has(resourceId), `Unknown verified destination id: ${resourceId}`);
    assert.equal(HUB_EXTERNAL_RESOURCES[resourceId].status, "verified_live");
  }
});

test("NULLA Operator remains the flagship internal action module", () => {
  const operator = HUB_MODULES.find((module) => module.id === "nulla-operator");
  assert.ok(operator);
  assert.equal(operator.actionType, "workflow");
  assert.equal(operator.status, "ready");
  assert.ok(HUB_OVERVIEW.featuredModuleIds.includes("nulla-operator"));
  assert.ok(MODULE_STORIES["nulla-operator"]);
  assert.ok((MODULE_STORIES["nulla-operator"].workflowSupport ?? []).length > 0);
});

test("top-level hub sections cover every nav tab with valid references", () => {
  const moduleIds = new Set(HUB_MODULES.map((module) => module.id));
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));

  assert.deepEqual(Object.keys(HUB_SECTIONS).sort(), HUB_TABS.map((tab) => tab.id).sort());

  for (const [tabId, section] of Object.entries(HUB_SECTIONS)) {
    assert.ok(section.title.length > 0, `Missing title for section ${tabId}`);
    for (const moduleId of section.featuredModuleIds) {
      assert.ok(moduleIds.has(moduleId), `Unknown section module id: ${moduleId}`);
    }
    for (const resourceId of section.featuredResourceIds) {
      assert.ok(resourceIds.has(resourceId), `Unknown section resource id: ${resourceId}`);
    }
    if (section.primaryAction.kind === "open-module") {
      assert.ok(moduleIds.has(section.primaryAction.moduleId), `Unknown primary action module id: ${section.primaryAction.moduleId}`);
    }
  }
});

test("Learn, Explore, and Community keep manifest-backed grouped content", () => {
  for (const tabId of ["learn", "explore", "community"]) {
    const groups = HUB_GROUPS_BY_TAB[tabId];
    assert.ok(groups?.length, `Expected grouped content for ${tabId}`);
    for (const group of groups) {
      assert.ok(group.label.length > 0, `Missing group label for ${tabId}`);
      assert.ok(group.description.length > 0, `Missing group description for ${tabId}`);
      assert.ok(group.moduleIds.length + group.resourceIds.length > 0, `Expected module or resource references for ${tabId}/${group.id}`);
    }
  }
});

test("Operator tab stays wired to the flagship NULLA Operator module", () => {
  const operatorTab = HUB_SECTIONS["use-ai"];
  assert.equal(operatorTab.primaryAction.kind, "open-module");
  assert.equal(operatorTab.primaryAction.moduleId, "nulla-operator");
  assert.ok(operatorTab.featuredModuleIds.includes("nulla-operator"));
});

test("search entries stay manifest-backed and preserve verified-only external actions", () => {
  const moduleIds = new Set(HUB_MODULES.map((module) => module.id));
  const resourceIds = new Set(Object.keys(HUB_EXTERNAL_RESOURCES));
  const tabIds = new Set(HUB_TABS.map((tab) => tab.id));
  const groupIdsByTab = new Map(
    Object.entries(HUB_GROUPS_BY_TAB).map(([tab, groups]) => [tab, new Set((groups ?? []).map((group) => group.id))])
  );

  assert.ok(HUB_SEARCH_ENTRIES.length > 0);

  for (const entry of HUB_SEARCH_ENTRIES) {
    assert.ok(tabIds.has(entry.tab), `Unknown search tab: ${entry.tab}`);
    if (entry.kind === "module") {
      assert.ok(moduleIds.has(entry.target.moduleId), `Unknown search module id: ${entry.target.moduleId}`);
      assert.equal(entry.actionable, true);
    }
    if (entry.kind === "resource") {
      assert.ok(resourceIds.has(entry.target.resourceId), `Unknown search resource id: ${entry.target.resourceId}`);
      assert.equal(entry.actionable, isVerifiedLiveResource(HUB_EXTERNAL_RESOURCES[entry.target.resourceId]));
    }
    if (entry.kind === "section") {
      assert.ok(tabIds.has(entry.target.tab), `Unknown search section tab: ${entry.target.tab}`);
    }
    if (entry.kind === "learning-topic") {
      assert.ok(groupIdsByTab.get(entry.target.tab)?.has(entry.target.groupId), `Unknown search group id: ${entry.target.groupId}`);
    }
  }

  const learnMatches = searchHubEntries("learn");
  assert.ok(learnMatches.some((entry) => entry.kind === "section" && entry.target.kind === "tab" && entry.target.tab === "learn"));
});

test("informational stories only point at known modules", () => {
  const moduleIds = new Set(HUB_MODULES.map((module) => module.id));
  for (const storyId of Object.keys(MODULE_STORIES)) {
    assert.ok(moduleIds.has(storyId), `Unknown module story id: ${storyId}`);
  }
});
