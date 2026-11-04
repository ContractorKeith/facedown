<script lang="ts">
import { onMount } from "svelte";
import { api } from "./api";
import { type Profile, parseProfile } from "./records";

let { username } = $props<{ username: string }>();
let profile = $state<Profile>();
let error = $state("");
onMount(() => {
  api<unknown>(`/players/${username}`)
    .then((value) => (profile = parseProfile(value)))
    .catch((e) => (error = e.message));
});
</script>
<main class="reading">
  <p class="eyebrow">PLAYER PROFILE</p><h1>{profile?.username ?? username}</h1>
  {#if error}<p role="alert">{error}</p>{:else if !profile}<p>Loading profile…</p>{/if}
  {#if profile}
    {#each profile.ratings as pool}
      <section class="pool"><h2>{pool.type === "spades" ? "Spades" : "Dominoes"}</h2>
        <dl><div><dt>Rating</dt><dd>{pool.rating.toFixed(0)}</dd></div><div><dt>RD</dt><dd>{pool.rd.toFixed(0)}</dd></div><div><dt>Games</dt><dd>{pool.games}</dd></div></dl>
      </section>
    {/each}
    <small>RD measures rating uncertainty. It falls as you play rated games.</small>
    <h2>Recent games</h2>
    {#if !profile.games.length}<p>No finished games yet.</p>{/if}
    {#each profile.games as game}<a class="table-row" href={`/games/${game.id}`}><span>{game.type} · {game.rated ? "Rated" : "Casual"}<small>Scores {game.outcome.scores.join(" / ")}</small></span><span>Replay ↗</span></a>{/each}
  {/if}
</main>
