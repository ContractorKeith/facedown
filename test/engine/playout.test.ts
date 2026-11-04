import { expect, test } from "bun:test";
import { sha256 } from "../../src/engine/core/sha256";
import { games } from "./games";
import { playout } from "./harness";
import { highcard, highcardEntry } from "./highcard";

const count = Number(process.env.FACEDOWN_PLAYOUTS ?? 200);
if (!Number.isInteger(count) || count < 1)
  throw new Error("FACEDOWN_PLAYOUTS must be a positive integer");
test("seeded bot playouts satisfy every invariant", () => {
  let total = 0;
  for (const entry of games) {
    for (let i = 0; i < count; i++) {
      playout(entry, sha256(`${entry.type}:${i}`));
      total++;
    }
  }
  console.log(`playouts: ${total} games`);
}, 180000);

test("a planted leak fails with a replay and seed", () => {
  const seed = sha256("planted leak");
  const leaky = {
    ...highcard,
    view(
      state: Parameters<typeof highcard.view>[0],
      viewer: Parameters<typeof highcard.view>[1],
    ) {
      const view = highcard.view(state, viewer);
      return {
        ...view,
        hand: [
          ...view.hand,
          ...state.hands[
            "seat" in viewer ? (((viewer.seat + 1) % 4) as 0 | 1 | 2 | 3) : 0
          ],
        ],
      };
    },
  };
  expect(() => playout({ ...highcardEntry, ...leaky }, seed)).toThrow(
    new RegExp(`seed=${seed} moves=0.*no leak:`),
  );
});

let counter = 0;
test("a planted module counter fails determinism", () => {
  counter = 0;
  const seed = sha256("planted counter");
  const impure = {
    ...highcard,
    apply(
      state: Parameters<typeof highcard.apply>[0],
      envelope: Parameters<typeof highcard.apply>[1],
    ) {
      const result = highcard.apply(state, envelope);
      if (result.ok)
        return { ...result, state: { ...result.state, counter: counter++ } };
      return result;
    },
  };
  expect(() => playout({ ...highcardEntry, ...impure }, seed)).toThrow(
    new RegExp(`seed=${seed} moves=[0-9]+.*determinism: refold differs`),
  );
});
