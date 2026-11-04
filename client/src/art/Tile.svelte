<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import { tileName } from "../pieces";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { tile } = $props<{ tile: string }>();
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const layouts = [
  [],
  [[0, 0]],
  [
    [-1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
];
</script>
<svg viewBox="0 0 40 80" aria-label={tileName(tile)} role="img" class="tile">
  <rect x=".5" y=".5" width="39" height="79" rx="5" fill="#fffaf0" stroke="#cfc6b5" />
  <path d="M5 40H35" stroke="#b4aa98" />
  {#each [Number(tile[0]), Number(tile[2])] as pips, half}
    {#each layouts[pips] ?? [] as point}
      <circle cx={20 + point[0]! * 9} cy={20 + half * 40 + point[1]! * 10} r="3.2" fill="#172e29" />
    {/each}
  {/each}
</svg>
