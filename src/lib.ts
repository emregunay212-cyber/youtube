import "dotenv/config";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- Paths ----------

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, "..");
export const DATA_ROOT = path.join(PROJECT_ROOT, "data");

export function currentMonth(): string {
  const override = process.env.PIPELINE_MONTH?.trim();
  if (override && /^\d{4}-\d{2}$/.test(override)) return override;
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7);
}

export interface PipelinePaths {
  root: string;
  trends: string;
  topic: string;
  script: string;
  scriptMd: string;
  voiceover: string;
  audioDir: string;
  sceneTimings: string;
  assetsDir: string;
  captions: string;
  finalLong: string;
  shortsDir: string;
  uploadResults: string;
  pipelineLog: string;
  review: string;
}

export function getPaths(month: string = currentMonth()): PipelinePaths {
  const root = path.join(DATA_ROOT, month);
  return {
    root,
    trends: path.join(root, "trends.json"),
    topic: path.join(root, "topic.md"),
    script: path.join(root, "script.json"),
    scriptMd: path.join(root, "script.md"),
    voiceover: path.join(root, "voiceover.mp3"),
    audioDir: path.join(root, "audio"),
    sceneTimings: path.join(root, "scene-timings.json"),
    assetsDir: path.join(root, "assets"),
    captions: path.join(root, "captions.srt"),
    finalLong: path.join(root, "final-long.mp4"),
    shortsDir: path.join(root, "shorts"),
    uploadResults: path.join(root, "upload-results.json"),
    pipelineLog: path.join(root, "pipeline.log"),
    review: path.join(root, "REVIEW.md"),
  };
}

// ---------- Env ----------

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY required"),
  ELEVENLABS_VOICE_ID: z.string().min(1, "ELEVENLABS_VOICE_ID required"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),

  YOUTUBE_CLIENT_SECRET_PATH: z.string().default("./client_secret.json"),
  YOUTUBE_TOKEN_PATH: z.string().default("./data/.yt-token.json"),
  YOUTUBE_CHANNEL_ID: z.string().optional().default(""),

  PEXELS_API_KEY: z.string().min(1, "PEXELS_API_KEY required"),
  PIXABAY_API_KEY: z.string().min(1, "PIXABAY_API_KEY required"),

  REDDIT_CLIENT_ID: z.string().min(1, "REDDIT_CLIENT_ID required"),
  REDDIT_CLIENT_SECRET: z.string().min(1, "REDDIT_CLIENT_SECRET required"),
  REDDIT_USERNAME: z.string().min(1, "REDDIT_USERNAME required"),
  REDDIT_PASSWORD: z.string().min(1, "REDDIT_PASSWORD required"),
  REDDIT_USER_AGENT: z.string().default("youtube-content-pipeline/0.1"),

  FAL_KEY: z.string().min(1, "FAL_KEY required"),

  PIPELINE_MONTH: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WHISPER_MODEL: z.enum(["tiny", "base", "small", "medium", "large"]).default("medium"),
  PYTHON_BIN: z.string().default("python"),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${missing}\n\nCopy .env.example to .env and fill values.`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getEnvOrEmpty(): Partial<Env> {
  try {
    return getEnv();
  } catch {
    return process.env as Partial<Env>;
  }
}

// ---------- Logger ----------

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

export interface Logger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export function getLogger(scope: string): Logger {
  const env = getEnvOrEmpty();
  const minLevel = LOG_LEVELS[(env.LOG_LEVEL as LogLevel) ?? "info"];

  function emit(level: LogLevel, msg: string, meta?: unknown) {
    if (LOG_LEVELS[level] < minLevel) return;
    const ts = new Date().toISOString();
    const tag = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
    const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
    if (meta !== undefined) {
      out.write(`${tag} ${msg} ${typeof meta === "string" ? meta : JSON.stringify(meta)}\n`);
    } else {
      out.write(`${tag} ${msg}\n`);
    }
  }

  return {
    debug: (m, x) => emit("debug", m, x),
    info: (m, x) => emit("info", m, x),
    warn: (m, x) => emit("warn", m, x),
    error: (m, x) => emit("error", m, x),
  };
}

// ---------- FS Helpers ----------

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function ensureDirSync(dirPath: string): void {
  fsSync.mkdirSync(dirPath, { recursive: true });
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

// ---------- Async Helpers ----------

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RetryOpts {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttempt?: (attempt: number, err: unknown) => void;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 10000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(i + 1, err);
      if (i === attempts - 1) break;
      const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function parallelMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ---------- Misc ----------

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function daysAgo(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}
