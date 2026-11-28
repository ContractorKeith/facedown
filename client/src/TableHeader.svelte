<script lang="ts">
let { id, type, rated, navigate } = $props<{
  id: string;
  type?: "spades" | "dominoes";
  rated: boolean;
  navigate: (path: string) => void;
}>();
let copied = $state(false);
let error = $state("");
async function copy() {
  try {
    error = "";
    await navigator.clipboard.writeText(
      new URL(location.pathname, location.origin).href,
    );
    copied = true;
  } catch {
    error = "Copy this page’s address to invite a friend.";
  }
}
</script>
<header class="brand">
  <a href="/" onclick={e => { e.preventDefault(); navigate("/"); }}>facedown<span>♠</span></a>
  <button class="quiet" onclick={copy}>{copied ? "Link copied" : "Copy invite"}</button>
</header>
<div class="game-heading">
  <h1>{type === "dominoes" ? "Dominoes" : type === "spades" ? "Spades" : "Table"}</h1>
  <small>{rated ? "Rated" : "Casual"} · {id}</small>
</div>
{#if error}<p role="alert">{error}</p>{/if}
