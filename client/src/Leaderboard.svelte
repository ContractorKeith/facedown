<script lang="ts">
import { onMount } from "svelte";
import { api } from "./api";

let { type } = $props<{ type: string }>();
let players = $state<
  { username: string; rating: number; rd: number; games: number }[]
>([]);
let error = $state("");
let loaded = $state(false);
onMount(() => {
  api<typeof players>(`/leaderboard/${type}`)
    .then((value) => (players = value))
    .catch((e) => (error = e.message))
    .finally(() => (loaded = true));
});
</script>
<main class="reading">
  <p class="eyebrow">THE RATING POOLS</p><h1>Leaderboard</h1>
  <nav aria-label="Game type"><a href="/leaderboard/spades" aria-current={type === "spades" ? "page" : undefined}>Spades</a> · <a href="/leaderboard/dominoes" aria-current={type === "dominoes" ? "page" : undefined}>Dominoes</a></nav>
  <h2>{type === "spades" ? "Spades" : "Dominoes"} · Top 50</h2>
  <small>Players with RD below 150 qualify. Play rated games to establish your rating.</small>
  {#if error}<p role="alert">{error}</p>{:else if !loaded}<p>Loading leaderboard…</p>{:else if !players.length}<p>No established ratings yet. Pull up a chair.</p>{/if}
  {#if players.length}<table><thead><tr><th scope="col">Player</th><th scope="col">Rating</th><th scope="col">RD</th><th scope="col">Games</th></tr></thead><tbody>
    {#each players as player, index}<tr><th scope="row"><a href={`/players/${player.username}`}>{index + 1}. {player.username}</a></th><td>{player.rating.toFixed(0)}</td><td>{player.rd.toFixed(0)}</td><td>{player.games}</td></tr>{/each}
  </tbody></table>{/if}
</main>
