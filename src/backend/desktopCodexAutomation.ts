import { spawn } from "node:child_process";
import { z } from "zod";
import type { DesktopAutomationReport } from "../shared/contracts";

const checkSchema = z.object({
  name: z.enum([
    "codex-window-found",
    "codex-window-visible",
    "codex-window-focused",
    "input-target-found",
    "result-region-found",
    "prompt-non-empty",
    "confidence-threshold"
  ]),
  passed: z.boolean(),
  message: z.string()
});

const automationResultSchema = z.object({
  submitted: z.string(),
  reply: z.string(),
  windowTitle: z.string().nullable(),
  confidence: z.number(),
  usedClipboard: z.boolean(),
  usedCoordinateFallback: z.boolean(),
  partialCapture: z.boolean(),
  checks: z.array(checkSchema),
  abortReason: z.string().nullable(),
  debugLog: z.array(z.string()).optional().default([])
});

export interface DesktopAutomationResult {
  submitted: string;
  reply: string;
  report: DesktopAutomationReport;
}

export async function runDesktopCodexAutomation(
  helperPath: string,
  prompt: string,
  cwd: string
): Promise<DesktopAutomationResult> {
  const stdout = await runJsonProcess("python", [helperPath, prompt], cwd);
  const parsed = automationResultSchema.parse(JSON.parse(stdout));
  const report: DesktopAutomationReport = {
    adapterKind: "desktop-codex-primary",
    windowTitle: parsed.windowTitle,
    confidence: parsed.confidence,
    usedClipboard: parsed.usedClipboard,
    usedCoordinateFallback: parsed.usedCoordinateFallback,
    partialCapture: parsed.partialCapture,
    checks: parsed.checks,
    abortReason: parsed.abortReason,
    debugLog: parsed.debugLog
  };

  assertDesktopAutomationResult(report);

  return {
    submitted: parsed.submitted,
    reply: parsed.reply,
    report
  };
}

export function assertDesktopAutomationResult(report: DesktopAutomationReport) {
  const failedChecks = report.checks.filter((check) => !check.passed);
  if (report.abortReason) {
    throw new Error(report.abortReason);
  }

  if (failedChecks.length) {
    throw new Error(failedChecks.map((check) => check.message).join(" "));
  }

  if (report.confidence < 0.75) {
    throw new Error(`Blocked low-confidence desktop automation run (${report.confidence.toFixed(2)}).`);
  }
}

function runJsonProcess(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
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
        return;
      }

      const text = stdout.trim() || stderr.trim() || `Desktop automation helper failed with code ${code}.`;
      try {
        const parsed = automationResultSchema.parse(JSON.parse(text));
        reject(new Error(parsed.abortReason ?? "Desktop automation helper failed."));
      } catch {
        reject(new Error(text));
      }
    });
  });
}
