import axios from "axios";
import * as https from "node:https";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Local dev: skip TLS verification for fal.ai CDN where Windows trust store
// doesn't include the upstream CA. Safe here because the host is operator's
// own machine and the URLs come from authenticated fal.ai responses.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const http = axios.create({ httpsAgent });
import { PIPELINE } from "../config/pipeline.js";
import {
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
  parallelMap,
  readJson,
  retry,
} from "./lib.js";
import type { Scene, Script, SceneTiming } from "./types.js";

const log = getLogger("visuals");

const TARGET_W = PIPELINE.video.longFormWidth;
const TARGET_H = PIPELINE.video.longFormHeight;
const FPS = PIPELINE.video.fps;

// ---------- Pexels ----------

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  video_files: PexelsVideoFile[];
}

interface PexelsResponse {
  videos: PexelsVideo[];
  total_results: number;
}

async function searchPexelsVideo(
  query: string,
  minDurationSec: number,
): Promise<{ url: string; durationSec: number } | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    log.warn("PEXELS_API_KEY missing, skipping Pexels");
    return null;
  }
  try {
    const res = await retry(() =>
      http.get<PexelsResponse>("https://api.pexels.com/videos/search", {
        params: { query, per_page: 8, orientation: "landscape", size: "medium" },
        headers: { Authorization: apiKey },
        timeout: 15_000,
      }),
    );

    for (const video of res.data.videos) {
      if (video.duration < Math.max(3, minDurationSec * 0.6)) continue;
      const hd = video.video_files
        .filter((f) => f.file_type === "video/mp4")
        .sort((a, b) => Math.abs(a.width - TARGET_W) - Math.abs(b.width - TARGET_W))[0];
      if (hd) return { url: hd.link, durationSec: video.duration };
    }
    return null;
  } catch (err) {
    log.warn(`Pexels search failed for "${query}"`, String(err));
    return null;
  }
}

// ---------- fal.ai Flux schnell ----------

interface FalImageResponse {
  images: Array<{ url: string; width: number; height: number; content_type: string }>;
}

async function generateFalImage(prompt: string): Promise<string> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY missing in .env");
  const res = await retry(() =>
    http.post<FalImageResponse>(
      `https://fal.run/${PIPELINE.visuals.falModel}`,
      {
        prompt,
        image_size: PIPELINE.visuals.falImageSize,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "jpeg",
      },
      {
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60_000,
      },
    ),
  );
  const url = res.data.images?.[0]?.url;
  if (!url) throw new Error("fal.ai returned no image");
  return url;
}

// ---------- Download helper ----------

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await retry(() =>
    http.get<ArrayBuffer>(url, { responseType: "arraybuffer", timeout: 60_000 }),
  );
  await ensureDir(path.dirname(dest));
  await fs.writeFile(dest, Buffer.from(res.data));
}

// ---------- FFmpeg: fit video to size + duration ----------

async function fitVideoToScene(
  inputPath: string,
  outputPath: string,
  targetSec: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilter([
        `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_W}:${TARGET_H}`,
        `fps=${FPS}`,
        `setsar=1`,
      ])
      .duration(targetSec)
      .outputOptions([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", String(PIPELINE.video.crf),
        "-an",
        "-movflags", "+faststart",
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", reject);
  });
}

// ---------- FFmpeg: Ken Burns from still image ----------

async function kenBurnsImage(
  imagePath: string,
  outputPath: string,
  targetSec: number,
): Promise<void> {
  const totalFrames = Math.max(2, Math.round(targetSec * FPS));
  const filter = [
    `scale=${TARGET_W * 2}:${TARGET_H * 2}:flags=lanczos`,
    `zoompan=z='min(zoom+0.0009,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${TARGET_W}x${TARGET_H}:fps=${FPS}`,
    `setsar=1`,
  ].join(",");

  return new Promise<void>((resolve, reject) => {
    ffmpeg(imagePath)
      .inputOptions(["-loop", "1", "-framerate", String(FPS)])
      .videoFilter(filter)
      .duration(targetSec)
      .outputOptions([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", String(PIPELINE.video.crf),
        "-an",
        "-movflags", "+faststart",
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", reject);
  });
}

// ---------- Prompt shaping ----------

const PEXELS_STOPWORDS = new Set([
  "a", "an", "the", "in", "on", "at", "of", "and", "or", "with", "into", "over",
  "for", "to", "from", "as", "by", "is", "are", "was", "were", "be", "been",
  "this", "that", "these", "those", "it", "its", "his", "her", "their",
  "soft", "slow", "subtle", "calm", "gentle", "evening", "morning",
  "metaphor", "like", "composition",
]);

function pexelsKeyword(visualHint: string): string {
  const words = visualHint
    .toLowerCase()
    .replace(/[:;,.()'"\[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !PEXELS_STOPWORDS.has(w));
  return words.slice(0, 4).join(" ") || visualHint.split(/\s+/).slice(0, 3).join(" ");
}

function buildFalPrompt(visualHint: string): string {
  const themeContext = "AI agents and software engineering theme";
  const styleContext = "cinematic photography, dramatic lighting, dark blue and amber tones, futuristic technology aesthetic, high detail, photorealistic, 16:9 wide composition";
  return `${visualHint}. ${themeContext}. ${styleContext}.`;
}

// ---------- Per-scene strategy ----------

export interface SceneVisualResult {
  sceneId: number;
  source: "pexels" | "fal";
  outputPath: string;
  targetSec: number;
}

function sceneDurationSec(scene: Scene, timings: SceneTiming[]): number {
  const t = timings.find((x) => x.sceneId === scene.id);
  if (t) return Math.max(2, (t.endMs - t.startMs) / 1000);
  return scene.durationEstimateSec;
}

async function processScene(
  scene: Scene,
  targetSec: number,
  outputPath: string,
): Promise<SceneVisualResult> {
  await ensureDir(path.dirname(outputPath));

  if (scene.visualType === "concrete") {
    const query = pexelsKeyword(scene.visualHint);
    const pexels = await searchPexelsVideo(query, targetSec);
    if (pexels) {
      const tmp = outputPath + ".raw.mp4";
      try {
        log.info(`Scene ${scene.id}: Pexels download (${Math.round(pexels.durationSec)}s)`, { query });
        await downloadTo(pexels.url, tmp);
        await fitVideoToScene(tmp, outputPath, targetSec);
        return { sceneId: scene.id, source: "pexels", outputPath, targetSec };
      } finally {
        await fs.unlink(tmp).catch(() => {});
      }
    }
    log.warn(`Scene ${scene.id}: no Pexels match, falling back to fal.ai`, { query });
  }

  const tmpImg = outputPath + ".raw.jpg";
  try {
    const prompt = buildFalPrompt(scene.visualHint);
    log.info(`Scene ${scene.id}: fal.ai Flux schnell`, { prompt: prompt.slice(0, 100) + "..." });
    const url = await generateFalImage(prompt);
    await downloadTo(url, tmpImg);
    await kenBurnsImage(tmpImg, outputPath, targetSec);
    return { sceneId: scene.id, source: "fal", outputPath, targetSec };
  } finally {
    await fs.unlink(tmpImg).catch(() => {});
  }
}

export async function generateSceneVisual(
  sceneId: number,
  month: string,
): Promise<SceneVisualResult> {
  const paths = getPaths(month);
  const script = await readJson<Script>(paths.script);
  const timings = (await fileExists(paths.sceneTimings))
    ? (await readJson<{ scenes: SceneTiming[] }>(paths.sceneTimings)).scenes
    : [];
  const allScenes: Scene[] = [...script.hook, ...script.body, ...script.cta];
  const scene = allScenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const targetSec = sceneDurationSec(scene, timings);
  const outputPath = path.join(paths.assetsDir, `scene-${String(scene.id).padStart(3, "0")}.mp4`);
  return processScene(scene, targetSec, outputPath);
}

export interface VisualsResult {
  results: SceneVisualResult[];
  pexelsCount: number;
  falCount: number;
  totalSec: number;
}

export async function generateVisuals(month: string): Promise<VisualsResult> {
  const paths = getPaths(month);
  if (!(await fileExists(paths.script))) {
    throw new Error(`script.json not found at ${paths.script}`);
  }
  const script = await readJson<Script>(paths.script);
  const timings = (await fileExists(paths.sceneTimings))
    ? (await readJson<{ scenes: SceneTiming[] }>(paths.sceneTimings)).scenes
    : [];
  const allScenes: Scene[] = [...script.hook, ...script.body, ...script.cta];

  await ensureDir(paths.assetsDir);

  log.info("Visuals starting", {
    scenes: allScenes.length,
    concrete: allScenes.filter((s) => s.visualType === "concrete").length,
    abstract: allScenes.filter((s) => s.visualType === "abstract").length,
  });

  const results = await parallelMap(
    allScenes,
    PIPELINE.concurrency.visualsParallel,
    async (scene) => {
      const targetSec = sceneDurationSec(scene, timings);
      const outputPath = path.join(
        paths.assetsDir,
        `scene-${String(scene.id).padStart(3, "0")}.mp4`,
      );
      const out = await processScene(scene, targetSec, outputPath);
      log.info(`Scene ${scene.id}/${allScenes.length} visual ready`, {
        source: out.source,
        targetSec: targetSec.toFixed(1),
      });
      return out;
    },
  );

  const pexelsCount = results.filter((r) => r.source === "pexels").length;
  const falCount = results.filter((r) => r.source === "fal").length;
  const totalSec = results.reduce((sum, r) => sum + r.targetSec, 0);

  log.info("Visuals ready", {
    dir: paths.assetsDir,
    pexels: pexelsCount,
    fal: falCount,
    totalSec: totalSec.toFixed(1),
  });

  return { results, pexelsCount, falCount, totalSec };
}
