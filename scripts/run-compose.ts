import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const MONTH = process.env.MONTH ?? new Date().toISOString().slice(0, 7);
const DATA_DIR = path.join(ROOT, "data", MONTH);
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "out");
const ENTRY = path.join(ROOT, "remotion", "src", "index.ts");

interface ScriptScene {
  id: number;
  voiceover: string;
  durationEstimateSec: number;
  visualHint?: string;
}

interface SceneTiming {
  id: number;
  startMs: number;
  endMs: number;
  voiceover: string;
  visualHint?: string;
}

function buildScenes(): { scenes: SceneTiming[]; durationSec: number; title?: string; subtitle?: string } {
  const scriptPath = path.join(DATA_DIR, "script.json");
  const timingsPath = path.join(DATA_DIR, "scene-timings.json");

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`script.json bulunamadı: ${scriptPath}`);
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const all: ScriptScene[] = [
    ...(script.hook ?? []),
    ...(script.body ?? []),
    ...(script.outro ?? []),
  ];

  let scenes: SceneTiming[];
  if (fs.existsSync(timingsPath)) {
    const timings = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
    scenes = timings.scenes.map((t: any) => ({
      id: t.id,
      startMs: t.startMs,
      endMs: t.endMs,
      voiceover: all.find((s) => s.id === t.id)?.voiceover ?? "",
    }));
  } else {
    let cursor = 0;
    scenes = all.map((s) => {
      const startMs = cursor;
      const endMs = cursor + (s.durationEstimateSec ?? 5) * 1000;
      cursor = endMs;
      return { id: s.id, startMs, endMs, voiceover: s.voiceover, visualHint: s.visualHint };
    });
  }

  const durationSec = Math.ceil(scenes[scenes.length - 1].endMs / 1000);
  const titleParts = (script.title ?? "").split(":");
  return {
    scenes,
    durationSec,
    title: titleParts[0]?.trim(),
    subtitle: titleParts.slice(1).join(":").trim() || undefined,
  };
}

async function main() {
  console.log(`📝 ${MONTH} ayı için kompozisyon hazırlanıyor...`);

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ ${DATA_DIR} bulunamadı`);
    process.exit(1);
  }

  const { scenes, durationSec, title, subtitle } = buildScenes();
  console.log(`  Sahne sayısı: ${scenes.length}`);
  console.log(`  Toplam süre: ${durationSec}s`);

  // Voiceover varsa public/'a kopyala
  const localVoiceover = path.join(DATA_DIR, "voiceover.mp3");
  let audioSrc: string | undefined;
  if (fs.existsSync(localVoiceover)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    const targetVoiceover = path.join(PUBLIC_DIR, "voiceover.mp3");
    fs.copyFileSync(localVoiceover, targetVoiceover);
    audioSrc = "voiceover.mp3";
    console.log(`  ✅ Ses public/voiceover.mp3'e kopyalandı`);
  } else {
    console.log(`  ⚠️  voiceover.mp3 yok (sessiz render)`);
  }

  // Props'ları geçici dosyaya yaz
  const propsPath = path.join(ROOT, ".compose-props.json");
  fs.writeFileSync(
    propsPath,
    JSON.stringify({ scenes, totalDurationSec: durationSec, title, subtitle, audioSrc })
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${MONTH}-diji.mp4`);

  console.log(`\n🎬 Remotion render başlıyor → ${outFile}`);

  const cmd = `npx remotion render "${ENTRY}" DijiPresenter "${outFile}" --props="${propsPath}" --concurrency=1`;
  try {
    execSync(cmd, { stdio: "inherit" });
  } finally {
    if (fs.existsSync(propsPath)) fs.unlinkSync(propsPath);
  }

  console.log(`\n✅ Video hazır: ${outFile}`);
}

main().catch((e) => {
  console.error("❌ Hata:", e.message);
  process.exit(1);
});
