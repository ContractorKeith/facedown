import { ApiError, api, type Table } from "./api";

export async function loadTable(id: string) {
  const table = await api<Table>(`/tables/${id}`).catch(async (error) => {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    // Temporary compatibility until the server's direct lookup lands.
    const found = (await api<Table[]>("/tables")).find(
      (table) => table.id === id,
    );
    if (!found) throw error;
    return found;
  });
  const scores =
    table.status === "finished"
      ? (await api<{ outcome: { scores: number[] } }>(`/games/${id}`)).outcome
          .scores
      : undefined;
  return { table, scores };
}
