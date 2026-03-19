import type { HubModule, HubTab } from "./contracts";

export interface ModuleStory {
  eyebrow: string;
  body: string;
  highlights: string[];
  trustNotes: string[];
  cta?: string;
  workflowSupport?: string[];
  statusNote?: string;
}

export interface HubBranding {
  eyebrow: string;
  productName: string;
  ecosystem: string;
}

export interface ProductDefinition {
  title: string;
  sentence: string;
  trustSentence: string;
}

export interface OnboardingStep {
  title: string;
  body: string;
}

export type ExternalResourceKind = "portal" | "docs" | "community" | "ecosystem" | "token";
export type ExternalResourceStatus = "verified_live" | "placeholder" | "coming_soon" | "unavailable";

export interface ExternalResourceRecord {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  kind: ExternalResourceKind;
  icon?: string;
  href: string | null;
  status: ExternalResourceStatus;
  note: string;
}

export const EXTERNAL_RESOURCE_STATUS_LABELS: Record<ExternalResourceStatus, string> = {
  verified_live: "Verified",
  placeholder: "Waiting for verification",
  coming_soon: "Coming Soon",
  unavailable: "Not yet available"
};

export function isVerifiedLiveResource(resource: ExternalResourceRecord) {
  return resource.status === "verified_live" && Boolean(resource.href);
}

export function externalResourceStatusSummary(status: ExternalResourceStatus) {
  switch (status) {
    case "verified_live":
      return "Verified destination. Safe to open from the hub.";
    case "placeholder":
      return "Visible now, but still waiting for a verified destination.";
    case "coming_soon":
      return "Planned surface. Not available yet.";
    case "unavailable":
    default:
      return "Not yet available and stays non-actionable.";
  }
}

export function moduleSurfaceStatusLabel(module: HubModule) {
  if (module.id === "nulla-operator") return "Live";
  if (module.actionType === "workflow") return "Internal";
  if (module.actionType === "placeholder" || module.status === "coming-soon" || module.status === "restricted") return "Coming Soon";
  return "Read Only";
}

export type HubResourcePlacement = Partial<Record<HubTab, string[]>>;

export interface HubOverviewContent {
  eyebrow: string;
  title: string;
  description: string;
  featuredModuleIds: string[];
  quickAccessResourceIds: string[];
}

export interface HubGroupDefinition {
  id: string;
  label: string;
  description: string;
  moduleIds: string[];
  resourceIds: string[];
}

export interface HubSectionContent {
  eyebrow: string;
  title: string;
  description: string;
  featuredModuleIds: string[];
  featuredResourceIds: string[];
  primaryAction:
    | { kind: "open-module"; moduleId: string; label: string }
    | { kind: "open-settings"; label: string }
    | { kind: "none"; label?: string };
}

export const HUB_BRANDING: HubBranding = {
  eyebrow: "Parad0xLabs gateway",
  productName: "NULLA Hub",
  ecosystem: "Parad0x Labs / NULL"
};

export const HUB_OFFICIAL_DESTINATIONS = {
  website: "https://parad0xlabs.com",
  docs: "https://parad0xlabs.com/docs",
  liquefy: "https://parad0xlabs.com/liquefy",
  privatePayments: "https://parad0xlabs.com/private-payments",
  githubOrg: "https://github.com/Parad0x-Labs",
  discord: "https://discord.gg/963Wdkcd7q",
  xParad0xLabs: "https://x.com/Parad0x_Labs",
  xDev: "https://x.com/Paradox_X402",
  linktree: "https://linktr.ee/Parad0xLabs"
} as const;

export const HUB_PLACEHOLDER_DESTINATIONS = {} as const;

export const HUB_GITHUB_REPOSITORY_DESTINATIONS = [
  { name: "nulla-hive-mind", url: "https://github.com/Parad0x-Labs/nulla-hive-mind", status: "verified_live" },
  { name: "dna-x402", url: "https://github.com/Parad0x-Labs/dna-x402", status: "verified_live" },
  { name: "Dark-Null-Protocol", url: "https://github.com/Parad0x-Labs/Dark-Null-Protocol", status: "verified_live" },
  { name: "liquefy-openclaw-integration", url: "https://github.com/Parad0x-Labs/liquefy-openclaw-integration", status: "verified_live" },
  { name: "Parad0x-Command", url: "https://github.com/Parad0x-Labs/Parad0x-Command", status: "verified_live" },
  { name: "paradox-compress-support", url: "https://github.com/Parad0x-Labs/paradox-compress-support", status: "verified_live" },
  { name: "Parad0x-Compress-Solana-Mobile", url: "https://github.com/Parad0x-Labs/Parad0x-Compress-Solana-Mobile", status: "verified_live" },
  { name: "parad0x-labs.github.io", url: "https://github.com/Parad0x-Labs/parad0x-labs.github.io", status: "verified_live" },
  { name: "Parad0x-Compress-Android-edition", url: "https://github.com/Parad0x-Labs/Parad0x-Compress-Android-edition", status: "verified_live" }
] as const;

export const HUB_PRODUCT_DEFINITIONS: Record<"hub" | "operator", ProductDefinition> = {
  hub: {
    title: "NULLA Hub",
    sentence: "NULLA Hub is the desktop gateway into the NULLA and Parad0xLabs ecosystem.",
    trustSentence: "It should help the user open the live workflow first, learn what is real now, and browse everything else safely."
  },
  operator: {
    title: "NULLA Operator",
    sentence: "NULLA Operator is the live guided workflow for sending real work through the current desktop Codex path.",
    trustSentence: "It is the main live internal workflow in the hub. Everything else should help the user learn, browse, or connect safely."
  }
};

export const HUB_START_HERE_STEPS: OnboardingStep[] = [
  {
    title: "What this is",
    body: HUB_PRODUCT_DEFINITIONS.hub.sentence
  },
  {
    title: "What you can do right now",
    body: HUB_PRODUCT_DEFINITIONS.operator.sentence
  },
  {
    title: "How trust and status work",
    body: "Only verified destinations are actionable. Everything else is read only, planned, or waiting for verification."
  }
];

export const HUB_OVERVIEW: HubOverviewContent = {
  eyebrow: "Portal home",
  title: "Open the live operator first, then learn, browse, or connect safely.",
  description:
    `${HUB_PRODUCT_DEFINITIONS.hub.sentence} Start Here explains what this is, what you can do right now, and how trust works in three short steps.`,
  featuredModuleIds: ["nulla-operator", "start-here", "proof-center", "ecosystem-overview"],
  quickAccessResourceIds: ["paradoxlabs_portal", "docs_learn_null", "community_x", "dev_x", "community_linktree"]
};

export const HUB_SECTIONS: Record<HubTab, HubSectionContent> = {
  hub: {
    eyebrow: HUB_OVERVIEW.eyebrow,
    title: HUB_OVERVIEW.title,
    description: HUB_OVERVIEW.description,
    featuredModuleIds: HUB_OVERVIEW.featuredModuleIds,
    featuredResourceIds: HUB_OVERVIEW.quickAccessResourceIds,
    primaryAction: { kind: "open-module", moduleId: "nulla-operator", label: "Open live operator" }
  },
  "use-ai": {
    eyebrow: "Live workflow",
    title: "Open the live guided workflow for real desktop work.",
    description:
      `${HUB_PRODUCT_DEFINITIONS.operator.sentence} This section is for doing the work, not for browsing placeholder surfaces.`,
    featuredModuleIds: ["nulla-operator", "settings-runtime"],
    featuredResourceIds: [],
    primaryAction: { kind: "open-module", moduleId: "nulla-operator", label: "Enter NULLA Operator" }
  },
  learn: {
    eyebrow: "Read-only guidance",
    title: "Learn what NULLA is, what is live now, and what is still planned.",
    description:
      "Learn is for orientation. It explains the live workflow, the trust model, and the ecosystem in plain language before the user goes deeper.",
    featuredModuleIds: ["start-here", "proof-center", "ecosystem-overview"],
    featuredResourceIds: ["docs_learn_null", "liquefy_page", "private_payments_page"],
    primaryAction: { kind: "open-module", moduleId: "start-here", label: "Open Start Here" }
  },
  explore: {
    eyebrow: "Safe browsing",
    title: "Browse products, protocols, and planned surfaces without treating them like live tools.",
    description:
      "Explore is for discovery. It maps the wider ecosystem while keeping live actions and verified destinations clearly separate.",
    featuredModuleIds: ["ecosystem-overview", "paradoxlabs", "openclaw-gateway"],
    featuredResourceIds: ["paradoxlabs_portal", "github_repositories", "liquefy_page", "private_payments_page"],
    primaryAction: { kind: "open-module", moduleId: "ecosystem-overview", label: "Open ecosystem overview" }
  },
  community: {
    eyebrow: "Verified connections",
    title: "Reach support and public-facing community surfaces through verified destinations only.",
    description:
      "Community is for support, updates, and safe public links. Verified destinations can open. Everything else stays visible but non-actionable.",
    featuredModuleIds: ["community"],
    featuredResourceIds: ["community_discord", "community_x", "dev_x", "community_linktree"],
    primaryAction: { kind: "open-module", moduleId: "community", label: "Open community details" }
  },
  settings: {
    eyebrow: "System controls",
    title: "Review voice, folders, wake, and runtime status in one place.",
    description:
      "Settings is where the user reviews system controls and readiness. It should stay clear, reachable, and separate from portal browsing.",
    featuredModuleIds: ["settings-runtime", "proof-center"],
    featuredResourceIds: [],
    primaryAction: { kind: "open-settings", label: "Open system controls" }
  }
};

export const HUB_TABS: Array<{ id: HubTab; label: string }> = [
  { id: "hub", label: "Hub" },
  { id: "use-ai", label: "Operator" },
  { id: "learn", label: "Learn" },
  { id: "explore", label: "Explore" },
  { id: "community", label: "Community" },
  { id: "settings", label: "Settings" }
];

export const HUB_EXTERNAL_RESOURCES: Record<string, ExternalResourceRecord> = {
  ecosystem_overview: {
    id: "ecosystem_overview",
    label: "Ecosystem Overview",
    subtitle: "A guided map of the ecosystem surface",
    description: "Use this as the overview anchor for the wider NULLA and Parad0xLabs landscape before going deeper into product-specific pages.",
    kind: "ecosystem",
    icon: "PX",
    href: HUB_OFFICIAL_DESTINATIONS.website,
    status: "verified_live",
    note: "Official Parad0x Labs public website."
  },
  github_repositories: {
    id: "github_repositories",
    label: "GitHub / org",
    subtitle: "Verified Parad0x Labs repository hub",
    description: "Use this as the official GitHub entry point for the Parad0x Labs organization and its public repositories.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_OFFICIAL_DESTINATIONS.githubOrg,
    status: "verified_live",
    note: "Official Parad0x Labs GitHub organization."
  },
  docs_learn_null: {
    id: "docs_learn_null",
    label: "Docs / Learn NULL",
    subtitle: "Guides, onboarding, and documentation",
    description: "Use this entry point for verified docs, onboarding, and plain-language learning content once those URLs are confirmed.",
    kind: "docs",
    icon: "DK",
    href: HUB_OFFICIAL_DESTINATIONS.docs,
    status: "verified_live",
    note: "Official Parad0x Labs documentation portal."
  },
  community_discord: {
    id: "community_discord",
    label: "Community / Discord",
    subtitle: "Community chat and support",
    description: "Use this as the verified Discord destination for community chat, support, and release discussion.",
    kind: "community",
    icon: "DC",
    href: HUB_OFFICIAL_DESTINATIONS.discord,
    status: "verified_live",
    note: "Official Parad0x Labs Discord invite."
  },
  community_x: {
    id: "community_x",
    label: "Community / X",
    subtitle: "Public updates and release signal",
    description: "Use this for the verified public social surface once the canonical X profile is confirmed.",
    kind: "community",
    icon: "X",
    href: HUB_OFFICIAL_DESTINATIONS.xParad0xLabs,
    status: "verified_live",
    note: "Official Parad0x Labs X account."
  },
  dev_x: {
    id: "dev_x",
    label: "Dev X",
    subtitle: "Developer-facing X account",
    description: "Use this as the verified developer-facing X destination tied to the x402 and engineering surface.",
    kind: "community",
    icon: "X",
    href: HUB_OFFICIAL_DESTINATIONS.xDev,
    status: "verified_live",
    note: "Official developer X account."
  },
  community_linktree: {
    id: "community_linktree",
    label: "Community / Linktree",
    subtitle: "Verified link hub",
    description: "Use this as the verified link hub instead of scattering public destinations across the renderer.",
    kind: "community",
    icon: "LT",
    href: HUB_OFFICIAL_DESTINATIONS.linktree,
    status: "verified_live",
    note: "Official Parad0x Labs Linktree."
  },
  paradoxlabs_portal: {
    id: "paradoxlabs_portal",
    label: "Parad0xLabs.com",
    subtitle: "Primary brand and ecosystem site",
    description: "This is the main verified Parad0x Labs site and the safest general external entry point from the hub.",
    kind: "portal",
    icon: "PX",
    href: HUB_OFFICIAL_DESTINATIONS.website,
    status: "verified_live",
    note: "Official Parad0x Labs public portal."
  },
  liquefy_page: {
    id: "liquefy_page",
    label: "Liquefy",
    subtitle: "Official Liquefy product page",
    description: "Verified product page for Liquefy inside the main Parad0x Labs site.",
    kind: "portal",
    icon: "PX",
    href: HUB_OFFICIAL_DESTINATIONS.liquefy,
    status: "verified_live",
    note: "Official Parad0x Labs Liquefy page."
  },
  private_payments_page: {
    id: "private_payments_page",
    label: "Private Payments",
    subtitle: "Official private payments page",
    description: "Verified Parad0x Labs page for the private payments product surface.",
    kind: "portal",
    icon: "PX",
    href: HUB_OFFICIAL_DESTINATIONS.privatePayments,
    status: "verified_live",
    note: "Official Parad0x Labs Private Payments page."
  },
  github_repo_nulla_hive_mind: {
    id: "github_repo_nulla_hive_mind",
    label: "GitHub / nulla-hive-mind",
    subtitle: "Repository entry",
    description: "Official repository entry for nulla-hive-mind.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[0].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[0].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_dna_x402: {
    id: "github_repo_dna_x402",
    label: "GitHub / dna-x402",
    subtitle: "Repository entry",
    description: "Official repository entry for dna-x402.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[1].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[1].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_dark_null_protocol: {
    id: "github_repo_dark_null_protocol",
    label: "GitHub / Dark-Null-Protocol",
    subtitle: "Repository entry",
    description: "Official repository entry for Dark-Null-Protocol.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[2].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[2].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_liquefy_openclaw_integration: {
    id: "github_repo_liquefy_openclaw_integration",
    label: "GitHub / liquefy-openclaw-integration",
    subtitle: "Repository entry",
    description: "Official repository entry for liquefy-openclaw-integration.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[3].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[3].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_parad0x_command: {
    id: "github_repo_parad0x_command",
    label: "GitHub / Parad0x-Command",
    subtitle: "Repository entry",
    description: "Official repository entry for Parad0x-Command.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[4].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[4].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_paradox_compress_support: {
    id: "github_repo_paradox_compress_support",
    label: "GitHub / paradox-compress-support",
    subtitle: "Repository entry",
    description: "Official repository entry for paradox-compress-support.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[5].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[5].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_parad0x_compress_solana_mobile: {
    id: "github_repo_parad0x_compress_solana_mobile",
    label: "GitHub / Parad0x-Compress-Solana-Mobile",
    subtitle: "Repository entry",
    description: "Official repository entry for Parad0x-Compress-Solana-Mobile.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[6].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[6].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_parad0x_labs_github_io: {
    id: "github_repo_parad0x_labs_github_io",
    label: "GitHub / parad0x-labs.github.io",
    subtitle: "Repository entry",
    description: "Official repository entry for parad0x-labs.github.io.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[7].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[7].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  github_repo_parad0x_compress_android: {
    id: "github_repo_parad0x_compress_android",
    label: "GitHub / Parad0x-Compress-Android-edition",
    subtitle: "Repository entry",
    description: "Official repository entry for Parad0x-Compress-Android-edition.",
    kind: "ecosystem",
    icon: "GH",
    href: HUB_GITHUB_REPOSITORY_DESTINATIONS[8].url,
    status: HUB_GITHUB_REPOSITORY_DESTINATIONS[8].status,
    note: "Official Parad0x Labs GitHub repository."
  },
  jupiter_token_link: {
    id: "jupiter_token_link",
    label: "Jupiter / token link",
    subtitle: "Advanced token utility gateway",
    description: "Keep this deeper in the information architecture until the verified token utility destination is ready to expose.",
    kind: "token",
    href: null,
    status: "coming_soon",
    note: "TODO: add the verified Jupiter or token utility URL."
  },
  liquefy: {
    id: "liquefy",
    label: "Liquefy",
    subtitle: "Future ecosystem utility entry",
    description: "Liquefy is visible as part of the ecosystem map, but it should not behave like a live destination until its verified source is present.",
    kind: "ecosystem",
    href: null,
    status: "coming_soon",
    note: "TODO: add the verified Liquefy URL."
  },
  dark_null_protocol: {
    id: "dark_null_protocol",
    label: "Dark NULL Protocol",
    subtitle: "Protocol explainer entry point",
    description: "Use this as the verified protocol explainer destination once the canonical reference page is known.",
    kind: "ecosystem",
    href: null,
    status: "coming_soon",
    note: "TODO: add the verified Dark NULL reference URL."
  },
  dna: {
    id: "dna",
    label: "DNA",
    subtitle: "Infrastructure and system layer",
    description: "DNA remains a deeper ecosystem surface and should stay informational until its verified source is defined.",
    kind: "ecosystem",
    href: null,
    status: "coming_soon",
    note: "TODO: add the verified DNA ecosystem URL."
  }
};

export const HUB_RESOURCES_BY_TAB: HubResourcePlacement = {
  hub: ["paradoxlabs_portal", "docs_learn_null", "community_x", "dev_x", "community_linktree", "github_repositories"],
  learn: ["docs_learn_null", "liquefy_page", "private_payments_page"],
  explore: [
    "ecosystem_overview",
    "paradoxlabs_portal",
    "liquefy_page",
    "private_payments_page",
    "github_repositories",
    "github_repo_nulla_hive_mind",
    "github_repo_dna_x402",
    "github_repo_dark_null_protocol",
    "github_repo_liquefy_openclaw_integration",
    "github_repo_parad0x_command",
    "github_repo_paradox_compress_support",
    "github_repo_parad0x_compress_solana_mobile",
    "github_repo_parad0x_labs_github_io",
    "github_repo_parad0x_compress_android",
    "liquefy",
    "dark_null_protocol",
    "dna",
    "jupiter_token_link"
  ],
  community: ["community_discord", "community_x", "dev_x", "community_linktree"],
  settings: [],
  "use-ai": []
};

export const HUB_VERIFIED_DESTINATION_IDS = Array.from(
  new Set([
    ...HUB_OVERVIEW.quickAccessResourceIds,
    ...HUB_SECTIONS.community.featuredResourceIds,
    ...HUB_SECTIONS.explore.featuredResourceIds,
    "github_repositories"
  ])
).filter((resourceId) => {
  const resource = HUB_EXTERNAL_RESOURCES[resourceId];
  return Boolean(resource && isVerifiedLiveResource(resource));
});

export const HUB_GROUPS_BY_TAB: Partial<Record<HubTab, HubGroupDefinition[]>> = {
  hub: [
    {
      id: "featured",
      label: "Featured",
      description: "Start with the most important gateway surfaces first.",
      moduleIds: ["nulla-operator", "start-here", "proof-center", "ecosystem-overview"],
      resourceIds: []
    },
    {
      id: "products",
      label: "Products",
      description: "Working product surfaces and their closest low-risk entry points.",
      moduleIds: ["nulla-operator", "ecosystem-overview", "paradoxlabs"],
      resourceIds: ["github_repositories", "paradoxlabs_portal"]
    },
    {
      id: "learn",
      label: "Learn",
      description: "Plain-language guidance before deeper ecosystem depth.",
      moduleIds: ["start-here", "proof-center"],
      resourceIds: ["docs_learn_null", "ecosystem_overview"]
    },
    {
      id: "community",
      label: "Community",
      description: "Support and public-facing signal, kept low risk.",
      moduleIds: ["community"],
      resourceIds: ["community_discord", "community_x", "community_linktree"]
    },
    {
      id: "links",
      label: "Links",
      description: "Low-risk outward-facing portal routes when verified.",
      moduleIds: [],
      resourceIds: ["paradoxlabs_portal", "docs_learn_null", "community_x", "dev_x", "community_linktree", "jupiter_token_link"]
    },
    {
      id: "github",
      label: "GitHub",
      description: "Official GitHub organization and repository entries, each kept as its own trusted external destination.",
      moduleIds: [],
      resourceIds: [
        "github_repositories",
        "github_repo_nulla_hive_mind",
        "github_repo_dna_x402",
        "github_repo_dark_null_protocol",
        "github_repo_liquefy_openclaw_integration",
        "github_repo_parad0x_command",
        "github_repo_paradox_compress_support",
        "github_repo_parad0x_compress_solana_mobile",
        "github_repo_parad0x_labs_github_io",
        "github_repo_parad0x_compress_android"
      ]
    },
    {
      id: "coming-soon",
      label: "Coming Soon",
      description: "Visible future surfaces that are not yet active.",
      moduleIds: ["openclaw-gateway", "dark-null-protocol", "dna-infrastructure", "token-utilities"],
      resourceIds: ["liquefy", "dark_null_protocol", "dna", "jupiter_token_link"]
    }
  ],
  learn: [
    {
      id: "learn-start",
      label: "Start with the live path",
      description: "Understand what NULLA can do right now before you go deeper into ecosystem structure or future surfaces.",
      moduleIds: ["start-here", "nulla-operator"],
      resourceIds: ["docs_learn_null"]
    },
    {
      id: "learn-trust",
      label: "Trust and readiness",
      description: "Use the trust framing and runtime controls to understand what stays read-only, what executes locally, and what still needs verified sources.",
      moduleIds: ["proof-center", "settings-runtime"],
      resourceIds: ["ecosystem_overview"]
    },
    {
      id: "learn-map",
      label: "Map the ecosystem",
      description: "Once the main workflow is clear, use the ecosystem surfaces to understand the wider Parad0xLabs and NULL landscape.",
      moduleIds: ["ecosystem-overview", "paradoxlabs"],
      resourceIds: ["paradoxlabs_portal", "docs_learn_null", "liquefy_page", "private_payments_page"]
    },
    {
      id: "learn-coming-soon",
      label: "Visible but not live yet",
      description: "These surfaces are intentionally present so the ecosystem direction is visible, but they remain non-actionable until their references and runtime paths are ready.",
      moduleIds: ["openclaw-gateway", "dark-null-protocol", "dna-infrastructure"],
      resourceIds: ["dark_null_protocol", "dna"]
    }
  ],
  explore: [
    {
      id: "explore-products",
      label: "Products and portal surfaces",
      description: "Browse the core product and ecosystem entry points first. These are discovery surfaces, not broad execution controls.",
      moduleIds: ["ecosystem-overview", "paradoxlabs", "community"],
      resourceIds: ["paradoxlabs_portal", "liquefy_page", "private_payments_page", "ecosystem_overview"]
    },
    {
      id: "explore-github",
      label: "GitHub",
      description: "Official GitHub organization and repository destinations. Each repository has its own verified entry instead of being collapsed into one generic link.",
      moduleIds: [],
      resourceIds: [
        "github_repositories",
        "github_repo_nulla_hive_mind",
        "github_repo_dna_x402",
        "github_repo_dark_null_protocol",
        "github_repo_liquefy_openclaw_integration",
        "github_repo_parad0x_command",
        "github_repo_paradox_compress_support",
        "github_repo_parad0x_compress_solana_mobile",
        "github_repo_parad0x_labs_github_io",
        "github_repo_parad0x_compress_android"
      ]
    },
    {
      id: "explore-protocols",
      label: "Protocol and infrastructure",
      description: "Deeper protocol and infrastructure concepts stay visible for discovery, but remain read-only until their source references are verified.",
      moduleIds: ["dark-null-protocol", "dna-infrastructure"],
      resourceIds: ["dark_null_protocol", "dna"]
    },
    {
      id: "explore-advanced",
      label: "Advanced utilities",
      description: "Advanced token and utility routes should stay one layer deeper until the ecosystem links are real and the first-use journey remains clear.",
      moduleIds: ["token-utilities", "openclaw-gateway"],
      resourceIds: ["jupiter_token_link", "liquefy"]
    }
  ],
  community: [
    {
      id: "community-support",
      label: "Support and conversation",
      description: "Community surfaces should stay trusted. Only verified destinations become actionable; everything else remains visibly unavailable.",
      moduleIds: ["community"],
      resourceIds: ["community_discord", "community_linktree"]
    },
    {
      id: "community-updates",
      label: "Public updates",
      description: "Public-facing signal belongs here once verified social destinations are confirmed and safe to expose.",
      moduleIds: [],
      resourceIds: ["community_x", "dev_x"]
    }
  ]
};

export const HUB_MODULES: HubModule[] = [
  {
    id: "nulla-operator",
    title: "NULLA Operator",
    subtitle: "Live guided desktop workflow",
    description: "Speak or type a request, send it through the existing desktop operator loop, and get a plain-language summary back.",
    icon: "OP",
    category: "operator",
    route: "/action/nulla-operator",
    actionType: "workflow",
    riskLevel: "high",
    enabled: true,
    internal: true,
    requiresBackend: true,
    requiresLocalRuntime: true,
    status: "ready",
    capabilities: ["voice_capture", "voice_playback", "desktop_codex_submit", "desktop_codex_capture", "journal_write"],
    moduleAdapterId: "desktop-codex-primary",
    badge: "Flagship",
    sortOrder: 1
  },
  {
    id: "start-here",
    title: "Start Here",
    subtitle: "A guided NULLA introduction",
    description: "Start with what this is, what it can do for you right now, and why the system is built around clear trust boundaries.",
    icon: "ST",
    category: "learn",
    route: "/module/start-here",
    actionType: "informational",
    riskLevel: "low",
    enabled: true,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "ready",
    capabilities: [],
    badge: "Start",
    resourceIds: ["docs_learn_null"],
    sortOrder: 2
  },
  {
    id: "proof-center",
    title: "Proof Center",
    subtitle: "Trust, readiness, and evidence",
    description: "See runtime readiness, safety boundaries, and proof-style explanations instead of marketing claims.",
    icon: "PF",
    category: "system",
    route: "/module/proof-center",
    actionType: "informational",
    riskLevel: "low",
    enabled: true,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "ready",
    capabilities: [],
    badge: "Trust",
    resourceIds: ["ecosystem_overview"],
    sortOrder: 3
  },
  {
    id: "ecosystem-overview",
    title: "Ecosystem Overview",
    subtitle: "Understand the hub landscape first",
    description: "A plain-language overview of the wider NULLA and Parad0xLabs surfaces, kept separate from high-risk execution flows.",
    icon: "EO",
    category: "ecosystem",
    route: "/module/ecosystem-overview",
    actionType: "informational",
    riskLevel: "low",
    enabled: true,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "beta",
    capabilities: [],
    resourceIds: ["ecosystem_overview", "github_repositories", "docs_learn_null", "paradoxlabs_portal"],
    sortOrder: 4
  },
  {
    id: "paradoxlabs",
    title: "Parad0xLabs",
    subtitle: "Wider ecosystem overview",
    description: "Explore the broader ecosystem once the first-use path is clear and the system already feels useful.",
    icon: "PX",
    category: "ecosystem",
    route: "/module/paradoxlabs",
    actionType: "informational",
    riskLevel: "low",
    enabled: true,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "beta",
    capabilities: [],
    resourceIds: ["paradoxlabs_portal", "github_repositories", "liquefy", "dark_null_protocol", "dna"],
    sortOrder: 5
  },
  {
    id: "community",
    title: "Community",
    subtitle: "Support, updates, and conversation",
    description: "A place for release notes, support direction, and community surfaces without pulling attention away from the first-use flow.",
    icon: "CM",
    category: "community",
    route: "/module/community",
    actionType: "informational",
    riskLevel: "low",
    enabled: true,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "beta",
    capabilities: [],
    resourceIds: ["community_discord", "community_x", "community_linktree"],
    sortOrder: 6
  },
  {
    id: "settings-runtime",
    title: "Settings & Runtime",
    subtitle: "Permissions, voice, and readiness",
    description: "Manage folders, voices, wake phrase settings, provider selection, and local diagnostics before you run high-risk workflows.",
    icon: "RT",
    category: "settings",
    route: "/action/settings-runtime",
    actionType: "workflow",
    riskLevel: "medium",
    enabled: true,
    internal: true,
    requiresBackend: true,
    requiresLocalRuntime: false,
    status: "ready",
    capabilities: ["read_local_settings", "write_local_settings", "voice_capture", "voice_playback"],
    sortOrder: 7
  },
  {
    id: "openclaw-gateway",
    title: "OpenClaw Gateway",
    subtitle: "Local operator bridge",
    description: "A future local operator surface that is visible now but intentionally marked as not ready to run yet.",
    icon: "OC",
    category: "integrations",
    route: "/module/openclaw-gateway",
    actionType: "placeholder",
    riskLevel: "medium",
    enabled: false,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: true,
    status: "coming-soon",
    capabilities: ["future_openclaw_bridge"],
    resourceIds: ["github_repositories"],
    sortOrder: 8
  },
  {
    id: "dark-null-protocol",
    title: "Dark NULL Protocol",
    subtitle: "Protocol concepts in plain language",
    description: "A future explainer surface for protocol flows and trust boundaries, kept one layer deeper than the home screen.",
    icon: "DN",
    category: "ecosystem",
    route: "/module/dark-null-protocol",
    actionType: "placeholder",
    riskLevel: "low",
    enabled: false,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "coming-soon",
    capabilities: [],
    resourceIds: ["dark_null_protocol"],
    sortOrder: 9
  },
  {
    id: "dna-infrastructure",
    title: "DNA Infrastructure",
    subtitle: "Deeper infrastructure layer",
    description: "Advanced infrastructure learning stays visible but does not dominate the front door of the product.",
    icon: "DNA",
    category: "ecosystem",
    route: "/module/dna-infrastructure",
    actionType: "placeholder",
    riskLevel: "low",
    enabled: false,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "coming-soon",
    capabilities: [],
    resourceIds: ["dna"],
    sortOrder: 10
  },
  {
    id: "token-utilities",
    title: "Token / Utilities",
    subtitle: "Advanced tools layer",
    description: "Kept deeper in the information architecture so the first impression stays useful first and speculative second.",
    icon: "UT",
    category: "ecosystem",
    route: "/module/token-utilities",
    actionType: "placeholder",
    riskLevel: "restricted",
    enabled: false,
    internal: true,
    requiresBackend: false,
    requiresLocalRuntime: false,
    status: "restricted",
    capabilities: [],
    resourceIds: ["jupiter_token_link"],
    sortOrder: 11
  }
];

export const MODULE_STORIES: Record<string, ModuleStory> = {
  "nulla-operator": {
    eyebrow: "Flagship action module",
    body: `${HUB_PRODUCT_DEFINITIONS.operator.sentence} It takes typed or spoken requests, submits them through the current desktop Codex path, and returns a plain-language result with the existing summary and journal flow.`,
    highlights: [
      "This is the live guided workflow in NULLA Hub.",
      "It uses the current working desktop-primary operator path instead of a second operator implementation."
    ],
    trustNotes: [
      "Execution stays inside the existing operator/runtime boundary.",
      "The hub only launches the existing operator surface. It does not change backend behavior."
    ],
    workflowSupport: [
      "Typed request entry",
      "Microphone capture",
      "Live Codex desktop submit",
      "Spoken summary and engineering log output"
    ],
    statusNote: "Live flagship workflow. Ready to run through the current desktop-primary path.",
    cta: "Enter live operator"
  },
  "start-here": {
    eyebrow: "Newcomer path",
    body: "Start Here is the short orientation layer for first-time users. It should explain what NULLA Hub is, what you can do right now, and how trust works before asking the user to go deeper.",
    highlights: HUB_START_HERE_STEPS.map((step) => `${step.title}: ${step.body}`),
    trustNotes: [
      "The app should feel like a guided desktop gateway, not a wall of equal-weight links.",
      "Only verified destinations should behave like live exits from the hub."
    ],
    cta: "Open NULLA Operator"
  },
  "proof-center": {
    eyebrow: "Trust surface",
    body: "Proof Center exists to show evidence, readiness, and boundaries. It explains what is live, what stays read only, and what is still waiting for verification.",
    highlights: [
      "Show readiness and trust clearly without turning the first screen into a diagnostics wall.",
      "Turn diagnostics and proof artifacts into product surfaces instead of hiding them in dev notes."
    ],
    trustNotes: ["Users should understand what the system is allowed to do before they run it."]
  },
  paradoxlabs: {
    eyebrow: "Explore layer",
    body: "The wider ecosystem should be discoverable without becoming the first thing a new user has to decode.",
    highlights: ["Keep the ecosystem visible under Explore.", "Let the home screen stay centered on use, learning, and trust."],
    trustNotes: ["Useful first. Impressive second."]
  },
  "ecosystem-overview": {
    eyebrow: "Map first",
    body: "The hub should make the ecosystem understandable before it asks the user to care about every deeper surface or future integration.",
    highlights: [
      "Give the user a clear mental model of what is useful now versus what is still coming later.",
      "Keep low-risk portal surfaces separate from the flagship operator workflow."
    ],
    trustNotes: ["Do not make unfinished integrations look live just because they are visible."]
  },
  community: {
    eyebrow: "Support and updates",
    body: "Community should become the place for support, release updates, and ongoing signal without distracting from the core action path.",
    highlights: ["Support and updates belong here.", "Community is a trust layer, not just a social link."],
    trustNotes: ["Keep it low-risk and clearly separate from execution modules."]
  },
  "settings-runtime": {
    eyebrow: "System controls",
    body: "This is where the user sees microphone, wake phrase, workspace, journal, provider, and other readiness settings before using higher-risk workflows.",
    highlights: [
      "Make privacy and readiness understandable without overselling them.",
      "Keep the real controls next to the trust explanation."
    ],
    trustNotes: ["The runtime view should explain status clearly and honestly."],
    cta: "Open system controls"
  },
  "openclaw-gateway": {
    eyebrow: "Future bridge",
    body: "OpenClaw stays visible as a future gateway, but the card should never pretend the integration exists before its capabilities and guardrails are real.",
    highlights: ["Visible now so the shell shape does not need to change later.", "Clearly marked as not ready."],
    trustNotes: ["Placeholders must look like placeholders."]
  },
  "dark-null-protocol": {
    eyebrow: "Protocol later",
    body: "Protocol concepts should become learnable explainers first and deeper product surfaces later.",
    highlights: ["Teach one problem at a time.", "Bridge into deeper material only after the user opts in."],
    trustNotes: ["Protocol depth should not sit on the front door."]
  },
  "dna-infrastructure": {
    eyebrow: "Infrastructure later",
    body: "DNA Infrastructure belongs in Explore so advanced ideas stay available without overwhelming the first release.",
    highlights: ["Keep the advanced layer visible but secondary."],
    trustNotes: ["Avoid forcing internal terminology onto first-time users."]
  },
  "token-utilities": {
    eyebrow: "Advanced tools",
    body: "Token and utility surfaces should stay one layer deeper until the AI-first experience feels effortless and trusted.",
    highlights: ["Do not make the first release feel speculative."],
    trustNotes: ["Restricted surfaces should look obviously restricted."]
  }
};

export type HubSearchEntry =
  | {
      id: string;
      kind: "section";
      title: string;
      subtitle: string;
      description: string;
      tab: HubTab;
      actionable: true;
      tone: "info";
      statusLabel: string;
      target: { kind: "tab"; tab: HubTab };
      searchText: string;
    }
  | {
      id: string;
      kind: "module";
      title: string;
      subtitle: string;
      description: string;
      tab: HubTab;
      actionable: true;
      tone: "info" | "live" | "pending";
      statusLabel: string;
      target: { kind: "module"; moduleId: string };
      searchText: string;
    }
  | {
      id: string;
      kind: "learning-topic";
      title: string;
      subtitle: string;
      description: string;
      tab: HubTab;
      actionable: true;
      tone: "info";
      statusLabel: string;
      target: { kind: "group"; tab: HubTab; groupId: string };
      searchText: string;
    }
  | {
      id: string;
      kind: "resource";
      title: string;
      subtitle: string;
      description: string;
      tab: HubTab;
      actionable: boolean;
      tone: "live" | "pending" | "disabled";
      statusLabel: string;
      target: { kind: "resource"; resourceId: string };
      searchText: string;
    };

const SEARCH_GROUP_TABS: HubTab[] = ["learn", "explore", "community"];
const TAB_LABEL_BY_ID = new Map(HUB_TABS.map((tab) => [tab.id, tab.label]));
const RESOURCE_PRIMARY_TAB = new Map<string, HubTab>();
for (const [tab, resourceIds] of Object.entries(HUB_RESOURCES_BY_TAB) as Array<[HubTab, string[] | undefined]>) {
  for (const resourceId of resourceIds ?? []) {
    if (!RESOURCE_PRIMARY_TAB.has(resourceId)) RESOURCE_PRIMARY_TAB.set(resourceId, tab);
  }
}

function modulePrimaryTab(module: HubModule): HubTab {
  switch (module.id) {
    case "nulla-operator":
      return "use-ai";
    case "settings-runtime":
      return "settings";
    case "start-here":
    case "proof-center":
      return "learn";
    case "community":
      return "community";
    case "ecosystem-overview":
    case "paradoxlabs":
    case "openclaw-gateway":
    case "dark-null-protocol":
    case "dna-infrastructure":
    case "token-utilities":
      return "explore";
    default:
      return "hub";
  }
}

function moduleSearchTone(status: string, actionType: string): "info" | "live" | "pending" {
  if (actionType === "workflow" && status === "ready") return "live";
  if (status === "coming-soon" || actionType === "placeholder") return "pending";
  return "info";
}

export const HUB_SEARCH_ENTRIES: HubSearchEntry[] = [
  ...HUB_TABS.map((tab) => {
    const section = HUB_SECTIONS[tab.id];
    return {
      id: `section:${tab.id}`,
      kind: "section" as const,
      title: tab.label,
      subtitle: section.eyebrow,
      description: section.description,
      tab: tab.id,
      actionable: true as const,
      tone: "info" as const,
      statusLabel: "Section",
      target: { kind: "tab" as const, tab: tab.id },
      searchText: `${tab.label} ${section.eyebrow} ${section.title} ${section.description}`.toLowerCase()
    };
  }),
  ...HUB_MODULES.map((module) => ({
    id: `module:${module.id}`,
    kind: "module" as const,
    title: module.title,
    subtitle: module.subtitle,
    description: module.description,
    tab: modulePrimaryTab(module),
    actionable: true as const,
    tone: moduleSearchTone(module.status, module.actionType),
    statusLabel: moduleSurfaceStatusLabel(module),
    target: { kind: "module" as const, moduleId: module.id },
    searchText: `${module.title} ${module.subtitle} ${module.description} ${module.category} ${module.id}`.toLowerCase()
  })),
  ...SEARCH_GROUP_TABS.flatMap((tab) =>
    (HUB_GROUPS_BY_TAB[tab] ?? []).map((group) => ({
      id: `group:${tab}:${group.id}`,
      kind: "learning-topic" as const,
      title: group.label,
      subtitle: `${TAB_LABEL_BY_ID.get(tab) ?? tab} topic`,
      description: group.description,
      tab,
      actionable: true as const,
      tone: "info" as const,
      statusLabel: "Guided topic",
      target: { kind: "group" as const, tab, groupId: group.id },
      searchText: `${group.label} ${group.description} ${tab} ${group.moduleIds.join(" ")} ${group.resourceIds.join(" ")}`.toLowerCase()
    }))
  ),
  ...Object.values(HUB_EXTERNAL_RESOURCES).map((resource) => ({
    id: `resource:${resource.id}`,
    kind: "resource" as const,
    title: resource.label,
    subtitle: resource.subtitle,
    description: resource.description,
    tab: RESOURCE_PRIMARY_TAB.get(resource.id) ?? "explore",
    actionable: isVerifiedLiveResource(resource),
    tone:
      resource.status === "verified_live"
        ? ("live" as const)
        : resource.status === "unavailable"
          ? ("disabled" as const)
          : ("pending" as const),
    statusLabel: EXTERNAL_RESOURCE_STATUS_LABELS[resource.status],
    target: { kind: "resource" as const, resourceId: resource.id },
    searchText: `${resource.label} ${resource.subtitle} ${resource.description} ${resource.kind} ${resource.note}`.toLowerCase()
  }))
];

export function searchHubEntries(query: string, limit = 8) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [] as HubSearchEntry[];
  const score = (entry: HubSearchEntry) => {
    const title = entry.title.toLowerCase();
    if (title === normalized) return 100;
    if (title.startsWith(normalized)) return 80;
    if (title.includes(normalized)) return 60;
    if (entry.searchText.includes(normalized)) return 40;
    return -1;
  };
  return HUB_SEARCH_ENTRIES
    .map((entry) => ({ entry, score: score(entry) }))
    .filter((result) => result.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.entry.actionable !== right.entry.actionable) return left.entry.actionable ? -1 : 1;
      return left.entry.title.localeCompare(right.entry.title);
    })
    .slice(0, limit)
    .map((result) => result.entry);
}
