import { expect, test } from "./fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  test("account, full casual game, verified replay, profile and leaderboard", async ({
    page,
    browser,
    origin,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const username = `replay_${Date.now().toString(36)}`;
    await page.goto(`${origin}/register`);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-password-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("link", { name: "Log in", exact: true }).click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-password-123");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Rated", exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Casual", exact: true }).check();
    await page.getByRole("button", { name: /Dominoes.*Open a table/ }).click();
    await expect(page).toHaveURL(/\/tables\/[a-z2-7]{10}$/);
    const tableURL = page.url();
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    const spectator = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await spectator.goto(origin);
    await spectator
      .getByRole("button", { name: "Watch", exact: true })
      .last()
      .click();
    await expect(spectator.locator(".turn")).toContainText("Spectating");
    await expect(spectator.locator(".hand, .faceup, .piece")).toHaveCount(0);
    await spectator.close();
    const deadline = Date.now() + 95000;
    while (
      Date.now() < deadline &&
      !(await page.getByRole("link", { name: "Check the replay →" }).count())
    ) {
      await page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(
          ".end-picker button, .piece.legal, button.draw",
        );
        button?.click();
      });
      await page.waitForTimeout(230);
    }
    await page.getByRole("link", { name: "Check the replay →" }).click();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    const replayURL = page.url();
    await expect(page.locator(".faceup svg")).toHaveCount(20);
    await page.getByRole("button", { name: "Forward", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Last", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Forward", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: "test-results/replay-phone.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "First", exact: true }).click();
    await page.getByRole("slider", { name: "Replay move" }).fill("1");
    await page.goto(`${origin}/players/${username}`);
    await expect(
      page.getByRole("heading", { name: username, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1500", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: /dominoes.*Casual.*Replay/ }),
    ).toHaveAttribute(
      "href",
      tableURL.replace(origin, "").replace("tables", "games"),
    );
    await page.screenshot({
      path: "test-results/profile-phone.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Leaderboards" }).click();
    await expect(
      page.getByRole("heading", { name: "Leaderboard", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No established ratings yet. Pull up a chair."),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/leaderboard-phone.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.route("**/api/games/*", async (route) => {
      const response = await route.fetch();
      const record = await response.json();
      record.moves[0] = { seat: 0, move: { play: "tampered" } };
      await route.fulfill({ json: record });
    });
    await page.goto(replayURL);
    await expect(page.getByText("Mismatch", { exact: true })).toBeVisible();
    await expect(page.getByText(/Move 1 failed to fold/)).toBeVisible();
    await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Last", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  });
  test("authentication shows API failures and throttling", async ({
    page,
    origin,
  }) => {
    await page.goto(`${origin}/login`);
    await page.getByLabel("Username", { exact: true }).fill("unknown_user");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.route("**/api/login", (route) =>
      route.fulfill({ status: 401, json: { message: "unauthorized" } }),
    );
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("unauthorized");
    await page.route("**/api/login", (route) =>
      route.fulfill({ status: 429, json: { message: "rate_limited" } }),
    );
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Too many attempts");
  });
}
