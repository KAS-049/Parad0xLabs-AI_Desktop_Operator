import type {
  AppSettings,
  CodexAdapterKind,
  DesktopAutomationReport,
  ExecutionPolicyDecision,
  NormalizedRunResult,
  RunProgressEvent
} from "../shared/contracts";

export interface ProviderContext {
  settings: AppSettings;
  runId: string;
  transcript: string;
  submitPrompt: (message: string) => void;
  log: (message: string) => Promise<void>;
  policyDecision: ExecutionPolicyDecision;
}

export interface RawProviderResult {
  providerKind: CodexAdapterKind;
  rawCodexOutput: string;
  submittedPrompt: string;
  desktopAutomationReport?: DesktopAutomationReport | null;
}

export interface CodexProviderAdapter {
  kind: CodexAdapterKind;
  execute(context: ProviderContext): Promise<RawProviderResult>;
}

export interface SummaryContext {
  transcript: string;
  rawCodexOutput: string;
  providerKind: CodexAdapterKind;
  settings: AppSettings;
}

export type SummaryBuilder = (context: SummaryContext) => Promise<Omit<NormalizedRunResult, "providerKind" | "rawCodexOutput" | "submittedPrompt">>;

export function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    task
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function retryProvider<T>(task: () => Promise<T>, retries: number, onRetry?: (attempt: number, error: Error) => Promise<void> | void) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await onRetry?.(attempt + 1, lastError);
      }
    }
  }

  throw lastError ?? new Error("Provider execution failed.");
}

export function normalizeProviderResult(
  rawResult: RawProviderResult,
  summary: Omit<NormalizedRunResult, "providerKind" | "rawCodexOutput" | "submittedPrompt">
): NormalizedRunResult {
  return {
    providerKind: rawResult.providerKind,
    rawCodexOutput: rawResult.rawCodexOutput,
    submittedPrompt: rawResult.submittedPrompt,
    plainEnglishSummary: summary.plainEnglishSummary,
    technicalSummary: summary.technicalSummary,
    blockers: summary.blockers,
    rememberNextTime: summary.rememberNextTime,
    nextSteps: summary.nextSteps,
    whatCodexDid: summary.whatCodexDid,
    problemOccurred: summary.problemOccurred,
    howItWasFixed: summary.howItWasFixed,
    filesChanged: summary.filesChanged,
    commandsRun: summary.commandsRun,
    fixDiagramSpec: summary.fixDiagramSpec,
    fixDiagramSource: summary.fixDiagramSource
  };
}

export function getProviderFlowLabel(providerKind: CodexAdapterKind) {
  switch (providerKind) {
    case "mock":
      return "Mock provider";
    case "desktop-codex-primary":
      return "Live Codex desktop app";
    default:
      return "Direct backend debug session";
  }
}

export function resolveProviderKind(settings: AppSettings): CodexAdapterKind {
  if (settings.codexProvider === "mock") {
    return "mock";
  }

  if (settings.codexProvider === "desktop-codex" || settings.executionMode === "desktop-primary") {
    return "desktop-codex-primary";
  }

  return "direct-backend-debug";
}
