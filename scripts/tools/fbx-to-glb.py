"""
Blender headless script: Batch convert FBX animations to GLB.
Usage:
  blender --background --python fbx-to-glb.py -- <input_dir> <output_dir>
"""
import bpy
import os
import sys

argv = sys.argv
if "--" not in argv:
    print("Usage: blender --background --python fbx-to-glb.py -- <input_dir> <output_dir>")
    sys.exit(1)
argv = argv[argv.index("--") + 1:]
input_dir = argv[0]
output_dir = argv[1]

os.makedirs(output_dir, exist_ok=True)

fbx_files = [f for f in os.listdir(input_dir) if f.lower().endswith(".fbx")]
print(f"Found {len(fbx_files)} FBX files")

for i, filename in enumerate(fbx_files, 1):
    print(f"\n[{i}/{len(fbx_files)}] Converting: {filename}")

    # Reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    fbx_path = os.path.join(input_dir, filename)
    glb_path = os.path.join(output_dir, filename.replace(".fbx", ".glb").replace(".FBX", ".glb"))

    try:
        bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format="GLB",
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_apply=False,
        )
        size_kb = os.path.getsize(glb_path) // 1024
        print(f"  OK: {os.path.basename(glb_path)} ({size_kb} KB)")
    except Exception as e:
        print(f"  FAIL: {e}")

print("\nDone.")
