import { generateVisuals } from "../src/visuals.js";
import { currentMonth, getLogger, getPaths } from "../src/lib.js";

const log = getLogger("run-visuals");

async function main() {
  const startedAt = Date.now();
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Visuals generation starting", { month });

  const result = await generateVisuals(month);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const falCost = result.falCount * 0.003;
  process.stdout.write("\nVisuals ready.\n");
  process.stdout.write(`  Assets dir: ${paths.assetsDir}\n`);
  process.stdout.write(`  Scenes:     ${result.results.length}\n`);
  process.stdout.write(`  Pexels:     ${result.pexelsCount} (free)\n`);
  process.stdout.write(`  fal.ai:     ${result.falCount} (~$${falCost.toFixed(3)})\n`);
  process.stdout.write(`  Total sec:  ${result.totalSec.toFixed(1)}\n`);
  process.stdout.write(`  Wall time:  ${elapsedSec} sec\n`);
}

main().catch((err) => {
  log.error("Visuals generation failed", String(err));
  process.exitCode = 1;
});
