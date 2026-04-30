import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  currentMonth,
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
  PROJECT_ROOT,
} from "../src/lib.js";
import { uploadAll } from "../src/upload.js";

const log = getLogger("upload-after-approval");

type Action = "approve" | "reject";

function parseArgs(argv: string[]): Action {
  if (argv.includes("--approve")) return "approve";
  if (argv.includes("--reject")) return "reject";
  throw new Error("Usage: tsx upload-after-approval.ts --approve|--reject");
}

async function archiveRejectedMonth(month: string): Promise<string> {
  const paths = getPaths(month);
  const archiveRoot = path.join(PROJECT_ROOT, "data", "archive");
  await ensureDir(archiveRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(archiveRoot, `${month}-rejected-${stamp}`);
  await fs.rename(paths.root, target);
  return target;
}

async function approve(month: string): Promise<void> {
  const paths = getPaths(month);
  if (!(await fileExists(paths.finalLong))) {
    throw new Error(
      `Cannot approve: final-long.mp4 missing at ${paths.finalLong}`,
    );
  }

  log.info("Approval received — uploading to YouTube");

  const result = await uploadAll(month);

  process.stdout.write("\nUpload complete.\n");
  for (const r of result.results) {
    const label = r.kind === "long" ? "Long-form" : `Short ${r.index}`;
    const scheduled = r.scheduledFor ? ` (scheduled: ${r.scheduledFor})` : "";
    process.stdout.write(`  ${label}: ${r.url}${scheduled}\n`);
  }
  process.stdout.write(`\nResults saved: ${paths.uploadResults}\n`);
}

async function reject(month: string): Promise<void> {
  const paths = getPaths(month);
  if (!(await fileExists(paths.root))) {
    throw new Error(`Nothing to reject: ${paths.root} not found`);
  }
  log.info("Rejection received — archiving month folder");
  const archived = await archiveRejectedMonth(month);
  process.stdout.write(`\nMonth ${month} arşivlendi.\n`);
  process.stdout.write(`  ${archived}\n`);
  process.stdout.write(`\nYeniden başlatmak için \`npm run monthly\`.\n`);
}

async function main() {
  const action = parseArgs(process.argv.slice(2));
  const month = currentMonth();
  log.info(`Action: ${action}`, { month });

  if (action === "approve") await approve(month);
  else await reject(month);
}

main().catch((err) => {
  log.error("Approval flow failed", String(err));
  process.exitCode = 1;
});
