<script lang="ts">
import { api, type ViewMessage } from "./api";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { message, seat, join } = $props<{
  message: ViewMessage;
  seat: number | null;
  join: (seat: number) => void;
}>();
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let error = $state("");
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function control(action: string) {
  try {
    error = "";
    await api(`/tables/${message.table}/${action}`, {});
  } catch (e) {
    error = (e as Error).message;
  }
}
</script>
{#if error}<p role="alert">{error}</p>{/if}
<div class="controls">
  {#if message.host}
    <button onclick={() => control("bots")}>Fill bots</button>
    <button disabled={!message.seats.every(Boolean)} onclick={() => control("start")}>Start game</button>
  {/if}
  {#if seat === null}{#each message.seats as occupant, index}{#if !occupant}
    <button onclick={() => join(index)}>Join seat {index + 1}</button>
  {/if}{/each}{/if}
  <small>Share your invite and settle in.</small>
</div>
