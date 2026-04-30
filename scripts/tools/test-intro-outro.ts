/**
 * Quick smoke-test for the Diji Zihin intro and outro renders.
 * Outputs to data/_preview/intro.mp4 and outro.mp4 — visual review only.
 *
 * Usage: npm run test:intro-outro
 */
import * as path from "node:path";
import { generateIntro, generateOutro } from "../../src/intro-outro.js";
import { ensureDir, getLogger } from "../../src/lib.js";

const log = getLogger("test-intro-outro");

async function main(): Promise<void> {
  const outDir = path.resolve("data/_preview");
  await ensureDir(outDir);

  const introPath = path.join(outDir, "intro.mp4");
  const outroPath = path.join(outDir, "outro.mp4");

  log.info("Rendering preview", { introPath, outroPath });
  const [intro, outro] = await Promise.all([
    generateIntro(introPath),
    generateOutro(outroPath),
  ]);

  log.info("Preview ready", {
    intro: { file: intro.outputPath, sec: intro.durationSec },
    outro: { file: outro.outputPath, sec: outro.durationSec },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
