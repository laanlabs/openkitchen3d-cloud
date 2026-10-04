<script lang="ts">
  import type { Project } from '../model/types';
  import { cabinetCorners, innerPolygon, perp, projectBounds, scale, sub, add, wallDir } from '../model/geometry';
  import { fronts, swatch } from '../catalog/catalog';
  import { levelOf } from '../layout/runs';

  let { project, height = 120 }: { project: Project; height?: number } = $props();
  const b = $derived(projectBounds(project));
  const pad = 300;
  const pts = (q: { x: number; y: number }[]) => q.map((a) => `${a.x},${a.y}`).join(' ');
  const floor = $derived(innerPolygon(project));
  const hex = $derived(swatch(fronts, project.kitchen.style.front).hex);
</script>

<svg viewBox="{b.min.x - pad} {b.min.y - pad} {b.max.x - b.min.x + pad * 2} {b.max.y - b.min.y + pad * 2}" style="height:{height}px" aria-hidden="true">
  {#if floor}<polygon points={pts(floor)} fill="var(--floor)" />{/if}
  {#each project.kitchen.cabinets.filter((c) => levelOf(c) !== 'wall') as c (c.id)}
    <polygon points={pts(cabinetCorners(c))} fill={c.family === 'appliance' ? '#c9ccd0' : hex} stroke="var(--line)" stroke-width="12" />
  {/each}
  {#each project.walls as w (w.id)}
    {@const n = scale(perp(wallDir(w)), w.thickness / 2)}
    <polygon points={pts([sub(w.start, n), sub(w.end, n), add(w.end, n), add(w.start, n)])} fill="var(--wall)" />
  {/each}
</svg>

<style>
  svg { width: 100%; display: block; }
</style>
