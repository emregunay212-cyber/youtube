import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { NICHE } from "../../config/niche.js";
import { PIPELINE } from "../../config/pipeline.js";
import {
  daysAgo,
  getLogger,
  parallelMap,
  retry,
} from "../lib.js";
import type {
  RankedTrend,
  TrendItem,
  TrendSource,
  TrendsArtifact,
} from "../types.js";

const log = getLogger("trends");
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// ---------- Hacker News ----------

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  descendants?: number;
  type?: string;
  text?: string;
}

async function fetchHackerNews(): Promise<TrendItem[]> {
  try {
    const ids = await retry(async () => {
      const res = await axios.get<number[]>(
        "https://hacker-news.firebaseio.com/v0/topstories.json",
        { timeout: 10_000 },
      );
      return res.data.slice(0, PIPELINE.trends.perSourceLimit);
    });

    const items = await parallelMap(ids, 6, async (id) => {
      const res = await axios.get<HNItem>(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        { timeout: 10_000 },
      );
      return res.data;
    });

    return items
      .filter((it): it is HNItem => Boolean(it && it.title && it.url && it.time))
      .map<TrendItem>((it) => {
        const publishedAt = new Date((it.time ?? 0) * 1000).toISOString();
        return {
          source: "hackernews",
          id: `hn-${it.id}`,
          title: it.title!,
          url: it.url!,
          summary: it.text?.slice(0, 500),
          rawScore: it.score ?? 0,
          publishedAt,
          ageDays: daysAgo(publishedAt),
          language: "en",
          meta: { comments: it.descendants ?? 0 },
        };
      });
  } catch (err) {
    log.warn("Hacker News failed", String(err));
    return [];
  }
}

// ---------- ArXiv ----------

interface ArxivEntry {
  id?: string;
  title?: string | { "#text": string };
  summary?: string | { "#text": string };
  published?: string;
  link?: { "@_href"?: string } | Array<{ "@_href"?: string; "@_rel"?: string }>;
}

function arxivText(field: string | { "#text": string } | undefined): string {
  if (!field) return "";
  return typeof field === "string" ? field : field["#text"] ?? "";
}

function arxivUrl(link: ArxivEntry["link"], fallback: string): string {
  if (!link) return fallback;
  if (Array.isArray(link)) {
    return link[0]?.["@_href"] ?? fallback;
  }
  return link["@_href"] ?? fallback;
}

async function fetchArxiv(): Promise<TrendItem[]> {
  try {
    const query = encodeURIComponent("cat:cs.AI OR cat:cs.LG OR cat:cs.CL");
    const url = `http://export.arxiv.org/api/query?search_query=${query}&max_results=${PIPELINE.trends.perSourceLimit}&sortBy=submittedDate&sortOrder=descending`;
    const res = await retry(() => axios.get<string>(url, { timeout: 15_000, responseType: "text" }));
    const parsed = xml.parse(res.data);
    const entries: ArxivEntry[] = parsed?.feed?.entry ?? [];
    const list = Array.isArray(entries) ? entries : [entries];

    return list
      .filter((e) => e?.title && e?.published)
      .map<TrendItem>((e) => {
        const title = arxivText(e.title).replace(/\s+/g, " ").trim();
        const summary = arxivText(e.summary).replace(/\s+/g, " ").trim().slice(0, 500);
        const publishedAt = new Date(e.published!).toISOString();
        const id = (e.id ?? "").replace(/^.*\//, "");
        return {
          source: "arxiv",
          id: `arxiv-${id}`,
          title,
          url: arxivUrl(e.link, e.id ?? ""),
          summary,
          rawScore: 50,
          publishedAt,
          ageDays: daysAgo(publishedAt),
          language: "en",
        };
      });
  } catch (err) {
    log.warn("ArXiv failed", String(err));
    return [];
  }
}

// ---------- Webrazzi RSS ----------

interface RssItem {
  title?: string | { "#text": string };
  link?: string;
  guid?: string | { "#text": string };
  pubDate?: string;
  description?: string;
}

async function fetchWebrazzi(): Promise<TrendItem[]> {
  try {
    const res = await retry(() =>
      axios.get<string>("https://webrazzi.com/feed/", { timeout: 15_000, responseType: "text" }),
    );
    const parsed = xml.parse(res.data);
    const items: RssItem[] = parsed?.rss?.channel?.item ?? [];
    const list = Array.isArray(items) ? items : [items];

    return list
      .filter((it) => it?.title && it?.pubDate)
      .slice(0, PIPELINE.trends.perSourceLimit)
      .map<TrendItem>((it) => {
        const title = (typeof it.title === "string" ? it.title : it.title?.["#text"] ?? "").trim();
        const guid = typeof it.guid === "string" ? it.guid : it.guid?.["#text"] ?? it.link ?? "";
        const slug = guid.split("/").filter(Boolean).pop()
          || title.slice(0, 40).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const publishedAt = new Date(it.pubDate!).toISOString();
        const summary = (it.description ?? "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
        return {
          source: "webrazzi",
          id: `webrazzi-${slug}`,
          title,
          url: it.link ?? "",
          summary,
          rawScore: 60,
          publishedAt,
          ageDays: daysAgo(publishedAt),
          language: "tr",
        };
      });
  } catch (err) {
    log.warn("Webrazzi failed", String(err));
    return [];
  }
}

// ---------- YouTube Trending TR ----------

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
}

async function fetchYouTubeTrending(): Promise<TrendItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    log.info("YOUTUBE_API_KEY not set, skipping YouTube trending");
    return [];
  }
  try {
    const url = "https://www.googleapis.com/youtube/v3/videos";
    const res = await retry(() =>
      axios.get<{ items: YouTubeVideo[] }>(url, {
        params: {
          part: "snippet,statistics",
          chart: "mostPopular",
          regionCode: "TR",
          videoCategoryId: NICHE.youtube.categoryId,
          maxResults: PIPELINE.trends.perSourceLimit,
          key: apiKey,
        },
        timeout: 15_000,
      }),
    );

    return (res.data.items ?? []).map<TrendItem>((v) => ({
      source: "youtube-tr",
      id: `yt-${v.id}`,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      summary: v.snippet.description.slice(0, 500),
      rawScore: Number(v.statistics?.viewCount ?? 0),
      publishedAt: v.snippet.publishedAt,
      ageDays: daysAgo(v.snippet.publishedAt),
      language: "tr",
      meta: {
        channel: v.snippet.channelTitle,
        likes: Number(v.statistics?.likeCount ?? 0),
      },
    }));
  } catch (err) {
    log.warn("YouTube trending failed", String(err));
    return [];
  }
}

// ---------- Reddit ----------

interface RedditChild {
  data: {
    id: string;
    title: string;
    selftext: string;
    permalink: string;
    url: string;
    score: number;
    created_utc: number;
    subreddit: string;
    num_comments: number;
  };
}

async function redditAccessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const user = process.env.REDDIT_USERNAME;
  const pass = process.env.REDDIT_PASSWORD;
  const ua = process.env.REDDIT_USER_AGENT ?? "youtube-content-pipeline/0.1";
  if (!id || !secret || !user || !pass) return null;

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "password", username: user, password: pass });
  const res = await axios.post<{ access_token: string }>(
    "https://www.reddit.com/api/v1/access_token",
    body.toString(),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": ua,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15_000,
    },
  );
  return res.data.access_token;
}

async function fetchReddit(): Promise<TrendItem[]> {
  try {
    const token = await redditAccessToken();
    if (!token) {
      log.info("Reddit credentials missing, skipping");
      return [];
    }
    const ua = process.env.REDDIT_USER_AGENT ?? "youtube-content-pipeline/0.1";
    const subs = ["technology", "science", "Futurology", "MachineLearning"].join("+");
    const url = `https://oauth.reddit.com/r/${subs}/top`;
    const res = await retry(() =>
      axios.get<{ data: { children: RedditChild[] } }>(url, {
        params: { t: "week", limit: PIPELINE.trends.perSourceLimit },
        headers: { Authorization: `bearer ${token}`, "User-Agent": ua },
        timeout: 15_000,
      }),
    );

    return (res.data?.data?.children ?? []).map<TrendItem>(({ data }) => {
      const publishedAt = new Date(data.created_utc * 1000).toISOString();
      return {
        source: "reddit",
        id: `reddit-${data.id}`,
        title: data.title,
        url: data.url || `https://reddit.com${data.permalink}`,
        summary: data.selftext?.slice(0, 500),
        rawScore: data.score,
        publishedAt,
        ageDays: daysAgo(publishedAt),
        language: "en",
        meta: { subreddit: data.subreddit, comments: data.num_comments },
      };
    });
  } catch (err) {
    log.warn("Reddit failed", String(err));
    return [];
  }
}

// ---------- Aggregator ----------

function matchKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return NICHE.keywords.filter((k) => lower.includes(k.toLowerCase()));
}

function isExcluded(text: string): boolean {
  const lower = text.toLowerCase();
  return NICHE.excludeKeywords.some((k) => lower.includes(k.toLowerCase()));
}

function normalizeScore(items: TrendItem[]): Map<string, number> {
  const map = new Map<string, number>();
  if (items.length === 0) return map;
  const max = Math.max(...items.map((i) => i.rawScore || 0), 1);
  for (const it of items) {
    map.set(it.id, (it.rawScore || 0) / max);
  }
  return map;
}

function rankAndFilter(all: TrendItem[]): RankedTrend[] {
  const bySource = new Map<TrendSource, TrendItem[]>();
  for (const item of all) {
    const arr = bySource.get(item.source) ?? [];
    arr.push(item);
    bySource.set(item.source, arr);
  }

  const normalizedBySource = new Map<TrendSource, Map<string, number>>();
  for (const [src, items] of bySource) {
    normalizedBySource.set(src, normalizeScore(items));
  }

  const ranked: RankedTrend[] = [];
  const weights = PIPELINE.trends.sourceWeights as Record<string, number>;

  for (const item of all) {
    const haystack = `${item.title} ${item.summary ?? ""}`;
    if (isExcluded(haystack)) continue;
    if (item.ageDays > PIPELINE.trends.maxAgeDays) continue;
    const matched = matchKeywords(haystack);
    if (matched.length === 0) continue;

    const norm = normalizedBySource.get(item.source)?.get(item.id) ?? 0;
    const sourceWeight = weights[item.source] ?? 0.1;
    const keywordBoost = Math.min(0.3, matched.length * 0.05);
    const recencyBoost = Math.max(0, 1 - item.ageDays / PIPELINE.trends.maxAgeDays) * 0.2;
    const weighted = norm * sourceWeight + keywordBoost + recencyBoost;

    ranked.push({
      ...item,
      normalizedScore: norm,
      weightedScore: weighted,
      matchedKeywords: matched,
    });
  }

  ranked.sort((a, b) => b.weightedScore - a.weightedScore);
  return ranked.slice(0, PIPELINE.trends.aggregateLimit);
}

// ---------- Public API ----------

export async function fetchAllTrends(): Promise<TrendItem[]> {
  log.info("Starting trend collection from all sources");
  const [hn, arxiv, webrazzi, yt, reddit] = await Promise.all([
    fetchHackerNews(),
    fetchArxiv(),
    fetchWebrazzi(),
    fetchYouTubeTrending(),
    fetchReddit(),
  ]);
  const all = [...hn, ...arxiv, ...webrazzi, ...yt, ...reddit];
  log.info("Collection complete", {
    hn: hn.length,
    arxiv: arxiv.length,
    webrazzi: webrazzi.length,
    youtube: yt.length,
    reddit: reddit.length,
    total: all.length,
  });
  return all;
}

export async function aggregateTrends(month: string): Promise<TrendsArtifact> {
  const all = await fetchAllTrends();
  const ranked = rankAndFilter(all);

  const perSource: TrendsArtifact["perSource"] = {};
  for (const it of all) {
    perSource[it.source] = (perSource[it.source] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    month,
    totalCollected: all.length,
    perSource,
    shortlist: ranked,
  };
}
