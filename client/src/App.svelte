<script lang="ts">
import { onMount } from "svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Auth from "./Auth.svelte";
import { api, session } from "./api";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Leaderboard from "./Leaderboard.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Lobby from "./Lobby.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Navigation from "./Navigation.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Player from "./Player.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Replay from "./Replay.svelte";
// biome-ignore lint/correctness/noUnusedImports: Referenced in markup (Biome checks scripts only).
import Table from "./Table.svelte";

// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let guest = $state(true);
let name = $state("");
let error = $state("");
function routePath() {
  try {
    return decodeURIComponent(location.pathname);
  } catch {
    return location.pathname;
  }
}
let path = $state(routePath());
function navigate(next: string) {
  history.pushState({}, "", next);
  path = routePath();
}
async function refreshSession() {
  name = await session();
  guest = (await api<{ guest: boolean }>("/me")).guest;
  return name;
}
onMount(() => {
  refreshSession().catch((e) => (error = e.message));
  const pop = () => (path = routePath());
  window.addEventListener("popstate", pop);
  return () => window.removeEventListener("popstate", pop);
});
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function logout() {
  try {
    await api("/logout", {});
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("seat:")) sessionStorage.removeItem(key);
    await refreshSession();
    navigate("/");
  } catch (e) {
    error = (e as Error).message;
  }
}
</script>
{#if name}<Navigation {name} {guest} {navigate} {logout} />{/if}
{#if error}
  <p role="alert">{error}</p>
{:else if !name}
  <main>
    <h1>facedown<span>♠</span></h1>
    <p>Setting your place…</p>
  </main>
{:else if path === "/login" || path === "/register"}
  {#key path}<Auth register={path === "/register"} {navigate} {refreshSession} />{/key}
{:else if /^\/games\/[a-z2-7]{10}$/.test(path)}
  {#key path}<Replay id={path.split("/")[2]!} />{/key}
{:else if /^\/players\/[a-zA-Z0-9_]{3,20}$/.test(path)}
  {#key path}<Player username={path.split("/")[2]!} />{/key}
{:else if /^\/leaderboard\/(spades|dominoes)$/.test(path)}
  {#key path}<Leaderboard type={path.split("/")[2]!} />{/key}
{:else if /^\/tables\/[a-z2-7]{10}$/.test(path)}
  {#key path}
    <Table id={path.split("/")[2]!} {name} {navigate} {refreshSession} />
  {/key}
{:else}
  <Lobby {name} {guest} {navigate} />
{/if}
