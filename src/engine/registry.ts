import type { Game, GameType } from "./core/types";

import { dominoes } from "./dominoes";
import { spades } from "./spades";

export const registry = new Map<
  GameType,
  Game<unknown, unknown, unknown, unknown>
>([
  ["spades", spades],
  ["dominoes", dominoes],
]);
