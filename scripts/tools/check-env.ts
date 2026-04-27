import "dotenv/config";
import axios from "axios";

interface Check {
  name: string;
  required: boolean;
  envKeys: string[];
  test?: () => Promise<string>;
}

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";

function status(label: string, result: "ok" | "fail" | "skip", detail = ""): void {
  const tag = result === "ok" ? `${GREEN}OK${RESET}` : result === "fail" ? `${RED}FAIL${RESET}` : `${YELLOW}SKIP${RESET}`;
  process.stdout.write(`  [${tag}] ${label}${detail ? ` ${GRAY}- ${detail}${RESET}` : ""}\n`);
}

function envPresent(keys: string[]): boolean {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

const checks: Check[] = [
  {
    name: "ElevenLabs TTS",
    required: false,
    envKeys: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"],
    test: async () => {
      const res = await axios.get("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        timeout: 10_000,
      });
      const name = res.data?.subscription?.tier ?? "unknown";
      return `tier: ${name}`;
    },
  },
  {
    name: "Pexels (stok video)",
    required: false,
    envKeys: ["PEXELS_API_KEY"],
    test: async () => {
      const res = await axios.get("https://api.pexels.com/videos/search?query=ai&per_page=1", {
        headers: { Authorization: process.env.PEXELS_API_KEY! },
        timeout: 10_000,
      });
      return `${res.data?.total_results ?? 0} matches for "ai"`;
    },
  },
  {
    name: "Pixabay (stok video)",
    required: false,
    envKeys: ["PIXABAY_API_KEY"],
    test: async () => {
      const res = await axios.get(
        `https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=technology&per_page=3`,
        { timeout: 10_000 },
      );
      return `${res.data?.totalHits ?? 0} matches`;
    },
  },
  {
    name: "Reddit (trend)",
    required: false,
    envKeys: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USERNAME", "REDDIT_PASSWORD"],
    test: async () => {
      const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
      const body = new URLSearchParams({
        grant_type: "password",
        username: process.env.REDDIT_USERNAME!,
        password: process.env.REDDIT_PASSWORD!,
      });
      const res = await axios.post<{ access_token: string }>(
        "https://www.reddit.com/api/v1/access_token",
        body.toString(),
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "User-Agent": process.env.REDDIT_USER_AGENT ?? "youtube-content-pipeline/0.1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10_000,
        },
      );
      return `token len ${res.data.access_token.length}`;
    },
  },
  {
    name: "YouTube Data API (trending)",
    required: false,
    envKeys: ["YOUTUBE_API_KEY"],
    test: async () => {
      const res = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "id",
          chart: "mostPopular",
          regionCode: "TR",
          maxResults: 1,
          key: process.env.YOUTUBE_API_KEY,
        },
        timeout: 10_000,
      });
      return `${res.data?.items?.length ?? 0} item(s) returned`;
    },
  },
  {
    name: "fal.ai (AI gorsel)",
    required: false,
    envKeys: ["FAL_KEY"],
    test: async () => `key length ${process.env.FAL_KEY!.length}`,
  },
];

async function main() {
  process.stdout.write("\nEnvironment validation\n=======================\n");

  let hardFail = false;
  for (const check of checks) {
    const present = envPresent(check.envKeys);
    if (!present) {
      const missing = check.envKeys.filter((k) => !process.env[k]?.trim());
      if (check.required) {
        status(check.name, "fail", `missing required: ${missing.join(", ")}`);
        hardFail = true;
      } else {
        status(check.name, "skip", `missing optional: ${missing.join(", ")}`);
      }
      continue;
    }
    if (!check.test) {
      status(check.name, "ok", "(no live test)");
      continue;
    }
    try {
      const detail = await check.test();
      status(check.name, "ok", detail);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (check.required) {
        status(check.name, "fail", msg.slice(0, 120));
        hardFail = true;
      } else {
        status(check.name, "skip", msg.slice(0, 120));
      }
    }
  }

  process.stdout.write("\n");
  if (hardFail) {
    process.stdout.write(`${RED}Critical environment checks failed.${RESET} Pipeline cannot run yet.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${GREEN}Environment ready.${RESET} LLM steps run inside Claude Code (Max plan), not via API.\n`);
  }
}

main();
