import { expect, test } from "bun:test";
import { playout } from "./harness";
import { highcard, highcardEntry } from "./highcard";
import { checkView } from "./view-check";

const hidden = new Map([["AC", [{ hidden: true } as const]]]);
test("unsampled JSON views still check standalone and embedded card tokens", () => {
  for (const view of [
    { hand: ["AC"] },
    { text: "secret:AC!" },
    { "hidden:AC": true },
  ])
    expect(() => checkView(view, { spectator: true }, hidden, false)).toThrow(
      "no leak: AC",
    );
});
test("JSON validation runs at the start of each deal and game end", () => {
  for (const stage of ["next-deal", "end"] as const) {
    const entry = {
      ...highcardEntry,
      view(
        state: Parameters<typeof highcard.view>[0],
        viewer: Parameters<typeof highcard.view>[1],
      ) {
        const view = highcard.view(state, viewer);
        if (stage === "next-deal" ? state.deal === 1 : state.turn === null)
          return { ...view, invalid: new Map() };
        return view;
      },
    };
    expect(() => playout(entry, "0".repeat(64))).toThrow(
      "view must be plain JSON",
    );
  }
});
