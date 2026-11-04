<script lang="ts">
import { onMount } from "svelte";
import { api, type GameType, type Table } from "./api";

let { name, navigate } = $props<{
  name: string;
  navigate: (path: string) => void;
}>();
let tables = $state<Table[]>([]);
let error = $state("");
let busy = $state(false);
async function refresh() {
  try {
    tables = await api<Table[]>("/tables");
  } catch (e) {
    error = (e as Error).message;
  }
}
async function create(type: GameType) {
  busy = true;
  try {
    const result = await api<{ id: string; inviteUrl: string }>("/tables", {
      type,
    });
    sessionStorage.setItem(`host:${result.id}`, "1");
    sessionStorage.setItem(`invite:${result.id}`, result.inviteUrl);
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
      <button onclick={() => navigate(`/tables/${table.id}`)}>{table.status === "live" ? "Spectate" : "Take a seat"}</button>
    </article>
  {/each}
  <footer>Your hand stays yours. Every finished game can be checked.</footer>
</main>
