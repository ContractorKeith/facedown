<script lang="ts">
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let { name, guest, navigate, logout } = $props<{
  name: string;
  guest: boolean;
  navigate: (path: string) => void;
  logout: () => void;
}>();
</script>
<nav class="account-nav" aria-label="Account">
  <a href="/" onclick={e => { e.preventDefault(); navigate("/"); }}>Lobby</a>
  {#if guest}<span>{name}</span><a href="/login">Log in</a><a href="/register">Register</a>
  {:else}<a href={`/players/${name}`}>{name}</a><button class="quiet" onclick={logout}>Log out</button>{/if}
  <a href="/leaderboard/spades">Leaderboards</a>
</nav>
