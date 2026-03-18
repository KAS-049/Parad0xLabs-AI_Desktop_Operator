import path from "node:path";
import type {
  ExecutionActionKind,
  ExecutionApprovalRequest,
  ExecutionPolicyConfig,
  ExecutionPolicyDecision,
  ExecutionRiskLevel
} from "../shared/contracts";

export interface ExecutionPolicyInput {
  actionKind: ExecutionActionKind;
  userRequest: string;
  workspacePath: string;
  config: ExecutionPolicyConfig;
  targetPaths?: string[];
  approval?: ExecutionApprovalRequest | null;
}

const SYSTEM_PATH_PREFIXES = [
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)",
  "c:\\programdata"
];

const DESTRUCTIVE_KEYWORDS = [
  /\bdelete\b/i,
  /\bdestroy\b/i,
  /\bwipe\b/i,
  /\bformat\b/i,
  /\breset\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bregistry\b/i,
  /\bsystem32\b/i,
  /\bdriver\b/i,
  /\bservice\b/i,
  /\bkill process\b/i
];

const WRITE_KEYWORDS = [
  /\bwrite\b/i,
  /\bedit\b/i,
  /\bupdate\b/i,
  /\bmodify\b/i,
  /\bpatch\b/i,
  /\bimplement\b/i,
  /\bfix\b/i,
  /\bcreate\b/i,
  /\brename\b/i,
  /\bmove\b/i,
  /\bcopy\b/i,
  /\bremove\b/i,
  /\badd\b/i
];

function normalizePath(targetPath: string) {
  const normalized = path.win32.normalize(targetPath.trim()).replace(/\//g, "\\");
  return normalized.toLowerCase();
}

function isWithinRoot(targetPath: string, rootPath: string) {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedRoot = normalizePath(rootPath).replace(/\\+$/, "");
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}\\`);
}

export function extractTargetPaths(userRequest: string) {
  const matches = userRequest.match(/[A-Za-z]:\\[^"'`\r\n]+/g) ?? [];
  return [...new Set(matches.map((item) => path.win32.normalize(item.trim())))];
}

export function classifyRiskLevel(userRequest: string, targetPaths: string[]): ExecutionRiskLevel {
  if (targetPaths.some((targetPath) => SYSTEM_PATH_PREFIXES.some((prefix) => normalizePath(targetPath).startsWith(prefix)))) {
    return "privileged-destructive";
  }

  if (DESTRUCTIVE_KEYWORDS.some((pattern) => pattern.test(userRequest))) {
    return "privileged-destructive";
  }

  if (WRITE_KEYWORDS.some((pattern) => pattern.test(userRequest))) {
    return "reversible-write";
  }

  return "read-only";
}

function getRollbackHints(riskLevel: ExecutionRiskLevel, workspacePath: string) {
  if (riskLevel === "read-only") {
    return ["No rollback is needed because this action should not change files."];
  }

  if (riskLevel === "reversible-write") {
    return [
      `Review changes under ${workspacePath} before keeping them.`,
      "Use version control or restore the modified workspace files if the result is not wanted."
    ];
  }

  return [
    "Do not run the live action until you have reviewed the dry-run plan.",
    "Create a backup or restore point before approving any destructive or system-level change."
  ];
}

export function evaluateExecutionPolicy(input: ExecutionPolicyInput): ExecutionPolicyDecision {
  const configuredRoots = input.config.allowedWorkspaceRoots.length ? input.config.allowedWorkspaceRoots : [input.workspacePath];
  const requestedTargetPaths = input.targetPaths?.length ? input.targetPaths : extractTargetPaths(input.userRequest);
  const targetPaths = requestedTargetPaths.length ? requestedTargetPaths : [input.workspacePath];
  const riskLevel = classifyRiskLevel(input.userRequest, targetPaths);
  const protectedSystemPath = targetPaths.some((targetPath) =>
    input.config.protectedSystemRoots.some((rootPath) => isWithinRoot(targetPath, rootPath))
  );
  const workspaceAllowed =
    !input.config.enforceWorkspaceAllowlist ||
    targetPaths.every((targetPath) => configuredRoots.some((rootPath) => isWithinRoot(targetPath, rootPath)));
  const requiresApproval = input.config.approvalRequiredForRiskLevels.includes(riskLevel) || !workspaceAllowed;
  const approved = Boolean(input.approval?.granted);
  const dryRun =
    input.config.dryRunForRiskLevels.includes(riskLevel) ||
    (!workspaceAllowed && !approved) ||
    (requiresApproval && !approved);
  const sandboxMode = riskLevel === "read-only" ? input.config.defaultReadOnlySandbox : input.config.defaultWriteSandbox;
  const reasons: string[] = [];
  let status: ExecutionPolicyDecision["status"] = "safe-to-run";

  if (protectedSystemPath && riskLevel !== "read-only") {
    status = "blocked-by-policy";
    reasons.push("The request targets a protected system path.");
  } else if (!workspaceAllowed && !approved) {
    status = "requires-approval";
    reasons.push("The request targets paths outside the allowed workspace roots.");
  } else if (requiresApproval && !approved) {
    status = "requires-approval";
    reasons.push("The request is classified as privileged or destructive and needs explicit approval.");
  } else {
    reasons.push("The request stays within the allowed workspace policy.");
  }

  if (dryRun) {
    reasons.push("The policy switched this request into dry-run mode until it is explicitly approved.");
  }

  return {
    actionKind: input.actionKind,
    status,
    riskLevel,
    sandboxMode,
    approvalPolicy: status === "safe-to-run" ? input.config.approvalPolicy : "on-request",
    dryRun,
    requiresApproval,
    workspaceAllowed,
    targetPaths,
    reasons,
    rollbackHints: getRollbackHints(riskLevel, input.workspacePath)
  };
}
