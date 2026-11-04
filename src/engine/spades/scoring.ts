import type { Team } from "../core/types";
import { SpadesRuleset, type State } from "./state";

// Nil tricks are bags, never credit toward the partner's contract.
export function scoreDeal(state: State): {
  scores: [number, number];
  bags: [number, number];
} {
  const scores: [number, number] = [...state.scores];
  const bags: [number, number] = [...state.bags];
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
      (taken >= contract ? 10 * contract : -10 * contract) + overtricks;
    bags[team] += overtricks;
    while (bags[team] >= SpadesRuleset.bagLimit) {
      scores[team] -= SpadesRuleset.bagPenalty;
      bags[team] -= SpadesRuleset.bagLimit;
    }
  }
  return { scores, bags };
}
export function winningTeam(scores: readonly [number, number]): Team | null {
  if (Math.max(...scores) < SpadesRuleset.target || scores[0] === scores[1])
    return null;
  return scores[0] > scores[1] ? 0 : 1;
}
