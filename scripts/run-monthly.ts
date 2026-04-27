import { aggregateTrends } from "../src/trends/index.js";
import { selectTopic } from "../src/topic.js";
import { finalizeScript } from "../src/script.js";
import { generateVoiceover } from "../src/tts/elevenlabs.js";
import { currentMonth, fileExists, getLogger, getPaths, writeJson } from "../src/lib.js";

const log = getLogger("run-monthly");

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Monthly pipeline starting", { month });

  // ---- Phase 1a: Trends ----
  log.info("[1] Trend collection");
  const trends = await aggregateTrends(month);
  await writeJson(paths.trends, trends);
  log.info("Trends ready", {
    matched: trends.shortlist.length,
    total: trends.totalCollected,
    perSource: trends.perSource,
  });

  // ---- Phase 1b: Topic selection (LLM step — done in Claude Code session) ----
  const topicJsonPath = paths.topic.replace(/\.md$/, ".json");
  if (!(await fileExists(topicJsonPath))) {
    process.stdout.write("\n");
    process.stdout.write("Trends written to: " + paths.trends + "\n\n");
    process.stdout.write("Next step (LLM): topic selection is performed inside Claude Code.\n");
    process.stdout.write("  - Recommended: /youtube-monthly slash command\n");
    process.stdout.write("  - Manual: open trends.json, write topic.json, then run `npm run topic`.\n");
    return;
  }

  log.info("[2] Topic markdown render (topic.json exists)");
  const topic = await selectTopic(month);
  log.info("Topic ready", { title: topic.primary.title, novelty: topic.primary.novelty });

  // ---- Phase 2: Script (LLM step — done in Claude Code session) ----
  if (!(await fileExists(paths.script))) {
    process.stdout.write("\n");
    process.stdout.write(`Topic ready: ${paths.topic}\n\n`);
    process.stdout.write("Next step (LLM): script writing is performed inside Claude Code.\n");
    process.stdout.write("  - Recommended: continue /youtube-monthly slash command\n");
    process.stdout.write("  - Manual: read topic.json + trends.json, write script.json,\n");
    process.stdout.write("    then run `npm run script`.\n");
    return;
  }

  log.info("[3] Script validate + markdown render (script.json exists)");
  const script = await finalizeScript(month);
  const totalScenes = script.hook.length + script.body.length + script.cta.length;
  log.info("Script ready", {
    title: script.title,
    scenes: totalScenes,
    words: script.totalWords,
    seconds: script.totalDurationEstimateSec,
  });

  // ---- Phase 3: TTS (ElevenLabs) ----
  if (await fileExists(paths.voiceover)) {
    log.info("[4] Voiceover already exists, skipping TTS", { file: paths.voiceover });
  } else if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    process.stdout.write("\n");
    process.stdout.write(`Script ready: ${paths.scriptMd}\n\n`);
    process.stdout.write("Next step: TTS (ElevenLabs). Set ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in .env,\n");
    process.stdout.write("then run `npm run tts` to generate the voiceover.\n");
    return;
  } else {
    log.info("[4] Generating voiceover (ElevenLabs)");
    const tts = await generateVoiceover(month);
    log.info("Voiceover ready", {
      file: paths.voiceover,
      sec: tts.totalDurationSec.toFixed(1),
      chars: tts.totalChars,
    });
  }

  process.stdout.write("\nPhase 1-3 complete. Outputs:\n");
  process.stdout.write(`  - Trends:    ${paths.trends}\n`);
  process.stdout.write(`  - Topic:     ${paths.topic}\n`);
  process.stdout.write(`  - Script:    ${paths.scriptMd}\n`);
  process.stdout.write(`  - Voiceover: ${paths.voiceover}\n`);
  process.stdout.write(`  - Timings:   ${paths.sceneTimings}\n`);
  process.stdout.write("\nPhases 4-10 (visuals, subtitles, compose, shorts, upload) not yet implemented.\n");
}

main().catch((err) => {
  log.error("Monthly pipeline failed", String(err));
  process.exitCode = 1;
});
