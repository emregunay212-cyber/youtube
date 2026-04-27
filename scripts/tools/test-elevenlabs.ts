import { ttsSingleScene } from "../../src/tts/elevenlabs.js";
import { currentMonth, getLogger, getPaths, readJson } from "../../src/lib.js";
import type { Scene, Script } from "../../src/types.js";

const log = getLogger("tts-test");

function parseSceneFlag(): number {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--scene=(\d+)$/);
    if (m) return Number(m[1]);
  }
  return 1;
}

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  const sceneId = parseSceneFlag();
  log.info("ElevenLabs single-scene test", { month, sceneId });

  const script = await readJson<Script>(paths.script);
  const allScenes: Scene[] = [...script.hook, ...script.body, ...script.cta];
  const scene = allScenes.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Scene ${sceneId} not found. Available ids: ${allScenes.map((s) => s.id).join(", ")}`);
  }

  log.info("Generating", {
    sceneId: scene.id,
    chars: scene.voiceover.length,
    voiceoverPreview: scene.voiceover.slice(0, 80) + "...",
  });

  const result = await ttsSingleScene(scene, paths.audioDir);

  process.stdout.write("\nTTS test complete.\n");
  process.stdout.write(`  Scene:    #${result.scene.id}\n`);
  process.stdout.write(`  Chars:    ${result.scene.voiceover.length}\n`);
  process.stdout.write(`  Bytes:    ${result.bytes}\n`);
  process.stdout.write(`  Duration: ${result.durationSec.toFixed(2)} sec\n`);
  process.stdout.write(`  File:     ${result.filePath}\n\n`);
  process.stdout.write("Open the file to listen and verify your cloned voice quality.\n");
}

main().catch((err) => {
  log.error("TTS test failed", String(err));
  process.exitCode = 1;
});
