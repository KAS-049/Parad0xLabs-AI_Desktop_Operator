import path from "node:path";
import { buildJournalPdf } from "./journalBook";

async function main() {
  const journalOutputFolder = process.argv[2] || path.join(process.env.APPDATA || "", "codex-avatar", "journal");
  const pdfPath = await buildJournalPdf(journalOutputFolder);
  process.stdout.write(pdfPath);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message);
  process.exit(1);
});
