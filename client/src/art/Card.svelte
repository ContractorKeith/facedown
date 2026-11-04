<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import { cardName } from "../pieces";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { card } = $props<{ card: string }>();
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const suits: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
</script>
<svg viewBox="0 0 56 80" aria-label={cardName(card)} role="img" class="card" style:color={/[DH]/.test(card) ? "#a82d37" : "#172e29"}>
<rect x=".5" y=".5" width="55" height="79" rx="5" fill="#fffaf0" stroke="#d2cbbb" />
<text x="5" y="18" font-size="16" font-weight="700" fill="currentColor">{card[0] === "T" ? "10" : card[0]}</text>
<text x="6" y="33" font-size="14" fill="currentColor">{suits[card[1]!]}</text>
<text x="28" y="56" text-anchor="middle" font-size="29" fill="currentColor">{suits[card[1]!]}</text>
<g transform="rotate(180 28 40)">
  <text x="5" y="18" font-size="16" font-weight="700" fill="currentColor">{card[0] === "T" ? "10" : card[0]}</text>
</g>
</svg>
