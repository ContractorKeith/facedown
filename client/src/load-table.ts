import { api, type Table } from "./api";

export async function loadTable(id: string) {
  const table = await api<Table>(`/tables/${id}`);
  const scores =
    table.status === "finished"
      ? (await api<{ outcome: { scores: number[] } }>(`/games/${id}`)).outcome
          .scores
      : undefined;
  return { table, scores };
}
