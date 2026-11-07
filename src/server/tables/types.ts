import type {
  Envelope,
  Game,
  GameType,
  Seat,
  Viewer,
} from "../../engine/core/types";
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
  created: number;
  type: GameType;
  host: string;
  casual: boolean;
  creatorAccount?: string | null;
  creatorIP?: string;
  rated?: boolean;
  game: Engine;
  seed: string | null;
  commitment: string | null;
  logHash: string | null;
  lastMove: Envelope<unknown> | null;
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
  | "conflict"
  | "reserved"
  | "busy";
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

export const owns = (
  occupant: Occupant | null | undefined,
  session: Session,
): boolean =>
  occupant?.accountId
    ? occupant.accountId === session.accountId
    : occupant?.session === session.id;
export const ratedIfStarted = (table: Table): boolean => {
  const accounts = table.seats.map((s) => s?.accountId);
  return (
    !table.casual &&
    table.seats.every((s) => s?.accountId && !s.bot) &&
    new Set(accounts).size === 4
  );
};
