import { type Seat, type Team, teamOf } from "../core/types";
import { type DealSummary, deal, pips, ruleset, type State } from "./state";

// The cap resolves a tied score by the last deal that awarded positive points.
export function gameWinner(state: State): Team {
  if (state.scores[0] !== state.scores[1])
    return state.scores[0] > state.scores[1] ? 0 : 1;
  return state.lastScoringTeam ?? 1;
}

export function summaryView(summary: DealSummary | null): DealSummary | null {
  return summary === null
    ? null
    : {
        ending: { ...summary.ending },
        pips: [...summary.pips],
        points: [...summary.points],
      };
}

// Score before replacing the hands; retain only public numbers across deals.
export function finishDeal(state: State, seat: Seat): State {
  const remaining = state.hands.map((hand) =>
    hand.reduce((sum, tile) => sum + pips(tile), 0),
  ) as DealSummary["pips"];
  const totals: [number, number] = [
    remaining[0] + remaining[2],
    remaining[1] + remaining[3],
  ];
  const domino = state.hands[seat].length === 0;
  const winner = domino
    ? teamOf(seat)
    : totals[0] === totals[1]
      ? null
      : totals[0] < totals[1]
        ? 0
        : 1;
  const points: [number, number] = [0, 0];
  if (winner !== null) points[winner] = totals[winner === 0 ? 1 : 0];
  const scores: [number, number] = [
    state.scores[0] + points[0],
    state.scores[1] + points[1],
  ];
  const lastScoringTeam =
    winner !== null && points[winner] > 0 ? winner : state.lastScoringTeam;
  const lastDeal: DealSummary = {
    ending: domino ? { kind: "domino", seat } : { kind: "blocked" },
    pips: remaining,
    points,
  };
  // Only one team scores per deal, so both cannot reach 100 together.
  if (
    scores.some((score) => score >= ruleset.target) ||
    state.deal + 1 >= ruleset.maxDeals
  )
    return { ...state, scores, lastDeal, lastScoringTeam, turn: null };
  return {
    ...deal(state.seed, state.deal + 1, scores, state.leader),
    lastDeal,
    lastScoringTeam,
  };
}
