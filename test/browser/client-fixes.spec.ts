import { expect, test } from "./fixture";
import { tableFixture } from "./table-fixture";

if (process.env.FACEDOWN_BROWSER === "1") {
  test("open tables show seats and host controls without a hand; same names do not determine your seat", async ({
    page,
    origin,
  }) => {
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".seat")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Fill bots" })).toBeVisible();
    await expect(page.locator(".hand, .piece")).toHaveCount(0);
    expect(wire.record.moves[0]?.seat).not.toBe(0);
    wire.send(0, { you: wire.record.moves[0]?.seat });
    await expect(page.locator(".south small")).toContainText("Your seat");
    await expect(page.locator(".north small")).toContainText("Partner");
    await expect(page.locator(".hand .piece")).toHaveCount(13);
    expect(wire.sent.some((m) => m.t === "join" && m.seat === 0)).toBe(true);
    // The active bidder from the view must override the requested seat 0.
    await expect(page.locator(".bids button")).toHaveCount(14);
  });

  for (const largerType of [false, true])
    test(`phone bidding fits every card and bid in the viewport${largerType ? " with larger type" : ""}`, async ({
      page,
      origin,
    }, info) => {
      const wire = await tableFixture(page);
      await page.goto(`${origin}/tables/${wire.id}`);
      await expect(
        page.getByText("Waiting to start", { exact: true }),
      ).toBeVisible();
      if (largerType)
        await page.addStyleTag({
          content: ":root { font-size: 18px; }",
        });
      wire.send(0, { you: wire.record.moves[0]?.seat });
      await expect(page.locator(".piece")).toHaveCount(13);
      await expect(page.locator(".bids button")).toHaveCount(14);
      for (const item of await page.locator(".piece, .bids button").all())
        await expect(item).toBeInViewport({ ratio: 1 });
      if (!largerType)
        await page.screenshot({
          path: `docs/screenshots/bidding-${info.project.name}-phone.png`,
          animations: "disabled",
        });
    });

  test("keyboard play focuses a legal card on the next turn", async ({
    page,
    origin,
  }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    wire.send(4, { you: wire.record.moves[4]?.seat }); // All four bids are in the fixture.
    const playable = page.locator(".piece:not(:disabled)").first();
    await expect(playable).toBeEnabled();
    await playable.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".piece")).toHaveCount(12);
    // Pending moves must not consume restoration before a legal card exists.
    wire.send(8, { you: wire.record.moves[8]?.seat });
    await expect(page.locator(".piece:not(:disabled)").first()).toBeFocused();
  });

  test("disabled cards do not lift on desktop hover", async ({
    page,
    origin,
  }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    wire.send(0);
    const disabled = page.locator(".piece:disabled").first();
    await expect(disabled).toBeVisible();
    await disabled.hover({ force: true });
    await expect(disabled).toHaveCSS("transform", "none");
  });

  test("a rewritten live hash warns immediately and the replay is Mismatch", async ({
    page,
    origin,
  }) => {
    const wire = await tableFixture(page);
    await page.goto(`${origin}/tables/${wire.id}`);
    await expect(
      page.getByText("Waiting to start", { exact: true }),
    ).toBeVisible();
    wire.send(0);
    await expect(page.locator(".hand")).toBeVisible();
    wire.send(1, { rewrite: true });
    await expect(page.getByRole("alert")).toHaveText(
      "This game's move log changed unexpectedly",
    );
    await page.goto(`${origin}/games/${wire.id}`);
    await expect(page.getByText("Mismatch", { exact: true })).toBeVisible();
  });

  for (const reloadAt of [null, 0, 2])
    test(`a ${reloadAt === null ? "continuous" : `reloaded at move ${reloadAt}`} live game ends ${reloadAt === null ? "Verified" : "Consistent"}`, async ({
      page,
      origin,
    }) => {
      const wire = await tableFixture(page, "dominoes");
      await page.goto(`${origin}/tables/${wire.id}`);
      await expect(
        page.getByText("Waiting to start", { exact: true }),
      ).toBeVisible();
      wire.send(0);
      await expect(page.locator(".hand")).toBeVisible();
      if (reloadAt === 0) {
        await page.reload();
        await expect(page.locator(".hand")).toBeVisible();
      }
      for (let seq = 1; seq <= wire.record.moves.length; seq++) {
        wire.send(seq);
        // Wait for the client to save each frame rather than filling the socket queue.
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                JSON.parse(localStorage.getItem(`fd:game:${id}`) ?? "{}").seq,
              wire.id,
            ),
          )
          .toBe(seq);
        if (seq === reloadAt) {
          await page.reload();
          await expect(page.locator(".hand")).toBeVisible();
        }
      }
      await page.getByRole("link", { name: "Check the replay →" }).click();
      await expect(
        page.getByText(reloadAt === null ? "Verified" : "Consistent", {
          exact: true,
        }),
      ).toBeVisible();
    });
}
