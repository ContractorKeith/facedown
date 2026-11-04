<script lang="ts">
import { onMount } from "svelte";
import { api, type GameType, type Table } from "./api";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { name, guest, navigate } = $props<{
  name: string;
  guest: boolean;
  navigate: (path: string) => void;
}>();
let casual = $state(true);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let tables = $state<Table[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let error = $state("");
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let busy = $state(false);
async function refresh() {
  try {
    tables = await api<Table[]>("/tables");
  } catch (e) {
    error = (e as Error).message;
  }
}
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function create(type: GameType) {
  busy = true;
  try {
    const result = await api<{ id: string; inviteUrl: string }>("/tables", {
      type,
      casual: guest || casual,
    });
    navigate(result.inviteUrl);
  } catch (e) {
    error = (e as Error).message;
    busy = false;
  }
}
onMount(() => {
  refresh();
  const timer = setInterval(refresh, 5000);
  return () => clearInterval(timer);
});
</script>
<main class="lobby">
  <header class="brand">
    <a href="/" onclick={e => { e.preventDefault(); navigate("/"); }}>facedown<span>♠</span></a>
    <small>{name}</small>
  </header>
  <p class="eyebrow">FOUR SEATS. TWO TEAMS.</p>
  <h1>A good game.<br>A place for everyone.</h1>
  <p class="intro">Bring a partner, share a table, or let the bots pull up a chair.</p>
  <fieldset><legend>Table scoring</legend>
    <label><input type="radio" bind:group={casual} value={true} /> Casual</label>
    {#if !guest}<label><input type="radio" bind:group={casual} value={false} /> Rated</label>{/if}
    <small>Rated games require four signed-in humans.</small>
  </fieldset>
  <section class="create" aria-label="Create a table">
    <button disabled={busy} onclick={() => create("spades")}>
      <span class="game-icon">♠</span>
      <strong>Spades</strong>
      <small>Bid together. Win together.</small>
      <span>Open a table ↗</span>
    </button>
    <button disabled={busy} onclick={() => create("dominoes")}>
      <span class="game-icon">⚄</span>
      <strong>Dominoes</strong>
      <small>Draw tiles. Find your opening.</small>
      <span>Open a table ↗</span>
    </button>
  </section>
  <div class="section-title">
    <h2>At the tables</h2>
    <small>Updates every 5 seconds</small>
  </div>
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  {#if !tables.length}
    <p class="empty">The room is quiet. Set the first table.</p>
  {/if}
  {#each tables as table (table.id)}
    <article class="table-row">
      <div>
        <strong>{table.type === "spades" ? "Spades" : "Dominoes"}</strong>
        <small>{table.seats.filter(Boolean).length}/4 seated · {table.status}</small>
      </div>
      <button onclick={() => navigate(`/tables/${table.id}${table.status === "live" ? "?watch=1" : ""}`)}>{table.status === "live" ? "Watch" : "Take a seat"}</button>
    </article>
  {/each}
  <footer>Your hand stays yours. Every finished game can be checked.</footer>
</main>
