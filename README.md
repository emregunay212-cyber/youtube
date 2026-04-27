# YouTube Content Pipeline

Aylik 1 long-form (8-12 dk) + 3 Shorts (9:16) ureten yari otomatik YouTube icerik pipeline'i.

- **Niche:** Bilim & Teknoloji (Turkce)
- **TTS:** ElevenLabs cloned voice
- **Gorsel:** Hibrit (Pexels/Pixabay stok + fal.ai Flux AI gorsel)
- **Composition:** Remotion (React-based programmatic video)
- **Trend:** YouTube + Reddit + HN + ArXiv + Webrazzi RSS

## Yeni Makinede Hizli Kurulum

```powershell
git clone https://github.com/emregunay212-cyber/youtube-content-pipeline.git
cd youtube-content-pipeline
.\setup.ps1
# .env'i ac, API key'lerini doldur
npm run check-env
```

`setup.ps1` sirayla yapar: npm install, video-toolkit clone, Python venv + deps, .env kopya, surum kontrol.

**Not:** Repo'da yalnizca text artifact'lar var (script.json, topic.json, vs.). Binary'ler (audio MP3'leri, voiceover.mp3, scene MP4'leri) yeniden uretilir — `npm run tts && npm run visuals` ~10 dakika ve ~$0.05 maliyet.

---

## Kurulum (Manuel)

### 1. Bagimliliklar

```bash
npm install
cd remotion && npm install && cd ..
```

### 2. Python (Whisper altyazi)

```bash
python -m venv .python-venv
.python-venv\Scripts\activate
pip install openai-whisper
```

### 3. FFmpeg

```bash
ffmpeg -version
```

Yoksa: <https://www.gyan.dev/ffmpeg/builds/> (Windows full build).

### 4. API Key'ler

> **Not:** LLM adımları (konu seçimi, script yazımı, Shorts segment seçimi) bu projeye Anthropic API ile *çağrılmaz* — Claude Code oturumu (Max planı) bu adımları kendisi yapar. Bu yüzden `ANTHROPIC_API_KEY` gerekmez.

`.env.example` dosyasini `.env` olarak kopyalayin ve asagidaki servislerden key alin:

| Servis | Nereden | Maliyet | Phase |
|--------|---------|---------|-------|
| ElevenLabs | dashboard -> API key + Voice ID | Creator $22/ay (mevcut) | 3 |
| YouTube Data API v3 (OAuth) | Google Cloud Console -> OAuth Desktop client | $0 | 9 |
| YouTube Data API v3 (key) | Google Cloud Console -> API key (public read) | $0 | 1 (ops.) |
| Pexels | pexels.com/api | $0 | 4 |
| Pixabay | pixabay.com/api/docs | $0 | 4 |
| Reddit | reddit.com/prefs/apps (script) | $0 | 1 (ops.) |
| fal.ai | fal.ai/dashboard | ~$5/ay (yukleme) | 4 |

### 5. YouTube OAuth (ilk seferde)

```bash
npm run yt:auth
```

Tarayici acilir -> Google ile giris yap -> token `data/.yt-token.json`'a kaydedilir.

### 6. Dogrulama

```bash
npm run check-env
```

Tum API key'lerin gecerli oldugunu dogrular.

## Kullanim

### Onerilen: Claude Code slash command

Bu projeyi Claude Code'da açtıktan sonra:

```
/youtube-monthly
```

Komut Claude'a şu adımları orchestrate ettirir:
1. `npm run trends` → `data/{ay}/trends.json`
2. Claude trends'i okur ve **bu oturumda** en iyi konuyu seçer (Max planı, ek API maliyeti yok)
3. Claude `data/{ay}/topic.json` yazar
4. `npm run topic` → `topic.md` render edilir

### Alternatif: Tek komutla manuel

```bash
npm run monthly
```

Pipeline akisi:

1. Trend tarama (~2 dk)
2. Konu secimi (~30 sn)
3. Script uretimi (~1 dk)
4. ElevenLabs TTS (~10 dk)
5. Gorsel toplama (~5 dk)
6. Whisper altyazi (~3 dk)
7. Remotion long-form render (~10 dk)
8. 3 Shorts render (~5 dk)
9. **ONAY KAPISI** -> Windows toast bildirim
10. `npm run approve` ile YouTube'a upload

### Tek asama calistirma

```bash
npm run trends
npm run topic
npm run script
npm run tts
npm run visuals
npm run subtitles
npm run compose
npm run shorts
```

### Test

```bash
npm run tts:test -- --scene=1
npm run visuals:test -- --scene=1 --type=concrete
```

## Klasor Yapisi

```
config/      Niche kurallari, pipeline parametreleri
src/         Pipeline modulleri (trend -> upload)
remotion/    Remotion composition (LongForm, ShortForm)
scripts/     CLI orchestrators
data/YYYY-MM/  Aylik artifact'lar (script, audio, video)
```

## Onay Akisi

Pipeline tamamlaninca:

1. Windows toast bildirim gelir
2. `data/{YYYY-MM}/REVIEW.md` acilir
3. `final-long.mp4` ve `shorts/short-{1,2,3}.mp4` dosyalarini izleyin
4. Memnunsan: `npm run approve`
5. Degilse: `npm run reject` -> klasor arsive tasinir, yeniden baslatilabilir

## Maliyetler

| Kalem | $/ay |
|-------|------|
| ElevenLabs Creator (mevcut) | 22 |
| Claude Max (mevcut) | mevcut planda |
| fal.ai (~15 gorsel/ay) | 1-3 |
| YouTube/Pexels/Pixabay/Reddit/HN/ArXiv | 0 |
| **Net ek harcama** | **~$3-5/ay** |
