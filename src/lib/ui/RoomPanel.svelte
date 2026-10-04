<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { wallLength } from '../model/geometry';
  import { fmtLen } from '../model/units';
  import { layoutKinds } from '../layout/templates';
  import LayoutIcon from './LayoutIcon.svelte';

  let { editor }: { editor: Editor } = $props();
  const p = $derived(editor.project);
  const verifiedCount = $derived(p.walls.filter((w) => w.verified).length + Number(p.ceilingVerified));
</script>

<div class="room">
  <section>
    <h4>Starter layouts</h4>
    <p class="muted small">One click proposes a complete kitchen for this room. You can undo it.</p>
    <div class="layouts">
      {#each layoutKinds.filter((k) => k.id !== 'empty') as k (k.id)}
        <button class="layout" onclick={() => editor.applyLayout(k.id)} title={k.blurb} disabled={editor.readonly}>
          <LayoutIcon kind={k.id} />
          <span>{k.name}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h4>Walls <span class="muted small">{verifiedCount}/{p.walls.length + 1} verified</span></h4>
    <ul class="walls">
      {#each p.walls as w, i (w.id)}
        <li class:sel={editor.selection?.id === w.id}>
          <button class="wl" onclick={() => { editor.selection = { kind: 'wall', id: w.id }; editor.elevationWallId = w.id; }}>
            <span>Wall {i + 1}</span>
            <span class="muted">{fmtLen(wallLength(w) - w.thickness, p.units, true)}</span>
          </button>
          <label title="Verified on site"><input type="checkbox" checked={w.verified} onchange={(e) => editor.updateWall(w.id, { verified: (e.currentTarget as HTMLInputElement).checked })} /> ✓</label>
        </li>
      {/each}
      <li>
        <span class="wl static"><span>Ceiling</span><span class="muted">{fmtLen(p.ceilingHeight, p.units, true)}</span></span>
        <label title="Verified on site"><input type="checkbox" checked={p.ceilingVerified} onchange={(e) => editor.setCeiling(p.ceilingHeight, (e.currentTarget as HTMLInputElement).checked)} /> ✓</label>
      </li>
    </ul>
    <p class="muted small">Scans and typed sizes are a starting point. Tick each dimension once you have measured it on site.</p>
  </section>

  <section>
    <h4>Doors &amp; windows</h4>
    {#each p.openings as o (o.id)}
      <button class="op" class:sel={editor.selection?.id === o.id} onclick={() => (editor.selection = { kind: 'opening', id: o.id })}>
        {o.kind === 'door' ? '🚪' : o.kind === 'window' ? '🪟' : '⬚'} {o.kind} · {fmtLen(o.width, p.units, true)} · wall {p.walls.findIndex((w) => w.id === o.wallId) + 1}
      </button>
    {:else}
      <p class="muted small">None yet.</p>
    {/each}
    <p class="muted small">Select a wall to add a door, window or opening.</p>
  </section>

  {#if p.fixtures.length}
    <section>
      <h4>Scanned fixtures</h4>
      <p class="muted small">Recognised by the scan. Reference only — not part of the design.</p>
      {#each p.fixtures as f (f.id)}
        <div class="op">{f.category} <button class="link" onclick={() => editor.removeFixture(f.id)}>remove</button></div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .room { display: flex; flex-direction: column; gap: 18px; overflow: auto; }
  h4 { margin: 0 0 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: baseline; }
  .small { font-size: 11px; margin: 4px 0; }
  .layouts { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
  .layout { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); font-size: 12px; cursor: pointer; color: inherit; }
  .layout:hover { border-color: var(--accent); }
  .walls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .walls li { display: flex; align-items: center; gap: 6px; border-radius: 6px; padding: 2px 4px; }
  .walls li.sel { background: var(--accent-bg); }
  .wl { flex: 1; display: flex; justify-content: space-between; background: none; border: 0; padding: 6px 4px; cursor: pointer; color: inherit; font-size: 13px; }
  .wl.static { cursor: default; }
  .walls label { font-size: 12px; display: flex; align-items: center; gap: 2px; }
  .op { display: flex; justify-content: space-between; width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: 6px; padding: 5px 6px; font-size: 13px; text-transform: capitalize; cursor: pointer; color: inherit; }
  .op.sel { border-color: var(--accent); background: var(--accent-bg); }
  .link { background: none; border: 0; color: var(--accent-ink); cursor: pointer; font-size: 12px; }
</style>
