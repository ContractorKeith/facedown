import { expect, test } from "./fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      class Socket extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as unknown as { gameSocket: WebSocket }).gameSocket = this;
        }
        send(data: string) {
          const tracked = window as unknown as { moves: number };
          if (JSON.parse(data).t === "move")
            tracked.moves = (tracked.moves ?? 0) + 1;
          super.send(data);
        }
      }
      window.WebSocket = Socket;
    });
  });
  test("a host's fresh second tab has controls without sessionStorage", async ({
    page,
    context,
    origin,
  }) => {
    await page.goto(origin);
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    await expect(page.getByRole("button", { name: "Fill bots" })).toBeVisible();
    const second = await context.newPage();
    await second.goto(page.url());
    expect(
      await second.evaluate(() =>
        sessionStorage.getItem(`host:${location.pathname.split("/")[2]}`),
      ),
    ).toBeNull();
    await second.getByRole("button", { name: "Fill bots" }).click();
    await second.getByRole("button", { name: "Start game" }).click();
    await expect(page.locator(".turn")).toBeVisible();
    await expect(second.locator(".turn")).toBeVisible();
    await second.evaluate(() => {
      let copied = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            copied = text;
          },
          readText: async () => copied,
        },
      });
    });
    await second.getByRole("button", { name: "Copy invite" }).click();
    expect(await second.evaluate(() => navigator.clipboard.readText())).toBe(
      second.url(),
    );
    await second.close();
  });
  test("cleared cookies recover to a working spectator without reload", async ({
    page,
    context,
    origin,
  }) => {
    await page.goto(origin);
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.evaluate(() => Reflect.set(window, "noReload", "still here"));
    await context.clearCookies();
    await page.evaluate(() =>
      (window as unknown as { gameSocket: WebSocket }).gameSocket.close(),
    );
    await expect(
      page.getByText("You were signed out of this seat. You are spectating.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".turn")).toContainText("Spectating");
    await expect(page.getByText("Reconnecting…", { exact: true })).toBeHidden();
    await expect(page.locator(".piece")).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, "noReload"))).toBe(
      "still here",
    );
    await page.getByRole("link", { name: "facedown♠" }).click();
    await page.getByRole("button", { name: /Dominoes.*Open a table/ }).click();
    await expect(page.getByRole("button", { name: "Fill bots" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
  test("double taps send one move; the reaction tray waits three seconds", async ({
    page,
    origin,
  }) => {
    await page.goto(origin);
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(
      page.getByRole("button", { name: "Bid 3", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Bid 3", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    expect(
      await page.evaluate(() => (window as unknown as { moves: number }).moves),
    ).toBe(1);
    const nice = page.getByRole("button", { name: "nice", exact: true });
    await nice.click();
    await expect(page.locator(".reactions button:disabled")).toHaveCount(6);
    await expect(nice).toBeEnabled({ timeout: 5000 });
    await page.getByRole("button", { name: "thanks", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const names = await page
      .locator(".piece")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getAttribute("aria-label")),
      );
    expect(
      names.every((name) =>
        /^Play (Ace|King|Queen|Jack|Ten|Nine|Eight|Seven|Six|Five|Four|Three|Two) of (spades|hearts|clubs|diamonds)$/.test(
          name ?? "",
        ),
      ),
    ).toBe(true);
  });
  test("M4 logout closes the socket and recovers without reloading", async ({
    page,
    context,
    origin,
  }) => {
    const registered = await context.request.post(`${origin}/api/register`, {
      headers: { origin },
      data: { username: "logout_tester", password: "test-password-123" },
    });
    expect(registered.status()).toBe(201);
    await page.goto(origin);
    await page.getByRole("button", { name: /Spades.*Open a table/ }).click();
    await page.getByRole("button", { name: "Fill bots" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.evaluate(() => Reflect.set(window, "noReload", "still here"));
    expect(
      await page.evaluate(() =>
        fetch("/api/logout", { method: "POST" }).then((r) => r.status),
      ),
    ).toBe(204);
    await expect(
      page.getByText("You were signed out of this seat. You are spectating.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".turn")).toContainText("Spectating");
    await expect(page.getByText("Reconnecting…", { exact: true })).toBeHidden();
    await expect(page.locator(".piece")).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, "noReload"))).toBe(
      "still here",
    );
    await page.getByRole("link", { name: "facedown♠" }).click();
    await page.getByRole("button", { name: /Dominoes.*Open a table/ }).click();
    await expect(page.getByRole("button", { name: "Fill bots" })).toBeVisible();
  });
}
