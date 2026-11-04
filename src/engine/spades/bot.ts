import { partnerOf, teamOf } from "../core/types";
import { beats, rank, trickWinner } from "./cards";
import type { Move, View } from "./state";

export function bot(view: View, legal: Move[]): Move {
  const first = legal[0];
  if (!first || view.seat === null) throw new Error("No seat or legal moves");
  if ("bid" in first) {
    const spades = view.hand.filter((card) => card[1] === "S");
    const high = view.hand.filter((card) =>
      card[1] === "S" ? rank(card) >= 10 : rank(card) >= 11,
    ).length;
    const weak =
      high === 0 &&
      spades.length <= 2 &&
      view.hand.every((card) => rank(card) < 10);
    const bid = weak
      ? 0
      : Math.max(1, Math.min(13, high + Math.max(0, spades.length - 3)));
    return legal.find((move) => "bid" in move && move.bid === bid) ?? first;
  }
  const plays = legal
    .filter((move): move is Extract<Move, { play: unknown }> => "play" in move)
    .sort(
      (a, b) =>
        rank(a.play) - rank(b.play) ||
        (a.play < b.play ? -1 : a.play > b.play ? 1 : 0),
    );
  const low = plays[0];
  if (!low) throw new Error("No plays");
  const partner = partnerOf(view.seat);
  const duck = view.bids[view.seat] === 0 || view.bids[partner] === 0;
  if (!view.trick.length) {
    if (duck) return low;
    const suits = [..."CDH"].sort(
      (a, b) =>
        view.hand.filter((card) => card[1] === b).length -
        view.hand.filter((card) => card[1] === a).length,
    );
    return plays.find((move) => move.play[1] === suits[0]) ?? low;
  }
  const winner = trickWinner(view.trick);
  const losing = plays.filter((move) => !beats(move.play, winner.card));
  if (duck) return losing[0] ?? low;
  const contract = (view.bids[view.seat] ?? 0) + (view.bids[partner] ?? 0);
  const taken = view.tricks[view.seat] + view.tricks[partner];
  if (taken < contract && teamOf(winner.seat) !== teamOf(view.seat))
    return plays.find((move) => beats(move.play, winner.card)) ?? low;
  return low;
}
