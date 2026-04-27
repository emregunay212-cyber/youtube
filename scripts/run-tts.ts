import { generateVoiceover } from "../src/tts/elevenlabs.js";
import { currentMonth, getLogger, getPaths } from "../src/lib.js";

const log = getLogger("run-tts");

async function main() {
  const startedAt = Date.now();
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Voiceover generation starting", { month });

  const result = await generateVoiceover(month);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write("\nVoiceover ready.\n");
  process.stdout.write(`  Voiceover: ${result.voiceoverPath}\n`);
  process.stdout.write(`  Per-scene: ${result.scenesDir}\n`);
  process.stdout.write(`  Duration:  ${result.totalDurationSec.toFixed(1)} sec (~${Math.round(result.totalDurationSec / 60)} min)\n`);
  process.stdout.write(`  Scenes:    ${result.sceneTimings.length}\n`);
  process.stdout.write(`  Chars:     ${result.totalChars} (~${(result.totalChars / 100000 * 100).toFixed(2)}% of Creator monthly quota)\n`);
  process.stdout.write(`  Timings:   ${paths.sceneTimings}\n`);
  process.stdout.write(`  Wall time: ${elapsedSec} sec\n`);
}

main().catch((err) => {
  log.error("Voiceover generation failed", String(err));
  process.exitCode = 1;
});
