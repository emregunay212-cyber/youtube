import { NodeIO, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import path from "path";
import fs from "fs";

const CHARS_DIR = path.join(process.cwd(), "assets", "characters");

async function getBoundingBoxSize(node: any): Promise<number> {
  let maxSize = 0;
  node.traverse((n: any) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < arr.length; i += 3) {
        minX = Math.min(minX, arr[i]);   maxX = Math.max(maxX, arr[i]);
        minY = Math.min(minY, arr[i+1]); maxY = Math.max(maxY, arr[i+1]);
        minZ = Math.min(minZ, arr[i+2]); maxZ = Math.max(maxZ, arr[i+2]);
      }
      const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
      maxSize = Math.max(maxSize, size);
    }
  });
  return maxSize;
}

async function cleanModel(inputPath: string, outputPath: string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(inputPath);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error("Sahne bulunamadı");

  const topNodes = scene.listChildren();
  console.log(`  Toplam üst node: ${topNodes.length}`);

  // Her node'un bounding box boyutunu hesapla
  const sizes: { node: any; name: string; size: number }[] = [];
  for (const node of topNodes) {
    const size = await getBoundingBoxSize(node);
    sizes.push({ node, name: node.getName() || "(isimsiz)", size });
    console.log(`    Node: "${node.getName() || "(isimsiz)"}" — boyut: ${size.toFixed(3)}`);
  }

  if (sizes.length <= 1) {
    console.log("  Sadece 1 node var, silinecek bir şey yok.");
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  // En büyük node = Diji, diğerleri = silinecek
  const maxSize = Math.max(...sizes.map((s) => s.size));
  const toRemove = sizes.filter((s) => s.size < maxSize * 0.5);

  if (toRemove.length === 0) {
    console.log("  Küçük karakter bulunamadı, model temiz.");
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  for (const { node, name } of toRemove) {
    console.log(`  🗑️  Siliniyor: "${name}"`);
    node.detach();
    node.dispose();
  }

  await io.write(outputPath, doc);
  const kb = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`  ✅ Temizlendi: ${path.basename(outputPath)} (${kb} KB)`);
}

async function main() {
  const inputFile = path.join(CHARS_DIR, "diji.glb");
  const outputFile = path.join(CHARS_DIR, "diji-clean.glb");

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ ${inputFile} bulunamadı`);
    process.exit(1);
  }

  console.log("🧹 diji.glb temizleniyor...");
  await cleanModel(inputFile, outputFile);

  console.log("\n✅ Temiz model: assets/characters/diji-clean.glb");
  console.log("   Blender veya gltf.report ile kontrol edebilirsin.");
}

main().catch((e) => {
  console.error("❌ Hata:", e.message);
  process.exit(1);
});
