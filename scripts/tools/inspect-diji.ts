import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import path from "path";

const CHARS_DIR = path.join(process.cwd(), "assets", "characters");

function getNodeSize(node: any): number {
  let maxSize = 0;
  const mesh = node.getMesh();
  if (mesh) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < arr.length; i += 3) {
        minY = Math.min(minY, arr[i]);
        maxY = Math.max(maxY, arr[i]);
      }
      maxSize = Math.max(maxSize, maxY - minY);
    }
  }
  return maxSize;
}

function printTree(node: any, depth = 0) {
  const indent = "  ".repeat(depth);
  const name = node.getName() || "(isimsiz)";
  const mesh = node.getMesh();
  const size = getNodeSize(node);
  const children = node.listChildren();
  const translation = node.getTranslation();

  console.log(`${indent}├─ "${name}" | mesh:${mesh ? "✓" : "✗"} | yükseklik:${size.toFixed(3)} | pos:[${translation.map((v: number) => v.toFixed(2)).join(",")}] | çocuk:${children.length}`);

  for (const child of children) {
    printTree(child, depth + 1);
  }
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(CHARS_DIR, "diji.glb"));
  const root = doc.getRoot();

  console.log("📊 diji.glb node ağacı:\n");
  const scene = root.listScenes()[0];
  for (const node of scene.listChildren()) {
    printTree(node);
  }

  // Tüm mesh'lerin boyutlarını listele
  console.log("\n📦 Tüm mesh'ler (boyuta göre):");
  const allNodes: { name: string; size: number; node: any }[] = [];
  root.listNodes().forEach((node: any) => {
    const size = getNodeSize(node);
    if (size > 0) {
      allNodes.push({ name: node.getName() || "(isimsiz)", size, node });
    }
  });
  allNodes.sort((a, b) => b.size - a.size);
  allNodes.forEach(({ name, size }) => {
    console.log(`  "${name}" — yükseklik: ${size.toFixed(3)}`);
  });
}

main().catch(console.error);
