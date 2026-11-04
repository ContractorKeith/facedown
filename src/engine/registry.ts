import type { Game, GameType } from "./core/types";

import { spades } from "./spades";

export const registry = new Map<
  GameType,
  Game<unknown, unknown, unknown, unknown>
>([["spades", spades]]);
