import { google } from "googleapis";
import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import http from "node:http";
import * as path from "node:path";
import {
  ensureDir,
  fileExists,
  getEnv,
  getLogger,
  PROJECT_ROOT,
} from "../../src/lib.js";

const log = getLogger("yt:auth");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

const CALLBACK_PORT = 53682;
const CALLBACK_PATH = "/oauth2callback";

interface ClientSecretFile {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

function resolveProjectPath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p);
}

function openInBrowser(url: string): void {
  // Windows: `start` works via cmd
  exec(`start "" "${url}"`, (err) => {
    if (err) log.warn("Could not auto-open browser", String(err));
  });
}

async function main() {
  const env = getEnv();
  const clientSecretPath = resolveProjectPath(env.YOUTUBE_CLIENT_SECRET_PATH);
  const tokenPath = resolveProjectPath(env.YOUTUBE_TOKEN_PATH);

  if (!(await fileExists(clientSecretPath))) {
    process.stderr.write(
      `\n[ERROR] client_secret.json not found at:\n  ${clientSecretPath}\n\n` +
        `Adımlar:\n` +
        `  1. https://console.cloud.google.com/ -> Yeni proje oluştur\n` +
        `  2. APIs & Services -> Library -> "YouTube Data API v3" -> Enable\n` +
        `  3. APIs & Services -> Credentials -> Create -> OAuth client ID\n` +
        `  4. Application type: Desktop app -> Create\n` +
        `  5. JSON indir -> proje köküne client_secret.json olarak koy\n\n`,
    );
    process.exitCode = 1;
    return;
  }

  const cs = JSON.parse(
    await fs.readFile(clientSecretPath, "utf-8"),
  ) as ClientSecretFile;
  const creds = cs.installed ?? cs.web;
  if (!creds) {
    throw new Error('Invalid client_secret.json — missing "installed" or "web" key');
  }

  const redirectUri = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
  const oAuth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    redirectUri,
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  process.stdout.write("\nOAuth flow başlıyor.\n");
  process.stdout.write(`Tarayıcıda şu URL açılıyor:\n  ${authUrl}\n\n`);
  process.stdout.write(
    `Eğer otomatik açılmazsa kopyala-yapıştır.\nLocalhost:${CALLBACK_PORT} dinleniyor...\n\n`,
  );
  openInBrowser(authUrl);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "", `http://localhost:${CALLBACK_PORT}`);
        if (!url.pathname.startsWith(CALLBACK_PATH)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const authCode = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) {
          res.statusCode = 400;
          res.end(`OAuth error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        if (!authCode) {
          res.statusCode = 400;
          res.end("Missing code parameter");
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<html><body style='font-family:sans-serif;padding:40px;'><h1>OAuth tamamlandı.</h1><p>Bu sekmeyi kapatabilirsin.</p></body></html>",
        );
        server.close();
        resolve(authCode);
      } catch (err) {
        res.statusCode = 500;
        res.end("Internal error");
        reject(err);
      }
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT, "localhost");
  });

  log.info("Authorization code received, exchanging for token");
  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    process.stderr.write(
      "\n[WARN] refresh_token alınmadı. " +
        "Google Cloud Console'da bu app için 'Revoke access' yapıp tekrar dene.\n\n",
    );
  }

  await ensureDir(path.dirname(tokenPath));
  await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), "utf-8");

  process.stdout.write(`\nToken saved to: ${tokenPath}\n`);
  process.stdout.write("YouTube upload artık hazır. \`npm run approve\` ile yükleyebilirsin.\n\n");
}

main().catch((err) => {
  log.error("OAuth flow failed", String(err));
  process.exitCode = 1;
});
