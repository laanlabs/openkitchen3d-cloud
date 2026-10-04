<script lang="ts">
  import type { Editor } from './editor.svelte';
  import type { KitchenCabinetInstance, Wall } from '../model/types';
  import { alongWall, cabinetCenter, dot, inwardNormal, wallDir, wallLength } from '../model/geometry';
  import { fronts as frontSwatches, product, swatch, variantFor, countertops, TOE_KICK } from '../catalog/catalog';
  import { frontLayout } from '../scene/build';
  import { fmtLen, fmtShort } from '../model/units';

  let { editor, wallId, print = false }: { editor: Editor; wallId?: string; print?: boolean } = $props();

  const p = $derived(editor.project);
  const wall = $derived(p.walls.find((w) => w.id === (wallId ?? editor.elevationWallId)) ?? p.walls[0]);
  const wallIndex = $derived(p.walls.indexOf(wall));

  let svg: SVGSVGElement | undefined = $state();

  /** x in the elevation (mm from the inner-left corner as seen from inside the room). */
  function mapper(w: Wall) {
    const L = wallLength(w);
    const n = inwardNormal(p, w);
    const right = { x: n.y, y: -n.x };
    const flip = dot(right, wallDir(w)) < 0;
    return (s: number) => (flip ? L - s : s) - w.thickness / 2;
  }

  const geom = $derived.by(() => {
    if (!wall) return null;
    const L = wallLength(wall);
    const X = mapper(wall);
    const inner = L - wall.thickness;
    const H = p.ceilingHeight;
    const cabs = p.kitchen.cabinets
      .filter((c) => c.wallId === wall.id)
      .map((c) => {
        const s = alongWall(wall, cabinetCenter(c));
        const x0 = Math.min(X(s - c.width / 2), X(s + c.width / 2));
        return { c, x0, x1: x0 + c.width, s };
      })
      .sort((a, b) => a.c.anchor.elevation - b.c.anchor.elevation || a.x0 - b.x0);
    const ids = new Set(cabs.map((x) => x.c.id));
    const parts = editor.parts
      .filter((g) => g.sourceIds.some((id) => ids.has(id)))
      .map((g) => {
        const s = alongWall(wall, g.center);
        const x0 = Math.min(X(s - g.width / 2), X(s + g.width / 2));
        return { g, x0, x1: x0 + g.width };
      });
    const openings = p.openings
      .filter((o) => o.wallId === wall.id)
      .map((o) => {
        const s = o.position * L;
        const x0 = Math.min(X(s - o.width / 2), X(s + o.width / 2));
        return { o, x0, x1: x0 + o.width };
      });
    // Dimension chains: base level and wall level.
    const chain = (list: typeof cabs) => {
      const pts = new Set<number>([0, inner]);
      for (const x of list) { pts.add(Math.round(x.x0)); pts.add(Math.round(x.x1)); }
      return [...pts].filter((v) => v >= -1 && v <= inner + 1).sort((a, b) => a - b);
    };
    return {
      inner, H, cabs, parts, openings,
      baseChain: chain(cabs.filter((x) => x.c.anchor.elevation < 500)),
      wallChain: chain(cabs.filter((x) => x.c.anchor.elevation >= 500)),
      flipX: X
    };
  });

  const heights = $derived.by(() => {
    if (!geom) return [] as number[];
    const zs = [0, geom.H, ...geom.cabs.flatMap((x) => [x.c.anchor.elevation, x.c.anchor.elevation + x.c.height])];
    for (const x of geom.parts) if (x.g.kind === 'countertop') zs.push(x.g.elevation + x.g.height);
    return [...new Set(zs.map(Math.round))].sort((a, b) => a - b);
  });

  const pad = { l: 420, r: 520, t: 380, b: 640 };
  const Y = (z: number) => (geom?.H ?? 2400) - z;

  // ---- dragging ----
  let drag: { id: string; startX: number; startS: number; startElev: number; startY: number; flip: number; wallUnit: boolean } | null = null;

  function toSvg(e: PointerEvent) {
    const pt = svg!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg!.getScreenCTM()!.inverse());
  }

  function onDown(e: PointerEvent, c: KitchenCabinetInstance, s: number) {
    e.stopPropagation();
    editor.selection = { kind: 'cabinet', id: c.id };
    if (editor.readonly || print) return;
    const pt = toSvg(e);
    const X = mapper(wall);
    const flip = X(1) - X(0) > 0 ? 1 : -1;
    drag = { id: c.id, startX: pt.x, startS: s, startElev: c.anchor.elevation, startY: pt.y, flip, wallUnit: c.anchor.elevation >= 500 };
    svg!.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!drag) return;
    const pt = toSvg(e);
    const ds = (pt.x - drag.startX) * drag.flip;
    let s = drag.startS + ds;
    // snap to 10 mm
    s = Math.round(s / 10) * 10;
    const elev = drag.wallUnit ? Math.round((drag.startElev - (pt.y - drag.startY)) / 10) * 10 : undefined;
    editor.slideOnWall(drag.id, s, elev);
  }
  function onUp() {
    if (drag) editor.endDrag();
    drag = null;
  }

  const finish = (c: KitchenCabinetInstance) => swatch(frontSwatches, c.finishIds.front ?? p.kitchen.style.front).hex;
  const topHex = $derived(swatch(countertops, p.kitchen.style.countertop).hex);

  function frontsOf(c: KitchenCabinetInstance) {
    const prod = product(c.productId);
    if (!prod) return [];
    const vr = variantFor(prod, c.width);
    const wallUnit = c.anchor.elevation >= 500;
    const kick = c.anchor.elevation < 50 && !wallUnit && c.family !== 'appliance' && prod.fronts !== 'panel' ? TOE_KICK : 0;
    const fl = frontLayout(prod.fronts, vr.doors, vr.drawers, c.width / 1000, (c.height - kick) / 1000, wallUnit, (c.configuration.hinge as 'left' | 'right') ?? 'left');
    return fl.map((f) => ({ ...f, x: f.x * 1000, y: f.y * 1000 + kick, w: f.w * 1000, h: f.h * 1000 })).concat([]).map((f) => ({ ...f, kick }));
  }
</script>

{#if wall && geom}
  <div class="elev" class:print>
    {#if !print}
      <div class="bar">
        <button class="chip" onclick={() => (editor.elevationWallId = p.walls[(wallIndex - 1 + p.walls.length) % p.walls.length].id)} aria-label="Previous wall">‹</button>
        <strong>Wall {wallIndex + 1}</strong>
        <span class="muted">{fmtLen(geom.inner, p.units, true)} · {p.kitchen.cabinets.filter((c) => c.wallId === wall.id).length} units</span>
        <button class="chip" onclick={() => (editor.elevationWallId = p.walls[(wallIndex + 1) % p.walls.length].id)} aria-label="Next wall">›</button>
        <span class="hint muted">Drag units along the wall · drag wall units up/down</span>
      </div>
    {/if}
    <svg
      bind:this={svg}
      viewBox="{-pad.l} {-pad.t} {geom.inner + pad.l + pad.r} {geom.H + pad.t + pad.b}"
      preserveAspectRatio="xMidYMid meet"
      onpointermove={onMove}
      onpointerup={onUp}
      onpointerdown={() => (editor.selection = null)}
      role="application"
      aria-label="Wall elevation"
    >
      <rect x="0" y="0" width={geom.inner} height={geom.H} class="wallface" />
      {#each geom.openings as { o, x0, x1 } (o.id)}
        {@const z0 = o.kind === 'window' ? o.sillHeight : 0}
        <rect x={x0} y={Y(z0 + o.height)} width={x1 - x0} height={o.height} class={o.kind === 'window' ? 'window' : 'door'} />
        {#if o.kind === 'window'}
          <line x1={(x0 + x1) / 2} y1={Y(z0 + o.height)} x2={(x0 + x1) / 2} y2={Y(z0)} class="mullion" />
        {/if}
      {/each}

      {#each geom.parts.filter((x) => x.g.kind !== 'countertop') as { g, x0, x1 } (g.id)}
        <rect x={x0} y={Y(g.elevation + g.height)} width={x1 - x0} height={g.height} class="auto" />
      {/each}

      {#each geom.cabs as { c, x0, x1, s } (c.id)}
        {@const sel = editor.selection?.id === c.id}
        {@const hex = finish(c)}
        <g class="unit" class:sel onpointerdown={(e) => onDown(e, c, s)} role="button" tabindex="-1" aria-label={c.sku}>
          <rect x={x0} y={Y(c.anchor.elevation + c.height)} width={x1 - x0} height={c.height} fill={hex} class="body" />
          {#each frontsOf(c) as f, i (i)}
            {@const cx = (x0 + x1) / 2 + f.x}
            <rect x={cx - f.w / 2 + 2} y={Y(c.anchor.elevation + f.y + f.h / 2) + 2} width={f.w - 4} height={f.h - 4} fill={f.kind === 'glass' ? '#2b3138' : hex} class="front" />
            {#if f.kind === 'door' && f.hinge !== 'top'}
              <!-- hinge triangle -->
              {@const hx = f.hinge === 'left' ? cx - f.w / 2 + 2 : cx + f.w / 2 - 2}
              {@const ox = f.hinge === 'left' ? cx + f.w / 2 - 2 : cx - f.w / 2 + 2}
              <polyline points="{ox},{Y(c.anchor.elevation + f.y + f.h / 2) + 2} {hx},{Y(c.anchor.elevation + f.y)} {ox},{Y(c.anchor.elevation + f.y - f.h / 2) - 2}" class="swing" />
            {/if}
          {/each}
          {#if c.anchor.elevation < 50 && frontsOf(c)[0]?.kick}
            <rect x={x0 + 30} y={Y(TOE_KICK)} width={x1 - x0 - 60} height={TOE_KICK} class="kick" />
          {/if}
          <text x={(x0 + x1) / 2} y={Y(c.anchor.elevation + c.height) - 30} class="sku" text-anchor="middle">{c.sku}</text>
        </g>
      {/each}

      {#each geom.parts.filter((x) => x.g.kind === 'countertop') as { g, x0, x1 } (g.id)}
        <rect x={x0} y={Y(g.elevation + g.height)} width={x1 - x0} height={g.height} fill={topHex} class="top" />
      {/each}

      <line x1={-pad.l * 0.6} y1={geom.H} x2={geom.inner + pad.r * 0.6} y2={geom.H} class="floor" />

      <!-- dimension chains -->
      {#each [{ chain: geom.baseChain, y: geom.H + 200 }, { chain: geom.wallChain, y: -170 }] as row}
        {#if row.chain.length > 2}
          <g class="dim">
            <line x1={row.chain[0]} y1={row.y} x2={row.chain[row.chain.length - 1]} y2={row.y} />
            {#each row.chain as x, i}
              <line x1={x} y1={row.y - 50} x2={x} y2={row.y + 50} />
              {#if i > 0 && x - row.chain[i - 1] > 40}
                <text x={(x + row.chain[i - 1]) / 2} y={row.y - 30} text-anchor="middle">{fmtShort(x - row.chain[i - 1], p.units)}</text>
              {/if}
            {/each}
          </g>
        {/if}
      {/each}
      <g class="dim">
        <line x1="0" y1={geom.H + 450} x2={geom.inner} y2={geom.H + 450} />
        <line x1="0" y1={geom.H + 400} x2="0" y2={geom.H + 500} />
        <line x1={geom.inner} y1={geom.H + 400} x2={geom.inner} y2={geom.H + 500} />
        <text x={geom.inner / 2} y={geom.H + 420} text-anchor="middle" class="strong">{fmtLen(geom.inner, p.units, true)}</text>
      </g>
      <!-- heights -->
      <g class="dim">
        {#each heights as z, i (z)}
          {@const arr = heights}
          <line x1={geom.inner + 180} y1={Y(z)} x2={geom.inner + 280} y2={Y(z)} />
          {#if i > 0}
            <line x1={geom.inner + 230} y1={Y(z)} x2={geom.inner + 230} y2={Y(arr[i - 1])} />
            {#if z - arr[i - 1] > 60}
              <text x={geom.inner + 300} y={Y((z + arr[i - 1]) / 2)} dominant-baseline="middle">{fmtShort(z - arr[i - 1], p.units)}</text>
            {/if}
          {/if}
        {/each}
      </g>
    </svg>
  </div>
{:else}
  <div class="empty muted">Add walls to see elevations.</div>
{/if}

<style>
  .elev { display: flex; flex-direction: column; height: 100%; background: var(--bg-plan); }
  .elev.print { background: white; height: auto; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--panel); font-size: 13px; }
  .hint { margin-left: auto; font-size: 12px; }
  svg { flex: 1; width: 100%; min-height: 0; touch-action: none; user-select: none; }
  .print svg { height: 9cm; }
  .wallface { fill: var(--wallface); stroke: var(--line-soft); stroke-width: 6; }
  .window { fill: #cfe8f1; stroke: var(--line); stroke-width: 8; }
  .door { fill: var(--bg-plan); stroke: var(--line); stroke-width: 8; }
  .mullion { stroke: var(--line); stroke-width: 6; }
  .body { stroke: var(--line); stroke-width: 6; }
  .front { stroke: var(--line); stroke-width: 4; }
  .swing { fill: none; stroke: var(--line-soft); stroke-width: 3; stroke-dasharray: 18 12; }
  .kick { fill: #2a2b2e; }
  .top { stroke: var(--line); stroke-width: 5; }
  .auto { fill: var(--auto); stroke: var(--line); stroke-width: 4; }
  .unit { cursor: grab; }
  .unit.sel .body, .unit.sel .front { stroke: var(--accent); stroke-width: 12; }
  .sku { font-size: 64px; fill: var(--ink-soft); font-family: var(--font); font-weight: 600; pointer-events: none; }
  .floor { stroke: var(--ink); stroke-width: 12; }
  .dim line { stroke: var(--ink-soft); stroke-width: 4; }
  .dim text { font-size: 70px; fill: var(--ink); font-family: var(--font); }
  .dim text.strong { font-weight: 700; font-size: 80px; }
  .empty { padding: 40px; text-align: center; }
</style>
