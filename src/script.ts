import { z } from "zod";
import { PIPELINE } from "../config/pipeline.js";
import { fileExists, getLogger, getPaths, readJson, writeText } from "./lib.js";
import type { Scene, Script, TopicArtifact } from "./types.js";

const log = getLogger("script");

const SceneSchema = z.object({
  id: z.number().int().min(1),
  voiceover: z.string().min(5).max(2000),
  durationEstimateSec: z.number().min(2).max(120),
  visualHint: z.string().min(3).max(300),
  visualType: z.enum(["concrete", "abstract"]),
});

const ScriptSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(2000),
  tags: z.array(z.string().min(1).max(40)).min(3).max(20),
  hook: z.array(SceneSchema).min(1).max(3),
  body: z.array(SceneSchema)
    .min(PIPELINE.longForm.sceneCountMin - 4)
    .max(PIPELINE.longForm.sceneCountMax),
  cta: z.array(SceneSchema).min(1).max(2),
  totalWords: z.number().int()
    .min(PIPELINE.longForm.minWords - 200)
    .max(PIPELINE.longForm.maxWords + 200),
  totalDurationEstimateSec: z.number().int()
    .min(PIPELINE.longForm.minDurationSec - 60)
    .max(PIPELINE.longForm.maxDurationSec + 60),
});

interface ValidationIssue {
  severity: "error" | "warn";
  message: string;
}

function checkSequentialIds(script: Script): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = [...script.hook, ...script.body, ...script.cta];
  for (let i = 0; i < all.length; i++) {
    const expected = i + 1;
    const actual = all[i]!.id;
    if (actual !== expected) {
      issues.push({
        severity: "error",
        message: `Scene ID gap at position ${i + 1}: expected id=${expected}, got id=${actual} (voiceover starts: "${all[i]!.voiceover.slice(0, 40)}...")`,
      });
    }
  }
  return issues;
}

function checkWordsConsistency(script: Script): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = [...script.hook, ...script.body, ...script.cta];
  const computedWords = all.reduce(
    (sum, s) => sum + s.voiceover.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const declared = script.totalWords;
  const drift = Math.abs(computedWords - declared);
  if (drift > 80) {
    issues.push({
      severity: "warn",
      message: `totalWords (${declared}) differs from sum of voiceover words (${computedWords}) by ${drift}. Declared total should be within 80 words of actual.`,
    });
  }
  return issues;
}

function checkDurationConsistency(script: Script): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = [...script.hook, ...script.body, ...script.cta];
  const computedSec = all.reduce((sum, s) => sum + s.durationEstimateSec, 0);
  const drift = Math.abs(computedSec - script.totalDurationEstimateSec);
  if (drift > 30) {
    issues.push({
      severity: "warn",
      message: `totalDurationEstimateSec (${script.totalDurationEstimateSec}) differs from sum of scene durations (${computedSec}) by ${drift}s. Should be within 30s.`,
    });
  }
  return issues;
}

function checkVisualMix(script: Script): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = [...script.hook, ...script.body, ...script.cta];
  const concrete = all.filter((s) => s.visualType === "concrete").length;
  const abstractRatio = (all.length - concrete) / all.length;
  if (abstractRatio > 0.7) {
    issues.push({
      severity: "warn",
      message: `Abstract scene ratio is ${(abstractRatio * 100).toFixed(0)}% (>70%). High AI generation cost; consider rewriting some scenes with concrete visuals.`,
    });
  }
  return issues;
}

function renderScriptMarkdown(script: Script, topic?: TopicArtifact): string {
  const totalScenes = script.hook.length + script.body.length + script.cta.length;
  const renderScene = (s: Scene, kind: string): string => {
    const visualBadge = s.visualType === "abstract" ? "AI" : "Stok";
    return [
      `### [${kind} #${s.id}] · ${s.durationEstimateSec}s · ${visualBadge}`,
      "",
      `> ${s.voiceover}`,
      "",
      `*Görsel:* ${s.visualHint}`,
    ].join("\n");
  };

  const headerLines = [
    `# ${script.title}`,
    "",
    topic ? `**Topic:** ${topic.primary.title}` : "",
    `**Süre tahmini:** ${Math.floor(script.totalDurationEstimateSec / 60)}:${String(script.totalDurationEstimateSec % 60).padStart(2, "0")} dk · **Kelime:** ${script.totalWords} · **Sahne:** ${totalScenes} (${script.hook.length} hook + ${script.body.length} body + ${script.cta.length} cta)`,
    "",
    `**Açıklama:** ${script.description}`,
    "",
    `**Etiketler:** ${script.tags.map((t) => "`" + t + "`").join(" · ")}`,
    "",
    "---",
  ].filter((line) => line !== "");

  return [
    headerLines.join("\n"),
    "",
    "## Hook",
    "",
    ...script.hook.map((s) => renderScene(s, "Hook")),
    "",
    "## Body",
    "",
    ...script.body.map((s) => renderScene(s, "Body")),
    "",
    "## CTA",
    "",
    ...script.cta.map((s) => renderScene(s, "CTA")),
  ].join("\n\n");
}

const SCRIPT_GUIDANCE = `
In your Claude Code session:
  1. Read data/<month>/topic.json (the chosen topic)
  2. Read data/<month>/trends.json (source material — for facts/numbers)
  3. Write a Turkish long-form script (target ~1700 words, 8-12 minutes)
     following the channel rules in config/niche.ts (no clickbait phrases,
     mandatory closer line).
  4. Write the script as JSON to data/<month>/script.json with this shape:
     {
       "title": "...",
       "description": "Multi-paragraph YouTube description (will be uploaded as-is).",
       "tags": ["bilim", "teknoloji", "..."],
       "hook":  [ Scene, ... ]   // 1-3 scenes, ~10-25 sec total
       "body":  [ Scene, ... ]   // 21-40 scenes, ~9-11 minutes
       "cta":   [ Scene, ... ]   // 1-2 scenes, ~10-20 sec
       "totalWords":               <int>,
       "totalDurationEstimateSec": <int>
     }
     Each Scene:
     {
       "id":                  <int starting at 1, sequential across hook/body/cta>,
       "voiceover":           "Turkish sentence(s), spoken text only — NO stage directions",
       "durationEstimateSec": <number>   // assume Turkish ~150 wpm => 0.4 sec/word
       "visualHint":          "Short English keyword for stock search OR detailed scene description for AI image",
       "visualType":          "concrete" | "abstract"
                              // concrete = real-world objects/people/places
                              //            (search Pexels/Pixabay)
                              // abstract = ideas/algorithms/symbols
                              //            (generate with fal.ai Flux)
     }
  5. Re-run \`npm run script\` (this CLI). It will validate the JSON and render
     a human-readable script.md.

Tip: use the /youtube-monthly slash command, which automates Phase 1 and Phase 2.
`.trim();

export async function finalizeScript(month: string): Promise<Script> {
  const paths = getPaths(month);

  if (!(await fileExists(paths.script))) {
    throw new Error(
      `script.json not found at ${paths.script}.\n\n${SCRIPT_GUIDANCE}`,
    );
  }

  log.info("Reading script.json written by Claude Code", paths.script);
  const raw = await readJson<unknown>(paths.script);
  const validation = ScriptSchema.safeParse(raw);
  if (!validation.success) {
    log.error("script.json schema validation failed", validation.error.format());
    const summary = validation.error.issues
      .slice(0, 6)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`script.json shape invalid:\n${summary}\n\n(${validation.error.issues.length} issue(s) total)`);
  }
  const script = validation.data as Script;

  const issues: ValidationIssue[] = [
    ...checkSequentialIds(script),
    ...checkWordsConsistency(script),
    ...checkDurationConsistency(script),
    ...checkVisualMix(script),
  ];

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warn");

  for (const w of warnings) log.warn(w.message);
  if (errors.length > 0) {
    const msg = errors.map((e) => `  - ${e.message}`).join("\n");
    throw new Error(`script.json has structural errors:\n${msg}`);
  }

  let topic: TopicArtifact | undefined;
  const topicJsonPath = paths.topic.replace(/\.md$/, ".json");
  if (await fileExists(topicJsonPath)) {
    topic = await readJson<TopicArtifact>(topicJsonPath);
  }

  const md = renderScriptMarkdown(script, topic);
  await writeText(paths.scriptMd, md);

  const totalScenes = script.hook.length + script.body.length + script.cta.length;
  log.info("Script validated + markdown rendered", {
    file: paths.scriptMd,
    title: script.title,
    scenes: totalScenes,
    words: script.totalWords,
    seconds: script.totalDurationEstimateSec,
    warnings: warnings.length,
  });
  return script;
}
