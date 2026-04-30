export type TrendSource =
  | "youtube-tr"
  | "reddit"
  | "hackernews"
  | "arxiv"
  | "webrazzi"
  | "manual";

export interface TrendItem {
  source: TrendSource;
  id: string;
  title: string;
  url: string;
  summary?: string;
  rawScore: number;
  publishedAt: string;
  ageDays: number;
  language?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface RankedTrend extends TrendItem {
  normalizedScore: number;
  weightedScore: number;
  matchedKeywords: string[];
}

export interface TrendsArtifact {
  generatedAt: string;
  month: string;
  totalCollected: number;
  perSource: Partial<Record<TrendSource, number>>;
  shortlist: RankedTrend[];
}

export interface TopicChoice {
  rank: number;
  title: string;
  angle: string;
  reasoning: string;
  sourceTrendIds: string[];
  estimatedSearchInterest: "low" | "medium" | "high";
  novelty: "fresh" | "recent" | "evergreen";
}

export interface TopicArtifact {
  generatedAt: string;
  month: string;
  primary: TopicChoice;
  alternatives: TopicChoice[];
}

// ---- Script types (placeholders for later phases) ----

export type SceneVisualType = "concrete" | "abstract";

export interface Scene {
  id: number;
  voiceover: string;
  durationEstimateSec: number;
  visualHint: string;
  visualType: SceneVisualType;
}

export interface Script {
  title: string;
  description: string;
  tags: string[];
  hook: Scene[];
  body: Scene[];
  cta: Scene[];
  totalWords: number;
  totalDurationEstimateSec: number;
}

export interface SceneTiming {
  sceneId: number;
  startMs: number;
  endMs: number;
  audioFile: string;
}

export interface ShortSegment {
  index: 1 | 2 | 3;
  startSceneId: number;
  endSceneId: number;
  hookOverlay: string;
  estimatedDurationSec: number;
}

export interface UploadResult {
  kind: "long" | "short";
  index?: number;
  videoId: string;
  url: string;
  uploadedAt: string;
  scheduledFor?: string;
}
