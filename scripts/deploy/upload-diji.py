"""
Diji karakter dosyalarini ve bilesenlerini sunucuya yukler.
"""
import os
import sys
import io
import paramiko
from pathlib import Path

# UTF-8 stdout (Windows cp1254 fix)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST = "161.97.156.48"
USER = "root"
PASS = "a517o6tsEmexP5xSMTay"
REMOTE_BASE = "/root/youtube"

LOCAL_BASE = Path(__file__).parent.parent.parent

# Yüklenecek dosyalar (yerel yol → uzak yol)
UPLOADS = [
    # Karakter modelleri
    ("assets/characters/diji.glb",         "assets/characters/diji.glb"),
    ("assets/characters/diji.fbx",         "assets/characters/diji.fbx"),
    ("assets/characters/diji.obj",         "assets/characters/diji.obj"),
    ("assets/characters/diji-preview.glb", "assets/characters/diji-preview.glb"),

    # Three.js bileşenleri
    ("src/components/diji/DijiCharacter.tsx", "src/components/diji/DijiCharacter.tsx"),
    ("src/components/diji/DijiScene.tsx",     "src/components/diji/DijiScene.tsx"),
    ("src/components/diji/index.ts",          "src/components/diji/index.ts"),

    # Script'ler
    ("scripts/tools/generate-diji.ts", "scripts/tools/generate-diji.ts"),
    ("scripts/tools/animate-diji.ts",  "scripts/tools/animate-diji.ts"),
    ("scripts/tools/clean-diji.ts",    "scripts/tools/clean-diji.ts"),
    ("scripts/tools/inspect-diji.ts",  "scripts/tools/inspect-diji.ts"),
    ("scripts/tools/fbx-to-glb.py",    "scripts/tools/fbx-to-glb.py"),

    # Önizleme HTML
    ("diji-preview.html", "diji-preview.html"),

    # Güncellenmiş package
    ("package.json", "package.json"),
]

# Tüm animasyon GLB'leri
ANIM_DIR = LOCAL_BASE / "assets/characters/animations"
for f in ANIM_DIR.glob("*.glb"):
    rel = f"assets/characters/animations/{f.name}"
    UPLOADS.append((rel, rel))


def ensure_remote_dir(sftp, path):
    """Remote'da klasörü ve atalarını oluştur."""
    parts = path.strip("/").split("/")
    cur = ""
    for p in parts:
        cur = f"{cur}/{p}" if cur else f"/{p}"
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def main():
    print(f"Diji dosyalari yükleniyor → {HOST}:{REMOTE_BASE}\n")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    sftp = ssh.open_sftp()

    total = len(UPLOADS)
    total_bytes = 0
    for i, (local_rel, remote_rel) in enumerate(UPLOADS, 1):
        local = LOCAL_BASE / local_rel
        remote = f"{REMOTE_BASE}/{remote_rel}"

        if not local.exists():
            print(f"  [{i}/{total}] ATLA  (yok): {local_rel}")
            continue

        ensure_remote_dir(sftp, str(Path(remote).parent).replace("\\", "/"))

        size = local.stat().st_size
        total_bytes += size
        size_str = f"{size//1024} KB" if size < 1024*1024 else f"{size//(1024*1024)} MB"
        print(f"  [{i}/{total}] {size_str:>8}  {remote_rel}")
        sftp.put(str(local), remote)

    sftp.close()

    total_mb = total_bytes / (1024*1024)
    print(f"\nToplam: {total_mb:.1f} MB ({total} dosya)")

    # npm install (yeni paketler için)
    print("\nSunucuda npm install çalıştırılıyor (yeni paketler)...")
    stdin, stdout, stderr = ssh.exec_command(
        f"cd {REMOTE_BASE} && npm install --legacy-peer-deps 2>&1 | tail -5"
    )
    print(stdout.read().decode())

    ssh.close()
    print("Yükleme tamamlandi.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"HATA: {e}")
        sys.exit(1)
