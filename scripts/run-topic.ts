import { selectTopic } from "../src/topic.js";
import { currentMonth, getLogger, getPaths } from "../src/lib.js";

const log = getLogger("run-topic");

async function main() {
  const month = currentMonth();
  const paths = getPaths(month);
  log.info("Topic selection starting", { month });

  const artifact = await selectTopic(month);

  log.info("Topic written", {
    file: paths.topic,
    title: artifact.primary.title,
    novelty: artifact.primary.novelty,
  });
  process.stdout.write(`\nSecilen ana konu: ${artifact.primary.title}\n`);
  process.stdout.write(`Aci: ${artifact.primary.angle}\n`);
  process.stdout.write(`Detaylar: ${paths.topic}\n`);
}

main().catch((err) => {
  log.error("Topic selection failed", String(err));
  process.exitCode = 1;
});
