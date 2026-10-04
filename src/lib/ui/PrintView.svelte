<script lang="ts">
  import type { Project } from '../model/types';
  import { Editor } from './editor.svelte';
  import PlanView from './PlanView.svelte';
  import ElevationView from './ElevationView.svelte';
  import Schedule from './Schedule.svelte';
  import ChecksPanel from './ChecksPanel.svelte';
  import Logo from './Logo.svelte';
  import { fmtLen } from '../model/units';
  import { carcasses, countertops, fronts, handles, swatch } from '../catalog/catalog';

  let { project }: { project: Project } = $props();
  // svelte-ignore state_referenced_locally
  const editor = new Editor(project, { readonly: true });
  const p = editor.project;
  const walls = p.walls.filter((w) => p.kitchen.cabinets.some((c) => c.wallId === w.id));
</script>

<div class="print">
  <header>
    <Logo word />
    <div class="meta">
      <h1>{p.name}</h1>
      <span>{new Date().toLocaleDateString()} · ceiling {fmtLen(p.ceilingHeight, p.units, true)} · {p.kitchen.cabinets.length} units</span>
      <span>Style: {swatch(fronts, p.kitchen.style.front).name} fronts, {swatch(handles, p.kitchen.style.handle).name}, {swatch(countertops, p.kitchen.style.countertop).name} worktop, {swatch(carcasses, p.kitchen.style.carcass).name} carcass</span>
    </div>
    <button class="btn primary noprint" onclick={() => window.print()}>Print / save as PDF</button>
  </header>

  <section class="page">
    <h2>Floor plan</h2>
    <div class="plan"><PlanView {editor} /></div>
  </section>

  {#each walls as w, i (w.id)}
    <section class="elev">
      <h2>Elevation — wall {p.walls.indexOf(w) + 1}</h2>
      <ElevationView {editor} wallId={w.id} print />
    </section>
  {/each}

  <section class="page">
    <h2>Item list</h2>
    <Schedule {editor} print />
  </section>

  <section>
    <ChecksPanel {editor} />
    <p class="note">Prices are planning estimates, not a quote. Scan and typed dimensions must be field-verified before ordering. Generated with OpenKitchen3D (MIT) — openkitchen3d.com</p>
  </section>
</div>

<style>
  .print { max-width: 1050px; margin: 0 auto; padding: 24px; background: white; color: #111; display: flex; flex-direction: column; gap: 22px; }
  header { display: flex; gap: 20px; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .meta { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
  h1 { margin: 0; font-size: 22px; }
  h2 { font-size: 15px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .05em; }
  .plan { height: 560px; border: 1px solid #ccc; }
  .plan :global(.tools), .plan :global(.legend) { display: none; }
  .elev { break-inside: avoid; }
  .note { font-size: 11px; color: #555; }
  @media print {
    .noprint { display: none; }
    .print { padding: 0; }
    .page { break-after: page; }
  }
</style>
