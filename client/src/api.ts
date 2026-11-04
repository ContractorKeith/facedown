import type { Envelope } from "../../src/engine/core/types";
import type { View as DominoView } from "../../src/engine/dominoes";
import type { View as SpadesView } from "../../src/engine/spades";
export type GameType = "spades" | "dominoes";
export type Seat = { name: string; bot: boolean; connected: boolean } | null;
export type Table = {
  id: string;
  type: GameType;
  status: "open" | "live";
  seats: Seat[];
};
export type ViewMessage = {
  t: "view";
  table: string;
  seq: number;
  view: SpadesView | DominoView | null;
  toAct: number | null;
  deadline: number | null;
  seats: Seat[];
  commitment: string | null;
  logHash: string | null;
  you?: number | null;
  lastMove?: Envelope<unknown> | null;
  host: boolean;
  status: "open" | "live" | "finished" | "unavailable";
  rated: boolean;
};
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 429
        ? "Too many attempts. Please wait before trying again."
        : ((await response.json()).message?.replaceAll("_", " ") ??
            "Request failed"),
    );
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function session(): Promise<string> {
  try {
    return (await api<{ name: string }>("/me")).name;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    return (await api<{ name: string }>("/guest", {})).name;
  }
}
