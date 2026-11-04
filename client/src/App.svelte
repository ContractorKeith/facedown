<script lang="ts">
import { onMount } from "svelte";
import { session } from "./api";
import Lobby from "./Lobby.svelte";
import Table from "./Table.svelte";

let name = $state("");
let error = $state("");
let path = $state(location.pathname);
function navigate(next: string) {
  history.pushState({}, "", next);
  path = location.pathname;
}
onMount(() => {
  session()
    .then((value) => (name = value))
    .catch((e) => (error = e.message));
  const pop = () => (path = location.pathname);
  window.addEventListener("popstate", pop);
  return () => window.removeEventListener("popstate", pop);
});
</script>
{#if error}
  <p role="alert">{error}</p>
{:else if !name}
  <main>
    <h1>facedown<span>♠</span></h1>
    <p>Setting your place…</p>
  </main>
{:else if /^\/tables\/[a-z2-7]{10}$/.test(path)}
  {#key path}
    <Table id={path.split("/")[2]!} {name} {navigate} />
  {/key}
{:else}
  <Lobby {name} {navigate} />
{/if}
