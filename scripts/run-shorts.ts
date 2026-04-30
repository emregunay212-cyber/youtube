import { generateShorts } from "../src/shorts.js";
import { currentMonth, getLogger } from "../src/lib.js";

const log = getLogger("run-shorts");

async function main() {
  const startedAt = Date.now();
  const month = currentMonth();
  log.info("Shorts starting", { month });

  const result = await generateShorts(month);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write("\nShorts ready.\n");
  for (const s of result.segments) {
    process.stdout.write(
      `  Short ${s.index}: scenes ${s.startSceneId}..${s.endSceneId}, ${s.durationSec.toFixed(1)}s -> ${s.outputPath}\n`,
    );
  }
  process.stdout.write(`  Wall time: ${elapsedSec} sec\n`);
}

main().catch((err) => {
  log.error("Shorts generation failed", String(err));
  process.exitCode = 1;
});
