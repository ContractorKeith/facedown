<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Card from "./art/Card.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Tile from "./art/Tile.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import { cardName, sortHand, tileName } from "./pieces";

let { hand, moves, dominoes, play } = $props<{
  hand: string[];
  moves: Record<string, unknown>[];
  dominoes: boolean;
  play: (move: Record<string, unknown>) => void;
}>();
let selected = $state<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const ordered = $derived(sortHand(hand, dominoes));
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const options = $derived(moves.filter((m) => m.play === selected));
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
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
<div tabindex="-1" role="group" class:dominoes class="hand" aria-label="Your hand">
  {#each ordered as item (item)}
    <button class="piece" class:legal={moves.some(m => m.play === item)} disabled={!moves.some(m => m.play === item)} aria-label={`Play ${dominoes ? tileName(item) : cardName(item)}`} aria-pressed={selected === item} onclick={() => choose(item)}>
      {#if dominoes}
        <Tile tile={item} />
      {:else}
        <Card card={item} />
      {/if}
    </button>
  {/each}
</div>
