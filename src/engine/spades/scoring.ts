import type { Team } from "../core/types";
import type { State } from "./state";

// Nil tricks are bags, never credit toward the partner's contract.
export function scoreDeal(state: State): {
  scores: [number, number];
  bags: [number, number];
  earnedBags: [number, number];
} {
  const scores: [number, number] = [...state.scores];
  const bags: [number, number] = [...state.bags];
  const earnedBags: [number, number] = [0, 0];
  for (const team of [0, 1] as const) {
    let contract = 0;
    let taken = 0;
    let nilTricks = 0;
    for (const seat of [team, team + 2]) {
      const bid = state.bids[seat];
      const tricks = state.tricks[seat] ?? 0;
      if (bid === null || bid === undefined) throw new Error("Incomplete bids");
      if (bid === 0) {
        scores[team] += tricks === 0 ? 100 : -100;
        nilTricks += tricks;
      } else {
        contract += bid;
        taken += tricks;
      }
    }
    const overtricks = Math.max(0, taken - contract) + nilTricks;
    scores[team] +=
      taken >= contract ? 10 * contract + overtricks : -10 * contract;
    earnedBags[team] = overtricks;
    bags[team] += overtricks;
    while (bags[team] >= state.ruleset.bagLimit) {
      scores[team] -= state.ruleset.bagPenalty;
      bags[team] -= state.ruleset.bagLimit;
    }
  }
  return { scores, bags, earnedBags };
}
// Called only at deal boundaries; the deal index is zero-based.
export function winningTeam(state: State): Team | null {
  const { scores, ruleset } = state;
  const mercy = scores.some((score) => score <= ruleset.mercyScore);
  const capped = state.deal + 1 >= ruleset.maxDeals;
  if (scores[0] === scores[1])
    return capped ? (state.lastScoringTeam ?? 1) : null;
  if (!mercy && !capped && Math.max(...scores) < ruleset.target) return null;
  return scores[0] > scores[1] ? 0 : 1;
}
