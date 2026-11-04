<script lang="ts">
import Card from "./art/Card.svelte";
import Tile from "./art/Tile.svelte";

let { hand, moves, dominoes, play } = $props<{
  hand: string[];
  moves: Record<string, unknown>[];
  dominoes: boolean;
  play: (move: Record<string, unknown>) => void;
}>();
let selected = $state<string | null>(null);
const options = $derived(moves.filter((m) => m.play === selected));
function choose(item: string) {
  const matches = moves.filter((m) => m.play === item);
  if (matches.length === 1 && matches[0]) {
    selected = null;
    play(matches[0]);
  } else selected = item;
}
</script>
{#if options.length > 1}
  <div class="end-picker" aria-label="Choose an end">
    <span>{selected}: which end?</span>
    {#each options as move}
      <button onclick={() => { play(move); selected = null; }}>Play {String(move.end)}</button>
    {/each}
  </div>
{/if}
<div class:dominoes class="hand" aria-label="Your hand">
  {#each hand as item (item)}
    <button class="piece" class:legal={moves.some(m => m.play === item)} disabled={!moves.some(m => m.play === item)} aria-label={`Play ${item}`} aria-pressed={selected === item} onclick={() => choose(item)}>
      {#if dominoes}
        <Tile tile={item} />
      {:else}
        <Card card={item} />
      {/if}
    </button>
  {/each}
</div>
