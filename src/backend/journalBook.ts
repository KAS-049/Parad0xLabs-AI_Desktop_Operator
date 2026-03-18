import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import type { RunReport } from "../shared/contracts";

function toText(value: unknown, fallback = "None recorded.") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function paragraph(text: string) {
  return new Paragraph({
    children: [new TextRun(text || "None recorded.")]
  });
}

function section(title: string, text: string) {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2
    }),
    paragraph(text)
  ];
}

function listSection(title: string, items: string[]) {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2
    }),
    ...(items.length
      ? items.map(
          (item) =>
            new Paragraph({
              text: item,
              bullet: { level: 0 }
            })
        )
      : [paragraph("None recorded.")])
  ];
}

export function buildFixDiagramSvg(spec: string) {
  const fallbackLines = spec
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1, 6);
  const labels = fallbackLines.length
    ? fallbackLines.map((line) => line.replace(/^[A-Z]\[[^:]*:\s*/, "").replace(/\]$/, "").trim())
    : ["Request", "Work", "Problem", "Fix", "Next"];

  const boxes = labels.map((label, index) => {
    const y = 30 + index * 90;
    const escaped = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <rect x="40" y="${y}" width="540" height="54" rx="12" fill="#0f1724" stroke="#47627a" stroke-width="1.4" />
      <text x="60" y="${y + 32}" fill="#dbe7f3" font-family="Segoe UI, Arial, sans-serif" font-size="16">${escaped}</text>
      ${index < labels.length - 1 ? `<line x1="310" y1="${y + 54}" x2="310" y2="${y + 90}" stroke="#6b879f" stroke-width="1.6" marker-end="url(#arrow)" />` : ""}
    `;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="620" height="${Math.max(140, labels.length * 90 + 20)}" viewBox="0 0 620 ${Math.max(140, labels.length * 90 + 20)}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#6b879f"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="620" height="${Math.max(140, labels.length * 90 + 20)}" fill="#09111a"/>
  ${boxes.join("\n")}
</svg>`;
}

export async function buildEngineeringLogDocx(journalOutputFolder: string): Promise<string> {
  const docxPath = path.join(journalOutputFolder, "Codex-Avatar-Engineering-Log.docx");
  const entryRoot = path.join(journalOutputFolder, "entries");
  const entryDirs = (await readdir(entryRoot, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const children: Paragraph[] = [
    new Paragraph({
      text: "Codex Avatar Engineering Log",
      heading: HeadingLevel.TITLE
    }),
    paragraph("Fast structured engineering log for Codex Avatar runs.")
  ];

  for (const entry of entryDirs) {
    const folder = path.join(entryRoot, entry.name);
    const report = JSON.parse(await readFile(path.join(folder, "entry.json"), "utf8")) as Partial<RunReport>;
    const filesChanged = toList(report.filesChanged);
    const commandsRun = toList(report.commandsRun);

    children.push(
      new Paragraph({
        text: toText(report.timestamp, entry.name),
        heading: HeadingLevel.HEADING_1
      }),
      paragraph(
        `Status: ${toText(report.status, "unknown")} | Duration: ${typeof report.durationMs === "number" ? report.durationMs : 0}ms | Provider: ${toText(report.codexProvider, "unknown")} | Execution: ${toText(report.executionMode, "unknown")}`
      ),
      ...section("User Request", toText(report.userRequest)),
      ...section("What Codex Did", toText(report.whatCodexDid, toText(report.plainEnglishSummary))),
      ...section("What Problem Occurred", toText(report.problemOccurred)),
      ...section("How It Was Fixed", toText(report.howItWasFixed)),
      ...section("What To Do Next", toText(report.nextSteps)),
      ...section("Technical Summary", toText(report.technicalSummary)),
      ...section("Fix Diagram Spec", toText(report.fixDiagramSpec)),
      ...section("Fix Diagram Source", toText(report.fixDiagramSource)),
      ...section("Fix Diagram Output Path", toText(report.fixDiagramOutputPath, "No diagram file generated.")),
      ...listSection("Files Changed", filesChanged),
      ...listSection("Commands Run", commandsRun),
      new Paragraph({ text: "" })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(docxPath, buffer);
  return docxPath;
}
