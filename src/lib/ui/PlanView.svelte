<script lang="ts">
  import type { Editor } from './editor.svelte';
  import type { KitchenCabinetInstance, Vec2, Wall } from '../model/types';
  import {
    add, alongWall, cabinetCorners, footprint, innerPolygon, inwardNormal, perp, projectBounds, scale, sub,
    wallDir, wallLength, wallPoint, cabinetCenter, rad, wallAngle
  } from '../model/geometry';
  import { fronts, product, productsFor, swatch, variantFor } from '../catalog/catalog';
  import { fmtLen } from '../model/units';
  import { levelOf } from '../layout/runs';

  let { editor }: { editor: Editor } = $props();

  let svg: SVGSVGElement;
  let view = $state({ x: -500, y: -500, w: 6000, h: 5000 });
  let size = $state({ w: 800, h: 600 });
  let fittedFor = '';

  const p = $derived(editor.project);
  const units = $derived(p.units);
  const k = $derived(Math.max(view.w / size.w, view.h / size.h)); // mm per px

  function fit() {
    const b = projectBounds(p);
    const pad = 900;
    const w = b.max.x - b.min.x + pad * 2, h = b.max.y - b.min.y + pad * 2;
    const aspect = size.w / size.h;
    const vw = Math.max(w, h * aspect), vh = vw / aspect;
    view = { x: (b.min.x + b.max.x) / 2 - vw / 2, y: (b.min.y + b.max.y) / 2 - vh / 2, w: vw, h: vh };
  }

  $effect(() => {
    if (fittedFor !== p.id && size.w > 10) { fittedFor = p.id; fit(); }
  });

  function toPlan(e: { clientX: number; clientY: number }): Vec2 {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  }

  // ---- pointer handling: drag cabinets/openings, pan, pinch ----
  type Mode =
    | { t: 'cabinet'; id: string; off: Vec2 }
    | { t: 'opening'; id: string; wall: Wall }
    | { t: 'pan'; start: Vec2; view: typeof view; moved: boolean }
    | null;
  let mode: Mode = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; view: typeof view; mid: Vec2 } | null = null;

  function onCabinetDown(e: PointerEvent, c: KitchenCabinetInstance) {
    if (e.button !== 0) return;
    e.stopPropagation();
    editor.selection = { kind: 'cabinet', id: c.id };
    if (editor.readonly) return;
    const pt = toPlan(e);
    mode = { t: 'cabinet', id: c.id, off: sub(cabinetCenter(c), pt) };
    svg.setPointerCapture(e.pointerId);
  }

  function onOpeningDown(e: PointerEvent, id: string, wall: Wall) {
    e.stopPropagation();
    editor.selection = { kind: 'opening', id };
    if (editor.readonly) return;
    mode = { t: 'opening', id, wall };
    svg.setPointerCapture(e.pointerId);
  }

  function onWallDown(e: PointerEvent, w: Wall) {
    e.stopPropagation();
    editor.selection = { kind: 'wall', id: w.id };
    editor.elevationWallId = w.id;
  }

  function onDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: { ...view }, mid: toPlan({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
      mode = null;
      return;
    }
    mode = { t: 'pan', start: { x: e.clientX, y: e.clientY }, view: { ...view }, moved: false };
    svg.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const f = pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const w = pinch.view.w * f, h = pinch.view.h * f;
      view = { x: pinch.mid.x - (pinch.mid.x - pinch.view.x) * f, y: pinch.mid.y - (pinch.mid.y - pinch.view.y) * f, w, h };
      return;
    }
    if (!mode) return;
    if (mode.t === 'cabinet') {
      editor.dragTo(mode.id, add(toPlan(e), mode.off));
    } else if (mode.t === 'opening') {
      const s = alongWall(mode.wall, toPlan(e));
      editor.moveOpening(mode.id, s / wallLength(mode.wall));
    } else if (mode.t === 'pan') {
      const dx = (e.clientX - mode.start.x) * k, dy = (e.clientY - mode.start.y) * k;
      if (Math.abs(dx) + Math.abs(dy) > 3 * k) mode.moved = true;
      view = { ...mode.view, x: mode.view.x - dx, y: mode.view.y - dy };
    }
  }

  function onUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (mode?.t === 'cabinet' || mode?.t === 'opening') editor.endDrag();
    else if (mode?.t === 'pan' && !mode.moved) editor.selection = null;
    mode = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const pt = toPlan(e);
    const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const w = Math.min(60000, Math.max(800, view.w * f));
    const r = w / view.w;
    view = { x: pt.x - (pt.x - view.x) * r, y: pt.y - (pt.y - view.y) * r, w, h: view.h * r };
  }

  // ---- drop from catalog ----
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer?.getData('application/x-okd-product');
    if (!data) return;
    const { id, width } = JSON.parse(data);
    const prod = productsFor(p.catalogId).find((x) => x.id === id) ?? product(id);
    if (!prod) return;
    editor.addProduct(prod, variantFor(prod, width), toPlan(e));
  }

  // ---- geometry helpers for drawing ----
  const pts = (q: Vec2[]) => q.map((a) => `${a.x.toFixed(1)},${a.y.toFixed(1)}`).join(' ');
  function wallQuad(w: Wall): Vec2[] {
    const n = scale(perp(wallDir(w)), w.thickness / 2);
    return [sub(w.start, n), sub(w.end, n), add(w.end, n), add(w.start, n)];
  }
  const floor = $derived(innerPolygon(p));
  const sortedCabs = $derived(
    [...p.kitchen.cabinets].sort((a, b) => Number(levelOf(a) === 'wall') - Number(levelOf(b) === 'wall'))
  );

  function finishHex(c: KitchenCabinetInstance) {
    return swatch(fronts, c.finishIds.front ?? p.kitchen.style.front).hex;
  }

  function doorArc(o: { position: number; width: number; hingeLeft?: boolean }, w: Wall) {
    const n = inwardNormal(p, w);
    const d = wallDir(w);
    const c = wallPoint(w, o.position);
    const face = add(c, scale(n, w.thickness / 2));
    const hingeSide = o.hingeLeft === false ? 1 : -1;
    const hinge = add(face, scale(d, (hingeSide * o.width) / 2));
    const closed = add(face, scale(d, (-hingeSide * o.width) / 2));
    const open = add(hinge, scale(n, o.width));
    const sweep = (d.x * n.y - d.y * n.x) * hingeSide > 0 ? 0 : 1;
    return { hinge, closed, open, sweep };
  }

  function wallDim(w: Wall) {
    const n = inwardNormal(p, w);
    const out = scale(n, -(w.thickness / 2 + 280));
    const L = wallLength(w);
    const inner = L - w.thickness; // inside face length for square corners
    const a = add(add(w.start, scale(wallDir(w), w.thickness / 2)), out);
    const b = add(add(w.end, scale(wallDir(w), -w.thickness / 2)), out);
    let ang = (wallAngle(w) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    const mid = scale(add(a, b), 0.5);
    return { a, b, mid, ang, label: fmtLen(inner, units, true), tick: scale(n, 90) };
  }

  function label(c: KitchenCabinetInstance) {
    let ang = c.rotation;
    if (ang > 90 && ang <= 270) ang -= 180;
    return { ang, text: c.sku };
  }
</script>

<div class="plan" bind:clientWidth={size.w} bind:clientHeight={size.h}>
  <svg
    bind:this={svg}
    viewBox="{view.x} {view.y} {view.w} {view.h}"
    preserveAspectRatio="xMidYMid meet"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onwheel={onWheel}
    ondragover={(e) => e.preventDefault()}
    ondrop={onDrop}
    role="application"
    aria-label="Floor plan"
  >
    <defs>
      <pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
        <path d="M500 0H0V500" fill="none" stroke="var(--grid)" stroke-width={k * 1} />
      </pattern>
      <pattern id="hatch" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="60" stroke="#f59e0b" stroke-width="10" opacity=".35" />
      </pattern>
    </defs>
    <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#grid)" />

    {#if floor}<polygon points={pts(floor)} fill="var(--floor)" />{/if}

    {#each p.fixtures as f (f.id)}
      <polygon points={pts(footprint(f.center, f.rotation, f.width, f.depth))} fill="url(#hatch)" stroke="#f59e0b" stroke-dasharray="{k * 6} {k * 4}" stroke-width={k * 1.5}>
        <title>Existing {f.category} (scanned reference)</title>
      </polygon>
    {/each}

    {#each editor.parts.filter((g) => g.kind === 'countertop') as g (g.id)}
      <polygon points={pts(footprint(g.center, g.rotation, g.width, g.depth))} fill="var(--counter)" stroke="var(--line-soft)" stroke-width={k} />
    {/each}

    {#each sortedCabs as c (c.id)}
      {@const wallLevel = levelOf(c) === 'wall'}
      {@const sel = editor.selection?.id === c.id}
      {@const corners = cabinetCorners(c)}
      {@const l = label(c)}
      {@const center = cabinetCenter(c)}
      <g class="cab" class:sel onpointerdown={(e) => onCabinetDown(e, c)} role="button" tabindex="-1" aria-label={c.sku}>
        <polygon
          points={pts(corners)}
          fill={wallLevel ? 'transparent' : finishHex(c)}
          fill-opacity={wallLevel ? 0 : 0.55}
          stroke={sel ? 'var(--accent)' : 'var(--line)'}
          stroke-width={k * (sel ? 2.5 : 1.2)}
          stroke-dasharray={wallLevel ? `${k * 6} ${k * 4}` : undefined}
        />
        <!-- front edge marker -->
        <line x1={corners[2].x} y1={corners[2].y} x2={corners[3].x} y2={corners[3].y} stroke={sel ? 'var(--accent)' : 'var(--line)'} stroke-width={k * (wallLevel ? 1.2 : 2.5)} stroke-dasharray={wallLevel ? `${k * 6} ${k * 4}` : undefined} />
        {#if c.width / k > 34 && !wallLevel}
          <text x={center.x} y={center.y} transform="rotate({l.ang} {center.x} {center.y})" font-size={k * 10.5} text-anchor="middle" dominant-baseline="middle" class="sku">{l.text}</text>
        {/if}
      </g>
    {/each}

    {#each editor.parts.filter((g) => g.kind !== 'countertop' && g.elevation < 500) as g (g.id)}
      <polygon points={pts(footprint(g.center, g.rotation, g.width, g.depth))} fill="var(--auto)" stroke="var(--line-soft)" stroke-width={k}>
        <title>{g.name} (auto-added)</title>
      </polygon>
    {/each}

    {#each p.walls as w (w.id)}
      <polygon
        points={pts(wallQuad(w))}
        class="wall"
        class:sel={editor.selection?.id === w.id}
        onpointerdown={(e) => onWallDown(e, w)}
        role="button"
        tabindex="-1"
        aria-label="Wall"
      />
    {/each}

    {#each p.openings as o (o.id)}
      {@const w = p.walls.find((x) => x.id === o.wallId)}
      {#if w}
        {@const c = wallPoint(w, o.position)}
        {@const d = wallDir(w)}
        {@const n = perp(d)}
        {@const half = scale(d, o.width / 2)}
        {@const t = scale(n, w.thickness / 2 + 1)}
        {@const quad = [sub(sub(c, half), t), sub(add(c, half), t), add(add(c, half), t), add(sub(c, half), t)]}
        {@const sel = editor.selection?.id === o.id}
        <g class="opening" onpointerdown={(e) => onOpeningDown(e, o.id, w)} role="button" tabindex="-1" aria-label={o.kind}>
          <polygon points={pts(quad)} fill="var(--bg-plan)" stroke={sel ? 'var(--accent)' : 'none'} stroke-width={k * 2} />
          {#if o.kind === 'window'}
            <line x1={sub(c, half).x} y1={sub(c, half).y} x2={add(c, half).x} y2={add(c, half).y} stroke="var(--window)" stroke-width={k * 3} />
            <polygon points={pts(quad)} fill="none" stroke="var(--line)" stroke-width={k} />
          {:else if o.kind === 'door'}
            {@const a = doorArc(o, w)}
            <line x1={a.hinge.x} y1={a.hinge.y} x2={a.open.x} y2={a.open.y} stroke="var(--line)" stroke-width={k * 1.5} />
            <path d="M{a.open.x} {a.open.y} A{o.width} {o.width} 0 0 {a.sweep} {a.closed.x} {a.closed.y}" fill="none" stroke="var(--line-soft)" stroke-width={k} stroke-dasharray="{k * 4} {k * 3}" />
          {/if}
        </g>
      {/if}
    {/each}

    {#each p.walls as w (w.id)}
      {@const dm = wallDim(w)}
      <g class="dim" pointer-events="none">
        <line x1={dm.a.x} y1={dm.a.y} x2={dm.b.x} y2={dm.b.y} />
        <line x1={dm.a.x - dm.tick.x} y1={dm.a.y - dm.tick.y} x2={dm.a.x + dm.tick.x} y2={dm.a.y + dm.tick.y} />
        <line x1={dm.b.x - dm.tick.x} y1={dm.b.y - dm.tick.y} x2={dm.b.x + dm.tick.x} y2={dm.b.y + dm.tick.y} />
        <rect x={dm.mid.x - k * 34} y={dm.mid.y - k * 9} width={k * 68} height={k * 18} rx={k * 4} transform="rotate({dm.ang} {dm.mid.x} {dm.mid.y})" class:unverified={!w.verified} />
        <text x={dm.mid.x} y={dm.mid.y} font-size={k * 11} text-anchor="middle" dominant-baseline="central" transform="rotate({dm.ang} {dm.mid.x} {dm.mid.y})">{dm.label}</text>
      </g>
    {/each}
  </svg>

  <div class="tools">
    <button class="chip" onclick={fit}>Fit</button>
    <button class="chip" class:on={editor.snap} onclick={() => (editor.snap = !editor.snap)} title="Snap to walls and neighbours">Snap {editor.snap ? 'on' : 'off'}</button>
  </div>
  <div class="legend">
    <span><i class="sw base"></i>Base</span><span><i class="sw wall"></i>Wall unit</span><span><i class="sw auto"></i>Auto-added</span>
  </div>
</div>

<style>
  .plan { position: relative; width: 100%; height: 100%; background: var(--bg-plan); overflow: hidden; }
  svg { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; cursor: grab; }
  svg:active { cursor: grabbing; }
  .wall { fill: var(--wall); cursor: pointer; }
  .wall.sel { fill: var(--accent); }
  .cab { cursor: move; }
  .opening { cursor: ew-resize; }
  .sku { fill: var(--ink); font-weight: 600; pointer-events: none; font-family: var(--font); }
  .dim line { stroke: var(--ink-soft); stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .dim rect { fill: var(--panel); stroke: var(--line-soft); vector-effect: non-scaling-stroke; }
  .dim rect.unverified { stroke: var(--warn); stroke-dasharray: 3 2; }
  .dim text { fill: var(--ink); font-family: var(--font); font-weight: 600; }
  .tools { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; }
  .legend { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 10px; font-size: 11px; color: var(--ink-soft); background: color-mix(in srgb, var(--panel) 85%, transparent); padding: 4px 8px; border-radius: 6px; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .sw { width: 12px; height: 8px; border: 1px solid var(--line); display: inline-block; }
  .sw.base { background: #ddd; }
  .sw.wall { border-style: dashed; }
  .sw.auto { background: var(--auto); }
</style>
