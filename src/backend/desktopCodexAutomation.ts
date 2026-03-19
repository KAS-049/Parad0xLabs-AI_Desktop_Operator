import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
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

const pythonPreflightSchema = z.object({
  status: z.enum(["ok", "missing-modules", "module-error"]),
  missing: z.array(z.string()).optional().default([]),
  module: z.string().optional(),
  error: z.string().optional()
});

const requiredPythonModules = ["pywinauto", "win32clipboard", "win32gui"] as const;

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
  await verifyDesktopAutomationPreflight(helperPath, cwd);
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

async function verifyDesktopAutomationPreflight(helperPath: string, cwd: string) {
  try {
    await access(helperPath);
  } catch {
    throw new Error("Desktop submit blocked: the desktop automation helper script is missing.");
  }

  const preflightScript = [
    "import importlib, json, sys",
    `modules = ${JSON.stringify([...requiredPythonModules])}`,
    "missing = []",
    "for name in modules:",
    "    try:",
    "        importlib.import_module(name)",
    "    except ModuleNotFoundError:",
    "        missing.append(name)",
    "    except Exception as error:",
    "        print(json.dumps({'status': 'module-error', 'module': name, 'error': str(error)}))",
    "        sys.exit(4)",
    "if missing:",
    "    print(json.dumps({'status': 'missing-modules', 'missing': missing}))",
    "    sys.exit(3)",
    "print(json.dumps({'status': 'ok'}))"
  ].join("\n");

  const preflightResult = await runPythonPreflight(preflightScript, cwd);
  const parsed = preflightResult.payload;

  if (parsed.status === "missing-modules") {
    throw new Error(
      `Desktop submit blocked: Python is installed, but required desktop automation modules are missing: ${parsed.missing.join(", ")}. Install pywinauto and pywin32.`
    );
  }

  if (parsed.status === "module-error") {
    throw new Error(
      `Desktop submit blocked: the Python desktop automation module ${parsed.module ?? "unknown"} failed to load. ${parsed.error ?? "Unknown module error."}`
    );
  }
}

async function runPythonPreflight(script: string, cwd: string) {
  return new Promise<{ exitCode: number; payload: z.infer<typeof pythonPreflightSchema> }>((resolve, reject) => {
    const child = spawn("python", ["-c", script], { cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      const text =
        "code" in (error as NodeJS.ErrnoException) && (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "Desktop submit blocked: Python was not found. Install Python 3 and the desktop automation dependencies to use the live Codex desktop mode."
          : `Desktop submit blocked: the Python desktop automation preflight could not be launched. ${error instanceof Error ? error.message : String(error)}`;
      reject(new Error(text));
    });
    child.on("close", (code) => {
      const text = stdout.trim() || stderr.trim();
      try {
        const payload = pythonPreflightSchema.parse(JSON.parse(text));
        resolve({ exitCode: code ?? 0, payload });
      } catch {
        reject(
          new Error(
            text
              ? `Desktop submit blocked: the Python desktop automation preflight failed. ${text}`
              : "Desktop submit blocked: the Python desktop automation preflight returned an invalid response."
          )
        );
      }
    });
  });
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
  return runProcess(command, args, cwd);
}

function runProcess(command: string, args: string[], cwd: string) {
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
    child.on("error", (error) => {
      const text =
        "code" in (error as NodeJS.ErrnoException) && (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "Desktop submit blocked: Python was not found. Install Python 3 and the desktop automation dependencies to use the live Codex desktop mode."
          : `Desktop submit blocked: the desktop automation helper could not be launched. ${error instanceof Error ? error.message : String(error)}`;
      reject(new Error(text));
    });
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
