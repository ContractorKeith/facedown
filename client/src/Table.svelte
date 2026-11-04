<script lang="ts">
import { onMount } from "svelte";
import { api, type Table, type ViewMessage } from "./api";
import Board from "./Board.svelte";
import Hand from "./Hand.svelte";
import { legalMovesFromView } from "./legal";
import { connect } from "./socket";

let { id, name, navigate } = $props<{
  id: string;
  name: string;
  navigate: (path: string) => void;
}>();
let table = $state<Table>();
let message = $state<ViewMessage>();
let seat = $state<number | null>(null);
let up = $state(false);
let error = $state("");
let copied = $state(false);
let over = $state(false);
let now = $state(Date.now());
let bubbles = $state<Record<number, string>>({});
let connection: ReturnType<typeof connect> | undefined;
const timers = new Set<ReturnType<typeof setTimeout>>();
const reactions = ["nice", "oops", "gg", "hurry", "thanks", "wow"];
const view = $derived(message?.view);
const moves = $derived(
  (up && message && message.toAct === seat && seat !== null && !over
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
      if (incoming.t === "view") {
        message = incoming as unknown as ViewMessage;
        error = "";
      }
      if (incoming.t === "over") over = true;
      if (incoming.t === "error" && incoming.code !== "stale_seq")
        error = String(incoming.message).replaceAll("_", " ");
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
    (value) => (up = value),
  );
}
async function control(action: string) {
  try {
    await api(`/tables/${id}/${action}`, {});
    if (action === "start" && table) table.status = "live";
  } catch (e) {
    error = (e as Error).message;
  }
}
function play(move: Record<string, unknown>) {
  if (up && message && moves.includes(move))
    connection?.send({ t: "move", seq: message.seq, move });
}
async function copy() {
  try {
    await navigator.clipboard.writeText(
      new URL(
        sessionStorage.getItem(`invite:${id}`) ?? `/tables/${id}`,
        location.origin,
      ).href,
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
        own >= 0
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
    <small>CASUAL · {id}</small>
  </div>
  {#if !up && table}
    <p class="banner" role="status">Reconnecting…</p>
  {/if}
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  {#if message && view}
    <div class="scorebar">
      <div>
        <small>TEAM 1 · 1 + 3</small>
        <strong>{view.scores[0]}</strong>
      </div>
      <div>
        <small>DEAL {view.deal + 1}</small>
        <span>{"bags" in view ? `Bags ${view.bags.join(" / ")}` : `Boneyard ${view.boneyardCount}`}</span>
      </div>
      <div>
        <small>TEAM 2 · 2 + 4</small>
        <strong>{view.scores[1]}</strong>
      </div>
    </div>
    <Board {message} {seat} {bubbles} />
    {#if view.lastDeal}
      <p class="deal-result" data-testid="deal-result">Deal scored · {view.lastDeal.points.join(" / ")} points</p>
    {/if}
    {#if over}
      <p class="banner">Game over · Final scores {view.scores.join(" / ")}</p>
    {:else if table?.status === "open" && !message.deadline}
      <div class="controls">
        {#if sessionStorage.getItem(`host:${id}`)}
          <button onclick={() => control("bots")}>Fill bots</button>
          <button disabled={!message.seats.every(Boolean)} onclick={() => control("start")}>Start game</button>
        {/if}
        {#if seat === null}{#each message.seats as occupant, index}{#if !occupant}
              <button onclick={() => subscribe(index)}>Join seat {index + 1}</button>
            {/if}{/each}{/if}
        <small>Share your invite and settle in.</small>
      </div>
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
      <nav class="reactions" aria-label="Reactions">
        {#each reactions as id}
          <button disabled={!up} onclick={() => connection?.send({ t: "react", id })}>{id}</button>
        {/each}
      </nav>
    {/if}
  {/if}
</main>
