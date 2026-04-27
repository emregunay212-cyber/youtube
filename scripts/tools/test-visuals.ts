import { generateSceneVisual } from "../../src/visuals.js";
import { currentMonth, getLogger } from "../../src/lib.js";

const log = getLogger("visuals-test");

function parseSceneFlag(): number {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--scene=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return 1;
}

async function main() {
  const month = currentMonth();
  const sceneId = parseSceneFlag();
  log.info("Visual single-scene test", { month, sceneId });

  const result = await generateSceneVisual(sceneId, month);

  process.stdout.write("\nVisual test complete.\n");
  process.stdout.write(`  Scene:    #${result.sceneId}\n`);
  process.stdout.write(`  Source:   ${result.source}\n`);
  process.stdout.write(`  Duration: ${result.targetSec.toFixed(2)} sec\n`);
  process.stdout.write(`  Output:   ${result.outputPath}\n`);
}

main().catch((err) => {
  log.error("Visual test failed", String(err));
  process.exitCode = 1;
});
