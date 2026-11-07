<script lang="ts">
import { onMount, tick } from "svelte";
import { ApiError, type Table, type ViewMessage } from "./api";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Board from "./Board.svelte";
import { type Chain, rememberFrame } from "./chain";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Hand from "./Hand.svelte";
import { legalMovesFromView } from "./legal";
import { loadTable } from "./load-table";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import OpenTable from "./OpenTable.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Reactions from "./Reactions.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Scorebar from "./Scorebar.svelte";
import { connect } from "./socket";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import TableHeader from "./TableHeader.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup.
import TableNotices from "./TableNotices.svelte";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { id, navigate, refreshSession } = $props<{
  id: string;
  navigate: (path: string) => void;
  refreshSession: () => Promise<string>;
}>();
let chain = $state<Chain>();
let table = $state<Table>();
let message = $state<ViewMessage>();
let seat = $state<number | null>(null);
let up = $state(false);
let error = $state("");
let pending = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup.
let notice = $state("");
let over = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup.
let gone = $state(false);
let controls: HTMLElement;
let ownsFocus = false;
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup.
let finalScores = $state<number[]>();
$effect(() => {
  if (moves.some((m) => "play" in m) && ownsFocus)
    tick().then(() => {
      if (ownsFocus)
        controls
          ?.querySelector<HTMLButtonElement>(".piece:not(:disabled)")
          ?.focus();
    });
});
let now = $state(Date.now());
let bubbles = $state<Record<number, string>>({});
let connection: ReturnType<typeof connect> | undefined;
const timers = new Set<ReturnType<typeof setTimeout>>();
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const view = $derived(message?.view);
const moves = $derived(
  (up &&
  !pending &&
  message?.view &&
  message.status === "live" &&
  message.toAct === seat &&
  seat !== null &&
  !over
    ? legalMovesFromView(table?.type ?? "spades", message.view)
    : []) as Record<string, unknown>[],
);
function subscribe(next: number | null) {
  connection?.stop();
  seat = next;
  if (next !== null) sessionStorage.setItem(`seat:${id}`, String(next));
  connection = connect(
    id,
    next,
    (incoming) => {
      if (incoming.t === "signed_out") {
        seat = null;
        pending = false;
        sessionStorage.removeItem(`seat:${id}`);
        notice = "You were signed out of this seat. You are spectating.";
        refreshSession().catch((e) => (error = e.message));
      }
      if (incoming.t === "view") {
        pending = false;
        message = incoming as unknown as ViewMessage;
        seat = message.you;
        if (seat !== null) sessionStorage.setItem(`seat:${id}`, String(seat));
        chain = rememberFrame(id, chain, message);
        over = message.status === "finished";
        error = "";
      }
      if (incoming.t === "over") {
        over = true;
      }
      if (incoming.t === "error" && incoming.code !== "stale_seq") {
        pending = false;
        if (incoming.code === "not_found") gone = true;
        error = String(incoming.message).replaceAll("_", " ");
      }
      if (incoming.t === "reaction") {
        const index = Number(incoming.seat);
        bubbles[index] = String(incoming.id);
        const timer = setTimeout(() => {
          delete bubbles[index];
          timers.delete(timer);
        }, 2000);
        timers.add(timer);
      }
    },
    (value) => {
      up = value;
      if (!value) pending = false;
    },
    refreshSession,
    location.search === "?watch=1"
      ? []
      : (table?.seats.flatMap((occupant, index) => (occupant ? [index] : [])) ??
          []),
  );
}
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
function play(move: Record<string, unknown>) {
  if (up && !pending && message && moves.includes(move)) {
    ownsFocus = controls?.contains(document.activeElement) ?? false;
    pending = true;
    connection?.send({ t: "move", seq: message.seq, move });
  }
}
onMount(() => {
  let alive = true;
  loadTable(id)
    .then(({ table: found, scores }) => {
      if (!alive) return;
      table = found;
      finalScores = scores;
      over = found.status === "finished";
      if (over) return;
      const saved = sessionStorage.getItem(`seat:${id}`);
      subscribe(
        location.search === "?watch=1"
          ? null
          : saved !== null
            ? Number(saved)
            : null,
      );
    })
    .catch((e) => {
      if (!alive) return;
      gone = e instanceof ApiError && e.status === 404;
      error = e.message;
    });
  const tick = setInterval(() => (now = Date.now()), 250);
  return () => {
    alive = false;
    clearInterval(tick);
    for (const timer of timers) clearTimeout(timer);
    connection?.stop();
  };
});
</script>
<svelte:document onfocusin={event => { ownsFocus = controls?.contains(event.target as Node) && !!(event.target as Element).closest(".hand, .bids, .draw, .end-picker"); }} />
<main class="game" class:bidding={view && "phase" in view && view.phase === "bidding"} bind:this={controls}>
  <TableHeader {id} type={table?.type} rated={message?.rated ?? table?.rated ?? false} {navigate} />
  {#if !up && table && !gone && !over}
    <p class="banner" role="status">Reconnecting…</p>
  {/if}
  <TableNotices {gone} {error} {notice} tampered={chain?.tampered} scores={finalScores} {id} />
  {#if message && !gone && !finalScores}
    {#if view}
    {#if !message.rated}<p class="banner casual-banner">Casual · Ratings stay unchanged; guests or bots make a table casual.</p>{/if}
    <Scorebar {view} />
    {/if}
    <Board {message} {seat} {bubbles} />
    {#if view?.lastDeal}
      <p class="deal-result" data-testid="deal-result">Deal scored · {view.lastDeal.points.join(" / ")} points</p>
    {/if}
    {#if over && view}
      <p class="banner">Game over · Final scores {view.scores.join(" / ")}</p>
      <a class="replay-link" href={`/games/${id}`}>Check the replay →</a>
    {:else if message.status === "open"}
      <OpenTable {message} {seat} join={subscribe} />
    {:else}
      <div class="turn" role="status">{seat === null ? "Spectating" : message.toAct === seat ? "Your turn" : `Seat ${(message.toAct ?? 0) + 1}’s turn`}
        <span>{message.deadline ? `${Math.max(0, Math.ceil((message.deadline - now) / 1000))}s` : ""}</span>
      </div>
    {/if}
    {#if view && "phase" in view && view.phase === "bidding" && moves.length}
      <div class="bids" aria-label="Choose your bid">
        {#each moves as move}
          <button onclick={() => play(move)}>Bid {move.bid === 0 ? "0 · Nil" : String(move.bid)}</button>
        {/each}
      </div>
    {/if}
    {#each moves.filter(m => "draw" in m || "pass" in m) as move}
      <button class="draw" onclick={() => play(move)}>{"draw" in move ? "Draw tile" : "Pass"}</button>
    {/each}
    {#if seat !== null && view && message.status !== "open"}
      <Hand hand={view.hand} {moves} dominoes={table?.type === "dominoes"} {play} />
      <Reactions {up} send={value => connection?.send(value)} />
    {/if}
  {/if}
</main>
