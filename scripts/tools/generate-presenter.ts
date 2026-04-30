import axios from "axios";
import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as path from "node:path";
import {
  currentMonth,
  ensureDir,
  getEnv,
  getLogger,
  getPaths,
  retry,
} from "../../src/lib.js";

const log = getLogger("generate-presenter");

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const http = axios.create({ httpsAgent });

const PRESENTER_PROMPT = [
  "Professional headshot portrait of a Turkish male tech YouTuber",
  "age around 30, friendly intelligent expression, light beard, glasses optional",
  "wearing a casual modern dark shirt or jacket",
  "modern minimalist home studio with soft warm lighting",
  "shallow depth of field, looking directly at the camera",
  "front-facing, head and upper shoulders visible",
  "photorealistic portrait photography, sharp facial features",
  "neutral dark background with subtle bokeh",
  "cinematic lighting, deep blue and amber color grading",
  "high detail, 4K quality, magazine cover style",
].join(", ");

interface FalImageResponse {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
}

async function generatePortrait(): Promise<{ outputPath: string; sizeBytes: number }> {
  const env = getEnv();
  const month = currentMonth();
  const paths = getPaths(month);
  const outputPath = path.join(paths.assetsDir, "_presenter.jpg");

  log.info("Generating presenter portrait", {
    model: "fal-ai/flux/dev",
    promptPreview: PRESENTER_PROMPT.slice(0, 80) + "...",
  });

  const res = await retry(
    () =>
      http.post<FalImageResponse>(
        "https://fal.run/fal-ai/flux/dev",
        {
          prompt: PRESENTER_PROMPT,
          image_size: { width: 768, height: 768 },
          num_inference_steps: 28,
          guidance_scale: 3.5,
          num_images: 1,
          enable_safety_checker: true,
          output_format: "jpeg",
        },
        {
          headers: {
            Authorization: `Key ${env.FAL_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 120_000,
        },
      ),
    {
      attempts: 3,
      onAttempt: (a, e) => log.warn(`fal.ai attempt ${a} failed`, String(e)),
    },
  );

  const imgUrl = res.data.images?.[0]?.url;
  if (!imgUrl) throw new Error("fal.ai returned no image");

  log.info("Downloading portrait", { url: imgUrl });
  const imgRes = await retry(
    () =>
      http.get<ArrayBuffer>(imgUrl, {
        responseType: "arraybuffer",
        timeout: 60_000,
      }),
    { attempts: 3 },
  );

  await ensureDir(path.dirname(outputPath));
  const buf = Buffer.from(imgRes.data);
  await fs.writeFile(outputPath, buf);

  return { outputPath, sizeBytes: buf.length };
}

async function main() {
  const result = await generatePortrait();
  process.stdout.write("\nPresenter portrait ready.\n");
  process.stdout.write(`  File:  ${result.outputPath}\n`);
  process.stdout.write(`  Size:  ${(result.sizeBytes / 1024).toFixed(1)} KB\n`);
}

main().catch((err) => {
  log.error("Presenter generation failed", String(err));
  process.exitCode = 1;
});
