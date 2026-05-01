import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

const API_KEY = process.env.MESHY_API_KEY!;
const API_BASE = "https://api.meshy.ai/openapi/v1";
const OUTPUT_DIR = path.join(process.cwd(), "assets", "characters", "animations");

// Diji için gerekli animasyonlar
const ANIMATIONS = [
  { id: 0,   name: "idle" },
  { id: 30,  name: "walk" },
  { id: 308, name: "talk" },
  { id: 22,  name: "dance_wave" },
  { id: 41,  name: "bow" },
  { id: 56,  name: "stand_chat" },
];

const headers = { Authorization: `Bearer ${API_KEY}` };

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRig(rigId: string): Promise<any> {
  let attempts = 0;
  while (attempts < 60) {
    await sleep(8000);
    const res = await axios.get(`${API_BASE}/rigging/${rigId}`, { headers });
    const { status, progress } = res.data;
    console.log(`  Rigging: ${status} %${progress ?? "?"}`);
    if (status === "SUCCEEDED") return res.data;
    if (status === "FAILED") throw new Error(`Rigging başarısız: ${JSON.stringify(res.data)}`);
    attempts++;
  }
  throw new Error("Rigging timeout");
}

async function waitForAnimation(animId: string): Promise<any> {
  let attempts = 0;
  while (attempts < 40) {
    await sleep(6000);
    const res = await axios.get(`${API_BASE}/animations/${animId}`, { headers });
    const { status, progress } = res.data;
    process.stdout.write(`\r  Animasyon: ${status} %${progress ?? "?"}   `);
    if (status === "SUCCEEDED") { console.log(); return res.data; }
    if (status === "FAILED") throw new Error(`Animasyon başarısız`);
    attempts++;
  }
  throw new Error("Animasyon timeout");
}

async function downloadFile(url: string, dest: string) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, res.data);
  const kb = Math.round((res.data as Buffer).length / 1024);
  console.log(`  ✅ ${path.basename(dest)} (${kb} KB)`);
}

async function main() {
  if (!API_KEY) { console.error("❌ MESHY_API_KEY eksik"); process.exit(1); }

  // Refine task ID (generate-diji.ts çıktısından)
  const REFINE_TASK_ID = "019de035-cd03-70be-8c32-d64c5a33c123";

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Mevcut rig ID varsa kullan (arg olarak geçilebilir)
  let rigId = process.argv[2];

  if (!rigId) {
    console.log("🦴 Diji rigging başlatılıyor...");
    const rigRes = await axios.post(
      `${API_BASE}/rigging`,
      { input_task_id: REFINE_TASK_ID, height_meters: 1.6 },
      { headers }
    );
    rigId = rigRes.data.result;
    console.log(`  Rig Task ID: ${rigId}`);
  } else {
    console.log(`♻️  Mevcut rig kullanılıyor: ${rigId}`);
  }

  const rigData = await waitForRig(rigId);

  // Temel animasyonlar rigging ile birlikte geliyor
  const basic = rigData.result?.basic_animations ?? {};
  if (basic.walking_glb_url) {
    await downloadFile(basic.walking_glb_url, path.join(OUTPUT_DIR, "walk_basic.glb"));
  }
  if (basic.running_glb_url) {
    await downloadFile(basic.running_glb_url, path.join(OUTPUT_DIR, "run_basic.glb"));
  }

  // Rigged model
  const riggedGlb = rigData.result?.rigged_character_glb_url;
  if (riggedGlb) {
    await downloadFile(riggedGlb, path.join(path.dirname(OUTPUT_DIR), "diji-rigged.glb"));
  }

  console.log("\n🎬 Animasyonlar oluşturuluyor...");

  // Her animasyonu sırayla oluştur ve indir
  for (const anim of ANIMATIONS) {
    console.log(`\n  → ${anim.name} (action_id: ${anim.id})`);
    try {
      const res = await axios.post(
        `${API_BASE}/animations`,
        { rig_task_id: rigId, action_id: anim.id },
        { headers }
      );
      const animTaskId = res.data.result;
      const animData = await waitForAnimation(animTaskId);

      const glbUrl = animData.result?.animation_glb_url;
      if (glbUrl) {
        await downloadFile(glbUrl, path.join(OUTPUT_DIR, `${anim.name}.glb`));
      }
    } catch (e: any) {
      console.error(`  ❌ ${anim.name} hatası: ${e.message}`);
    }
  }

  console.log("\n🎉 Diji animasyonları tamamlandı!");
  console.log(`   Dosyalar: ${OUTPUT_DIR}`);
  console.log("   Sonraki: Three.js + Remotion entegrasyonu");
}

main().catch((e) => {
  console.error("❌ Hata:", e.message);
  process.exit(1);
});
