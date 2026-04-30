import { currentMonth, getLogger } from "../src/lib.js";
import { generateReview, notifyReviewReady } from "../src/review.js";

const log = getLogger("run-review");

async function main() {
  const month = currentMonth();
  log.info("Review starting", { month });

  const review = await generateReview(month);
  await notifyReviewReady(month, review.reviewPath);

  process.stdout.write("\nReview ready.\n");
  process.stdout.write(`  REVIEW.md: ${review.reviewPath}\n`);
}

main().catch((err) => {
  log.error("Review failed", String(err));
  process.exitCode = 1;
});
