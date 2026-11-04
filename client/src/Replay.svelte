<script lang="ts">
import { onMount } from "svelte";
import { api, type ViewMessage } from "./api";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Card from "./art/Card.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Tile from "./art/Tile.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Board from "./Board.svelte";
import { liveRecord } from "./game-records";
import { parseReplay } from "./records";
import { type Frame, type ReplayRecord, verifyReplay } from "./replay";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Scorebar from "./Scorebar.svelte";

let { id } = $props<{ id: string }>();
let record = $state<ReplayRecord>();
let frames = $state<Frame[]>([]);
let failures = $state<string[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let verified = $state(false);
let loaded = $state(false);
let step = $state(0);
const frame = $derived(frames[step]);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const message = $derived(
  frame && record
    ? ({
        view: frame.view,
        toAct: frame.toAct,
        seats: [0, 1, 2, 3].map((seat) => ({
          name:
            record?.seats.find((s) => s.seat === seat)?.name ??
            `Seat ${seat + 1}`,
          bot: false,
          connected: false,
        })),
      } as ViewMessage)
    : undefined,
);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
const deals = $derived(
  frames.filter(
    (frame, index) =>
      index > 0 &&
      frame.view.lastDeal &&
      (frame.view.deal !== frames[index - 1]?.view.deal ||
        index === frames.length - 1),
  ),
);
onMount(() => {
  api<unknown>(`/games/${id}`)
    .then((value) => {
      const parsed = parseReplay(value);
      const result = verifyReplay(parsed, liveRecord(id));
      record = parsed;
      verified = !!result.verified;
      frames = result.frames;
      failures = result.failures;
    })
    .catch(
      (e) =>
        (failures = [`Replay unavailable or failed to fold: ${e.message}`]),
    )
    .finally(() => (loaded = true));
});
</script>
<main class="replay">
  <p class="eyebrow">CHECK A GAME YOURSELF</p>
  <h1>{record?.type === "dominoes" ? "Dominoes" : "Spades"} replay</h1>
  {#if !loaded}<p role="status">Checking seed and move log…</p>
  {:else if failures.length}<div class="verification mismatch" role="alert"><strong>Mismatch</strong>{#each failures as failure}<p>{failure}</p>{/each}</div>
  {:else}<div class="verification" role="status">{#if verified}<strong>Verified</strong><p>Verified: matches the commitment and move log your browser saw during the game</p>{:else}<strong>Consistent</strong><p>Consistent: the seed matches the published commitment and the log replays to the stored result (this browser did not verify an unbroken live move log)</p>{/if}</div>{/if}
  {#if frame && message && record}
    <div class="replay-controls" aria-label="Replay controls">
      <button onclick={() => step = 0} disabled={step === 0}>First</button>
      <button onclick={() => step--} disabled={step === 0}>Back</button>
      <button onclick={() => step++} disabled={step === frames.length - 1}>Forward</button>
      <button onclick={() => step = frames.length - 1} disabled={step === frames.length - 1}>Last</button>
      <label>Move {step} of {frames.length - 1}<input aria-label="Replay move" type="range" min="0" max={frames.length - 1} bind:value={step} /></label>
    </div>
    <Scorebar view={frame.view} />
    <Board {message} seat={null} bubbles={{}} />
    <section aria-label="All hands" class="replay-hands">
      {#each frame.hands as hand, seat}
        <article><h2>{message.seats[seat]?.name}</h2><small>Seat {seat + 1} · Team {seat % 2 + 1} · {hand.length} remaining</small>
          <div class="faceup">{#each hand as item}{#if record.type === "dominoes"}<Tile tile={item} />{:else}<Card card={item} />{/if}{/each}</div>
        </article>
      {/each}
    </section>
    <h2>Scores per deal</h2>
    {#each deals as deal, index}<p>Deal {index + 1} · {deal.view.lastDeal?.points.join(" / ")} points · Scores {deal.view.scores.join(" / ")}</p>{/each}
  {/if}
  {#if record}
    <h2>{record.rated ? "Rating changes" : "Casual game · no rating changes"}</h2>
    {#each record.rating_changes as change}<p><a href={`/players/${change.username}`}>{change.username}</a> · {change.before.toFixed(0)} → {change.after.toFixed(0)} ({change.after - change.before >= 0 ? "+" : ""}{(change.after - change.before).toFixed(0)})</p>{/each}
    <details><summary>Seed and commitment</summary><p class="digest">Seed: {record.seed}</p><p class="digest">Commitment: {record.commitment}</p></details>
  {/if}
</main>
