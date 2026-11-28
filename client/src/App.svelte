<script lang="ts">
import { onMount } from "svelte";
import Auth from "./Auth.svelte";
import { api, session } from "./api";
import Leaderboard from "./Leaderboard.svelte";
import Lobby from "./Lobby.svelte";
import Navigation from "./Navigation.svelte";
import Player from "./Player.svelte";
import Replay from "./Replay.svelte";
import Table from "./Table.svelte";

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
    <Table id={path.split("/")[2]!} {navigate} {refreshSession} />
  {/key}
{:else}
  <Lobby {name} {guest} {navigate} />
{/if}
