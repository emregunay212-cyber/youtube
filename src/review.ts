import notifier from "node-notifier";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  fileExists,
  getLogger,
  getPaths,
  readJson,
  writeText,
  PROJECT_ROOT,
} from "./lib.js";
import type { Script, TopicArtifact } from "./types.js";

const log = getLogger("review");

interface SceneTimingsArtifact {
  generatedAt: string;
  month: string;
  totalDurationMs: number;
  scenes: Array<{ sceneId: number; startMs: number; endMs: number }>;
}

interface ShortsManifest {
  generatedAt: string;
  segments: Array<{
    index: 1 | 2 | 3;
    startSceneId: number;
    endSceneId: number;
    estimatedDurationSec: number;
  }>;
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  try {
    return await readJson<T>(filePath);
  } catch {
    return null;
  }
}

async function fileSizeMb(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) return "missing";
  const stats = await fs.stat(filePath);
  return `${(stats.size / 1024 / 1024).toFixed(1)} MB`;
}

export interface ReviewResult {
  reviewPath: string;
  reviewExists: boolean;
}

export async function generateReview(month: string): Promise<ReviewResult> {
  const paths = getPaths(month);

  if (!(await fileExists(paths.finalLong))) {
    throw new Error(
      `final-long.mp4 missing at ${paths.finalLong}. Run \`npm run compose\` first.`,
    );
  }

  const script = await safeReadJson<Script>(paths.script);
  const topicJsonPath = paths.topic.replace(/\.md$/, ".json");
  const topic = await safeReadJson<TopicArtifact>(topicJsonPath);
  const timings = await safeReadJson<SceneTimingsArtifact>(paths.sceneTimings);
  const shortsJsonPath = path.join(paths.root, "shorts.json");
  const shorts = await safeReadJson<ShortsManifest>(shortsJsonPath);

  const longSize = await fileSizeMb(paths.finalLong);
  const totalDurationSec = timings ? timings.totalDurationMs / 1000 : 0;
  const minutes = Math.floor(totalDurationSec / 60);
  const seconds = Math.floor(totalDurationSec % 60);

  const shortLines: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const shortPath = path.join(paths.shortsDir, `short-${i}.mp4`);
    const size = await fileSizeMb(shortPath);
    const meta = shorts?.segments.find((s) => s.index === i);
    if (meta) {
      shortLines.push(
        `- **Short ${i}** (${meta.estimatedDurationSec}s, ${size}): \`${shortPath}\``,
      );
    } else {
      shortLines.push(`- **Short ${i}** (${size}): \`${shortPath}\``);
    }
  }

  const titleLine = script?.title ?? topic?.primary.title ?? "(başlık yok)";
  const descriptionExcerpt = script?.description?.slice(0, 240) ?? "(açıklama yok)";
  const tagsLine = (script?.tags ?? []).join(", ") || "(etiket yok)";

  const review = [
    `# Review — ${month}`,
    "",
    `**Başlık:** ${titleLine}`,
    "",
    `**Süre:** ${minutes}:${String(seconds).padStart(2, "0")} dk`,
    "",
    `**Açıklama özeti:** ${descriptionExcerpt}${(script?.description?.length ?? 0) > 240 ? "..." : ""}`,
    "",
    `**Etiketler:** ${tagsLine}`,
    "",
    "---",
    "",
    "## Video Dosyaları",
    "",
    `- **Long-form** (${longSize}): \`${paths.finalLong}\``,
    ...shortLines,
    "",
    "## İzlemek için",
    "",
    "Long-form videoyu varsayılan oynatıcıda aç:",
    "```powershell",
    `Invoke-Item "${paths.finalLong}"`,
    "```",
    "",
    "Tüm shorts'u aç:",
    "```powershell",
    `Get-ChildItem "${paths.shortsDir}" -Filter *.mp4 | ForEach-Object { Invoke-Item $_.FullName }`,
    "```",
    "",
    "## Onay",
    "",
    "Memnunsan:",
    "```bash",
    "npm run approve",
    "```",
    "",
    "Beğenmediysen (klasör arşive taşınır, yeniden çalıştırılabilir):",
    "```bash",
    "npm run reject",
    "```",
    "",
    "## Pipeline Özeti",
    "",
    `- Trend kaynakları: \`${paths.trends}\``,
    `- Konu (json): \`${topicJsonPath}\``,
    `- Script (json): \`${paths.script}\``,
    `- Voiceover: \`${paths.voiceover}\``,
    `- Sahne görselleri: \`${paths.assetsDir}\``,
    `- Altyazı (SRT): \`${paths.captions}\``,
    "",
    `Oluşturuldu: ${new Date().toISOString()}`,
    "",
  ].join("\n");

  await writeText(paths.review, review);

  log.info("REVIEW.md ready", { file: paths.review });

  return { reviewPath: paths.review, reviewExists: true };
}

export async function notifyReviewReady(
  month: string,
  reviewPath: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    notifier.notify(
      {
        title: "YouTube Pipeline hazır",
        message: `Ay: ${month}\nİnceleme: ${reviewPath}\n'npm run approve' veya 'npm run reject'`,
        wait: false,
      },
      (err) => {
        if (err) {
          log.warn("Toast notification failed", String(err));
        } else {
          log.info("Toast notification sent");
        }
        resolve();
      },
    );

    // Don't block forever if notifier hangs
    setTimeout(() => resolve(), 5000);
  });
}
