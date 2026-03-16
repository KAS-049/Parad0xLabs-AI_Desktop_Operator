import { createWriteStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { RunReport } from "../shared/contracts";

function addSection(doc: PDFKit.PDFDocument, heading: string, text: string) {
  doc
    .moveDown(0.7)
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1b2533")
    .text(heading)
    .moveDown(0.2)
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#2b2b2b")
    .text(text || "None recorded.", {
      align: "left",
      lineGap: 2
    });
}

export async function buildJournalPdf(journalOutputFolder: string): Promise<string> {
  const pdfPath = path.join(journalOutputFolder, "Codex-Avatar-Storybook.pdf");
  const entryRoot = path.join(journalOutputFolder, "entries");
  const entryDirs = (await readdir(entryRoot, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const doc = new PDFDocument({
    autoFirstPage: false,
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    info: {
      Title: "Codex Avatar Storybook",
      Author: "OpenAI Codex"
    }
  });

  await new Promise<void>(async (resolve, reject) => {
    const stream = createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#111111")
      .text("Codex Avatar Storybook", { align: "center" })
      .moveDown(0.5)
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#555555")
      .text("A picture-book style journal of your Codex Avatar runs.", { align: "center" });

    for (const entry of entryDirs) {
      const folder = path.join(entryRoot, entry.name);
      const report = JSON.parse(await readFile(path.join(folder, "entry.json"), "utf8")) as RunReport;
      const memePath = path.join(folder, "meme.png");

      doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor("#111111")
        .text(report.timestamp, { align: "center" })
        .moveDown(0.3)
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666666")
        .text(report.projectWorkspace, { align: "center" });

      try {
        const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const top = doc.y + 14;
        doc.image(memePath, doc.page.margins.left, top, {
          fit: [availableWidth, 280],
          align: "center",
          valign: "center"
        });
        doc.y = top + 290;
      } catch {
        doc.moveDown(1);
      }

      addSection(doc, "User Request", report.userRequest);
      addSection(doc, "Layman Summary", report.plainEnglishSummary);
      addSection(doc, "Technical Summary", report.technicalSummary);
      addSection(doc, "Blockers", report.blockers);
      addSection(doc, "What To Remember", report.rememberNextTime);
      addSection(doc, "Next Steps", report.nextSteps);
      addSection(doc, "Meme Prompt", report.memePrompt);
    }

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.on("error", reject);
  });

  return pdfPath;
}
