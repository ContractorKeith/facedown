import { ends, type Move, pips, type View } from "./state";

// Final ties keep legal-move order (hand order, then left before right).
export function bot(view: View, legal: Move[]): Move {
  const support = (move: Move): number => {
    if (!("play" in move) || !view.openEnds) return 0;
    const [a, b] = ends(move.play);
    const join = view.openEnds[move.end === "left" ? 0 : 1];
    const exposed = a === join ? b : a;
    return view.hand.filter(
      (tile) => tile !== move.play && ends(tile).includes(exposed),
    ).length;
  };
  const rank = (move: Move): number => ("play" in move ? pips(move.play) : -1);
  const double = (move: Move): number =>
    Number("play" in move && move.play[0] === move.play[2]);
  const move = [...legal].sort(
    (a, b) =>
      rank(b) - rank(a) || double(b) - double(a) || support(b) - support(a),
  )[0];
  if (!move) throw new Error("No legal moves");
  return move;
}
