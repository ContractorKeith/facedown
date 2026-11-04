import { expect, test } from "./fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  test("bots make a requested rated table casual; its host can watch publicly", async ({
    page,
    context,
    origin,
  }) => {
    const response = await context.request.post(`${origin}/api/register`, {
      headers: { origin },
      data: {
        username: `rated_${Date.now().toString(36)}`,
        password: "test-password-123",
      },
    });
    expect(response.status()).toBe(201);
    await page.goto(origin);
    await page.getByRole("radio", { name: "Rated", exact: true }).check();
    const request = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/api/tables"),
    );
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    expect((await request).postDataJSON().casual).toBe(false);
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.locator(".turn")).toBeVisible();
    await expect(page.locator(".game-heading small")).toContainText("Casual");
    await expect(
      page.getByText(/guests or bots make a table casual/),
    ).toBeVisible();
    await page.getByRole("link", { name: "Lobby", exact: true }).click();
    await page
      .getByRole("button", { name: "Watch", exact: true })
      .last()
      .click();
    await expect(page).toHaveURL(/\?watch=1$/);
    await expect(page.locator(".turn")).toContainText("Spectating");
    await expect(page.locator(".hand, .piece")).toHaveCount(0);
  });

  test("established leaderboard entries link to profiles", async ({
    page,
    origin,
  }) => {
    await page.route("**/api/leaderboard/dominoes", (route) =>
      route.fulfill({
        json: [
          { username: "established_player", rating: 1623, rd: 90, games: 24 },
        ],
      }),
    );
    await page.goto(`${origin}/leaderboard/dominoes`);
    await expect(
      page.getByRole("link", { name: "1. established_player" }),
    ).toHaveAttribute("href", "/players/established_player");
    await expect(
      page.getByRole("cell", { name: "1623", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "90", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "24", exact: true }),
    ).toBeVisible();
  });
}
