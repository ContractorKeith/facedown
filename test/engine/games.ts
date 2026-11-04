import type { Game, GameType } from "../../src/engine/core/types";
import { registry } from "../../src/engine/registry";
import { highcardEntry } from "./highcard";
import type { GameEntry, GameInvariants } from "./invariants";

// M1/M2 add their game-specific checks here, separate from the shipped registry.
const invariants = new Map<GameType, GameInvariants>();
export function registeredGames(
  registered: ReadonlyMap<GameType, Game<unknown, unknown, unknown, unknown>>,
  checks: ReadonlyMap<GameType, GameInvariants> = invariants,
): GameEntry[] {
  return [...registered].map(([type, game]) => {
    const hooks = checks.get(type);
    if (!hooks)
      throw new Error(`Missing invariants for registered game: ${type}`);
    return { ...game, ...hooks };
  });
}
export const games: GameEntry<unknown, unknown, unknown, unknown, string>[] = [
  ...registeredGames(registry),
  highcardEntry,
];
