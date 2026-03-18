import path from "node:path";
import { buildEngineeringLogDocx } from "./journalBook";

async function main() {
  const journalOutputFolder = process.argv[2] || path.join(process.env.APPDATA || "", "codex-avatar", "journal");
  const docxPath = await buildEngineeringLogDocx(journalOutputFolder);
  process.stdout.write(docxPath);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message);
  process.exit(1);
});
