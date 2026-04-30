import ffmpeg from "fluent-ffmpeg";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PIPELINE } from "../config/pipeline.js";
import {
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
  readJson,
  readText,
  writeText,
} from "./lib.js";
import {
  generateFullAudio,
  generateIntro,
  generateOutro,
} from "./intro-outro.js";
import type { Script, SceneTiming } from "./types.js";

const log = getLogger("compose");

interface SceneTimingsArtifact {
  generatedAt: string;
  month: string;
  totalDurationMs: number;
  scenes: SceneTiming[];
}

function escapeFilterPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

function parseSrtTime(t: string): number {
  const m = t.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!m) return 0;
  return (
    parseInt(m[1]!, 10) * 3_600_000 +
    parseInt(m[2]!, 10) * 60_000 +
    parseInt(m[3]!, 10) * 1_000 +
    parseInt(m[4]!, 10)
  );
}

function formatSrtTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const h = Math.floor(safeMs / 3_600_000);
  const m = Math.floor((safeMs % 3_600_000) / 60_000);
  const s = Math.floor((safeMs % 60_000) / 1_000);
  const remMs = safeMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0",
  )}:${String(s).padStart(2, "0")},${String(remMs).padStart(3, "0")}`;
}

function shiftAndCapSrt(
  srt: string,
  offsetSec: number,
  capEndSec: number,
): string {
  const offsetMs = Math.round(offsetSec * 1000);
  const capMs = Math.round(capEndSec * 1000);

  const blocks = srt.split(/\r?\n\r?\n/);
  const result: string[] = [];
  let newIndex = 1;

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) continue;

    const timeMatch = lines[1]?.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/,
    );
    if (!timeMatch) continue;

    let startMs = parseSrtTime(timeMatch[1]!) + offsetMs;
    let endMs = parseSrtTime(timeMatch[2]!) + offsetMs;

    if (startMs >= capMs) continue;
    if (endMs > capMs) endMs = capMs;
    if (endMs <= startMs) continue;

    const textLines = lines.slice(2);
    const newBlock = [
      String(newIndex++),
      `${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`,
      ...textLines,
    ].join("\n");

    result.push(newBlock);
  }

  return result.join("\n\n") + "\n";
}

function mixVoiceoverWithMusic(
  voiceoverPath: string,
  musicPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        voiceoverPath,
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        "[1:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=425:d=4[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[out]",
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
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
      else
        reject(
          new Error(`ffmpeg mix failed (${code}): ${stderr.slice(-1000)}`),
        );
    });
  });
}

function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      const d = meta?.format?.duration;
      if (typeof d !== "number") {
        return reject(new Error(`No duration in ${filePath}`));
      }
      resolve(d);
    });
  });
}

async function concatVideos(
  inputs: readonly string[],
  outputPath: string,
): Promise<void> {
  if (inputs.length === 0) throw new Error("No inputs to concat");
  await ensureDir(path.dirname(outputPath));
  const listFile = outputPath + ".concat.txt";
  const lines = inputs
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listFile, lines, "utf-8");
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", reject);
    });
  } finally {
    await fs.unlink(listFile).catch(() => {});
  }
}

async function muxAudioAndBurnSubtitles(
  videoPath: string,
  audioPath: string,
  subtitlePath: string,
  outputPath: string,
): Promise<void> {
  const subFilterPath = escapeFilterPath(subtitlePath);
  const styleArgs = [
    "Fontname=Arial",
    "Fontsize=22",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H80000000",
    "BorderStyle=3",
    "Outline=2",
    "Shadow=0",
    "Alignment=2",
    "MarginV=90",
  ].join(",");
  const subFilter = `subtitles='${subFilterPath}':force_style='${styleArgs}'`;

  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .videoFilter(subFilter)
      .outputOptions([
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        String(PIPELINE.video.crf),
        "-c:a",
        PIPELINE.video.audioCodec,
        "-b:a",
        PIPELINE.video.audioBitrate,
        "-movflags",
        "+faststart",
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", reject);
  });
}

export interface ComposeResult {
  outputPath: string;
  durationSec: number;
  fileSizeBytes: number;
  sceneCount: number;
  introDurationSec: number;
  outroDurationSec: number;
}

export async function composeLongForm(month: string): Promise<ComposeResult> {
  const paths = getPaths(month);

  if (!(await fileExists(paths.voiceover))) {
    throw new Error(
      `voiceover.mp3 missing at ${paths.voiceover}. Run \`npm run tts\` first.`,
    );
  }
  if (!(await fileExists(paths.sceneTimings))) {
    throw new Error(
      `scene-timings.json missing at ${paths.sceneTimings}. Run \`npm run tts\` first.`,
    );
  }
  if (!(await fileExists(paths.captions))) {
    throw new Error(
      `captions.srt missing at ${paths.captions}. Run \`npm run subtitles\` first.`,
    );
  }
  if (!(await fileExists(paths.script))) {
    throw new Error(`script.json missing at ${paths.script}.`);
  }

  const timingsArtifact = await readJson<SceneTimingsArtifact>(
    paths.sceneTimings,
  );
  const script = await readJson<Script>(paths.script);

  const sceneFiles: string[] = [];
  for (const t of timingsArtifact.scenes) {
    const sceneFile = path.join(
      paths.assetsDir,
      `scene-${String(t.sceneId).padStart(3, "0")}.mp4`,
    );
    if (!(await fileExists(sceneFile))) {
      throw new Error(
        `Scene visual missing: ${sceneFile}. Run \`npm run visuals\` first.`,
      );
    }
    sceneFiles.push(sceneFile);
  }

  const introDurationSec = PIPELINE.intro.durationSec;
  const outroDurationSec = PIPELINE.outro.durationSec;

  log.info("Long-form compose starting (Diji Zihin branded)", {
    scenes: sceneFiles.length,
    introDurationSec,
    outroDurationSec,
    output: paths.finalLong,
  });

  // Stage 0: generate Diji Zihin intro + outro videos
  log.info("Stage 0/4: generating Diji Zihin intro + outro");
  const introVideo = path.join(paths.root, ".intro.mp4");
  const outroVideo = path.join(paths.root, ".outro.mp4");
  await Promise.all([
    generateIntro(introVideo),
    generateOutro(outroVideo),
  ]);

  // Stage 1: concat [intro, ...scenes, outro]
  log.info("Stage 1/4: concatenating intro + scenes + outro");
  const concatVideo = path.join(paths.root, ".video-only.mp4");
  await concatVideos([introVideo, ...sceneFiles, outroVideo], concatVideo);

  // Stage 2: Build full audio with intro lead silence + voiceover + outro trailing silence
  // Optionally inject the "Diji Zihin." sonic logo at the start if present in library.
  log.info("Stage 2/4: building audio track with intro/outro padding");
  const paddedAudio = path.join(paths.root, ".voiceover-padded.mp3");
  const stingPath = path.join(
    paths.root,
    "..",
    "_library",
    "sting",
    "diji-zihin.mp3",
  );
  const hasSting = await fileExists(stingPath);
  let hookDurationSec = 0;
  if (hasSting) {
    const probed = await probeAudioDuration(stingPath);
    hookDurationSec = probed;
    log.info("Diji Zihin sonic logo detected — using as intro voice tag", {
      stingPath,
      hookDurationSec: hookDurationSec.toFixed(2),
    });
  }
  await generateFullAudio({
    voiceoverPath: paths.voiceover,
    outputPath: paddedAudio,
    introDurationSec,
    tailSilenceSec: PIPELINE.audioBuffer.tailSilenceSec,
    outroSilenceSec: outroDurationSec,
    hookAudioPath: hasSting ? stingPath : null,
    hookDurationSec,
  });

  // Stage 2b: If background music exists, mix it underneath voiceover
  const musicPath = path.join(paths.root, "music", "main.mp3");
  let finalAudio = paddedAudio;
  if (await fileExists(musicPath)) {
    log.info("Mixing background music underneath voiceover");
    const mixedAudio = path.join(paths.root, ".voiceover-with-music.mp3");
    await mixVoiceoverWithMusic(paddedAudio, musicPath, mixedAudio);
    finalAudio = mixedAudio;
  }

  // Stage 3: Mux audio + burn subtitles
  // Subtitles are timed to the voiceover only — they need to be shifted by intro duration
  // so they align with where the voiceover actually plays in the final concatenated video,
  // and capped before the outro starts so they don't overlap the outro CTA card.
  log.info("Stage 3/4: muxing audio + burning subtitles");
  const voiceoverDurationSec = await probeAudioDuration(paths.voiceover);
  const subtitleCapSec = introDurationSec + voiceoverDurationSec - 0.2;
  log.info("SRT timing", {
    introDurationSec,
    voiceoverDuration: voiceoverDurationSec.toFixed(2),
    subtitleCap: subtitleCapSec.toFixed(2),
    outroDurationSec,
  });
  const shiftedSrt = path.join(paths.root, ".captions-shifted.srt");
  const originalSrt = await readText(paths.captions);
  const shiftedSrtContent = shiftAndCapSrt(
    originalSrt,
    introDurationSec,
    subtitleCapSec,
  );
  await writeText(shiftedSrt, shiftedSrtContent);

  try {
    await muxAudioAndBurnSubtitles(
      concatVideo,
      finalAudio,
      shiftedSrt,
      paths.finalLong,
    );
  } finally {
    await fs.unlink(introVideo).catch(() => {});
    await fs.unlink(outroVideo).catch(() => {});
    await fs.unlink(concatVideo).catch(() => {});
    await fs.unlink(paddedAudio).catch(() => {});
    if (finalAudio !== paddedAudio) {
      await fs.unlink(finalAudio).catch(() => {});
    }
    await fs.unlink(shiftedSrt).catch(() => {});
  }

  const stats = await fs.stat(paths.finalLong);
  const baseDurationSec = timingsArtifact.totalDurationMs / 1000;
  const totalDurationSec =
    introDurationSec +
    baseDurationSec +
    PIPELINE.audioBuffer.tailSilenceSec +
    outroDurationSec;

  log.info("Long-form ready (Diji Zihin)", {
    file: paths.finalLong,
    durationSec: totalDurationSec.toFixed(1),
    sizeMB: (stats.size / 1024 / 1024).toFixed(1),
  });

  return {
    outputPath: paths.finalLong,
    durationSec: totalDurationSec,
    fileSizeBytes: stats.size,
    sceneCount: sceneFiles.length,
    introDurationSec,
    outroDurationSec,
  };
}
