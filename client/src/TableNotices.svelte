<script lang="ts">
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup.
let { gone, error, notice, tampered, scores, id } = $props<{
  gone: boolean;
  error: string;
  notice: string;
  tampered?: boolean;
  scores?: number[];
  id: string;
}>();
</script>
{#if notice}<p class="banner" role="status">{notice}</p>{/if}
{#if gone}
  <p role="alert">This table is gone</p><a href="/">Back to lobby</a>
{:else if error}
  <p role="alert">{error}</p>
{/if}
{#if tampered}<p role="alert">This game's move log changed unexpectedly</p>{/if}
{#if scores && !gone}
  <p class="banner">Game over · Final scores {scores.join(" / ")}</p>
  <a class="replay-link" href={`/games/${id}`}>Check the replay →</a>
{/if}
