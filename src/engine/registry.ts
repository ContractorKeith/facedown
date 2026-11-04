import type { Game, GameType } from "./core/types";

export const registry = new Map<
  GameType,
  Game<unknown, unknown, unknown, unknown>
>();
