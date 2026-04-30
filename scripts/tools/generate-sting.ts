/**
 * One-time generator for the "Diji Zihin" sonic logo voice tag.
 *
 * Produces data/_library/sting/diji-zihin.mp3 — used by compose.ts as the intro
 * voice-over hook (plays during the visual intro animation). Run once and the
 * file is reused across all future videos.
 *
 * Usage: npm run sting:generate
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { generateIntroHookAudio } from "../../src/intro-outro.js";
import { ensureDir, getLogger } from "../../src/lib.js";
import { PIPELINE } from "../../config/pipeline.js";

const log = getLogger("generate-sting");

async function main(): Promise<void> {
  const text = PIPELINE.intro.hookText;
  const libraryDir = path.resolve("data/_library/sting");
  const outputPath = path.join(libraryDir, "diji-zihin.mp3");

  await ensureDir(libraryDir);

  try {
    await fs.access(outputPath);
    log.info(
      "Sting already exists — skipping (delete the file to regenerate)",
      outputPath,
    );
    return;
  } catch {
    // does not exist; proceed
  }

  log.info("Generating Diji Zihin sonic logo", { text, outputPath });
  const result = await generateIntroHookAudio(text, outputPath);

  const metadata = {
    id: "diji-zihin-sting",
    file: "diji-zihin.mp3",
    text,
    durationSec: result.durationSec,
    type: "sonic-logo",
    createdAt: new Date().toISOString(),
    voiceProvider: "elevenlabs",
    purpose:
      "Channel name voice tag played during the 4s Diji Zihin intro animation. Reused across all videos.",
    regenerationNotes:
      "Delete the .mp3 file and run `npm run sting:generate` to regenerate (e.g. after voice clone update).",
  };
  await fs.writeFile(
    path.join(libraryDir, "diji-zihin.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8",
  );

  log.info("Sting generated", {
    file: outputPath,
    durationSec: result.durationSec.toFixed(2),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
