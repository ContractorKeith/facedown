<script lang="ts">
import { api } from "./api";

let { register, navigate, refreshSession } = $props<{
  register: boolean;
  navigate: (path: string) => void;
  refreshSession: () => Promise<string>;
}>();
let username = $state("");
let password = $state("");
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let error = $state("");
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
let busy = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: Referenced in markup (Biome checks scripts only).
async function submit(e: SubmitEvent) {
  e.preventDefault();
  busy = true;
  error = "";
  try {
    await api(register ? "/register" : "/login", { username, password });
    await refreshSession();
    navigate("/");
  } catch (e) {
    error = (e as Error).message;
  } finally {
    busy = false;
  }
}
</script>
<main class="reading">
  <p class="eyebrow">YOUR PLACE AT THE TABLE</p>
  <h1>{register ? "Register" : "Log in"}</h1>
  <form onsubmit={submit}>
    <label>Username<input bind:value={username} required pattern={"[a-zA-Z0-9_]{3,20}"} maxlength="20" autocomplete="username" /></label>
    <small>3–20 letters, numbers or underscores.</small>
    <label>Password<input type="password" bind:value={password} required minlength={register ? 8 : 1} maxlength="200" autocomplete={register ? "new-password" : "current-password"} /></label>
    {#if register}<small>At least 8 characters. No email needed.</small>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    <button disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Log in"}</button>
  </form>
  <p><a href={register ? "/login" : "/register"}>{register ? "Already have an account? Log in" : "New here? Register"}</a></p>
  <a href="/">Continue as a guest</a>
</main>
