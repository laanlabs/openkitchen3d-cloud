<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { defaultVariant, fronts, productsFor, swatch, type CatalogTab, type Product, type Variant } from '../catalog/catalog';
  import { fmtShort, money } from '../model/units';
  import ProductThumb from './ProductThumb.svelte';

  let { editor }: { editor: Editor } = $props();
  const tabs: { id: CatalogTab; name: string }[] = [
    { id: 'base', name: 'Base' }, { id: 'wall', name: 'Wall' }, { id: 'tall', name: 'Tall' },
    { id: 'appliance', name: 'Appliances' }, { id: 'island', name: 'Islands' }, { id: 'extras', name: 'Fillers' }
  ];
  let tab = $state<CatalogTab>('base');
  let query = $state('');
  let picked = $state<Record<string, number>>({});

  const p = $derived(editor.project);
  const hex = $derived(swatch(fronts, p.kitchen.style.front).hex);
  const list = $derived(
    productsFor(p.catalogId).filter((x) =>
      query ? `${x.name} ${x.variants.map((v) => v.sku).join(' ')}`.toLowerCase().includes(query.toLowerCase()) : x.tab === tab
    )
  );
  const variantOf = (x: Product): Variant => x.variants.find((v) => v.width === picked[x.id]) ?? defaultVariant(x);

  function dragStart(e: DragEvent, x: Product) {
    e.dataTransfer?.setData('application/x-okd-product', JSON.stringify({ id: x.id, width: variantOf(x).width }));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
</script>

<div class="catalog">
  <input class="search" type="search" placeholder="Search cabinets, appliances, SKUs…" bind:value={query} />
  {#if !query}
    <div class="tabs" role="tablist">
      {#each tabs as t (t.id)}
        <button role="tab" class:on={tab === t.id} aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.name}</button>
      {/each}
    </div>
  {/if}
  <p class="muted tip">Click to add to the selected wall, or drag onto the plan.</p>
  <div class="items">
    {#each list as x (x.id)}
      {@const v = variantOf(x)}
      <div class="item" draggable={!editor.readonly} ondragstart={(e) => dragStart(e, x)} role="listitem">
        <button class="add" onclick={() => editor.addProduct(x, v)} title="Add {x.name}">
          <ProductThumb product={x} {hex} />
          <span class="meta">
            <span class="name">{x.name}</span>
            <span class="muted small">{v.sku} · {fmtShort(v.width, p.units)} × {fmtShort(v.depth, p.units)} × {fmtShort(v.height, p.units)}</span>
            <span class="price">{money(x.price(v))}</span>
          </span>
        </button>
        {#if x.variants.length > 1}
          <div class="widths" aria-label="Width">
            {#each x.variants as vv (vv.sku)}
              <button class="w" class:on={vv.width === v.width} onclick={() => (picked = { ...picked, [x.id]: vv.width })}>{fmtShort(vv.width, p.units)}</button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <p class="muted">Nothing matches.</p>
    {/each}
  </div>
</div>

<style>
  .catalog { display: flex; flex-direction: column; gap: 8px; min-height: 0; height: 100%; }
  .search { width: 100%; }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; }
  .tabs button { border: 1px solid var(--border); background: var(--panel); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
  .tabs button.on { background: var(--accent); color: white; border-color: var(--accent); }
  .tip { font-size: 12px; margin: 0; }
  .items { overflow: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; min-height: 0; }
  .item { flex-shrink: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); overflow: hidden; }
  .item:hover { border-color: var(--accent); }
  .add { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: none; border: 0; padding: 8px; cursor: pointer; color: inherit; }
  .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-weight: 600; font-size: 13px; }
  .small { font-size: 11px; }
  .price { font-size: 12px; color: var(--accent-ink); font-weight: 600; }
  .widths { display: flex; flex-wrap: wrap; gap: 3px; padding: 0 8px 8px; }
  .w { font-size: 11px; padding: 2px 6px; border: 1px solid var(--border); background: var(--bg); border-radius: 5px; }
  .w.on { border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
</style>
