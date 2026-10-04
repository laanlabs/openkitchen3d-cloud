<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { carcasses, countertops, fronts, handles, product, catalogs } from '../catalog/catalog';
  import { cabinetPrice } from '../layout/runs';
  import { wallLength } from '../model/geometry';
  import { fmtLen, fmtShort, money } from '../model/units';
  import LengthInput from './LengthInput.svelte';
  import Swatches from './Swatches.svelte';
  import ProductThumb from './ProductThumb.svelte';

  let { editor }: { editor: Editor } = $props();
  const p = $derived(editor.project);
  const c = $derived(editor.selectedCabinet);
  const w = $derived(editor.selectedWall);
  const o = $derived(editor.selectedOpening);
  const prod = $derived(c ? product(c.productId) : undefined);
  let scope = $state<'selected' | 'run'>('selected');
  const cWarnings = $derived(c ? editor.warnings.filter((x) => x.cabinetIds.includes(c.id)) : []);
</script>

<div class="insp">
  {#if c}
    <header>
      {#if prod}<ProductThumb product={prod} size={48} />{/if}
      <div>
        <h3>{prod?.name ?? c.productId}</h3>
        <div class="muted mono">{c.sku}</div>
      </div>
    </header>
    {#each cWarnings as wn (wn.id)}
      <div class="warn {wn.severity}">{wn.message}</div>
    {/each}

    <section>
      <span class="label">Width</span>
      {#if prod && prod.variants.length > 1}
        <div class="chips">
          {#each prod.variants as v (v.sku)}
            <button class="chip" class:on={v.width === c.width} disabled={editor.readonly} onclick={() => editor.setWidth(c.id, v.width)}>{fmtShort(v.width, p.units)}</button>
          {/each}
        </div>
        <p class="muted small">Only sizes this catalog makes are offered.</p>
      {:else}
        <div>{fmtLen(c.width, p.units, true)}</div>
      {/if}
      <div class="grid2">
        <div><span class="label">Depth</span><div>{fmtLen(c.depth, p.units, true)}</div></div>
        <div><span class="label">Height</span><div>{fmtLen(c.height, p.units, true)}</div></div>
      </div>
    </section>

    {#if c.anchor.elevation >= 500 || c.family === 'wall'}
      <section>
        <span class="label">Height off floor (underside)</span>
        <LengthInput value={c.anchor.elevation} units={p.units} min={0} max={p.ceilingHeight - c.height} disabled={editor.readonly}
          onchange={(mm) => editor.updateCabinet(c.id, (x) => ({ ...x, anchor: { ...x.anchor, elevation: mm } }))} />
        <div class="chips">
          <button class="chip" onclick={() => editor.updateCabinet(c.id, (x) => ({ ...x, anchor: { ...x.anchor, elevation: Math.max(0, x.anchor.elevation - 50) } }))}>▼ 50</button>
          <button class="chip" onclick={() => editor.updateCabinet(c.id, (x) => ({ ...x, anchor: { ...x.anchor, elevation: Math.min(p.ceilingHeight - x.height, x.anchor.elevation + 50) } }))}>▲ 50</button>
          <button class="chip" onclick={() => editor.updateCabinet(c.id, (x) => ({ ...x, anchor: { ...x.anchor, elevation: p.ceilingHeight - x.height } }))}>To ceiling</button>
        </div>
      </section>
    {/if}

    {#if prod && (prod.fronts === 'doors' || prod.fronts === 'fridge' || prod.fronts === 'oven') && prod.variants.find((v) => v.width === c.width)?.doors !== 2}
      <section>
        <span class="label">Hinge side</span>
        <div class="seg">
          <button class:on={(c.configuration.hinge ?? 'left') === 'left'} onclick={() => editor.updateCabinet(c.id, (x) => ({ ...x, configuration: { ...x.configuration, hinge: 'left' } }))}>Left</button>
          <button class:on={c.configuration.hinge === 'right'} onclick={() => editor.updateCabinet(c.id, (x) => ({ ...x, configuration: { ...x.configuration, hinge: 'right' } }))}>Right</button>
        </div>
      </section>
    {/if}

    <section>
      <div class="row"><span class="label">Finish</span>
        <div class="seg small">
          <button class:on={scope === 'selected'} onclick={() => (scope = 'selected')}>This unit</button>
          <button class:on={scope === 'run'} onclick={() => (scope = 'run')}>Whole run</button>
        </div>
      </div>
      <span class="sub">Fronts</span>
      <Swatches list={fronts} label="Front finish" value={c.finishIds.front ?? p.kitchen.style.front} onpick={(id) => editor.applyStyle({ front: id }, scope)} />
      {#if c.family !== 'appliance'}
        <span class="sub">Handles</span>
        <Swatches list={handles} label="Handles" value={c.finishIds.handle ?? p.kitchen.style.handle} onpick={(id) => editor.applyStyle({ handle: id }, scope)} />
        <span class="sub">Carcass</span>
        <Swatches list={carcasses} label="Carcass" value={c.finishIds.carcass ?? p.kitchen.style.carcass} onpick={(id) => editor.applyStyle({ carcass: id }, scope)} />
      {/if}
    </section>

    <section>
      <div class="row"><span class="label">Price (estimate)</span><strong>{money(cabinetPrice(c, p), p.kitchen.currency)}</strong></div>
    </section>

    <div class="actions">
      <button class="btn" onclick={() => editor.rotate(c.id)} title="Rotate 90° (R)">⟳ Rotate</button>
      <button class="btn" onclick={() => editor.duplicate(c.id)} title="Duplicate (D)">⧉ Duplicate</button>
      <button class="btn danger" onclick={() => editor.remove(c.id)} title="Delete (Del)">🗑 Delete</button>
    </div>
    {#if c.wallId}
      <button class="link" onclick={() => { editor.elevationWallId = c.wallId!; editor.view = 'elevation'; }}>Show this wall's elevation →</button>
    {/if}
  {:else if w}
    {@const idx = p.walls.indexOf(w)}
    <header><div><h3>Wall {idx + 1}</h3><div class="muted">{w.verified ? 'Field-verified' : 'Not verified yet'}</div></div></header>
    <section>
      <span class="label">Inside length</span>
      <LengthInput value={wallLength(w) - w.thickness} units={p.units} min={300} max={30000} onchange={(mm) => editor.setWallLength(w.id, mm + w.thickness)} />
      <p class="muted small">Changing the length moves the shared corner; attached cabinets follow.</p>
      <label class="check"><input type="checkbox" checked={w.verified} onchange={(e) => editor.updateWall(w.id, { verified: (e.currentTarget as HTMLInputElement).checked })} /> Measured and verified on site</label>
    </section>
    <section>
      <span class="label">Thickness</span>
      <LengthInput value={w.thickness} units={p.units} min={50} max={600} onchange={(mm) => editor.updateWall(w.id, { thickness: mm })} />
    </section>
    <section>
      <span class="label">Add to this wall</span>
      <div class="chips">
        <button class="chip" onclick={() => editor.addOpening(w.id, 'door')}>+ Door</button>
        <button class="chip" onclick={() => editor.addOpening(w.id, 'window')}>+ Window</button>
        <button class="chip" onclick={() => editor.addOpening(w.id, 'opening')}>+ Opening</button>
      </div>
    </section>
    <button class="link" onclick={() => { editor.elevationWallId = w.id; editor.view = 'elevation'; }}>Show elevation →</button>
  {:else if o}
    {@const wall = p.walls.find((x) => x.id === o.wallId)}
    <header><div><h3>{o.kind === 'door' ? 'Door' : o.kind === 'window' ? 'Window' : 'Opening'}</h3><div class="muted">Drag it along the wall on the plan</div></div></header>
    <section class="grid2">
      <div><span class="label">Width</span><LengthInput value={o.width} units={p.units} min={300} max={6000} onchange={(mm) => editor.updateOpening(o.id, { width: mm })} /></div>
      <div><span class="label">Height</span><LengthInput value={o.height} units={p.units} min={300} max={p.ceilingHeight} onchange={(mm) => editor.updateOpening(o.id, { height: mm })} /></div>
      {#if o.kind === 'window'}
        <div><span class="label">Sill height</span><LengthInput value={o.sillHeight} units={p.units} min={0} max={p.ceilingHeight - o.height} onchange={(mm) => editor.updateOpening(o.id, { sillHeight: mm })} /></div>
      {/if}
      {#if wall}
        <div><span class="label">From wall start</span><LengthInput value={o.position * wallLength(wall) - o.width / 2 - wall.thickness / 2} units={p.units} min={0} max={wallLength(wall)} onchange={(mm) => editor.updateOpening(o.id, { position: (mm + o.width / 2 + wall.thickness / 2) / wallLength(wall) })} /></div>
      {/if}
    </section>
    {#if o.kind === 'door'}
      <section>
        <span class="label">Hinge</span>
        <div class="seg">
          <button class:on={o.hingeLeft !== false} onclick={() => editor.updateOpening(o.id, { hingeLeft: true })}>Left</button>
          <button class:on={o.hingeLeft === false} onclick={() => editor.updateOpening(o.id, { hingeLeft: false })}>Right</button>
        </div>
      </section>
    {/if}
    <div class="actions"><button class="btn danger" onclick={() => editor.removeOpening(o.id)}>🗑 Delete</button></div>
  {:else}
    <header><div><h3>Project</h3><div class="muted">Select a cabinet, wall, door or window to edit it.</div></div></header>
    <section>
      <span class="label">Name</span>
      <input type="text" value={p.name} disabled={editor.readonly} onchange={(e) => editor.rename((e.currentTarget as HTMLInputElement).value || 'My kitchen')} />
    </section>
    <section>
      <span class="label">Units</span>
      <div class="seg">
        <button class:on={p.units === 'metric'} onclick={() => editor.update({ units: 'metric' })}>Metric</button>
        <button class:on={p.units === 'imperial'} onclick={() => editor.update({ units: 'imperial' })}>Imperial</button>
      </div>
    </section>
    <section>
      <span class="label">Catalog</span>
      <select value={p.catalogId} onchange={(e) => editor.update({ catalogId: (e.currentTarget as HTMLSelectElement).value as never })}>
        {#each catalogs as cat (cat.id)}<option value={cat.id}>{cat.name}</option>{/each}
      </select>
      <p class="muted small">{catalogs.find((x) => x.id === p.catalogId)?.blurb}. Existing units keep their size.</p>
    </section>
    <section>
      <span class="label">Ceiling height</span>
      <LengthInput value={p.ceilingHeight} units={p.units} min={1800} max={5000} onchange={(mm) => editor.setCeiling(mm)} />
      <label class="check"><input type="checkbox" checked={p.ceilingVerified} onchange={(e) => editor.setCeiling(p.ceilingHeight, (e.currentTarget as HTMLInputElement).checked)} /> Verified on site</label>
    </section>
    <section class="grid2">
      <div><span class="label">Worktop thickness</span><LengthInput value={p.kitchen.countertop.thickness} units={p.units} min={10} max={100} onchange={(mm) => editor.setCountertop({ thickness: mm })} /></div>
      <div><span class="label">Front overhang</span><LengthInput value={p.kitchen.countertop.overhang} units={p.units} min={0} max={400} onchange={(mm) => editor.setCountertop({ overhang: mm })} /></div>
    </section>
    <section>
      <span class="label">Worktop</span>
      <Swatches list={countertops} label="Worktop" value={p.kitchen.style.countertop} onpick={(id) => editor.applyStyle({ countertop: id })} />
    </section>
  {/if}
</div>

<style>
  .insp { display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; gap: 10px; align-items: center; }
  h3 { margin: 0; font-size: 15px; }
  section { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 11px; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .04em; }
  .sub { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
  .small { font-size: 11px; margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .actions .btn { flex: 1; }
  .warn { font-size: 12px; padding: 6px 8px; border-radius: 6px; background: var(--warn-bg); color: var(--warn-ink); }
  .warn.error { background: var(--danger-bg); color: var(--danger); }
  .warn.info { background: var(--info-bg); color: var(--info-ink); }
  .check { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .link { background: none; border: 0; color: var(--accent-ink); padding: 0; text-align: left; cursor: pointer; font-weight: 600; }
</style>
