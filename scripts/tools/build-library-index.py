"""Build INDEX.md for data/_library reusable asset library."""
import json
import os
from collections import defaultdict

ROOT = "data/_library/b-roll/2026-04"
manifest = json.load(open(os.path.join(ROOT, "_manifest.json"), encoding="utf-8"))

by_theme = defaultdict(list)
no_theme = []
for m in manifest:
    if not m["themes"]:
        no_theme.append(m)
    for t in m["themes"]:
        by_theme[t].append(m)

L = []
L.append("# YouTube Pipeline — Reusable Asset Library")
L.append("")
L.append("> Bu dosya `data/_library/` altindaki yeniden kullanilabilir varliklarin aranabilir indeksidir.")
L.append("> Yeni bir video icin sahne gorseli ararken **once buraya bak**, sonra LTX2/AceStep ile yeni uret.")
L.append("")
L.append("## Presenter Portraits")
L.append("")
L.append("| ID | File | Source | Notes |")
L.append("|---|---|---|---|")
L.append(
    "| presenter-2026-04 | `presenter/presenter-2026-04.jpg` | fal.ai flux/dev | "
    "Lip-sync source for SadTalker. 1024x1024, neutral bg. Cost to regenerate: ~$0.025. |"
)
L.append("")
L.append("## Music Tracks")
L.append("")
L.append("| ID | File | Mood | Duration | License |")
L.append("|---|---|---|---|---|")
L.append(
    "| event-horizon | `music/event-horizon.mp3` | epic, cinematic, dramatic, tense | "
    "240s | archive.org public domain |"
)
L.append("")
L.append("## B-Roll Clips")
L.append("")
total_mb = sum(m["fileSizeBytes"] for m in manifest) / 1024 / 1024
L.append(
    f"**Toplam:** {len(manifest)} klip, {total_mb:.1f} MB. Hepsi LTX2 ile uretilmis "
    "abstract/cinematic B-roll. Lip-sync icermez (avatar sahneleri 1, 2, 3, 38 arsivlenmedi — "
    "Turkce dialoga kilitli)."
)
L.append("")
L.append("### Tema bazli arama")
L.append("")
for theme in sorted(by_theme.keys()):
    clips = by_theme[theme]
    L.append(f"**{theme}** ({len(clips)} klip):")
    for c in sorted(clips, key=lambda x: x["originalSceneId"]):
        d = c["durationMs"] / 1000
        hint = c["visualHint"][:80].replace("|", "/")
        L.append(f'  - `b-roll/2026-04/{c["file"]}` ({d:.1f}s) — {hint}')
    L.append("")

if no_theme:
    L.append(f"**Tema atanmamis** ({len(no_theme)} klip — manuel inceleme gerekebilir):")
    for c in sorted(no_theme, key=lambda x: x["originalSceneId"]):
        d = c["durationMs"] / 1000
        hint = c["visualHint"][:80].replace("|", "/")
        L.append(f'  - `b-roll/2026-04/{c["file"]}` ({d:.1f}s) — {hint}')
    L.append("")

L.append("## Tum B-roll Klipler (sahne sirasiyla)")
L.append("")
L.append("| Scene | Sure | Tema | Visual Hint (kisaltilmis) |")
L.append("|---|---|---|---|")
for m in sorted(manifest, key=lambda x: x["originalSceneId"]):
    sid = m["originalSceneId"]
    dur = m["durationMs"] / 1000
    themes = ", ".join(m["themes"]) if m["themes"] else "—"
    hint = m["visualHint"][:90].replace("|", "/")
    L.append(f"| {sid:3} | {dur:.1f}s | {themes} | {hint} |")
L.append("")

L.append("## Yeniden Kullanim Notlari")
L.append("")
L.append(
    "- **Esleme bulununca**: `_library/b-roll/2026-04/scene-NNN.mp4` dosyasini yeni "
    "videonun assets klasorune kopyala, scene-timings'e gore crop/extend et."
)
L.append(
    "- **Kismi esleme**: visualHint'i template olarak al, LTX2'ye yeni prompt ile yeniden "
    "urettir (saniye basi ~$0.10)."
)
L.append(
    "- **Tema yoksa**: `_manifest.json`'i oku, voiceoverContextTr alanindan konuyu anla."
)
L.append(
    "- **Avatar lip-sync sahneleri** (1, 2, 3, 38) bu kutuphanede yok — her video icin "
    "bastan uretilir (SadTalker, RunPod, sahne basi ~$0.04)."
)
L.append("")

with open("data/_library/INDEX.md", "w", encoding="utf-8") as f:
    f.write("\n".join(L))

print(f"INDEX.md written: {len(L)} lines")
print(f"Themes: {sorted(by_theme.keys())}")
