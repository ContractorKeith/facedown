<script lang="ts">
import type { ViewMessage } from "./api";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { view } = $props<{ view: ViewMessage["view"] }>();
</script>
<div class="scorebar">
  <div><small>TEAM 1 · 1 + 3</small><strong>{view.scores[0]}</strong></div>
  <div>
    <small>DEAL {view.deal + 1}</small>
    <span>{"bags" in view ? `Bags ${view.bags.join(" / ")}` : `Boneyard ${view.boneyardCount}`}</span>
  </div>
  <div><small>TEAM 2 · 2 + 4</small><strong>{view.scores[1]}</strong></div>
</div>
