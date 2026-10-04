<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { fmtShort, money } from '../model/units';
  import { finishName } from '../io/csv';

  let { editor, print = false }: { editor: Editor; print?: boolean } = $props();
  const p = $derived(editor.project);
  const cabinetCount = $derived(editor.lines.filter((l) => !l.auto).reduce((s, l) => s + l.qty, 0));
</script>

<div class="sched" class:print>
  <table>
    <thead>
      <tr><th>Qty</th><th>SKU</th><th>Description</th><th>Finish</th><th class="n">W × D × H ({p.units === 'metric' ? 'mm' : 'in'})</th><th class="n">Unit</th><th class="n">Total</th></tr>
    </thead>
    <tbody>
      {#each editor.lines as l (l.key)}
        <tr class:auto={l.auto} onclick={() => { if (!l.auto && !print) editor.selection = { kind: 'cabinet', id: l.ids[0] }; }}>
          <td>{l.qty}</td>
          <td class="mono">{l.sku}</td>
          <td>{l.description} {#if l.auto}<span class="badge" title="Generated from your cabinet runs">auto-added</span>{/if}</td>
          <td>{finishName(l.finish)}</td>
          <td class="n">{fmtShort(l.width, p.units)} × {fmtShort(l.depth, p.units)} × {fmtShort(l.height, p.units)}</td>
          <td class="n">{money(l.unitPrice, p.kitchen.currency)}</td>
          <td class="n">{money(l.total, p.kitchen.currency)}</td>
        </tr>
      {:else}
        <tr><td colspan="7" class="muted">No cabinets yet.</td></tr>
      {/each}
    </tbody>
    <tfoot>
      <tr><td colspan="6">{cabinetCount} units · estimate, excludes installation and tax</td><td class="n">{money(editor.total, p.kitchen.currency)}</td></tr>
    </tfoot>
  </table>
</div>

<style>
  .sched { overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 7px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-soft); position: sticky; top: 0; background: var(--panel); }
  .print th { position: static; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--accent-bg); }
  tr.auto td { color: var(--ink-soft); }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--auto); color: var(--ink); margin-left: 4px; font-weight: 600; }
  tfoot td { font-weight: 700; border-bottom: 0; padding-top: 10px; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
</style>
