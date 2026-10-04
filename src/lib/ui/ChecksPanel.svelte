<script lang="ts">
  import type { Editor } from './editor.svelte';
  let { editor, onclose }: { editor: Editor; onclose?: () => void } = $props();
  const icon = { error: '⛔', warning: '⚠️', info: 'ℹ️' } as const;
</script>

<div class="checks">
  <div class="head"><h4>Design checks</h4>{#if onclose}<button class="chip" onclick={onclose}>Close</button>{/if}</div>
  <p class="muted small">Guidance only — not a building-code check.</p>
  {#each editor.warnings as w (w.id)}
    <button class="w {w.severity}" onclick={() => { if (w.cabinetIds[0]) editor.selection = { kind: 'cabinet', id: w.cabinetIds[0] }; }}>
      <span>{icon[w.severity]}</span>
      <span class="msg">{w.message}<span class="rule">{w.rule}</span></span>
    </button>
  {:else}
    <p class="ok">✓ No issues found</p>
  {/each}
</div>

<style>
  .checks { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  h4 { margin: 0; font-size: 14px; }
  .small { font-size: 11px; margin: 0 0 4px; }
  .w { display: flex; gap: 8px; text-align: left; border: 0; border-radius: 8px; padding: 8px; font-size: 13px; cursor: pointer; background: var(--info-bg); color: var(--info-ink); }
  .w.error { background: var(--danger-bg); color: var(--danger); }
  .w.warning { background: var(--warn-bg); color: var(--warn-ink); }
  .msg { display: flex; flex-direction: column; gap: 2px; }
  .rule { font-family: ui-monospace, Menlo, monospace; font-size: 10px; opacity: .7; }
  .ok { color: var(--ok); font-weight: 600; }
</style>
