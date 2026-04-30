import { generateSubtitles } from "../src/subtitles.js";
import { currentMonth, getLogger } from "../src/lib.js";

const log = getLogger("run-subtitles");

async function main() {
  const startedAt = Date.now();
  const month = currentMonth();
  log.info("Subtitles starting", { month });

  const result = await generateSubtitles(month);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write("\nSubtitles ready.\n");
  process.stdout.write(`  SRT:        ${result.srtPath}\n`);
  process.stdout.write(`  JSON:       ${result.jsonPath}\n`);
  process.stdout.write(`  Segments:   ${result.segmentCount}\n`);
  process.stdout.write(`  Duration:   ${result.totalDurationSec.toFixed(1)} sec\n`);
  process.stdout.write(`  Wall time:  ${elapsedSec} sec\n`);
}

main().catch((err) => {
  log.error("Subtitles generation failed", String(err));
  process.exitCode = 1;
});
