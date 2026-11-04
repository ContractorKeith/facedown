import { expect, test } from "./fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  test("encoded player paths render profiles; malformed outcomes show an error", async ({
    page,
    origin,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/players/qa_empty", (route) =>
      route.fulfill({ json: { username: "qa_empty", ratings: [], games: [] } }),
    );
    await page.goto(`${origin}/players/%71a_empty`);
    await expect(
      page.getByRole("heading", { name: "qa_empty", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No finished games yet.")).toBeVisible();
    await page.route("**/api/players/qa_empty", (route) =>
      route.fulfill({
        json: {
          username: "qa_empty",
          ratings: [],
          games: [
            {
              id: "abcdefghij",
              type: "spades",
              rated: false,
              outcome: { scores: [1, 2, 3], winner: 0 },
            },
          ],
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toHaveText(
      "Malformed player profile",
    );
    expect(errors).toEqual([]);
  });

  test("logout clears saved seats while preserving unrelated session storage", async ({
    page,
    context,
    origin,
  }) => {
    await context.request.post(`${origin}/api/register`, {
      headers: { origin },
      data: {
        username: `clear_${Date.now().toString(36)}`,
        password: "test-password-123",
      },
    });
    await page.goto(origin);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.setItem("seat:first", "0");
      sessionStorage.setItem("seat:second", "2");
      sessionStorage.setItem("other", "keep");
    });
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(
      page.getByRole("link", { name: "Log in", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
      other: "keep",
    });
  });
}

if (process.env.FACEDOWN_BROWSER === "1") {
  test("second-tab login and logout retire the first tab's playing session", async ({
    page,
    context,
    origin,
  }) => {
    const username = `tabs_${Date.now().toString(36)}`;
    await context.request.post(`${origin}/api/register`, {
      headers: { origin },
      data: { username, password: "test-password-123" },
    });
    await page.goto(origin);
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.locator(".hand")).toBeVisible();
    const second = await context.newPage();
    try {
      await second.goto(`${origin}/login`);
      await second.getByLabel("Username", { exact: true }).fill(username);
      await second
        .getByLabel("Password", { exact: true })
        .fill("test-password-123");
      await second.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(second).toHaveURL(`${origin}/`);
      await second
        .getByRole("button", { name: "Log out", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: "Log in", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.locator(".turn")).toContainText("Spectating");
      await expect(page.locator(".hand, .piece, .bids button")).toHaveCount(0);
    } finally {
      await second.close();
    }
  });
}
