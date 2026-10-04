<script lang="ts">
  import type { Swatch } from '../catalog/catalog';
  let { list, value, onpick, label }: { list: Swatch[]; value: string; onpick: (id: string) => void; label: string } = $props();
</script>

<div class="sw" role="radiogroup" aria-label={label}>
  {#each list as s (s.id)}
    <button
      role="radio" aria-checked={value === s.id} class:on={value === s.id} title={s.name}
      style="--c:{s.hex}" class:none={s.id === 'none'} onclick={() => onpick(s.id)}
    ><span class="sr">{s.name}</span></button>
  {/each}
</div>

<style>
  .sw { display: flex; flex-wrap: wrap; gap: 6px; }
  button { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--panel); background: var(--c); box-shadow: 0 0 0 1px var(--border); cursor: pointer; padding: 0; }
  button.on { box-shadow: 0 0 0 2px var(--accent); }
  button.none { background: repeating-linear-gradient(45deg, #ddd 0 4px, #fff 4px 8px); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
