<script lang="ts">
import { onMount } from "svelte";

let { up, send } = $props<{ up: boolean; send: (message: object) => void }>();
let cooling = $state(false);
let timer: ReturnType<typeof setTimeout>;
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const reactions = ["nice", "oops", "gg", "hurry", "thanks", "wow"];
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
function react(id: string) {
  if (!up || cooling) return;
  cooling = true;
  send({ t: "react", id });
  timer = setTimeout(() => (cooling = false), 3000);
}
onMount(() => () => clearTimeout(timer));
</script>
<nav class="reactions" aria-label="Reactions">
  {#each reactions as id}
    <button disabled={!up || cooling} onclick={() => react(id)}>{id}</button>
  {/each}
</nav>
