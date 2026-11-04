import type {
  Envelope,
  GameType,
  Outcome,
  Seat,
} from "../../engine/core/types";
export type StoredSeat = {
  seat: Seat;
  session: string | null;
  name: string | null;
  bot: boolean;
  leaver: boolean;
};
export type GameRecord = {
  id: string;
  type: GameType;
  ruleset: unknown;
  seed: string;
  commitment: string;
  host: string;
  created: number;
  status: "live" | "finished" | "abandoned";
  casual: boolean;
  seats: StoredSeat[];
  moves: Envelope<unknown>[];
  outcome: Outcome | null;
};
export type Row = {
  id: string;
  type: GameType;
  ruleset_json: string;
  casual: number;
  seed: string;
  commitment: string;
  host_session: string;
  created_at: number;
  status: GameRecord["status"];
  outcome_json: string | null;
};
