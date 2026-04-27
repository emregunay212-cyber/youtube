import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PIPELINE } from "../../config/pipeline.js";
import {
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
  parallelMap,
  readJson,
  retry,
  writeJson,
} from "../lib.js";
import type { Scene, Script, SceneTiming } from "../types.js";

const log = getLogger("tts");

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

interface TtsCredentials {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

function getCredentials(): TtsCredentials {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  if (!apiKey || !voiceId) {
    throw new Error(
      "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID required in .env",
    );
  }
  return { apiKey, voiceId, modelId };
}

async function ttsScene(text: string, creds: TtsCredentials): Promise<Buffer> {
  const url = `${ELEVENLABS_TTS_URL}/${creds.voiceId}`;
  const res = await axios.post<ArrayBuffer>(
    url,
    {
      text,
      model_id: creds.modelId,
      voice_settings: {
        stability: PIPELINE.tts.stability,
        similarity_boost: PIPELINE.tts.similarityBoost,
        style: PIPELINE.tts.style,
        use_speaker_boost: PIPELINE.tts.useSpeakerBoost,
      },
    },
    {
      headers: {
        "xi-api-key": creds.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
      timeout: 120_000,
      validateStatus: (s) => s >= 200 && s < 300,
    },
  );
  return Buffer.from(res.data);
}

function probeDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const d = metadata?.format?.duration;
      if (typeof d !== "number") return reject(new Error(`No duration in ${filePath}`));
      resolve(d);
    });
  });
}

async function concatMp3s(inputs: readonly string[], output: string): Promise<void> {
  if (inputs.length === 0) throw new Error("Cannot concat zero inputs");
  await ensureDir(path.dirname(output));
  const listFile = output + ".concat-list.txt";
  const list = inputs
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listFile, list, "utf-8");
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .save(output)
        .on("end", () => resolve())
        .on("error", reject);
    });
  } finally {
    await fs.unlink(listFile).catch(() => {});
  }
}

export interface SingleSceneResult {
  scene: Scene;
  filePath: string;
  durationSec: number;
  bytes: number;
}

export async function ttsSingleScene(
  scene: Scene,
  outDir: string,
): Promise<SingleSceneResult> {
  const creds = getCredentials();
  await ensureDir(outDir);
  const filePath = path.join(outDir, `scene-${String(scene.id).padStart(3, "0")}.mp3`);
  const buf = await retry(() => ttsScene(scene.voiceover, creds), {
    attempts: 3,
    onAttempt: (a, e) => log.warn(`TTS scene ${scene.id} attempt ${a} failed`, String(e)),
  });
  await fs.writeFile(filePath, buf);
  const durationSec = await probeDurationSec(filePath);
  return { scene, filePath, durationSec, bytes: buf.length };
}

export interface VoiceoverResult {
  totalDurationSec: number;
  sceneTimings: SceneTiming[];
  voiceoverPath: string;
  scenesDir: string;
  totalChars: number;
}

export async function generateVoiceover(month: string): Promise<VoiceoverResult> {
  const paths = getPaths(month);
  const creds = getCredentials();

  if (!(await fileExists(paths.script))) {
    throw new Error(`script.json not found at ${paths.script}. Run /youtube-monthly first.`);
  }

  const script = await readJson<Script>(paths.script);
  const allScenes: Scene[] = [...script.hook, ...script.body, ...script.cta];
  const totalChars = allScenes.reduce((sum, s) => sum + s.voiceover.length, 0);

  log.info("TTS starting", {
    scenes: allScenes.length,
    totalChars,
    voice: creds.voiceId,
    model: creds.modelId,
  });

  await ensureDir(paths.audioDir);

  const sceneFiles = await parallelMap(
    allScenes,
    PIPELINE.concurrency.ttsParallel,
    async (scene) => {
      const filePath = path.join(
        paths.audioDir,
        `scene-${String(scene.id).padStart(3, "0")}.mp3`,
      );
      const buf = await retry(() => ttsScene(scene.voiceover, creds), {
        attempts: 3,
        onAttempt: (a, e) =>
          log.warn(`TTS scene ${scene.id} attempt ${a} failed`, String(e)),
      });
      await fs.writeFile(filePath, buf);
      log.info(`TTS scene ${scene.id}/${allScenes.length} done`, {
        bytes: buf.length,
      });
      return filePath;
    },
  );

  log.info("Probing durations");
  const durations = await Promise.all(sceneFiles.map(probeDurationSec));

  const sceneTimings: SceneTiming[] = [];
  let cursorSec = 0;
  for (let i = 0; i < allScenes.length; i++) {
    const startMs = Math.round(cursorSec * 1000);
    const durationMs = Math.round(durations[i]! * 1000);
    sceneTimings.push({
      sceneId: allScenes[i]!.id,
      startMs,
      endMs: startMs + durationMs,
      audioFile: path
        .relative(paths.root, sceneFiles[i]!)
        .replace(/\\/g, "/"),
    });
    cursorSec += durations[i]!;
  }

  log.info("Concatenating to single mp3", { output: paths.voiceover });
  await concatMp3s(sceneFiles, paths.voiceover);

  await writeJson(paths.sceneTimings, {
    generatedAt: new Date().toISOString(),
    month,
    totalDurationMs: Math.round(cursorSec * 1000),
    scenes: sceneTimings,
  });

  log.info("Voiceover ready", {
    file: paths.voiceover,
    totalSec: cursorSec.toFixed(1),
    scenes: sceneTimings.length,
  });

  return {
    totalDurationSec: cursorSec,
    sceneTimings,
    voiceoverPath: paths.voiceover,
    scenesDir: paths.audioDir,
    totalChars,
  };
}
