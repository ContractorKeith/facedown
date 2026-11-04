<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import { fly } from "svelte/transition";
import type { ViewMessage } from "./api";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Card from "./art/Card.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Tile from "./art/Tile.svelte";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { message, seat, bubbles } = $props<{
  message: ViewMessage;
  seat: number | null;
  bubbles: Record<number, string>;
}>();
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const view = $derived(message.view);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const positions = ["south", "west", "north", "east"];
</script>
<div class="board" aria-label="Game table">
  {#each message.seats as occupant, index}
    <div class={`seat ${positions[(index - (seat ?? 0) + 4) % 4]}`} class:active={message.toAct === index}>
      <span class="avatar">{occupant?.bot ? "♟" : index === seat ? "You" : index + 1}</span>
      <strong>{occupant?.name ?? "Empty seat"}</strong>
      <small>{seat === null ? `Team ${index % 2 + 1}` : index === seat ? "Your seat" : (index - (seat ?? 0) + 4) % 4 === 2 ? "Partner" : "Opponent"}{view ? "bids" in view ? ` · ${view.bids[index] ?? "–"} bid / ${view.tricks[index]} won` : ` · ${view.tileCounts[index]} tiles` : ""}</small>
      {#if bubbles[index]}
        <span class="bubble" role="status">{bubbles[index]}</span>
      {/if}
    </div>
  {/each}
  <div class="table-center">
    {#if !view}
      <span class="table-mark"><small>Waiting to start</small></span>
    {:else if "trick" in view}
      <div class="trick" aria-label="Current trick">
        {#each view.trick as item (item.card)}
          <div class="played" out:fly={{ y: -40, duration: 250 }}>
            <Card card={item.card} />
            <small>Seat {item.seat + 1}</small>
          </div>
        {/each}
      </div>
      {#if !view.trick.length}
        <span class="table-mark">♠<small>{view.phase === "bidding" ? "Place your bids" : "Next trick"}</small>
        </span>
      {/if}
    {:else}
      <div class="line" aria-label="Line of play">
        {#each view.line as item, index (`${view.deal}:${index}:${item.tile}`)}
          <div class="played">
            <Tile tile={`${item.left}-${item.right}`} />
          </div>
        {/each}
      </div>
      {#if !view.line.length}
        <span class="table-mark">⚄<small>Opening tile</small></span>
      {/if}
      {#if view.openEnds}
        <small class="open-ends">Open ends: {view.openEnds.join(" · ")}</small>
      {/if}
    {/if}
  </div>
</div>
