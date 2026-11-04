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
  view: SpadesView | DominoView;
  toAct: number | null;
  deadline: number | null;
  seats: Seat[];
  commitment: string;
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error((await response.json()).message ?? "Request failed");
  return response.json();
}
export async function session(): Promise<string> {
  try {
    return (await api<{ name: string }>("/me")).name;
  } catch {
    return (await api<{ name: string }>("/guest", {})).name;
  }
}
