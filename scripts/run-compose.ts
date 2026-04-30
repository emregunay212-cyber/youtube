import { composeLongForm } from "../src/compose.js";
import { currentMonth, getLogger } from "../src/lib.js";

const log = getLogger("run-compose");

async function main() {
  const startedAt = Date.now();
  const month = currentMonth();
  log.info("Compose starting", { month });

  const result = await composeLongForm(month);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write("\nLong-form video ready.\n");
  process.stdout.write(`  File:       ${result.outputPath}\n`);
  process.stdout.write(`  Duration:   ${result.durationSec.toFixed(1)} sec\n`);
  process.stdout.write(`  Size:       ${(result.fileSizeBytes / 1024 / 1024).toFixed(1)} MB\n`);
  process.stdout.write(`  Scenes:     ${result.sceneCount}\n`);
  process.stdout.write(`  Wall time:  ${elapsedSec} sec\n`);
}

main().catch((err) => {
  log.error("Compose failed", String(err));
  process.exitCode = 1;
});
