<script lang="ts">
  import type { Product } from '../catalog/catalog';
  import { defaultVariant, TOE_KICK } from '../catalog/catalog';
  import { frontLayout } from '../scene/build';

  let { product, hex = '#f2f1ec', size = 56 }: { product: Product; hex?: string; size?: number } = $props();

  const v = $derived(defaultVariant(product));
  const wallUnit = $derived(product.elevation >= 500);
  const kick = $derived(!wallUnit && product.family !== 'appliance' && product.fronts !== 'panel' && product.fronts !== 'hood' ? TOE_KICK : 0);
  const fronts = $derived(
    frontLayout(product.fronts, v.doors, v.drawers, v.width / 1000, (v.height - kick) / 1000, wallUnit, 'left').map((f) => ({
      ...f, x: f.x * 1000 + v.width / 2, y: v.height - (f.y * 1000 + kick), w: f.w * 1000, h: f.h * 1000
    }))
  );
  const fill = $derived(product.family === 'appliance' && product.fronts !== 'dishwasher' ? '#c9ccd0' : hex);
  const S = $derived(Math.max(v.width, v.height) * 1.08);
</script>

<svg width={size} height={size} viewBox="{v.width / 2 - S / 2} {v.height / 2 - S / 2} {S} {S}" aria-hidden="true">
  {#if product.fronts === 'hood'}
    <polygon points="{v.width * 0.38},0 {v.width * 0.62},0 {v.width * 0.62},{v.height * 0.45} {v.width},{v.height * 0.75} {v.width},{v.height} 0,{v.height} 0,{v.height * 0.75} {v.width * 0.38},{v.height * 0.45}" fill={fill} stroke="#3a3d42" stroke-width={S / 60} />
  {:else}
    <rect x="0" y="0" width={v.width} height={v.height} fill={fill} stroke="#3a3d42" stroke-width={S / 60} />
    {#if kick}<rect x={v.width * 0.04} y={v.height - kick} width={v.width * 0.92} height={kick} fill="#2a2b2e" />{/if}
    {#each fronts as f, i (i)}
      <rect x={f.x - f.w / 2 + S / 80} y={f.y - f.h / 2 + S / 80} width={f.w - S / 40} height={f.h - S / 40} fill={f.kind === 'glass' ? '#2b3138' : fill} stroke="#3a3d42" stroke-width={S / 110} />
      {#if f.kind === 'drawer'}
        <rect x={f.x - Math.min(f.w * 0.25, 90)} y={f.y - f.h / 2 + Math.min(f.h * 0.25, 60)} width={Math.min(f.w * 0.5, 180)} height={S / 45} fill="#3a3d42" />
      {:else if f.kind === 'door' && f.hinge !== 'top'}
        <rect x={f.hinge === 'left' ? f.x + f.w / 2 - S / 14 : f.x - f.w / 2 + S / 22} y={wallUnit ? f.y + f.h / 2 - S / 6 : f.y - f.h / 2 + S / 20} width={S / 45} height={Math.min(S / 8, f.h * 0.4)} fill="#3a3d42" />
      {/if}
    {/each}
    {#if product.fronts === 'range'}
      <rect x="0" y="0" width={v.width} height={S / 30} fill="#1d1f22" />
      <rect x={v.width * 0.12} y={v.height * 0.3} width={v.width * 0.76} height={v.height * 0.32} fill="#2b3138" />
    {/if}
    {#if product.fronts === 'open'}
      <line x1="0" y1={v.height / 2} x2={v.width} y2={v.height / 2} stroke="#3a3d42" stroke-width={S / 50} />
    {/if}
  {/if}
</svg>
