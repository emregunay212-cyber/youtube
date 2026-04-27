import { z } from "zod";
import { fileExists, getLogger, getPaths, readJson, writeText } from "./lib.js";
import type { TopicArtifact, TopicChoice, TrendsArtifact } from "./types.js";

const log = getLogger("topic");

const TopicChoiceSchema = z.object({
  rank: z.number().int().min(1).max(3),
  title: z.string().min(5).max(120),
  angle: z.string().min(10).max(400),
  reasoning: z.string().min(20).max(800),
  sourceTrendIds: z.array(z.string()).min(1).max(8),
  estimatedSearchInterest: z.enum(["low", "medium", "high"]),
  novelty: z.enum(["fresh", "recent", "evergreen"]),
});

const TopicArtifactSchema = z.object({
  generatedAt: z.string().min(10),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  primary: TopicChoiceSchema,
  alternatives: z.array(TopicChoiceSchema).length(2),
});

function renderTopicMarkdown(artifact: TopicArtifact, trends: TrendsArtifact): string {
  const trendById = new Map(trends.shortlist.map((t) => [t.id, t]));

  const renderChoice = (c: TopicChoice, isPrimary: boolean) => {
    const sources = c.sourceTrendIds
      .map((id) => {
        const t = trendById.get(id);
        return t ? `- [${t.source}] ${t.title} - ${t.url}` : `- (kayip) ${id}`;
      })
      .join("\n");
    const heading = isPrimary ? `## Ana Konu (Rank ${c.rank})` : `### Alternatif (Rank ${c.rank})`;
    return `${heading}\n\n**Baslik:** ${c.title}\n\n**Aci:** ${c.angle}\n\n**Yenilik:** ${c.novelty} | **Arama ilgisi:** ${c.estimatedSearchInterest}\n\n**Gerekce:**\n${c.reasoning}\n\n**Kaynaklar:**\n${sources}`;
  };

  return [
    `# Konu Secimi - ${artifact.month}`,
    `_Uretildi: ${artifact.generatedAt}_`,
    "",
    renderChoice(artifact.primary, true),
    "",
    "---",
    "",
    "## Alternatifler",
    "",
    ...artifact.alternatives.map((c) => renderChoice(c, false)),
  ].join("\n");
}

/**
 * Reads `topic.json` written by Claude Code (during a `/youtube-monthly` slash
 * command session) and renders the human-readable `topic.md` artifact.
 *
 * Topic selection itself is no longer done via the Anthropic API. The Claude
 * Code session that owns this pipeline reads `trends.json`, decides on the
 * topic itself, then writes `topic.json` matching the schema below.
 */
export async function selectTopic(month: string): Promise<TopicArtifact> {
  const paths = getPaths(month);
  const topicJsonPath = paths.topic.replace(/\.md$/, ".json");

  if (!(await fileExists(topicJsonPath))) {
    throw new Error(
      `topic.json not found at ${topicJsonPath}.\n\n` +
        `In your Claude Code session:\n` +
        `  1. Read ${paths.trends}\n` +
        `  2. Pick the best topic from the shortlist\n` +
        `  3. Write ${topicJsonPath} with this shape:\n` +
        `     {\n` +
        `       "generatedAt": "<ISO timestamp>",\n` +
        `       "month": "${month}",\n` +
        `       "primary": { "rank": 1, "title", "angle", "reasoning", "sourceTrendIds": [...], "estimatedSearchInterest": "low|medium|high", "novelty": "fresh|recent|evergreen" },\n` +
        `       "alternatives": [ {rank:2,...}, {rank:3,...} ]\n` +
        `     }\n` +
        `  4. Re-run \`npm run topic\` (this script).\n\n` +
        `Tip: use the \`/youtube-monthly\` slash command which automates these steps.`,
    );
  }

  log.info("Reading topic.json written by Claude Code", topicJsonPath);
  const raw = await readJson<unknown>(topicJsonPath);
  const validation = TopicArtifactSchema.safeParse(raw);
  if (!validation.success) {
    log.error("topic.json schema validation failed", validation.error.format());
    throw new Error(`topic.json shape invalid: ${validation.error.message}`);
  }
  const artifact = validation.data as TopicArtifact;

  log.info("Reading trends for cross-reference", paths.trends);
  const trends = await readJson<TrendsArtifact>(paths.trends);

  await writeText(paths.topic, renderTopicMarkdown(artifact, trends));
  log.info("Topic markdown rendered", {
    file: paths.topic,
    title: artifact.primary.title,
    novelty: artifact.primary.novelty,
  });
  return artifact;
}
