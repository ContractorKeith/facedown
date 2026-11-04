import { dominoes, type Move, type State } from "../../../src/engine/dominoes";

export const initial = (): State =>
  dominoes.init("dominoes rules", dominoes.ruleset);
export const setup = (overrides: Partial<State>): State => ({
  ...initial(),
  deal: 1,
  leader: 0,
  turn: 0,
  hands: [["1-2", "0-0"], ["3-4"], ["0-1"], ["5-6"]],
  boneyard: [],
  line: [{ tile: "2-3", seat: 3, left: 2, right: 3 }],
  ...overrides,
});
export function apply(state: State, move: Move): State {
  if (state.turn === null) throw new Error("Finished game");
  const result = dominoes.apply(state, { seat: state.turn, move });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
