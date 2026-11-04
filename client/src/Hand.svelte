<script lang="ts">
import { tick } from "svelte";
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
let container: HTMLDivElement;
let restoreFocus = false;
$effect(() => {
  hand;
  moves;
  if (restoreFocus)
    tick().then(() => {
      (
        container.querySelector<HTMLButtonElement>(".piece:not(:disabled)") ??
        container
      ).focus();
      restoreFocus = false;
    });
});
function submit(move: Record<string, unknown>, keyboard: boolean) {
  restoreFocus = keyboard;
  play(move);
}
let selected = $state<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const ordered = $derived(sortHand(hand, dominoes));
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const options = $derived(moves.filter((m) => m.play === selected));
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
function choose(item: string, keyboard: boolean) {
  const matches = moves.filter((m) => m.play === item);
  if (matches.length === 1 && matches[0]) {
    selected = null;
    submit(matches[0], keyboard);
  } else selected = item;
}
</script>
{#if options.length > 1}
  <div class="end-picker" aria-label="Choose an end">
    <span>{selected}: which end?</span>
    {#each options as move}
      <button onclick={event => { submit(move, event.detail === 0); selected = null; }}>Play {String(move.end)}</button>
    {/each}
  </div>
{/if}
<div bind:this={container} tabindex="-1" role="group" class:dominoes class="hand" aria-label="Your hand">
  {#each ordered as item (item)}
    <button class="piece" class:legal={moves.some(m => m.play === item)} disabled={!moves.some(m => m.play === item)} aria-label={`Play ${dominoes ? tileName(item) : cardName(item)}`} aria-pressed={selected === item} onclick={event => choose(item, event.detail === 0)}>
      {#if dominoes}
        <Tile tile={item} />
      {:else}
        <Card card={item} />
      {/if}
    </button>
  {/each}
</div>
