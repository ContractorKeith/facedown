import type { Game, GameType, Seat, Viewer } from "../../engine/core/types";
import type { Session } from "../http/sessions";
export type Engine = Game<unknown, unknown, unknown, unknown>;
export type Occupant = {
  session: string | null;
  accountId?: string | null;
  name: string;
  bot: boolean;
  sockets: Set<Peer>;
  cancelHold?: () => void;
  reactionAt?: number;
};
export type Peer = { session: Session; send(message: unknown): void };
export type Table = {
  id: string;
  type: GameType;
  host: string;
  casual: boolean;
  rated?: boolean;
  game: Engine;
  seed: string;
  commitment: string;
  state: unknown;
  seq: number;
  status: "open" | "live" | "finished" | "unavailable";
  seats: (Occupant | null)[];
  viewers: Map<Peer, Viewer>;
  deadline: number | null;
  cancelTurn?: () => void;
  cancelExpiry?: () => void;
  overSent: Set<Peer>;
};
export type ErrorCode =
  | "stale_seq"
  | "illegal_move"
  | "not_your_turn"
  | "rate_limited"
  | "not_found"
  | "forbidden"
  | "bad_request"
  | "unavailable"
  | "unauthorized"
  | "conflict";
export class Fault extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
export function seatNumber(value: unknown): value is Seat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 4;
}
export const publicSeats = (table: Table) =>
  table.seats.map((s) =>
    s ? { name: s.name, bot: s.bot, connected: s.sockets.size > 0 } : null,
  );
