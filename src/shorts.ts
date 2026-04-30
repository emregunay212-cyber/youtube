import ffmpeg from "fluent-ffmpeg";
import * as path from "node:path";
import { PIPELINE } from "../config/pipeline.js";
import {
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
  readJson,
  writeJson,
} from "./lib.js";
import type { Script, SceneTiming, ShortSegment } from "./types.js";

const log = getLogger("shorts");

interface SceneTimingsArtifact {
  generatedAt: string;
  month: string;
  totalDurationMs: number;
  scenes: SceneTiming[];
}

interface ShortsManifest {
  generatedAt: string;
  segments: ShortSegment[];
}

const TARGET_DURATION_SEC =
  (PIPELINE.shorts.minDurationSec + PIPELINE.shorts.maxDurationSec) / 2;

function findRangeForward(
  scenes: SceneTiming[],
  startIdx: number,
  targetSec: number,
): { startIdx: number; endIdx: number; durationSec: number } {
  if (scenes.length === 0) {
    throw new Error("No scenes available for short");
  }
  const startMs = scenes[startIdx]!.startMs;
  let endIdx = startIdx;
  let durationSec = (scenes[endIdx]!.endMs - startMs) / 1000;
  while (
    endIdx < scenes.length - 1 &&
    durationSec < targetSec &&
    durationSec < PIPELINE.shorts.maxDurationSec
  ) {
    endIdx++;
    durationSec = (scenes[endIdx]!.endMs - startMs) / 1000;
  }
  return { startIdx, endIdx, durationSec };
}

function findRangeBackward(
  scenes: SceneTiming[],
  endIdx: number,
  targetSec: number,
): { startIdx: number; endIdx: number; durationSec: number } {
  const endMs = scenes[endIdx]!.endMs;
  let startIdx = endIdx;
  let durationSec = (endMs - scenes[startIdx]!.startMs) / 1000;
  while (
    startIdx > 0 &&
    durationSec < targetSec &&
    durationSec < PIPELINE.shorts.maxDurationSec
  ) {
    startIdx--;
    durationSec = (endMs - scenes[startIdx]!.startMs) / 1000;
  }
  return { startIdx, endIdx, durationSec };
}

function pickAutoSegments(
  script: Script,
  timings: SceneTiming[],
): ShortSegment[] {
  if (timings.length < 3) {
    throw new Error(
      `Need at least 3 scenes to generate shorts (got ${timings.length})`,
    );
  }

  const total = timings.length;

  // Short 1: Hook section forward — start at scene 0
  const r1 = findRangeForward(timings, 0, TARGET_DURATION_SEC);

  // Short 2: Mid section — start at middle scene
  const midIdx = Math.floor(total / 2);
  const r2 = findRangeForward(timings, midIdx, TARGET_DURATION_SEC);

  // Short 3: End section — work backwards from last scene
  const r3 = findRangeBackward(timings, total - 1, TARGET_DURATION_SEC);

  return [
    {
      index: 1,
      startSceneId: timings[r1.startIdx]!.sceneId,
      endSceneId: timings[r1.endIdx]!.sceneId,
      hookOverlay: "",
      estimatedDurationSec: Math.round(r1.durationSec),
    },
    {
      index: 2,
      startSceneId: timings[r2.startIdx]!.sceneId,
      endSceneId: timings[r2.endIdx]!.sceneId,
      hookOverlay: "",
      estimatedDurationSec: Math.round(r2.durationSec),
    },
    {
      index: 3,
      startSceneId: timings[r3.startIdx]!.sceneId,
      endSceneId: timings[r3.endIdx]!.sceneId,
      hookOverlay: "",
      estimatedDurationSec: Math.round(r3.durationSec),
    },
  ];
}

async function extractShort(
  longFormPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  const cropFilter = [
    `scale=${PIPELINE.shorts.width}:${PIPELINE.shorts.height}:force_original_aspect_ratio=increase`,
    `crop=${PIPELINE.shorts.width}:${PIPELINE.shorts.height}`,
    "setsar=1",
  ].join(",");

  return new Promise<void>((resolve, reject) => {
    ffmpeg(longFormPath)
      .seekInput(startSec)
      .duration(durationSec)
      .videoFilter(cropFilter)
      .outputOptions([
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        String(PIPELINE.video.crf),
        "-c:a",
        "aac",
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

export interface ShortsResult {
  segments: Array<{
    index: 1 | 2 | 3;
    startSceneId: number;
    endSceneId: number;
    durationSec: number;
    outputPath: string;
  }>;
}

export async function generateShorts(month: string): Promise<ShortsResult> {
  const paths = getPaths(month);

  if (!(await fileExists(paths.finalLong))) {
    throw new Error(
      `final-long.mp4 missing at ${paths.finalLong}. Run \`npm run compose\` first.`,
    );
  }
  if (!(await fileExists(paths.script))) {
    throw new Error(`script.json missing at ${paths.script}.`);
  }
  if (!(await fileExists(paths.sceneTimings))) {
    throw new Error(`scene-timings.json missing at ${paths.sceneTimings}.`);
  }

  const script = await readJson<Script>(paths.script);
  const timingsArt = await readJson<SceneTimingsArtifact>(paths.sceneTimings);

  const shortsJsonPath = path.join(paths.root, "shorts.json");
  let segments: ShortSegment[];
  if (await fileExists(shortsJsonPath)) {
    const manifest = await readJson<ShortsManifest>(shortsJsonPath);
    segments = manifest.segments;
    log.info("Using manual shorts.json", { count: segments.length });
  } else {
    segments = pickAutoSegments(script, timingsArt.scenes);
    log.info("Auto-picked shorts segments", { count: segments.length });
    await writeJson(shortsJsonPath, {
      generatedAt: new Date().toISOString(),
      segments,
    } satisfies ShortsManifest);
  }

  await ensureDir(paths.shortsDir);

  const results: ShortsResult["segments"] = [];

  for (const seg of segments) {
    const startTiming = timingsArt.scenes.find(
      (s) => s.sceneId === seg.startSceneId,
    );
    const endTiming = timingsArt.scenes.find(
      (s) => s.sceneId === seg.endSceneId,
    );
    if (!startTiming || !endTiming) {
      throw new Error(
        `Scene IDs not found in timings: ${seg.startSceneId} or ${seg.endSceneId}`,
      );
    }

    // final-long.mp4 starts with the Diji Zihin intro animation, so all scene
    // start times in scene-timings.json need to be shifted by the intro length.
    const introOffsetSec = PIPELINE.intro.durationSec;
    const startSec = startTiming.startMs / 1000 + introOffsetSec;
    const durationSec = (endTiming.endMs - startTiming.startMs) / 1000;
    const outputPath = path.join(paths.shortsDir, `short-${seg.index}.mp4`);

    log.info(`Extracting Short ${seg.index}`, {
      scenes: `${seg.startSceneId}..${seg.endSceneId}`,
      startSec: startSec.toFixed(1),
      durationSec: durationSec.toFixed(1),
      introOffsetSec,
    });

    await extractShort(paths.finalLong, startSec, durationSec, outputPath);

    results.push({
      index: seg.index,
      startSceneId: seg.startSceneId,
      endSceneId: seg.endSceneId,
      durationSec,
      outputPath,
    });
  }

  log.info("Shorts ready", {
    dir: paths.shortsDir,
    count: results.length,
  });

  return { segments: results };
}
