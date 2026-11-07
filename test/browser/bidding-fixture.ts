import { expect, type Page } from "@playwright/test";

export async function checkBiddingLayout(
  page: Page,
  scale: number,
  height: number,
) {
  // Include geometry in failures so different platform fonts can be diagnosed.
  const geometry = await page
    .locator(
      ".account-nav, .brand, .game-heading, .scorebar, .board, .turn, .bids, .hand",
    )
    .evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return {
          class: item.className,
          y: box.y,
          height: box.height,
          width: box.width,
        };
      }),
    );
  const detail = JSON.stringify(geometry);
  if (scale <= 1.5)
    for (const item of await page.locator(".piece, .bids button").all())
      await expect(item, detail).toBeInViewport({ ratio: 1 });
  if (height < 640) {
    const hand = await page.locator(".hand").boundingBox();
    const bids = await page.locator(".bids").boundingBox();
    expect(hand && bids && hand.y + hand.height <= bids.y, detail).toBe(true);
    await expect(page.locator(".bids")).toHaveCSS("position", "fixed");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    detail,
  ).toBe(true);
  const you = await page.locator(".south .avatar").boundingBox();
  const prompt = await page
    .getByText("Place your bids", { exact: true })
    .boundingBox();
  if (you && prompt)
    expect(prompt.y + prompt.height, detail).toBeLessThanOrEqual(you.y);
}
