import { aggregateTrends } from "../src/trends/index.js";
import { selectTopic } from "../src/topic.js";
import { finalizeScript } from "../src/script.js";
import { generateVoiceover } from "../src/tts/elevenlabs.js";
import { generateVisuals } from "../src/visuals.js";
import { generateSubtitles } from "../src/subtitles.js";
import { composeLongForm } from "../src/compose.js";
import { generateShorts } from "../src/shorts.js";
import { generateReview, notifyReviewReady } from "../src/review.js";
import {
  currentMonth,
  fileExists,
  getLogger,
  getPaths,
  writeJson,
} from "../src/lib.js";

const log = getLogger("run-monthly");

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Monthly pipeline starting", { month });

  // ---- Phase 1a: Trends ----
  log.info("[1/9] Trend collection");
  const trends = await aggregateTrends(month);
  await writeJson(paths.trends, trends);
  log.info("Trends ready", {
    matched: trends.shortlist.length,
    total: trends.totalCollected,
    perSource: trends.perSource,
  });

  // ---- Phase 1b: Topic selection (LLM step in Claude Code session) ----
  const topicJsonPath = paths.topic.replace(/\.md$/, ".json");
  if (!(await fileExists(topicJsonPath))) {
    process.stdout.write("\n");
    process.stdout.write(`Trends written to: ${paths.trends}\n\n`);
    process.stdout.write("LLM step required: konu secimi.\n");
    process.stdout.write("  - Onerilen: /youtube-monthly slash command\n");
    process.stdout.write(
      "  - Manuel: trends.json oku, topic.json yaz, sonra `npm run monthly`.\n",
    );
    return;
  }

  log.info("[2/9] Topic markdown render");
  const topic = await selectTopic(month);
  log.info("Topic ready", {
    title: topic.primary.title,
    novelty: topic.primary.novelty,
  });

  // ---- Phase 2: Script (LLM step in Claude Code session) ----
  if (!(await fileExists(paths.script))) {
    process.stdout.write("\n");
    process.stdout.write(`Topic ready: ${paths.topic}\n\n`);
    process.stdout.write("LLM step required: script yazimi.\n");
    process.stdout.write("  - Onerilen: /youtube-monthly slash command\n");
    process.stdout.write(
      "  - Manuel: topic.json + trends.json oku, script.json yaz, sonra `npm run monthly`.\n",
    );
    return;
  }

  log.info("[3/9] Script validate + markdown render");
  const script = await finalizeScript(month);
  const totalScenes =
    script.hook.length + script.body.length + script.cta.length;
  log.info("Script ready", {
    title: script.title,
    scenes: totalScenes,
    words: script.totalWords,
  });

  // ---- Phase 3: TTS (ElevenLabs) ----
  if (await fileExists(paths.voiceover)) {
    log.info("[4/9] Voiceover already exists, skipping TTS");
  } else {
    log.info("[4/9] Generating voiceover (ElevenLabs)");
    const tts = await generateVoiceover(month);
    log.info("Voiceover ready", {
      sec: tts.totalDurationSec.toFixed(1),
      chars: tts.totalChars,
    });
  }

  // ---- Phase 4: Visuals ----
  log.info("[5/9] Generating scene visuals");
  const visuals = await generateVisuals(month);
  log.info("Visuals ready", {
    pexels: visuals.pexelsCount,
    fal: visuals.falCount,
  });

  // ---- Phase 5: Subtitles ----
  if (await fileExists(paths.captions)) {
    log.info("[6/9] Captions already exist, skipping Whisper");
  } else {
    log.info("[6/9] Generating subtitles (Whisper)");
    const subs = await generateSubtitles(month);
    log.info("Subtitles ready", {
      segments: subs.segmentCount,
      sec: subs.totalDurationSec.toFixed(1),
    });
  }

  // ---- Phase 6: Compose long-form ----
  if (await fileExists(paths.finalLong)) {
    log.info("[7/9] Long-form already exists, skipping compose");
  } else {
    log.info("[7/9] Composing long-form (FFmpeg concat + mux + burn-in)");
    const compose = await composeLongForm(month);
    log.info("Long-form ready", {
      sec: compose.durationSec.toFixed(1),
      mb: (compose.fileSizeBytes / 1024 / 1024).toFixed(1),
    });
  }

  // ---- Phase 7: Shorts ----
  log.info("[8/9] Generating 3 shorts");
  const shorts = await generateShorts(month);
  log.info("Shorts ready", { count: shorts.segments.length });

  // ---- Phase 8: Review + toast ----
  log.info("[9/9] Generating REVIEW.md + toast notification");
  const review = await generateReview(month);
  await notifyReviewReady(month, review.reviewPath);

  process.stdout.write("\n");
  process.stdout.write("============================================\n");
  process.stdout.write("  Pipeline tamamlandi.\n");
  process.stdout.write("============================================\n\n");
  process.stdout.write(`  Long-form: ${paths.finalLong}\n`);
  process.stdout.write(`  Shorts:    ${paths.shortsDir}\n`);
  process.stdout.write(`  Review:    ${paths.review}\n\n`);
  process.stdout.write("Incele, sonra:\n");
  process.stdout.write("  - Memnunsan:    `npm run approve`  (YouTube'a upload)\n");
  process.stdout.write("  - Begenmediysen: `npm run reject`  (klasor arsive tasinir)\n\n");
}

main().catch((err) => {
  log.error("Monthly pipeline failed", String(err));
  process.exitCode = 1;
});
