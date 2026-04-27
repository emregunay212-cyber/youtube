# YouTube Content Pipeline — Claude Code Guide

Bu proje, ayda 1 long-form (8-12 dk) + 3 Shorts (9:16) üreten yarı otomatik bir YouTube içerik pipeline'ıdır. Niche **Bilim & Teknoloji**, dil **Türkçe**, runtime **yerel makine**.

LLM gerektiren tüm adımlar (konu seçimi, script yazımı, Shorts segment seçimi) bu Claude Code oturumu (Max plan) tarafından yapılır — Anthropic API çağrısı yoktur.

## Hızlı Başlangıç

Tüm aylık akış için:

```
/youtube-monthly
```

Bu command Claude'a şu adımları orchestrate ettirir:
1. `npm run trends` (Bash)
2. `data/{YYYY-MM}/trends.json` oku (Read)
3. Niche kriterlerine göre en iyi konuyu seç (kendin düşün)
4. `data/{YYYY-MM}/topic.json` yaz (Write)
5. `npm run topic` ile validate + render (Bash)

## Pipeline Mimarisi

| Faz | Modül | Kullanılan Skill (toolkit) | Durum |
|-----|-------|----------------------------|-------|
| 1   | Trend tarama | — | implemented |
| 1   | Konu seçimi | (Claude oturumu) | implemented |
| 2   | Script yazımı | (Claude oturumu) | implemented |
| 3   | Voice-over (TTS) | `elevenlabs` | implemented |
| 4   | B-roll görseller | `ffmpeg`, `qwen-edit`, `ltx2` | TODO |
| 5   | Altyazı | (Whisper local) | TODO |
| 6   | Long-form composition | `remotion`, `remotion-official` | TODO |
| 7   | Shorts türetme | `ffmpeg`, `remotion` | TODO |
| 8   | Onay kapısı | (Windows toast) | TODO |
| 9   | YouTube upload | (YouTube Data API v3) | TODO |
| 10  | Scheduling | (scheduled-tasks MCP) | TODO |

## Mevcut Skill'ler

[digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) altından `.claude/skills/`'e taşındı. Kullanım için: `/skills` komutu veya doğrudan referans.

| Skill | Amaç |
|-------|------|
| `elevenlabs` | TTS, voice cloning (kullanıcının kendi sesi mevcut) |
| `remotion`, `remotion-official` | React-based programmatic video composition |
| `ffmpeg` | Format conversion, crop, concat, audio mux |
| `frontend-design` | Production-grade görsel kalite kuralları |
| `ltx2` | Text-to-video / image-to-video AI clip üretimi (cloud GPU) |
| `qwen-edit` | AI image editing (cloud GPU) |
| `acestep` | AI music generation (cloud GPU) |
| `moviepy` | Python-native video composition (Remotion alternatifi) |
| `playwright-recording` | Browser demo recording (Phase 2+ için) |
| `runpod` | Cloud GPU pay-as-you-go (LTX2/AceStep/Qwen Edit için) |

## Toolkit Slash Command'leri

Bu projeye eklenen toolkit komutları (`.claude/commands/`):

- `/setup` — Toolkit ilk kurulum (GPU, storage, voice)
- `/video` — Yeni video projesi başlat / devam ettir (toolkit'in proje sistemi)
- `/template` — Video template'leri yönet
- `/brand` — Görsel kimlik (renk, font) tanımla
- `/scene-review` — Sahneleri Remotion Studio'da önizle
- `/design` — Sahne görsel kalitesini iyileştir
- `/generate-voiceover` — TTS skript'i oluştur
- `/voice-clone` — Yeni ses klonu üret
- `/record-demo` — Playwright ile browser demo kaydet
- `/redub` — Mevcut videoyu yeni sesle dub et

Bizim özel command'ımız:

- `/youtube-monthly` — Aylık trend → konu seçimi pipeline'ı

## Klasör Yapısı

```
youtube/
├── .claude/
│   ├── commands/         Slash command'lar (toolkit + youtube-monthly)
│   └── skills/           Toolkit skill'leri (11 skill)
├── config/
│   ├── niche.ts          Bilim & Tek anahtar kelimeleri, kanal kuralları
│   └── pipeline.ts       Pipeline parametreleri
├── src/
│   ├── lib.ts            env, logger, paths, fs, retry, parallelMap
│   ├── types.ts          Paylaşılan tipler
│   ├── trends/index.ts   5-kaynak trend agregator
│   ├── topic.ts          topic.json doğrula + topic.md render
│   ├── script.ts         script.json doğrula + script.md render
│   └── tts/elevenlabs.ts ElevenLabs TTS + concat + scene-timings
├── scripts/
│   ├── run-trends.ts     `npm run trends`
│   ├── run-topic.ts      `npm run topic`
│   ├── run-script.ts     `npm run script`
│   ├── run-tts.ts        `npm run tts`
│   ├── run-monthly.ts    `npm run monthly`
│   └── tools/
│       ├── check-env.ts
│       └── test-elevenlabs.ts  `npm run tts:test -- --scene=N`
├── data/
│   └── YYYY-MM/          Aylık artifact'lar
│       ├── trends.json
│       ├── topic.json    (Claude tarafından yazılır)
│       ├── topic.md      (npm run topic ile render)
│       ├── script.json   (Claude tarafından yazılır)
│       ├── script.md     (npm run script ile render)
│       ├── audio/        (npm run tts: scene-001.mp3 .. scene-NNN.mp3)
│       ├── voiceover.mp3 (sahne MP3'lerinin concat'i)
│       ├── scene-timings.json (her sahnenin gerçek başlangıç-bitiş ms'si)
│       └── (Phase 4+ artifact'ları: görseller, altyazı, final video)
└── video-toolkit/        Üst-stream toolkit (git clone)
    ├── lib/              Remotion components
    ├── tools/            Python CLI (FLUX2, LTX2, AceStep, vb.)
    ├── templates/        Hazır video template'leri
    └── brands/           Görsel kimlik profilleri
```

## Önemli Tasarım Kararları

- **Claude Max planı zaten aktif** — LLM görevleri (konu, script, segment) bu oturum içinde yapılır, ek API maliyeti yok
- **ElevenLabs Creator + cloned voice** kullanıcıda hazır → Phase 3 TTS bunu kullanacak
- **fal.ai Flux schnell** soyut sahne görselleri için (~$3-5/ay) — toolkit'in cloud GPU stack'i (Modal, RunPod) alternatif olarak kullanılabilir ama daha pahalıdır
- **Yarı otomatik onay kapısı** — `npm run monthly` tamamlanınca kullanıcı izleyip `npm run approve` ile YouTube'a yükler
- **Yerel makine + scheduled-tasks MCP** — PC açıkken aylık 1'de çalışır

## Kanal Kuralları (Özet)

- Hedef kitle: 23-45 yaş, Türkiye, teknoloji okuru, üniversite mezunu
- Ton: akıcı, samimi, biraz heyecanlı ama clickbait değil
- Yasaklı: "ŞOK", "BİLİM ADAMLARI ŞAŞKIN", "İNANILMAZ KEŞIF", "kesin böyle"
- Closer: "Eğer bu video hoşuna gittiyse abone olmayı ve yorum yazmayı unutma. Görüşmek üzere."

Detaylı kurallar: `config/niche.ts`.

## API Anahtarları (Phase'lere Göre)

`.env.example` → `.env`. Hiçbiri zorunlu değildir; eksik olan kaynak `npm run check-env` ile "skip" görür.

| Phase | Servis | Maliyet |
|-------|--------|---------|
| 1 | Reddit (ops.), YOUTUBE_API_KEY (ops.) | $0 |
| 3 | ELEVENLABS_API_KEY + voice ID | mevcut Creator $22/ay |
| 4 | PEXELS_API_KEY, PIXABAY_API_KEY, FAL_KEY | $0 + ~$3-5/ay fal.ai |
| 9 | YOUTUBE_CLIENT_SECRET (OAuth) | $0 |
| Toolkit (ops.) | R2, Modal, RunPod (cloud GPU) | $0-30/ay |

## Toolkit Hakkında Daha Fazlası

`video-toolkit/CLAUDE.md` — toolkit'in kendi 24KB rehberi (template'ler, brands, advanced tools).

## Bilinen TODO'lar

- Phase 4 (Pexels/Pixabay stok + fal.ai Flux AI görsel + Ken Burns)
- Phase 5 (Whisper local TR altyazı)
- Phase 6 (Remotion long-form composition)
- Phase 7 (3 Shorts türetme)
- Phase 8 (Onay kapısı + toast notification)
- Phase 9 (YouTube Data API OAuth + upload)
- Phase 10 (scheduled-tasks MCP entegrasyonu — aylık cron)
