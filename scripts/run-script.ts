import { finalizeScript } from "../src/script.js";
import { currentMonth, getLogger, getPaths } from "../src/lib.js";

const log = getLogger("run-script");

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Script validation starting", { month });

  const script = await finalizeScript(month);

  const totalScenes = script.hook.length + script.body.length + script.cta.length;
  process.stdout.write("\nScript validated.\n");
  process.stdout.write(`  Title:    ${script.title}\n`);
  process.stdout.write(`  Duration: ~${Math.round(script.totalDurationEstimateSec / 60)} min (${script.totalDurationEstimateSec}s)\n`);
  process.stdout.write(`  Words:    ${script.totalWords}\n`);
  process.stdout.write(`  Scenes:   ${totalScenes}\n`);
  process.stdout.write(`  Markdown: ${paths.scriptMd}\n`);
}

main().catch((err) => {
  log.error("Script validation failed", String(err));
  process.exitCode = 1;
});
