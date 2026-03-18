import test from "node:test";
import assert from "node:assert/strict";

import { assertDesktopAutomationResult } from "../dist/backend/desktopCodexAutomation.js";

function makeReport(overrides = {}) {
  return {
    adapterKind: "desktop-codex-primary",
    windowTitle: "Codex",
    confidence: 0.92,
    usedClipboard: true,
    usedCoordinateFallback: false,
    partialCapture: false,
    checks: [
      { name: "codex-window-found", passed: true, message: "Found Codex window." },
      { name: "codex-window-visible", passed: true, message: "Codex window is visible." },
      { name: "codex-window-focused", passed: true, message: "Codex window is focused." },
      { name: "input-target-found", passed: true, message: "Input target found." },
      { name: "result-region-found", passed: true, message: "Result region found." },
      { name: "prompt-non-empty", passed: true, message: "Prompt is non-empty." },
      { name: "confidence-threshold", passed: true, message: "Confidence passed." }
    ],
    abortReason: null,
    ...overrides
  };
}

test("fails when the Codex window is not found", () => {
  assert.throws(
    () =>
      assertDesktopAutomationResult(
        makeReport({
          checks: [
            { name: "codex-window-found", passed: false, message: "Could not find the live Codex desktop window." }
          ],
          abortReason: "Could not find the live Codex desktop window."
        })
      ),
    /Could not find the live Codex desktop window/
  );
});

test("fails when the input target is not found", () => {
  assert.throws(
    () =>
      assertDesktopAutomationResult(
        makeReport({
          checks: [
            { name: "codex-window-found", passed: true, message: "Found Codex window." },
            { name: "input-target-found", passed: false, message: "Could not confidently identify the Codex message input area." }
          ],
          abortReason: "Could not confidently identify the Codex message input area."
        })
      ),
    /input area/
  );
});

test("fails when focus changes during the run", () => {
  assert.throws(
    () =>
      assertDesktopAutomationResult(
        makeReport({
          abortReason: "Focus changed away from the Codex window during capture."
        })
      ),
    /Focus changed away/
  );
});

test("blocks low confidence runs", () => {
  assert.throws(
    () =>
      assertDesktopAutomationResult(
        makeReport({
          confidence: 0.42
        })
      ),
    /Blocked low-confidence/
  );
});

test("accepts a successful prompt submit path", () => {
  assert.doesNotThrow(() => assertDesktopAutomationResult(makeReport()));
});
