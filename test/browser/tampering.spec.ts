import { moveLogHash } from "../../src/engine/core/log-hash";
import { expect, test } from "./fixture";
import { legalTamper, replayFixture } from "./replay-fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  const id = "abcdefghij";
  const original = replayFixture();
  const legal = legalTamper(original);
  const changedRules = {
    ...original,
    ruleset: { ...(original.ruleset as object), target: 101 },
  };
  const swapped = replayFixture("dominoes", "cd".repeat(32));
  const badScores = {
    ...original,
    outcome: { ...original.outcome, scores: [...original.outcome.scores, 999] },
  };
  const rehashed = {
    ...legal,
    logHash: moveLogHash(legal.commitment, legal.moves),
  };
  for (const [name, record, expected] of [
    ["different legal move, same outcome", legal, "Move log hash check failed"],
    [
      "legal move with a rewritten response hash",
      rehashed,
      "Saved move log hash check failed",
    ],
    [
      "seed and commitment consistently swapped",
      swapped,
      "Saved commitment check failed",
    ],
    ["changed ruleset", changedRules, "Ruleset check failed"],
    ["extra score entry", badScores, "Malformed replay record"],
  ] as const)
    test(`replay rejects ${name}`, async ({ page, origin }) => {
      await page.addInitScript(
        ({ id, commitment, logHash }) =>
          localStorage.setItem(
            `fd:game:${id}`,
            JSON.stringify({ commitment, logHash }),
          ),
        { id, commitment: original.commitment, logHash: original.logHash },
      );
      await page.route(`**/api/games/${id}`, (route) =>
        route.fulfill({ json: record }),
      );
      await page.goto(`${origin}/games/${id}`);
      await expect(page.getByText("Mismatch", { exact: true })).toBeVisible();
      await expect(page.getByRole("alert")).toContainText(expected);
      await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
    });

  test("without local records a valid replay is Consistent; saved records permit Verified", async ({
    page,
    origin,
  }) => {
    await page.route(`**/api/games/${id}`, (route) =>
      route.fulfill({ json: original }),
    );
    await page.goto(`${origin}/games/${id}`);
    await expect(page.getByText("Consistent", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Consistent: the seed matches the published commitment and the log replays to the stored result (this browser didn't watch this game live)",
        { exact: true },
      ),
    ).toBeVisible();
    await page.evaluate(
      ({ id, commitment, logHash }) =>
        localStorage.setItem(
          `fd:game:${id}`,
          JSON.stringify({ commitment, logHash }),
        ),
      { id, commitment: original.commitment, logHash: original.logHash },
    );
    await page.reload();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Verified: matches the commitment and move log your browser saw during the game",
        { exact: true },
      ),
    ).toBeVisible();
  });
}
