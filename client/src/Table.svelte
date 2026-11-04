<script lang="ts">
import { onMount } from "svelte";
import { api, type Table, type ViewMessage } from "./api";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Board from "./Board.svelte";
import { rememberGame } from "./game-records";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Hand from "./Hand.svelte";
import { legalMovesFromView } from "./legal";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Reactions from "./Reactions.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Scorebar from "./Scorebar.svelte";
import { connect } from "./socket";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { id, name, navigate, refreshSession } = $props<{
  id: string;
  name: string;
  navigate: (path: string) => void;
  refreshSession: () => Promise<string>;
}>();
let table = $state<Table>();
let message = $state<ViewMessage>();
let seat = $state<number | null>(null);
let up = $state(false);
let error = $state("");
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let copied = $state(false);
let pending = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let notice = $state("");
let over = $state(false);
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
        if (message.commitment) rememberGame(id, message.commitment);
        over = message.status === "finished";
        error = "";
      }
      if (incoming.t === "over") {
        if (message?.commitment)
          rememberGame(id, message.commitment, String(incoming.logHash));
        over = true;
      }
      if (incoming.t === "error" && incoming.code !== "stale_seq") {
        pending = false;
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
  );
}
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function control(action: string) {
  try {
    await api(`/tables/${id}/${action}`, {});
  } catch (e) {
    error = (e as Error).message;
  }
}
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
function play(move: Record<string, unknown>) {
  if (up && !pending && message && moves.includes(move)) {
    pending = true;
    connection?.send({ t: "move", seq: message.seq, move });
  }
}
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function copy() {
  try {
    await navigator.clipboard.writeText(
      new URL(location.pathname, location.origin).href,
    );
    copied = true;
  } catch {
    error = "Copy this page’s address to invite a friend.";
  }
}
onMount(() => {
  let alive = true;
  api<Table[]>("/tables")
    .then((tables) => {
      if (!alive) return;
      table = tables.find((t) => t.id === id);
      if (!table) {
        error = "Table not found";
        return;
      }
      const saved = sessionStorage.getItem(`seat:${id}`);
      const own = table.seats.findIndex((s) => s?.name === name);
      subscribe(
        location.search === "?watch=1"
          ? null
          : own >= 0
            ? own
            : saved !== null && table.status === "live"
              ? Number(saved)
              : null,
      );
    })
    .catch((e) => (error = e.message));
  const tick = setInterval(() => (now = Date.now()), 250);
  return () => {
    alive = false;
    clearInterval(tick);
    for (const timer of timers) clearTimeout(timer);
    connection?.stop();
  };
});
</script>
<main class="game">
  <header class="brand">
    <a href="/" onclick={e => { e.preventDefault(); navigate("/"); }}>facedown<span>♠</span></a>
    <button class="quiet" onclick={copy}>{copied ? "Link copied" : "Copy invite"}</button>
  </header>
  <div class="game-heading">
    <h1>{table?.type === "dominoes" ? "Dominoes" : "Spades"}</h1>
    <small>{message?.rated ? "Rated" : "Casual"} · {id}</small>
  </div>
  {#if !up && table}
    <p class="banner" role="status">Reconnecting…</p>
  {/if}
  {#if notice}<p class="banner" role="status">{notice}</p>{/if}
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  {#if message?.status === "open"}
    <div class="board" aria-label="Game table">
      {#each message.seats as occupant, index}
        <div class={`seat ${["south", "west", "north", "east"][(index - (seat ?? 0) + 4) % 4]}`}>
          <span class="avatar">{occupant?.bot ? "♟" : index === seat ? "You" : index + 1}</span>
          <strong>{occupant?.name ?? "Empty seat"}</strong>
          <small>Seat {index + 1}</small>
        </div>
      {/each}
      <div class="table-center"><p role="status">Waiting to start</p></div>
    </div>
    <div class="controls">
      {#if message.host}
        <button onclick={() => control("bots")}>Fill bots</button>
        <button disabled={!message.seats.every(Boolean)} onclick={() => control("start")}>Start game</button>
      {/if}
      {#if seat === null}{#each message.seats as occupant, index}{#if !occupant}
            <button onclick={() => subscribe(index)}>Join seat {index + 1}</button>
          {/if}{/each}{/if}
      <small>Share your invite and settle in.</small>
    </div>
  {:else if message && view}
    {#if !message.rated}<p class="banner">Casual · Ratings stay unchanged. Rated play requires four signed-in humans at the start; guests or bots make a table casual.</p>{/if}
    <Scorebar {view} />
    <Board {message} {seat} {bubbles} />
    {#if view.lastDeal}
      <p class="deal-result" data-testid="deal-result">Deal scored · {view.lastDeal.points.join(" / ")} points</p>
    {/if}
    {#if over}
      <p class="banner">Game over · Final scores {view.scores.join(" / ")}</p>
      <a class="replay-link" href={`/games/${id}`}>Check the replay →</a>
    {:else}
      <div class="turn" role="status">{seat === null ? "Spectating" : message.toAct === seat ? "Your turn" : `Seat ${(message.toAct ?? 0) + 1}’s turn`}
        <span>{message.deadline ? `${Math.max(0, Math.ceil((message.deadline - now) / 1000))}s` : ""}</span>
      </div>
    {/if}
    {#if "phase" in view && view.phase === "bidding" && moves.length}
      <div class="bids" aria-label="Choose your bid">
        {#each moves as move}
          <button onclick={() => play(move)}>Bid {move.bid === 0 ? "0 · Nil" : String(move.bid)}</button>
        {/each}
      </div>
    {/if}
    {#each moves.filter(m => "draw" in m || "pass" in m) as move}
      <button class="draw" onclick={() => play(move)}>{"draw" in move ? "Draw tile" : "Pass"}</button>
    {/each}
    {#if seat !== null}
      <Hand hand={view.hand} {moves} dominoes={table?.type === "dominoes"} {play} />
      <Reactions {up} send={value => connection?.send(value)} />
    {/if}
  {/if}
</main>
