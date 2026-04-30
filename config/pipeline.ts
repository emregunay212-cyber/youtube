export const PIPELINE = {
  longForm: {
    targetWords: 1700,
    minWords: 1500,
    maxWords: 2000,
    targetDurationSec: 600,
    minDurationSec: 480,
    maxDurationSec: 720,
    wordsPerSecond: 2.5,
    sceneCountTarget: 30,
    sceneCountMin: 25,
    sceneCountMax: 40,
    avgSceneDurationSec: 18,
  },

  shorts: {
    count: 3,
    minDurationSec: 30,
    maxDurationSec: 55,
    width: 1080,
    height: 1920,
  },

  video: {
    longFormWidth: 1920,
    longFormHeight: 1080,
    fps: 30,
    crf: 18,
    codec: "h264" as const,
    audioCodec: "aac" as const,
    audioBitrate: "192k",
  },

  trends: {
    sources: ["youtube-tr", "reddit", "hackernews", "arxiv", "webrazzi"] as const,
    maxAgeDays: 7,
    perSourceLimit: 30,
    aggregateLimit: 50,
    sourceWeights: {
      "youtube-tr": 0.40,
      "reddit": 0.25,
      "hackernews": 0.15,
      "arxiv": 0.10,
      "webrazzi": 0.10,
    },
  },

  tts: {
    stability: 0.50,
    similarityBoost: 0.70,
    style: 0.20,
    useSpeakerBoost: true,
    optimizeStreamingLatency: 0,
  },

  visuals: {
    abstractRatio: 0.30,
    falModel: "fal-ai/flux/schnell",
    falImageSize: { width: 1024, height: 576 },
    pexelsPerPage: 5,
    minClipDurationSec: 5,
    fallbackOrder: ["pexels", "pixabay", "fal"] as const,
  },

  whisper: {
    language: "tr",
    wordTimestamps: true,
    maxWordsPerLine: 5,
  },

  upload: {
    longFormPrivacy: "public" as const,
    shortsPrivacy: "public" as const,
    shortsScheduleHoursOffset: [24, 48, 72],
  },

  intro: {
    durationSec: 4,
    backgroundColor: "0x0a0a14",
    accentColor: "0xf5b042",
    titleColor: "0xffffff",
    subtitleColor: "0xb8c2cc",
    channelName: "DİJİ ZİHİN",
    channelTagline: "Bilim ve teknoloji hikayeleri",
    hookText: "Diji Zihin.",
  },

  outro: {
    durationSec: 6,
    backgroundColor: "0x0a0a14",
    accentColor: "0xf5b042",
    channelName: "DİJİ ZİHİN",
    questionText: "ABONE OLMAYI UNUTMA",
    subQuestionText: "Bildirimleri aç · Yorumlarda buluşalım",
    ctaLine: "Diji Zihin · Bilim ve teknoloji hikayeleri",
  },

  audioBuffer: {
    tailSilenceSec: 1.5,
  },

  concurrency: {
    visualsParallel: 3,
    ttsParallel: 2,
  },
} as const;

export type PipelineConfig = typeof PIPELINE;
