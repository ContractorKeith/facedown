import { checkBiddingLayout } from "./bidding-fixture";
import { expect, test } from "./fixture";
import { tableFixture } from "./table-fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  for (const font of ["system-ui", "sans-serif"])
    for (const [width, height, scale] of [
      [1280, 800, 1],
      [390, 844, 1],
      [390, 844, 1.5],
      [390, 844, 2],
      [360, 640, 1],
      [320, 568, 1],
      [844, 390, 1],
    ] as const)
      test(`bidding fits ${width}x${height} at ${scale * 100}% text (${font})`, async ({
        page,
        origin,
      }, info) => {
        await page.setViewportSize({ width, height });
        const wire = await tableFixture(page);
        await page.goto(`${origin}/tables/${wire.id}`);
        await expect(
          page.getByText("Waiting to start", { exact: true }),
        ).toBeVisible();
        await page.addStyleTag({
          content: `:root { font-size: ${16 * scale}px; font-family: ${font}; }`,
        });
        wire.send(0, { you: wire.record.moves[0]?.seat });
        await expect(page.locator(".piece")).toHaveCount(13);
        await expect(page.locator(".bids button")).toHaveCount(14);
        await checkBiddingLayout(page, scale, height);
        if (
          (width === 1280 || width === 360) &&
          scale === 1 &&
          font === "system-ui"
        )
          await page.screenshot({
            path: `docs/screenshots/bidding-${info.project.name}-${width}x${height}.png`,
            animations: "disabled",
          });
      });

  test("direct lookup loads an invite outside the newest 50 and a finished Dominoes reload", async ({
    page,
    origin,
  }) => {
    const wire = await tableFixture(page, "dominoes");
    let lobbyReads = 0;
    await page.route("**/api/tables", (route) => {
      lobbyReads++;
      return route.fulfill({
        json: Array.from({ length: 50 }, (_, i) => ({ id: `newer${i}` })),
      });
    });
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    expect(lobbyReads).toBe(0);
    await page.route(`**/api/tables/${wire.id}`, (route) =>
      route.fulfill({
        json: {
          id: wire.id,
          type: "dominoes",
          status: "finished",
          seats: [],
          rated: false,
          host: false,
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dominoes" })).toBeVisible();
    await expect(
      page.getByText(
        `Game over · Final scores ${wire.record.outcome.scores.join(" / ")}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Check the replay →" }),
    ).toBeVisible();
  });

  for (const source of ["http", "socket"])
    test(`${source} not_found hides host controls`, async ({
      page,
      origin,
    }) => {
      const wire = await tableFixture(page);
      let lobbyReads = 0;
      if (source === "http") {
        await page.route(`**/api/tables/${wire.id}`, (route) =>
          route.fulfill({ status: 404, json: { message: "not_found" } }),
        );
        await page.route("**/api/tables", (route) => {
          lobbyReads++;
          return route.fulfill({ json: [] });
        });
      } else
        await page.routeWebSocket("**/ws", (route) =>
          route.onMessage(() =>
            route.send(
              JSON.stringify({
                t: "error",
                code: "not_found",
                message: "not_found",
              }),
            ),
          ),
        );
      await page.goto(`${origin}/tables/${wire.id}`);
      await expect(page.getByRole("alert")).toHaveText("This table is gone");
      expect(lobbyReads).toBe(0);
      await expect(
        page.getByRole("link", { name: "Back to lobby" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Fill bots" })).toHaveCount(
        0,
      );
    });

  test("rewriting an earlier verified frame raises the live alert and Mismatch", async ({
    page,
    origin,
  }) => {
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    for (const seq of [0, 1, 2]) {
      wire.send(seq);
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              JSON.parse(localStorage.getItem(`fd:game:${id}`) ?? "{}").seq,
            wire.id,
          ),
        )
        .toBe(seq);
    }
    wire.send(1, { rewrite: true });
    await expect(page.getByRole("alert")).toHaveText(
      "This game's move log changed unexpectedly",
    );
    await page.goto(`${origin}/games/${wire.id}`);
    await expect(page.getByText("Mismatch", { exact: true })).toBeVisible();
  });

  test("keyboard bidding and successive play turns focus the first legal card", async ({
    page,
    origin,
  }) => {
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    const seat = wire.record.moves[0]?.seat;
    wire.send(0, { you: seat });
    await page.locator(".bids button").first().focus();
    await page.keyboard.press("Enter");
    for (let seq = 4; seq < 24; seq++) {
      wire.send(seq);
      const ownTurn = wire.record.moves[seq]?.seat === seat;
      if (ownTurn) {
        await expect(
          page.locator(".piece:not(:disabled)").first(),
        ).toBeFocused();
        await page.keyboard.press("Enter");
      }
    }
    const lobby = page.getByRole("link", { name: "Lobby", exact: true });
    await lobby.focus();
    const nextTurn = wire.record.moves.findIndex(
      (move, seq) => seq >= 24 && move.seat === seat,
    );
    wire.send(nextTurn);
    await expect(page.locator(".piece:not(:disabled)").first()).toBeEnabled();
    await expect(lobby).toBeFocused();
  });
}
