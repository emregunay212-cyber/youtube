import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

const API_KEY = process.env.MESHY_API_KEY!;
const API_BASE = "https://api.meshy.ai";
const OUTPUT_DIR = path.join(process.cwd(), "assets", "characters");

const DIJI_PROMPT = `A single cute friendly humanoid robot mascot with realistic human body proportions,
head size normal relative to body not oversized, round smooth helmet with two small antennas,
happy smiling face expression with a curved smile line on the faceplate,
large glowing cyan eyes with a cheerful expression, white and blue futuristic armor,
slim athletic body with long legs and proportional arms,
arms hanging straight down vertically along the sides of the body, hands closed in relaxed fists touching the thighs,
both arms perfectly parallel to the torso, elbows fully extended not bent,
standing upright at attention with feet together,
mechanical joint details at knees elbows shoulders,
solo character only no other objects in scene,
full body visible head to feet centered in frame, game-ready`;

const NEGATIVE_PROMPT =
  "low quality, blurry, distorted, extra limbs, deformed, broken mesh, floating parts";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createPreviewTask(): Promise<string> {
  console.log("🤖 Diji oluşturuluyor (preview aşaması)...");
  const res = await axios.post(
    `${API_BASE}/v2/text-to-3d`,
    {
      mode: "preview",
      prompt: DIJI_PROMPT,
      negative_prompt: NEGATIVE_PROMPT,
      art_style: "realistic",
      should_remesh: true,
    },
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return res.data.result;
}

async function waitForTask(taskId: string, label: string): Promise<any> {
  let attempts = 0;
  while (attempts < 60) {
    await sleep(10000);
    const res = await axios.get(`${API_BASE}/v2/text-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const { status, progress } = res.data;
    console.log(`  ${label}: ${status} %${progress ?? "?"}`);
    if (status === "SUCCEEDED") return res.data;
    if (status === "FAILED") throw new Error(`${label} başarısız: ${res.data.task_error?.message}`);
    attempts++;
  }
  throw new Error("Timeout: 10 dakika doldu");
}

async function refineTask(previewId: string): Promise<string> {
  console.log("✨ Refine aşaması başlatılıyor...");
  const res = await axios.post(
    `${API_BASE}/v2/text-to-3d`,
    { mode: "refine", preview_task_id: previewId, enable_pbr: true },
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return res.data.result;
}

async function downloadFile(url: string, dest: string) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, res.data);
  const kb = Math.round((res.data as Buffer).length / 1024);
  console.log(`  ✅ İndirildi: ${path.basename(dest)} (${kb} KB)`);
}

async function main() {
  if (!API_KEY) {
    console.error("❌ MESHY_API_KEY .env dosyasında bulunamadı");
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Önceki preview task ID varsa doğrudan refine'a geç
  const existingPreviewId = process.argv[2];

  let previewId: string;
  if (existingPreviewId) {
    console.log(`♻️  Mevcut preview kullanılıyor: ${existingPreviewId}`);
    previewId = existingPreviewId;
  } else {
    // 1. Preview
    previewId = await createPreviewTask();
    console.log(`  Task ID: ${previewId}`);
    const previewData = await waitForTask(previewId, "Preview");

    if (previewData.model_urls?.glb) {
      await downloadFile(
        previewData.model_urls.glb,
        path.join(OUTPUT_DIR, "diji-preview.glb")
      );
    }
  }

  // 2. Refine
  const refineId = await refineTask(previewId);
  console.log(`  Refine Task ID: ${refineId}`);
  const refineData = await waitForTask(refineId, "Refine");

  // Final GLB + FBX indir
  const urls = refineData.model_urls ?? {};
  if (urls.glb) {
    await downloadFile(urls.glb, path.join(OUTPUT_DIR, "diji.glb"));
  }
  if (urls.fbx) {
    await downloadFile(urls.fbx, path.join(OUTPUT_DIR, "diji.fbx"));
  }
  if (urls.obj) {
    await downloadFile(urls.obj, path.join(OUTPUT_DIR, "diji.obj"));
  }

  console.log("\n🎉 Diji hazır!");
  console.log(`   Dosyalar: ${OUTPUT_DIR}`);
  console.log("   Sonraki adım: diji.fbx dosyasını Mixamo'ya yükle → animasyon ekle");
}

main().catch((e) => {
  console.error("❌ Hata:", e.message);
  process.exit(1);
});
