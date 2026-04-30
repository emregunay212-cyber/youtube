import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  PROJECT_ROOT,
  currentMonth,
  fileExists,
  getEnv,
  getLogger,
  getPaths,
  readJson,
} from "../src/lib.js";
import type { Script } from "../src/types.js";

const log = getLogger("run-avatar");

function getPythonBin(): string {
  return path.join(PROJECT_ROOT, ".python-venv", "Scripts", "python.exe");
}

function runSadTalker(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  size: number = 512,
): Promise<void> {
  const python = getPythonBin();
  const sadtalker = path.join(
    PROJECT_ROOT,
    "video-toolkit",
    "tools",
    "sadtalker.py",
  );

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [
        sadtalker,
        "--cloud",
        "runpod",
        "--image",
        imagePath,
        "--audio",
        audioPath,
        "--output",
        outputPath,
        "--size",
        String(size),
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stderr = "";
    let lastProgress = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text && text !== lastProgress) {
        log.debug(text);
        lastProgress = text;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `sadtalker exited with code ${code}\nLast stderr:\n${stderr.slice(-1500)}`,
          ),
        );
    });
  });
}

function fitTo1920x1080(
  avatarVideoPath: string,
  bgImagePath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        bgImagePath,
        "-i",
        avatarVideoPath,
        "-filter_complex",
        "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=30,eq=brightness=-0.15:saturation=0.7,setsar=1[bg];" +
          "[1:v]scale=-2:880,setsar=1[fg];" +
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]",
        "-map",
        "[outv]",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  const env = getEnv();

  if (!env.RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY required in .env");
  }
  if (!env.RUNPOD_SADTALKER_ENDPOINT_ID) {
    throw new Error(
      "RUNPOD_SADTALKER_ENDPOINT_ID required in .env. Run: python video-toolkit/tools/sadtalker.py --setup",
    );
  }

  const presenterPath = path.join(paths.assetsDir, "_presenter.jpg");
  if (!(await fileExists(presenterPath))) {
    throw new Error(
      `Presenter portrait not found at ${presenterPath}. Run \`npx tsx scripts/tools/generate-presenter.ts\` first.`,
    );
  }

  const script = await readJson<Script>(paths.script);
  const presenterIds = [
    ...script.hook.map((s) => s.id),
    ...script.cta.map((s) => s.id),
  ];

  log.info("Starting SadTalker avatar generation", {
    sceneIds: presenterIds,
    total: presenterIds.length,
    presenter: presenterPath,
  });

  const startedAt = Date.now();

  for (const sceneId of presenterIds) {
    const audioFile = path.join(
      paths.audioDir,
      `scene-${String(sceneId).padStart(3, "0")}.mp3`,
    );
    if (!(await fileExists(audioFile))) {
      log.warn(`Audio missing for scene ${sceneId}, skipping`, {
        path: audioFile,
      });
      continue;
    }

    const rawAvatarPath = path.join(
      paths.assetsDir,
      `_avatar-raw-${String(sceneId).padStart(3, "0")}.mp4`,
    );
    const finalScenePath = path.join(
      paths.assetsDir,
      `scene-${String(sceneId).padStart(3, "0")}.mp4`,
    );

    const sceneStart = Date.now();
    log.info(`Scene ${sceneId}: SadTalker via RunPod (cold start may take 60-90s)`);
    await runSadTalker(presenterPath, audioFile, rawAvatarPath, 512);
    const sadtalkerSec = Math.round((Date.now() - sceneStart) / 1000);
    log.info(`Scene ${sceneId}: SadTalker done`, { elapsedSec: sadtalkerSec });

    log.info(`Scene ${sceneId}: Compositing 1920x1080 with blurred background`);
    await fitTo1920x1080(rawAvatarPath, presenterPath, finalScenePath);

    await fs.unlink(rawAvatarPath).catch(() => {});

    log.info(`Scene ${sceneId} avatar ready`, { file: finalScenePath });
  }

  const totalSec = Math.round((Date.now() - startedAt) / 1000);
  process.stdout.write(`\nAvatar generation complete.\n`);
  process.stdout.write(`  Scenes: ${presenterIds.length}\n`);
  process.stdout.write(`  Total time: ${totalSec} sec (~${Math.round(totalSec / 60)} min)\n`);
  process.stdout.write(`  Estimated cost: ~$${(presenterIds.length * 0.04).toFixed(2)}\n`);
}

main().catch((err) => {
  log.error("Avatar generation failed", String(err));
  process.exitCode = 1;
});
