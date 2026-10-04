<script lang="ts">
  import type { Units } from '../model/types';
  import { fmtLen, parseLen } from '../model/units';

  let { value, units, min = 0, max = 100000, onchange, disabled = false, label }:
    { value: number; units: Units; min?: number; max?: number; onchange: (mm: number) => void; disabled?: boolean; label?: string } = $props();

  let text = $state('');
  let editing = $state(false);
  let bad = $state(false);
  $effect(() => { if (!editing) text = fmtLen(value, units, true); });

  function commit() {
    editing = false;
    const mm = parseLen(text, units);
    if (mm == null || mm < min || mm > max) { bad = true; text = fmtLen(value, units, true); setTimeout(() => (bad = false), 1200); return; }
    if (Math.abs(mm - value) > 0.4) onchange(Math.round(mm));
  }
</script>

<input
  class="len" class:bad type="text" inputmode="decimal" aria-label={label} {disabled}
  bind:value={text}
  onfocus={(e) => { editing = true; (e.currentTarget as HTMLInputElement).select(); }}
  onblur={commit}
  onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') { editing = false; text = fmtLen(value, units, true); (e.currentTarget as HTMLInputElement).blur(); } }}
  title="Type mm, cm, m, in or ft (e.g. 2.4m, 36in, 3'6&quot;)"
/>

<style>
  .len { width: 100%; font-variant-numeric: tabular-nums; }
  .bad { border-color: var(--danger) !important; animation: shake .3s; }
  @keyframes shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
</style>
