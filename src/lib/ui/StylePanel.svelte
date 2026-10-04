<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { carcasses, countertops, fronts, handles, stylePresets, swatch } from '../catalog/catalog';
  import Swatches from './Swatches.svelte';

  let { editor }: { editor: Editor } = $props();
  const s = $derived(editor.project.kitchen.style);
</script>

<div class="style">
  <section>
    <h4>Styles</h4>
    <p class="muted small">Restyle the whole kitchen in one step — one undo reverts it.</p>
    <div class="presets">
      {#each stylePresets as preset (preset.id)}
        {@const on = JSON.stringify(preset.style) === JSON.stringify(s)}
        <button class="preset" class:on onclick={() => editor.applyStyle(preset.style)}>
          <span class="mini">
            <span class="top" style="background:{swatch(countertops, preset.style.countertop).hex}"></span>
            <span class="front" style="background:{swatch(fronts, preset.style.front).hex}">
              <i style="background:{preset.style.handle === 'none' ? 'transparent' : swatch(handles, preset.style.handle).hex}"></i>
              <i style="background:{preset.style.handle === 'none' ? 'transparent' : swatch(handles, preset.style.handle).hex}"></i>
            </span>
          </span>
          <span>{preset.name}</span>
        </button>
      {/each}
    </div>
  </section>
  <section><h4>Fronts</h4><Swatches list={fronts} label="Fronts" value={s.front} onpick={(id) => editor.applyStyle({ front: id })} /><span class="muted small">{swatch(fronts, s.front).name}</span></section>
  <section><h4>Handles</h4><Swatches list={handles} label="Handles" value={s.handle} onpick={(id) => editor.applyStyle({ handle: id })} /><span class="muted small">{swatch(handles, s.handle).name}</span></section>
  <section><h4>Worktop</h4><Swatches list={countertops} label="Worktop" value={s.countertop} onpick={(id) => editor.applyStyle({ countertop: id })} /><span class="muted small">{swatch(countertops, s.countertop).name}</span></section>
  <section><h4>Carcass</h4><Swatches list={carcasses} label="Carcass" value={s.carcass} onpick={(id) => editor.applyStyle({ carcass: id })} /><span class="muted small">{swatch(carcasses, s.carcass).name}</span></section>
</div>

<style>
  .style { display: flex; flex-direction: column; gap: 16px; overflow: auto; }
  h4 { margin: 0 0 6px; font-size: 13px; }
  .small { font-size: 11px; margin: 4px 0; display: block; }
  .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .preset { display: flex; flex-direction: column; gap: 6px; align-items: stretch; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); font-size: 12px; cursor: pointer; color: inherit; }
  .preset.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .mini { display: flex; flex-direction: column; height: 46px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border); }
  .mini .top { height: 7px; }
  .mini .front { flex: 1; display: flex; justify-content: space-around; align-items: flex-start; padding-top: 6px; border-top: 1px solid rgba(0,0,0,.15); }
  .mini i { width: 14px; height: 3px; border-radius: 2px; }
</style>
