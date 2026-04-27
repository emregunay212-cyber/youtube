---
description: Aylık YouTube içerik pipeline'ını çalıştır (trend tarama → konu seçimi → render). LLM adımları bu Claude Code oturumunda yapılır, ek API çağrısı yoktur.
allowed-tools: Bash(npm run *), Read, Write, Glob
---

# /youtube-monthly

Aylık 1 long-form + 3 Shorts üretim pipeline'ının **Phase 1** kısmını çalıştır. LLM gerektiren tüm adımları (konu seçimi, ilerideki phase'lerde script yazımı, Shorts segment seçimi) **bu oturumda kendin** yap — Anthropic API'sine çağrı atma, Claude Max planı zaten bu oturumda aktif.

## Adımlar

### 1. Trend tarama
```bash
npm run trends
```
Bu komut `data/{YYYY-MM}/trends.json` üretir (HN + ArXiv + Webrazzi + opsiyonel Reddit/YouTube).

### 2. Trend dosyasını oku
`data/{YYYY-MM}/trends.json` dosyasını oku. `shortlist` array'inde top 30-50 niche-uyumlu trend var, her biri:
- `id`, `source`, `title`, `url`, `summary`, `weightedScore`, `ageDays`, `matchedKeywords`

### 3. En iyi konuyu seç
Şu kriterlere göre değerlendir (önem sırasıyla):

1. **Niche uyumu** — Bilim/Teknoloji içinde mi, kanal kitlesi (23-45 yaş Türk teknoloji okuru) anlar mı?
2. **Yenilik** — Son 7 gün içinde mi, başka Türk kanalları henüz işlemedi mi?
3. **Anlatılabilirlik** — Görsellerle ve sesli anlatımla 10 dakika açıklanabilir mi?
4. **Arama hacmi potansiyeli** — Türkçe kullanıcıların aktif arayacağı bir konu mu?
5. **Kaynak çeşitliliği** — Birden fazla trend kaynağında doğrulanıyor mu?

**Yasaklı ifadeler** (clickbait, kullanma): "ŞOK", "BİLİM ADAMLARI ŞAŞKIN", "İNANILMAZ KEŞIF", "kesin böyle".

### 4. `topic.json` yaz
`data/{YYYY-MM}/topic.json` dosyasını şu şemayla yaz (Türkçe içerik):

```json
{
  "generatedAt": "<şu anki ISO timestamp>",
  "month": "<YYYY-MM>",
  "primary": {
    "rank": 1,
    "title": "Net, soru veya keşif tarzında başlık (5-120 char)",
    "angle": "Videonun bakış açısı, ne anlatılacağı (10-400 char)",
    "reasoning": "Neden bu konu seçildi, hangi trend'lerle desteklendi (20-800 char)",
    "sourceTrendIds": ["hn-12345", "arxiv-2604.1234"],
    "estimatedSearchInterest": "low | medium | high",
    "novelty": "fresh | recent | evergreen"
  },
  "alternatives": [
    { "rank": 2, "title": "...", "angle": "...", "reasoning": "...", "sourceTrendIds": [...], "estimatedSearchInterest": "...", "novelty": "..." },
    { "rank": 3, "title": "...", "angle": "...", "reasoning": "...", "sourceTrendIds": [...], "estimatedSearchInterest": "...", "novelty": "..." }
  ]
}
```

**Not:** `sourceTrendIds` mutlaka `trends.json`'daki gerçek `id` değerleri olmalı (örn `"hn-44831923"`, `"arxiv-2604.18456v1"`).

### 5. Markdown render et
```bash
npm run topic
```
Bu komut yazdığın `topic.json`'u doğrular ve `topic.md` (insan-okunabilir özet) üretir. Validation hatası alırsan `topic.json`'u düzelt ve tekrar çalıştır.

### 6. Konu özetini kullanıcıya bildir
Şunları kısaca söyle:
- Toplam kaç trend tarandı, niche'le kaç eşleşti
- Seçilen ana konu (başlık + bir cümlelik açı)
- 2 alternatif konu başlıkları
- `topic.md` dosya yolu

### 7. Script üret (Phase 2)
`data/{YYYY-MM}/topic.json` ve `data/{YYYY-MM}/trends.json` dosyalarını oku — script'in olgusal omurgasını birleştir. Türkçe, **8-12 dk** uzunluğunda, `config/niche.ts`'teki kanal kurallarına uyan bir long-form script yaz. Yasaklı clickbait ifadelerini ASLA kullanma. Kapanışta `NICHE.channelRules.requiredCloser` cümlesi geçmeli.

**Yapı:**
- **Hook** (1-3 sahne, ~10-25 sn): İzleyiciyi tutan açılış. Soru, şaşırtıcı istatistik veya somut sahne.
- **Body** (21-40 sahne, ~9-11 dk): Konuyu sıralı argümanlarla anlat. Her sahne ortalama 15-20 saniye.
- **CTA** (1-2 sahne, ~10-20 sn): Abonelik çağrısı + kapanış cümlesi.

Toplam ~1700 kelime hedef (1500-2000 arası kabul). Türkçe konuşma hızı ~150 kelime/dk → her kelime ≈ 0.4 saniye süre.

### 8. `script.json` yaz
`data/{YYYY-MM}/script.json` dosyasını şu şemayla yaz:

```json
{
  "title": "...",
  "description": "Çok paragraflı YouTube açıklaması (olduğu gibi yüklenecek). Linkler, kaynak referansları, hashtag'ler ekle.",
  "tags": ["bilim", "teknoloji", "yapay zeka", "..."],
  "hook": [
    {
      "id": 1,
      "voiceover": "Türkçe konuşma metni — sadece söylenecek kelimeler, sahne yönergesi YOK",
      "durationEstimateSec": 12,
      "visualHint": "data center server racks blinking lights",
      "visualType": "concrete"
    }
  ],
  "body": [
    { "id": 2, "voiceover": "...", "durationEstimateSec": 18, "visualHint": "...", "visualType": "concrete" },
    { "id": 3, "voiceover": "...", "durationEstimateSec": 15, "visualHint": "...", "visualType": "abstract" }
  ],
  "cta": [
    { "id": 28, "voiceover": "Eğer bu video hoşuna gittiyse abone olmayı ve yorum yazmayı unutma. Görüşmek üzere.", "durationEstimateSec": 8, "visualHint": "subscribe button animation", "visualType": "abstract" }
  ],
  "totalWords": 1720,
  "totalDurationEstimateSec": 615
}
```

**Kritik kurallar:**
- Sahne `id`'leri **1'den başlayıp ardışık ilerlemeli** (hook → body → cta hepsinde aynı sayaç)
- `voiceover` sadece okunacak metin — `[müzik başlar]`, `(efekt)` gibi yönerge yazma
- `visualType`: somut nesne/insan/yer ise `concrete` (Pexels arayacak), soyut kavram/algoritma ise `abstract` (fal.ai üretecek). En az %30'unu `concrete` tutmaya çalış (maliyet düşürür)
- `visualHint`: stok için kısa İngilizce keyword, AI için detaylı sahne açıklaması
- `tags`: 3-20 arası, Türkçe + İngilizce karışık olabilir
- `description`: 200+ karakter, kanal closer'ını **dahil etme** (o sadece voiceover'da)
- `totalWords` ve `totalDurationEstimateSec` hesaplanmış olmalı (tüm `voiceover`'ların kelime/süre toplamı)

### 9. Script'i validate + render et
```bash
npm run script
```
`script.json`'ı şema ile doğrular, `script.md` üretir. Hata alırsan (örn. id'lerde boşluk, kelime/süre tutarsızlığı) script.json'u düzelt ve tekrar çalıştır.

### 10. Script özetini kullanıcıya bildir
- Başlık, süre tahmini, kelime sayısı, sahne sayısı
- `script.md` dosya yolu (kullanıcı izleyebilir)

### 11. Voiceover üret (Phase 3)
Kullanıcı script'i onayladıktan sonra `npm run tts` çalıştır:

```bash
npm run tts
```

Bu komut:
- `script.json`'daki tüm sahneleri (hook + body + cta) sırayla okur
- ElevenLabs API üzerinden, `.env`'deki klonlanmış sesle her sahneyi ayrı MP3 olarak üretir (`data/{YYYY-MM}/audio/scene-NNN.mp3`)
- FFmpeg ile tek `voiceover.mp3` olarak birleştirir
- Her sahnenin gerçek başlangıç-bitiş ms'sini `scene-timings.json`'a yazar (Phase 6 Remotion render'ı için kritik)

İlerleme yaklaşık 3-5 dakika sürer (28 sahne × ~5 sn/sahne, paralel 2 worker). Maliyet ~$0.20-0.30 (Creator paketi ~%4'ü).

### 12. Voiceover özetini kullanıcıya bildir
- Toplam süre (sn / dakika)
- Karakter sayısı + ay quota'nın yüzde kaçı kullanıldı
- `voiceover.mp3` dosya yolu — kullanıcı dinleyip onaylayabilir
- Beğenmezse `data/{YYYY-MM}/audio/` ve `voiceover.mp3` silip script'te problemli sahneleri düzeltip tekrar `npm run tts`

## İleride (Phase 4+)

Phase 4 implementasyonundan sonra bu komut şu adımları da içerecek:

- Görsel toplama (`npm run visuals`) — somut sahne için Pexels/Pixabay, soyut sahne için fal.ai Flux
- Whisper altyazı (`npm run subtitles`) — voiceover.mp3 → captions.srt
- Remotion long-form render (`npm run compose`) — final-long.mp4
- 3 Shorts türetme (`npm run shorts`)
- Onay kapısı (toast notification + REVIEW.md)
- `npm run approve` → YouTube upload
