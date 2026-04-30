import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PIPELINE } from "../config/pipeline.js";
import { ensureDir, getLogger, retry } from "./lib.js";

const log = getLogger("intro-outro");

const TARGET_W = PIPELINE.video.longFormWidth;
const TARGET_H = PIPELINE.video.longFormHeight;
const FPS = PIPELINE.video.fps;

const FONT_PATH = "C:/Windows/Fonts/arial.ttf";
const FONT_BOLD_PATH = "C:/Windows/Fonts/arialbd.ttf";

function escapeFontPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function escapeTextfilePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

function runFfmpeg(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}\nLast stderr:\n${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

export interface IntroResult {
  outputPath: string;
  durationSec: number;
}

export async function generateIntro(outputPath: string): Promise<IntroResult> {
  const cfg = PIPELINE.intro;
  const dur = cfg.durationSec;

  await ensureDir(path.dirname(outputPath));

  const channelFile = outputPath + ".channel.txt";
  const taglineFile = outputPath + ".tagline.txt";
  await writeTextFile(channelFile, cfg.channelName);
  await writeTextFile(taglineFile, cfg.channelTagline);

  const titleFontEsc = escapeFontPath(FONT_BOLD_PATH);
  const subFontEsc = escapeFontPath(FONT_PATH);
  const channelEsc = escapeTextfilePath(channelFile);
  const taglineEsc = escapeTextfilePath(taglineFile);

  const accent = cfg.accentColor;
  const titleCol = cfg.titleColor;
  const subCol = cfg.subtitleColor;
  const bg = cfg.backgroundColor;

  // Animations (Diji Zihin brand intro):
  //   0.0-0.4s: black hold
  //   0.4-1.4s: "DİJİ ZİHİN" channel name slides in from right + fades in (large, bold)
  //   1.4-2.0s: amber accent line draws from center outward
  //   2.0-2.8s: tagline fades in below
  //   2.8-3.5s: hold
  //   3.5-4.0s: fade to black

  const totalH = TARGET_H;
  const cx = "(w-text_w)/2";

  const filters: string[] = [];

  // Channel name (large bold, centered above center, slides in from right)
  filters.push(
    `drawtext=fontfile='${titleFontEsc}':textfile='${channelEsc}':fontsize=120:fontcolor=${titleCol}:x=${cx}+max(0\\,(1.4-t)/1.0)*200:y=${totalH}/2-text_h/2-20:alpha='if(lt(t\\,0.4)\\,0\\,if(lt(t\\,1.4)\\,(t-0.4)/1.0\\,1))'`,
  );

  // Amber accent line under channel name — grows from center outward
  filters.push(
    `drawbox=x=(w-min((t-1.4)/0.6\\,1)*440)/2:y=${totalH}/2+50:w='if(lt(t\\,1.4)\\,0\\,min((t-1.4)/0.6\\,1)*440)':h=4:color=${accent}@1:t=fill`,
  );

  // Tagline (smaller, soft gray, fades in below accent line)
  filters.push(
    `drawtext=fontfile='${subFontEsc}':textfile='${taglineEsc}':fontsize=36:fontcolor=${subCol}:x=${cx}:y=${totalH}/2+90:alpha='if(lt(t\\,2.0)\\,0\\,if(lt(t\\,2.8)\\,(t-2.0)/0.8\\,1))'`,
  );

  // Final fade to black
  filters.push(`fade=t=out:st=${dur - 0.5}:d=0.5:color=0x000000`);

  const filter = filters.join(",");

  log.info("Generating Diji Zihin intro", {
    duration: dur,
    channelName: cfg.channelName,
    output: outputPath,
  });

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${bg}:s=${TARGET_W}x${TARGET_H}:d=${dur}:r=${FPS}`,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    String(PIPELINE.video.crf),
    "-an",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  try {
    await runFfmpeg(args);
  } finally {
    await fs.unlink(channelFile).catch(() => {});
    await fs.unlink(taglineFile).catch(() => {});
  }

  log.info("Intro ready", { file: outputPath });
  return { outputPath, durationSec: dur };
}

export interface OutroResult {
  outputPath: string;
  durationSec: number;
}

export async function generateOutro(outputPath: string): Promise<OutroResult> {
  const cfg = PIPELINE.outro;
  const dur = cfg.durationSec;

  await ensureDir(path.dirname(outputPath));

  const channelFile = outputPath + ".channel.txt";
  const questionFile = outputPath + ".question.txt";
  const subQuestionFile = outputPath + ".subquestion.txt";
  const ctaFile = outputPath + ".cta.txt";
  await writeTextFile(channelFile, cfg.channelName);
  await writeTextFile(questionFile, cfg.questionText);
  await writeTextFile(subQuestionFile, cfg.subQuestionText);
  await writeTextFile(ctaFile, cfg.ctaLine);

  const fontBold = escapeFontPath(FONT_BOLD_PATH);
  const fontReg = escapeFontPath(FONT_PATH);
  const channelEsc = escapeTextfilePath(channelFile);
  const questionEsc = escapeTextfilePath(questionFile);
  const subQuestionEsc = escapeTextfilePath(subQuestionFile);
  const ctaEsc = escapeTextfilePath(ctaFile);

  const accent = cfg.accentColor;
  const bg = cfg.backgroundColor;

  // Animations:
  //   0.0-0.5s: question pop-in (fade + slide down)
  //   0.5-1.2s: sub-question fade in
  //   1.2-2.0s: cta line slide-in
  //   2.0-5.0s: hold with subtle alpha pulse on question (breathing effect)
  //   5.0-6.0s: fade to black

  const cx = "(w-text_w)/2";
  const filters: string[] = [];

  // Animated sweep lines (continuous motion across entire outro to prevent "frozen" feel)
  // Three thin accent-colored vertical lines moving at different speeds
  filters.push(
    `drawbox=x='mod(t*180-200\\,${TARGET_W + 200})':y=0:w=2:h=${TARGET_H}:color=${accent}@0.18:t=fill`,
  );
  filters.push(
    `drawbox=x='mod(t*230-500\\,${TARGET_W + 200})':y=0:w=1:h=${TARGET_H}:color=${accent}@0.12:t=fill`,
  );
  filters.push(
    `drawbox=x='mod(t*150-800\\,${TARGET_W + 200})':y=0:w=2:h=${TARGET_H}:color=${accent}@0.10:t=fill`,
  );

  // DİJİ ZİHİN channel name header (small, accent, fades in early — brand recall)
  filters.push(
    `drawtext=fontfile='${fontBold}':textfile='${channelEsc}':fontsize=44:fontcolor=${accent}:x=${cx}:y=h/2-text_h-260:alpha='if(lt(t\\,0.2)\\,0\\,if(lt(t\\,1.0)\\,(t-0.2)/0.8\\,if(gt(t\\,${dur - 1})\\,max(0\\,(${dur}-t)/1)\\,1)))'`,
  );

  // Subtle horizontal accent line behind question
  filters.push(
    `drawbox=x=(w-700)/2:y=h/2-200:w=700:h=4:color=${accent}@0.5:t=fill:enable='gte(t,0.5)'`,
  );

  // Main question (large, accent color, alpha pulse during hold)
  // Pulse via sin wave: alpha = base + amplitude * sin(2*PI*t/period)
  filters.push(
    `drawtext=fontfile='${fontBold}':textfile='${questionEsc}':fontsize=86:fontcolor=${accent}:x=${cx}:y=h/2-text_h-100+if(lt(t\\,0.5)\\,(0.5-t)*40\\,0):alpha='if(lt(t\\,0.5)\\,t/0.5\\,if(gt(t\\,${dur - 1})\\,max(0\\,(${dur}-t)/1)\\,0.85+0.15*sin(2*PI*(t-2)/2.5)))'`,
  );

  // Sub-question (medium, white)
  filters.push(
    `drawtext=fontfile='${fontReg}':textfile='${subQuestionEsc}':fontsize=44:fontcolor=0xffffff:x=${cx}:y=h/2-10:alpha='if(lt(t\\,0.5)\\,0\\,if(lt(t\\,1.2)\\,(t-0.5)/0.7\\,if(gt(t\\,${dur - 1})\\,max(0\\,(${dur}-t)/1)\\,1)))'`,
  );

  // CTA line (smaller, light gray, slide-in from below)
  filters.push(
    `drawtext=fontfile='${fontReg}':textfile='${ctaEsc}':fontsize=28:fontcolor=0xb8c2cc:x=${cx}:y=h/2+90+if(lt(t\\,2.0)\\,max(0\\,(2.0-t))*30\\,0):alpha='if(lt(t\\,1.2)\\,0\\,if(lt(t\\,2.0)\\,(t-1.2)/0.8\\,if(gt(t\\,${dur - 1})\\,max(0\\,(${dur}-t)/1)\\,1)))'`,
  );

  // Final fade to black
  filters.push(`fade=t=out:st=${dur - 0.7}:d=0.7:color=0x000000`);

  const filter = filters.join(",");

  log.info("Generating outro", { duration: dur, output: outputPath });

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${bg}:s=${TARGET_W}x${TARGET_H}:d=${dur}:r=${FPS}`,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    String(PIPELINE.video.crf),
    "-an",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  try {
    await runFfmpeg(args);
  } finally {
    await fs.unlink(channelFile).catch(() => {});
    await fs.unlink(questionFile).catch(() => {});
    await fs.unlink(subQuestionFile).catch(() => {});
    await fs.unlink(ctaFile).catch(() => {});
  }

  log.info("Outro ready", { file: outputPath });
  return { outputPath, durationSec: dur };
}

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export interface IntroHookAudioResult {
  outputPath: string;
  durationSec: number;
}

export async function generateIntroHookAudio(
  text: string,
  outputPath: string,
): Promise<IntroHookAudioResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID required");
  }

  log.info("Generating intro hook audio", { text, output: outputPath });

  await ensureDir(path.dirname(outputPath));
  const url = `${ELEVENLABS_TTS_URL}/${voiceId}`;
  const buf = await retry(
    async () => {
      const res = await axios.post<ArrayBuffer>(
        url,
        {
          text,
          model_id: modelId,
          voice_settings: {
            stability: PIPELINE.tts.stability,
            similarity_boost: PIPELINE.tts.similarityBoost,
            style: PIPELINE.tts.style,
            use_speaker_boost: PIPELINE.tts.useSpeakerBoost,
          },
        },
        {
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          responseType: "arraybuffer",
          timeout: 60_000,
          validateStatus: (s) => s >= 200 && s < 300,
        },
      );
      return Buffer.from(res.data);
    },
    {
      attempts: 3,
      onAttempt: (a, e) =>
        log.warn(`Hook TTS attempt ${a} failed`, String(e)),
    },
  );

  await fs.writeFile(outputPath, buf);

  const duration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(outputPath, (err, meta) => {
      if (err) return reject(err);
      const d = meta?.format?.duration;
      if (typeof d !== "number") {
        return reject(new Error(`No duration in hook audio: ${outputPath}`));
      }
      resolve(d);
    });
  });

  log.info("Hook audio ready", {
    file: outputPath,
    durationSec: duration.toFixed(2),
  });

  return { outputPath, durationSec: duration };
}

export interface FullAudioOptions {
  voiceoverPath: string;
  outputPath: string;
  introDurationSec: number;
  tailSilenceSec: number;
  outroSilenceSec: number;
  hookAudioPath?: string | null;
  hookDurationSec?: number;
}

export async function generateFullAudio(opts: FullAudioOptions): Promise<void> {
  const trailingSilence = opts.tailSilenceSec + opts.outroSilenceSec;

  if (opts.hookAudioPath && opts.hookDurationSec) {
    const silenceAfterHook = Math.max(
      0.1,
      opts.introDurationSec - opts.hookDurationSec,
    );
    log.info("Building full audio with hook", {
      hookSec: opts.hookDurationSec.toFixed(2),
      silenceAfterHook: silenceAfterHook.toFixed(2),
      trailingSilence,
      output: opts.outputPath,
    });

    const args = [
      "-y",
      "-i",
      opts.hookAudioPath,
      "-i",
      opts.voiceoverPath,
      "-filter_complex",
      `[0:a]apad=pad_dur=${silenceAfterHook}[hookpad];[hookpad][1:a]concat=n=2:v=0:a=1[merged];[merged]apad=pad_dur=${trailingSilence}[out]`,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      PIPELINE.video.audioBitrate,
      opts.outputPath,
    ];
    await runFfmpeg(args);
    return;
  }

  // Fallback: silence before voiceover + trailing silence
  log.info("Building full audio (no hook)", {
    leadSec: opts.introDurationSec,
    trailingSilence,
    output: opts.outputPath,
  });

  const args = [
    "-y",
    "-i",
    opts.voiceoverPath,
    "-af",
    `adelay=${Math.round(opts.introDurationSec * 1000)}|${Math.round(opts.introDurationSec * 1000)},apad=pad_dur=${trailingSilence}`,
    "-c:a",
    "libmp3lame",
    "-b:a",
    PIPELINE.video.audioBitrate,
    opts.outputPath,
  ];
  await runFfmpeg(args);
}

// Legacy alias kept for compatibility
export async function generatePaddedAudio(
  voiceoverPath: string,
  outputPath: string,
  introPaddingSec: number,
  tailPaddingSec: number,
  outroPaddingSec: number,
): Promise<void> {
  await generateFullAudio({
    voiceoverPath,
    outputPath,
    introDurationSec: introPaddingSec,
    tailSilenceSec: tailPaddingSec,
    outroSilenceSec: outroPaddingSec,
  });
}
