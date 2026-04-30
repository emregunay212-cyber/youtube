import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  PROJECT_ROOT,
  ensureDir,
  fileExists,
  getLogger,
  getPaths,
} from "./lib.js";

const log = getLogger("subtitles");

export interface SubtitleResult {
  srtPath: string;
  jsonPath: string;
  segmentCount: number;
  totalDurationSec: number;
}

interface WhisperJsonSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface WhisperJsonResult {
  text: string;
  segments: WhisperJsonSegment[];
  language: string;
}

function getPythonBin(): string {
  const venvPython = path.join(
    PROJECT_ROOT,
    ".python-venv",
    "Scripts",
    "python.exe",
  );
  return venvPython;
}

function runWhisper(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const python = getPythonBin();
    const child = spawn(python, ["-m", "whisper", ...args], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").trim();
      if (lines) log.debug(lines);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stderr += text;
      const trimmed = text.trim();
      if (trimmed) log.debug(trimmed);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function generateSubtitles(
  month: string,
): Promise<SubtitleResult> {
  const paths = getPaths(month);
  const model = process.env.WHISPER_MODEL || "medium";

  if (!(await fileExists(paths.voiceover))) {
    throw new Error(
      `voiceover.mp3 not found at ${paths.voiceover}. Run \`npm run tts\` first.`,
    );
  }

  log.info("Whisper transcription starting", {
    voiceover: paths.voiceover,
    model,
    language: "tr",
  });

  await ensureDir(paths.root);

  const args = [
    paths.voiceover,
    "--model",
    model,
    "--language",
    "tr",
    "--task",
    "transcribe",
    "--output_format",
    "all",
    "--output_dir",
    paths.root,
    "--verbose",
    "False",
  ];

  const start = Date.now();
  await runWhisper(args);
  const elapsedSec = Math.round((Date.now() - start) / 1000);

  // Whisper writes <basename>.srt and <basename>.json next to output_dir
  const baseName = path.basename(paths.voiceover, path.extname(paths.voiceover));
  const generatedSrt = path.join(paths.root, `${baseName}.srt`);
  const generatedJson = path.join(paths.root, `${baseName}.json`);

  if (!(await fileExists(generatedSrt))) {
    throw new Error(`Whisper did not produce SRT at ${generatedSrt}`);
  }

  // Move to canonical paths defined in lib.ts (captions.srt + subtitles.json)
  await fs.copyFile(generatedSrt, paths.captions);
  const subtitlesJsonPath = path.join(paths.root, "subtitles.json");
  if (await fileExists(generatedJson)) {
    await fs.copyFile(generatedJson, subtitlesJsonPath);
  }

  // Cleanup the auto-named outputs (vtt, tsv, txt, etc.)
  const extras = [".vtt", ".tsv", ".txt"];
  for (const ext of extras) {
    const extra = path.join(paths.root, `${baseName}${ext}`);
    if (await fileExists(extra)) await fs.unlink(extra).catch(() => {});
  }
  // Keep generated srt/json next to voiceover for debugging? Remove duplicates.
  if (generatedSrt !== paths.captions) {
    await fs.unlink(generatedSrt).catch(() => {});
  }
  if (generatedJson !== subtitlesJsonPath) {
    await fs.unlink(generatedJson).catch(() => {});
  }

  const segments = await loadSegments(subtitlesJsonPath);
  const totalDurationSec =
    segments.length > 0 ? segments[segments.length - 1]!.end : 0;

  log.info("Subtitles ready", {
    srt: paths.captions,
    json: subtitlesJsonPath,
    segments: segments.length,
    elapsedSec,
  });

  return {
    srtPath: paths.captions,
    jsonPath: subtitlesJsonPath,
    segmentCount: segments.length,
    totalDurationSec,
  };
}

async function loadSegments(jsonPath: string): Promise<WhisperJsonSegment[]> {
  if (!(await fileExists(jsonPath))) return [];
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    const parsed = JSON.parse(raw) as WhisperJsonResult;
    return parsed.segments ?? [];
  } catch (err) {
    log.warn("Could not parse Whisper JSON output", String(err));
    return [];
  }
}
