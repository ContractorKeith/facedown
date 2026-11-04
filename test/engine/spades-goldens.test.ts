import { expect, test } from "bun:test";
import type { Envelope } from "../../src/engine/core/types";
import type { Move } from "../../src/engine/spades";
import { type State, spades } from "../../src/engine/spades";
import { trickWinner } from "../../src/engine/spades/cards";

test.each(["nil-made", "nil-set", "bag-penalty", "team-set", "both-over-500"])(
  "Spades golden actually exercises %s and every deal scores correctly",
  async (event) => {
    const replay = await Bun.file(
      `${import.meta.dir}/../replays/spades-${event}.json`,
    ).json();
    let state = spades.init(replay.seed, spades.ruleset);
    const events = new Set<string>();
    for (const envelope of replay.moves as Envelope<Move>[]) {
      const move =
        "move" in envelope
          ? envelope.move
          : spades.bot(
              spades.view(state, { seat: envelope.seat }),
              spades.legalMoves(state, envelope.seat),
            );
      let expected: { scores: State["scores"]; bags: State["bags"] } | null =
        null;
      if (
        "play" in move &&
        state.played.length === 48 &&
        state.trick.length === 3
      ) {
        const tricks = [...state.tricks];
        const winner = trickWinner([
          ...state.trick,
          { seat: envelope.seat, card: move.play },
        ]).seat;
        tricks[winner] = (tricks[winner] ?? 0) + 1;
        expected = { scores: [...state.scores], bags: [...state.bags] };
        for (const team of [0, 1] as const) {
          let bid = 0,
            taken = 0,
            nilBags = 0,
            nilPoints = 0;
          for (const seat of [team, team + 2]) {
            const count = tricks[seat] ?? 0;
            if (state.bids[seat] === 0) {
              nilPoints += count === 0 ? 100 : -100;
              nilBags += count;
              events.add(count === 0 ? "nil-made" : "nil-set");
            } else {
              bid += state.bids[seat] ?? 0;
              taken += count;
            }
          }
          if (taken < bid) events.add("team-set");
          const bags = nilBags + Math.max(0, taken - bid);
          const penalties = Math.floor((state.bags[team] + bags) / 10);
          if (penalties > 0) events.add("bag-penalty");
          expected.scores[team] +=
            nilPoints +
            (taken >= bid ? 10 * bid : -10 * bid) +
            bags -
            100 * penalties;
          expected.bags[team] = (state.bags[team] + bags) % 10;
        }
        if (expected.scores.every((score) => score >= 500))
          events.add("both-over-500");
      }
      const result = spades.apply(state, envelope);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
      if (expected) {
        expect(state.scores).toEqual(expected.scores);
        expect(state.bags).toEqual(expected.bags);
      }
    }
    expect(events.has(event)).toBe(true);
    expect(spades.outcome(state)).toEqual(replay.expectedOutcome);
    expect(replay.moves.length).toBeLessThanOrEqual(5600);
  },
);
