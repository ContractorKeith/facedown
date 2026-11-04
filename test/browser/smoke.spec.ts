import { expect, test } from "./fixture";

// Bun also discovers this file; only the browser command registers the suite.
if (process.env.FACEDOWN_BROWSER === "1") {
  for (const type of ["Spades", "Dominoes"] as const) {
    test(`${type}: a phone plays a deal, reacts and reconnects`, async ({
      page,
      browser,
      origin,
    }) => {
      // Track the real socket so the test can simulate a dropped connection.
      await page.addInitScript(() => {
        const Native = window.WebSocket;
        class Socket extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            (window as unknown as { gameSocket: WebSocket }).gameSocket = this;
          }
        }
        window.WebSocket = Socket;
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await page
        .getByRole("button", { name: new RegExp(`^.*${type}.*Open a table`) })
        .click();
      await expect(page).toHaveURL(/\/tables\/[a-z2-7]{10}$/);
      const invitee = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await invitee.goto(page.url());
      await invitee
        .getByRole("button", { name: "Join seat 2", exact: true })
        .click();
      await expect(invitee.locator(".south strong")).toContainText("guest-");
      await expect(invitee.locator(".hand")).toBeVisible();
      await invitee.close();
      await expect(page.locator(".west strong")).toHaveText("Empty seat");
      await page.getByRole("button", { name: "Fill bots" }).click();
      await page.getByRole("button", { name: "Start game" }).click();
      const spectator = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await spectator.goto(page.url());
      await expect(
        spectator.getByText("Spectating", { exact: false }),
      ).toBeVisible();
      await expect(spectator.locator(".piece")).toHaveCount(0);
      await page.getByRole("button", { name: "nice", exact: true }).click();
      await expect(page.locator(".bubble")).toHaveText("nice");
      await expect(spectator.locator(".bubble")).toHaveText("nice");
      await spectator.close();
      await page.evaluate(() =>
        (window as unknown as { gameSocket: WebSocket }).gameSocket.close(),
      );
      await expect(
        page.getByText("Reconnecting…", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Reconnecting…", { exact: true }),
      ).toBeHidden();
      let draws = 0;
      let moves = 0;
      let captured = false;
      const scoring = page.getByTestId("deal-result");
      const deadline = Date.now() + 65000;
      // Dominoes may finish a deal before this seat draws; continue until a draw too.
      while (
        Date.now() < deadline &&
        (!(await scoring.count()) || (type === "Dominoes" && draws === 0))
      ) {
        const draw = page.getByRole("button", {
          name: "Draw tile",
          exact: true,
        });
        const end = page.getByRole("button", {
          name: "Play left",
          exact: true,
        });
        const bid = page.getByRole("button", { name: "Bid 3", exact: true });
        const piece = page.locator(".piece.legal").first();
        const pass = page.getByRole("button", { name: "Pass", exact: true });
        if (await draw.isVisible()) {
          await draw.click();
          draws++;
          moves++;
        } else if (await end.isVisible()) {
          await end.click();
          moves++;
        } else if (await bid.isVisible()) {
          await bid.click();
          moves++;
        } else if (await piece.isVisible()) {
          await piece.click();
          moves++;
        } else if (await pass.isVisible()) {
          await pass.click();
          moves++;
        }
        if (!captured && moves >= 3) {
          await page.screenshot({
            path: `test-results/${type.toLowerCase()}-phone.png`,
            fullPage: true,
          });
          captured = true;
        }
        await page.waitForTimeout(230); // Respect the server's real move rate limit.
      }
      if (!captured)
        await page.screenshot({
          path: `test-results/${type.toLowerCase()}-phone.png`,
          fullPage: true,
        });
      await expect(scoring).toBeVisible();
      expect(moves).toBeGreaterThan(0);
      if (type === "Dominoes") expect(draws).toBeGreaterThan(0);
      expect(errors).toEqual([]);
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
    });
  }
}
