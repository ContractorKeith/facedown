import { expect, test } from "bun:test";
import { parseProfile } from "../../client/src/records";
import { verifyReplay } from "../../client/src/replay";
import { legalTamper, replayFixture } from "./replay-fixture";

test("a legal changed move with the same outcome fails the hash chain", () => {
  const record = replayFixture();
  const altered = legalTamper(record);
  const result = verifyReplay(altered);
  expect(result.frames.length).toBe(record.moves.length + 1);
  expect(result.failures).toEqual(["Move log hash check failed"]);
});
test("profile rejects malformed outcomes, arrays and ratings before rendering", () => {
  for (const value of [
    null,
    {},
    { username: "qa_empty", ratings: null, games: [] },
    {
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
  ])
    expect(() => parseProfile(value)).toThrow("Malformed player profile");
});
