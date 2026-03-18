import test from "node:test";
import assert from "node:assert/strict";

import { buildFixDiagramSvg } from "../dist/backend/journalBook.js";

test("buildFixDiagramSvg returns a valid svg wrapper", () => {
  const svg = buildFixDiagramSvg([
    "flowchart TD",
    "A[Request: test]",
    "B[Work: updated parser]",
    "C[Problem: timeout]",
    "D[Fix: reduced wait]",
    "E[Next: rerun]"
  ].join("\n"));

  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg/);
  assert.match(svg, /Request: test|updated parser|timeout|reduced wait|rerun/);
});
