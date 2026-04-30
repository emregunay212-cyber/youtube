import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { NICHE } from "../config/niche.js";
import { PIPELINE } from "../config/pipeline.js";
import {
  fileExists,
  getEnv,
  getLogger,
  getPaths,
  PROJECT_ROOT,
  readJson,
  writeJson,
} from "./lib.js";
import type { Script, UploadResult } from "./types.js";

const log = getLogger("upload");

interface ClientSecretFile {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface SavedToken {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

function resolveProjectPath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p);
}

export async function loadOAuthClient(): Promise<OAuth2Client> {
  const env = getEnv();
  const clientSecretPath = resolveProjectPath(env.YOUTUBE_CLIENT_SECRET_PATH);
  const tokenPath = resolveProjectPath(env.YOUTUBE_TOKEN_PATH);

  if (!(await fileExists(clientSecretPath))) {
    throw new Error(
      `client_secret.json not found at ${clientSecretPath}. ` +
        `Google Cloud Console -> OAuth Desktop client -> indir, proje köküne koy.`,
    );
  }

  const cs = JSON.parse(
    await fs.readFile(clientSecretPath, "utf-8"),
  ) as ClientSecretFile;
  const creds = cs.installed ?? cs.web;
  if (!creds) {
    throw new Error(
      `Invalid client_secret.json — needs "installed" or "web" key`,
    );
  }

  const redirectUri =
    creds.redirect_uris.find((u) => u.includes("localhost")) ??
    creds.redirect_uris[0] ??
    "http://localhost:53682/callback";

  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    redirectUri,
  );

  if (!(await fileExists(tokenPath))) {
    throw new Error(
      `Token not found at ${tokenPath}. Run \`npm run yt:auth\` first.`,
    );
  }

  const token = JSON.parse(
    await fs.readFile(tokenPath, "utf-8"),
  ) as SavedToken;
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

interface VideoUploadOptions {
  title: string;
  description: string;
  tags: string[];
  categoryId: number;
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string;
  language?: string;
  madeForKids?: boolean;
}

export async function uploadVideo(
  filePath: string,
  options: VideoUploadOptions,
): Promise<{ videoId: string; url: string }> {
  if (!(await fileExists(filePath))) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  const oAuth2Client = await loadOAuthClient();
  const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

  const status: Record<string, string | boolean> = {
    privacyStatus: options.publishAt ? "private" : options.privacyStatus,
    selfDeclaredMadeForKids: options.madeForKids ?? false,
  };
  if (options.publishAt) {
    status.publishAt = options.publishAt;
  }

  const trimmedTitle =
    options.title.length > 100 ? options.title.slice(0, 97) + "..." : options.title;
  const trimmedDescription =
    options.description.length > 5000
      ? options.description.slice(0, 4997) + "..."
      : options.description;

  const stats = fsSync.statSync(filePath);
  log.info("Uploading", {
    file: filePath,
    sizeMB: (stats.size / 1024 / 1024).toFixed(1),
    title: trimmedTitle,
  });

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: trimmedTitle,
        description: trimmedDescription,
        tags: options.tags.slice(0, 30),
        categoryId: String(options.categoryId),
        defaultLanguage: options.language ?? "tr",
        defaultAudioLanguage: options.language ?? "tr",
      },
      status: status as never,
    },
    media: {
      body: fsSync.createReadStream(filePath),
    },
  });

  const videoId = res.data.id;
  if (!videoId) {
    throw new Error("YouTube did not return a video ID");
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export interface UploadAllResult {
  generatedAt: string;
  month: string;
  results: UploadResult[];
}

export async function uploadAll(month: string): Promise<UploadAllResult> {
  const paths = getPaths(month);

  if (!(await fileExists(paths.finalLong))) {
    throw new Error(`final-long.mp4 missing at ${paths.finalLong}`);
  }
  if (!(await fileExists(paths.script))) {
    throw new Error(`script.json missing at ${paths.script}`);
  }

  const script = await readJson<Script>(paths.script);
  const results: UploadResult[] = [];

  // Long-form upload
  log.info("Uploading long-form video");
  const longDescription = `${script.description}\n\n${NICHE.youtube.descriptionFooter}`;
  const longTags = Array.from(
    new Set([...script.tags, ...NICHE.youtube.defaultTags]),
  );
  const long = await uploadVideo(paths.finalLong, {
    title: NICHE.youtube.titlePrefix + script.title,
    description: longDescription,
    tags: longTags,
    categoryId: NICHE.youtube.categoryId,
    privacyStatus: PIPELINE.upload.longFormPrivacy,
  });
  results.push({
    kind: "long",
    videoId: long.videoId,
    url: long.url,
    uploadedAt: new Date().toISOString(),
  });
  log.info("Long-form uploaded", long);

  // Shorts upload (with scheduling offsets)
  for (let i = 1; i <= 3; i++) {
    const shortPath = path.join(paths.shortsDir, `short-${i}.mp4`);
    if (!(await fileExists(shortPath))) {
      log.warn(`Short ${i} missing — skipping`, { path: shortPath });
      continue;
    }

    const offsetHours =
      PIPELINE.upload.shortsScheduleHoursOffset[i - 1] ?? 24 * i;
    const publishAt = new Date(
      Date.now() + offsetHours * 3600 * 1000,
    ).toISOString();

    const shortTitle = `${script.title} | Short ${i}`;
    const shortDescription = [
      "Bu video uzun versiyonun bir kesitinden alındı.",
      "",
      `Tam video: https://www.youtube.com/watch?v=${long.videoId}`,
      "",
      "#shorts #bilim #teknoloji",
    ].join("\n");
    const shortTags = Array.from(
      new Set([...script.tags, "shorts", "bilim", "teknoloji"]),
    );

    log.info(`Uploading short ${i}`, { publishAt });
    const short = await uploadVideo(shortPath, {
      title:
        shortTitle.length > 100 ? shortTitle.slice(0, 97) + "..." : shortTitle,
      description: shortDescription,
      tags: shortTags,
      categoryId: NICHE.youtube.categoryId,
      privacyStatus: PIPELINE.upload.shortsPrivacy,
      publishAt,
    });
    results.push({
      kind: "short",
      index: i,
      videoId: short.videoId,
      url: short.url,
      uploadedAt: new Date().toISOString(),
      scheduledFor: publishAt,
    });
    log.info(`Short ${i} uploaded`, short);
  }

  const artifact: UploadAllResult = {
    generatedAt: new Date().toISOString(),
    month,
    results,
  };
  await writeJson(paths.uploadResults, artifact);

  log.info("All uploads complete", {
    long: results.find((r) => r.kind === "long")?.url,
    shortsCount: results.filter((r) => r.kind === "short").length,
  });

  return artifact;
}
