import { type GameEntry, registry } from "../../src/engine/registry";
import { highcardEntry } from "./highcard";

// Method parameters on GameEntry preserve each implementation's concrete state types.
export const games: GameEntry<unknown, unknown, unknown, unknown, string>[] = [
  ...registry.values(),
  highcardEntry,
];
