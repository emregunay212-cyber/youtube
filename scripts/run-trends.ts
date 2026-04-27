import { aggregateTrends } from "../src/trends/index.js";
import { currentMonth, getLogger, getPaths, writeJson } from "../src/lib.js";

const log = getLogger("run-trends");

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Trend collection starting", { month });

  const artifact = await aggregateTrends(month);

  if (artifact.shortlist.length < 5) {
    log.warn(
      `Only ${artifact.shortlist.length} trends matched the niche filter. ` +
        "Consider relaxing keyword filters in config/niche.ts.",
    );
  }

  await writeJson(paths.trends, artifact);
  log.info("Trends written", {
    file: paths.trends,
    total: artifact.totalCollected,
    matched: artifact.shortlist.length,
    perSource: artifact.perSource,
  });
}

main().catch((err) => {
  log.error("Trend collection failed", String(err));
  process.exitCode = 1;
});
