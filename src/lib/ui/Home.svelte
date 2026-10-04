<script lang="ts">
  import { onMount } from 'svelte';
  import Logo from './Logo.svelte';
  import MiniPlan from './MiniPlan.svelte';
  import LayoutIcon from './LayoutIcon.svelte';
  import LengthInput from './LengthInput.svelte';
  import { deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from '../io/storage';
  import { defaultRoom, layoutKinds, newProject, propose, roomShapes, type LayoutKind, type RoomParams, type RoomShape } from '../layout/templates';
  import { catalogs, countertops, fronts, handles, stylePresets, swatch } from '../catalog/catalog';
  import type { CatalogId, Project, Units } from '../model/types';
  import { uid } from '../model/types';
  import { fromOpenPlan, isOpenPlanJson, isWebProject } from '../io/openplan';
  import { schedule, scheduleTotal } from '../layout/runs';
  import { validate } from '../layout/validation';
  import { money } from '../model/units';
  import { track } from '../firebase';

  let projects = $state<ProjectSummary[]>([]);
  let previews = $state<Record<string, Project>>({});
  let confirmDelete = $state<string | null>(null);
  let importError = $state('');

  // ---- wizard ----
  let step = $state<0 | 1 | 2 | 3>(0);
  let units = $state<Units>(navigator.language === 'en-US' ? 'imperial' : 'metric');
  let catalogId = $state<CatalogId>(navigator.language === 'en-US' ? 'na' : 'starter');
  let room = $state<RoomParams>(imperialize(defaultRoom('rectangle')));

  /** Round template sizes to whole feet / inches when working in imperial. */
  function imperialize(r: RoomParams): RoomParams {
    if (units !== 'imperial') return r;
    const ft = (mm: number) => Math.round(mm / 304.8) * 304.8;
    return { ...r, width: ft(r.width), depth: ft(r.depth), notchWidth: ft(r.notchWidth), notchDepth: ft(r.notchDepth), ceiling: 2438.4 };
  }
  let layout = $state<LayoutKind>('l');
  let styleId = $state(stylePresets[0].id);
  let name = $state('My kitchen');

  const base = $derived(newProject({ name, room, catalogId, units }));
  const proposals = $derived(
    step >= 2 ? Object.fromEntries(layoutKinds.map((k) => [k.id, propose(base, k.id)])) as Record<LayoutKind, Project> : null
  );
  const chosen = $derived.by(() => {
    if (!proposals) return null;
    const p = proposals[layout];
    const style = stylePresets.find((s) => s.id === styleId)!.style;
    return { ...p, kitchen: { ...p.kitchen, style: { ...style } } };
  });

  async function refresh() {
    projects = await listProjects();
    const out: Record<string, Project> = {};
    for (const s of projects.slice(0, 24)) {
      const p = await loadProject(s.id);
      if (p) out[s.id] = p;
    }
    previews = out;
  }
  onMount(refresh);

  function setShape(s: RoomShape) {
    room = { ...imperialize(defaultRoom(s)), ceiling: room.ceiling };
  }

  async function create() {
    if (!chosen) return;
    const p = { ...chosen, name: name.trim() || 'My kitchen' };
    await saveProject(p);
    track('create_project', { layout, catalog: catalogId, shape: room.shape });
    location.hash = `#/p/${p.id}`;
  }

  async function duplicate(id: string) {
    const p = await loadProject(id);
    if (!p) return;
    const copy = { ...p, id: uid(), name: `${p.name} — variant`, updatedAt: new Date().toISOString() };
    await saveProject(copy);
    refresh();
  }

  async function remove(id: string) {
    await deleteProject(id);
    confirmDelete = null;
    refresh();
  }

  async function importFile(e: Event) {
    importError = '';
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!isWebProject(j) && !isOpenPlanJson(j)) throw new Error('Not an OpenKitchen3D or OpenPlan3D JSON file.');
      const p = fromOpenPlan(j, file.name.replace(/\.json$/i, ''));
      const existing = await loadProject(p.id);
      const saved = existing ? { ...p, id: uid(), name: `${p.name} (imported)` } : p;
      await saveProject(saved);
      track('import', { source: isWebProject(j) ? 'web' : 'openplan' });
      location.hash = `#/p/${saved.id}`;
    } catch (err) {
      importError = err instanceof Error ? err.message : String(err);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<div class="home">
  <header class="nav">
    <Logo word size={30} />
    <nav>
      <a href="https://openkitchen3d.com" target="_blank" rel="noopener">About</a>
      <a href="https://github.com/laanlabs/openkitchen3d-ios" target="_blank" rel="noopener">iOS app</a>
    </nav>
  </header>

  {#if step === 0}
    <section class="hero">
      <div class="copy">
        <h1>Plan your kitchen in 3D.<br /><span>Free, open source, in your browser.</span></h1>
        <p>Draw your room, pick a layout, drop in cabinets that snap together, and get a priced item list with worktops, fillers and panels added for you. No account, no sales appointment — your designs stay on this device.</p>
        <div class="cta">
          <button class="btn primary big" onclick={() => (step = 1)}>Start a new kitchen</button>
          <label class="btn big">
            Import scan or JSON
            <input type="file" accept=".json,application/json" onchange={importFile} hidden />
          </label>
        </div>
        {#if importError}<p class="err">{importError}</p>{/if}
        <ul class="points">
          <li>Room templates or an iPhone LiDAR scan from the OpenKitchen3D iOS app</li>
          <li>Plan, 3D and per-wall elevations from one model</li>
          <li>Design checks: collisions, doorways, windows, aisle widths</li>
          <li>Item list as CSV and PDF · OpenPlan3D-compatible export</li>
        </ul>
      </div>
      <div class="art" aria-hidden="true">
        <MiniPlan project={propose(newProject({ name: 'demo', room: defaultRoom('rectangle'), catalogId: 'starter', units: 'metric' }), 'island')} height={300} />
      </div>
    </section>

    {#if projects.length}
      <section class="library">
        <h2>Your kitchens <span class="muted">saved in this browser</span></h2>
        <div class="cards">
          {#each projects as s (s.id)}
            <article class="card">
              <a href="#/p/{s.id}" class="thumb">
                {#if previews[s.id]}<MiniPlan project={previews[s.id]} height={130} />{/if}
              </a>
              <div class="info">
                <a href="#/p/{s.id}" class="name">{s.name}</a>
                <span class="muted small">{s.cabinets} units · edited {fmtDate(s.updatedAt)}</span>
                {#if previews[s.id]}<span class="small price">{money(scheduleTotal(schedule(previews[s.id])))}</span>{/if}
              </div>
              <div class="actions">
                {#if confirmDelete === s.id}
                  <span class="small">Delete for good?</span>
                  <button class="chip danger" onclick={() => remove(s.id)}>Delete</button>
                  <button class="chip" onclick={() => (confirmDelete = null)}>Keep</button>
                {:else}
                  <button class="chip" onclick={() => duplicate(s.id)} title="Copy to try a different idea">Make variant</button>
                  <button class="chip" onclick={() => (confirmDelete = s.id)}>Delete</button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {:else}
    <section class="wizard">
      <ol class="steps">
        <li class:on={step === 1} class:done={step > 1}><button onclick={() => (step = 1)}>1 · Room</button></li>
        <li class:on={step === 2} class:done={step > 2}><button onclick={() => (step = 2)}>2 · Layout</button></li>
        <li class:on={step === 3}><button onclick={() => (step = 3)} disabled={step < 2}>3 · Style</button></li>
      </ol>

      {#if step === 1}
        <div class="grid">
          <div class="form">
            <h2>What shape is your kitchen?</h2>
            <div class="shapes">
              {#each roomShapes as s (s.id)}
                <button class="shape" class:on={room.shape === s.id} onclick={() => setShape(s.id)}>
                  <MiniPlan project={newProject({ name: '', room: defaultRoom(s.id), catalogId, units })} height={70} />
                  <span>{s.name}</span>
                </button>
              {/each}
            </div>
            <div class="seg" role="radiogroup" aria-label="Units">
              <button class:on={units === 'metric'} onclick={() => (units = 'metric')}>Metric</button>
              <button class:on={units === 'imperial'} onclick={() => { units = 'imperial'; room = imperialize(room); }}>Imperial</button>
            </div>
            <div class="dims">
              <label>Inside width <LengthInput value={room.width} {units} min={1500} max={15000} onchange={(mm) => (room = { ...room, width: mm })} /></label>
              <label>Inside depth <LengthInput value={room.depth} {units} min={1500} max={15000} onchange={(mm) => (room = { ...room, depth: mm })} /></label>
              {#if room.shape === 'l'}
                <label>Cut-out width <LengthInput value={room.notchWidth} {units} min={500} max={room.width - 900} onchange={(mm) => (room = { ...room, notchWidth: mm })} /></label>
                <label>Cut-out depth <LengthInput value={room.notchDepth} {units} min={500} max={room.depth - 900} onchange={(mm) => (room = { ...room, notchDepth: mm })} /></label>
              {/if}
              <label>Ceiling height <LengthInput value={room.ceiling} {units} min={2000} max={5000} onchange={(mm) => (room = { ...room, ceiling: mm })} /></label>
            </div>
            <label class="block">Cabinet catalog
              <select bind:value={catalogId}>
                {#each catalogs as c (c.id)}<option value={c.id}>{c.name} — {c.blurb}</option>{/each}
              </select>
            </label>
            <p class="muted small">You can move doors and windows, change wall lengths and verify every dimension in the editor.</p>
            <div class="nav-btns">
              <button class="btn" onclick={() => (step = 0)}>Back</button>
              <button class="btn primary" onclick={() => (step = 2)}>Next: layout →</button>
            </div>
          </div>
          <div class="preview"><MiniPlan project={base} height={340} /></div>
        </div>
      {:else if step === 2 && proposals}
        <h2>Pick a starting layout</h2>
        <p class="muted">Each one is a complete, checked design for your room. Change anything afterwards.</p>
        <div class="layouts">
          {#each layoutKinds as k (k.id)}
            {@const prop = proposals[k.id]}
            {@const errs = validate(prop).filter((w) => w.severity === 'error').length}
            <button class="layout" class:on={layout === k.id} onclick={() => (layout = k.id)}>
              <MiniPlan project={prop} height={150} />
              <span class="lname"><LayoutIcon kind={k.id} size={22} /> {k.name}</span>
              <span class="muted small">{k.id === 'empty' ? k.blurb : `${prop.kitchen.cabinets.length} units · ${money(scheduleTotal(schedule(prop)))}`}{errs ? ' · needs fixes' : ''}</span>
            </button>
          {/each}
        </div>
        <div class="nav-btns">
          <button class="btn" onclick={() => (step = 1)}>← Room</button>
          <button class="btn primary" onclick={() => (step = 3)}>Next: style →</button>
        </div>
      {:else if step === 3 && chosen}
        <h2>Choose a style</h2>
        <div class="styles">
          {#each stylePresets as s (s.id)}
            <button class="stylecard" class:on={styleId === s.id} onclick={() => (styleId = s.id)}>
              <span class="kitchen">
                <span class="wallrow">
                  {#each [0, 1, 2] as _}<span class="door" style="background:{swatch(fronts, s.style.front).hex}"><i style="background:{s.style.handle === 'none' ? 'transparent' : swatch(handles, s.style.handle).hex}"></i></span>{/each}
                </span>
                <span class="counter" style="background:{swatch(countertops, s.style.countertop).hex}"></span>
                <span class="baserow">
                  {#each [0, 1, 2] as _}<span class="door" style="background:{swatch(fronts, s.style.front).hex}"><i style="background:{s.style.handle === 'none' ? 'transparent' : swatch(handles, s.style.handle).hex}"></i></span>{/each}
                </span>
              </span>
              <span class="sname">{s.name}</span>
              <span class="muted small">{swatch(fronts, s.style.front).name} · {swatch(countertops, s.style.countertop).name}</span>
            </button>
          {/each}
        </div>
        <label class="block nameinput">Name your kitchen <input type="text" bind:value={name} maxlength="80" /></label>
        <div class="nav-btns">
          <button class="btn" onclick={() => (step = 2)}>← Layout</button>
          <button class="btn primary big" onclick={create}>Open in the planner →</button>
        </div>
      {/if}
    </section>
  {/if}

  <footer class="foot muted small">
    OpenKitchen3D is MIT-licensed and powered by OpenPlan3D. Prices are estimates for planning, not quotes. Always field-verify dimensions before ordering.
  </footer>
</div>

<style>
  .home { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
  .nav { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; }
  .nav nav { display: flex; gap: 18px; }
  .nav a { color: var(--ink-soft); text-decoration: none; font-size: 14px; }
  .hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: center; padding: 30px 24px 40px; max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box; }
  h1 { font-size: clamp(30px, 4vw, 48px); line-height: 1.08; margin: 0 0 16px; letter-spacing: -.02em; }
  h1 span { color: var(--accent-ink); }
  .copy p { font-size: 17px; line-height: 1.55; color: var(--ink-soft); max-width: 560px; }
  .cta { display: flex; gap: 10px; flex-wrap: wrap; margin: 22px 0; }
  .points { color: var(--ink-soft); font-size: 14px; line-height: 1.9; padding-left: 18px; }
  .art { background: var(--panel); border-radius: 20px; padding: 24px; box-shadow: var(--shadow); }
  .err { color: var(--danger); }
  .library { max-width: 1200px; margin: 0 auto; width: 100%; padding: 0 24px 40px; box-sizing: border-box; }
  h2 { font-size: 22px; margin: 0 0 14px; }
  h2 .muted { font-size: 14px; font-weight: 400; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  .thumb { display: block; padding: 12px; background: var(--bg-plan); }
  .info { padding: 10px 12px 4px; display: flex; flex-direction: column; gap: 2px; }
  .name { font-weight: 700; color: var(--ink); text-decoration: none; }
  .price { color: var(--accent-ink); font-weight: 600; }
  .actions { display: flex; gap: 6px; padding: 8px 12px 12px; align-items: center; flex-wrap: wrap; }
  .small { font-size: 12px; }

  .wizard { max-width: 1100px; margin: 0 auto; width: 100%; padding: 10px 24px 40px; box-sizing: border-box; }
  .steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 22px; }
  .steps button { border: 0; background: var(--panel); padding: 8px 14px; border-radius: 999px; cursor: pointer; font-weight: 600; color: var(--ink-soft); border: 1px solid var(--border); }
  .steps .on button { background: var(--accent); color: white; border-color: var(--accent); }
  .steps .done button { color: var(--accent-ink); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; align-items: start; }
  .form { display: flex; flex-direction: column; gap: 14px; }
  .shapes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .shape, .layout, .stylecard { display: flex; flex-direction: column; gap: 6px; align-items: stretch; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); cursor: pointer; font-size: 13px; color: inherit; text-align: left; }
  .shape.on, .layout.on, .stylecard.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .dims { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dims label, .block { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; }
  .preview { background: var(--panel); border-radius: 16px; padding: 20px; box-shadow: var(--shadow); position: sticky; top: 20px; }
  .layouts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 16px 0; }
  .lname { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .styles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin: 16px 0; }
  .kitchen { display: flex; flex-direction: column; gap: 6px; background: #f4f2ee; padding: 10px; border-radius: 8px; }
  .wallrow, .baserow { display: flex; gap: 2px; }
  .wallrow .door { height: 34px; }
  .baserow .door { height: 44px; }
  .door { flex: 1; border: 1px solid rgba(0,0,0,.18); display: flex; justify-content: center; align-items: flex-start; padding-top: 5px; }
  .wallrow .door { align-items: flex-end; padding-bottom: 5px; }
  .door i { width: 40%; height: 3px; border-radius: 2px; }
  .counter { height: 6px; margin: 4px -4px 0; border-radius: 1px; }
  .sname { font-weight: 700; }
  .nameinput { max-width: 380px; }
  .nav-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
  .foot { text-align: center; padding: 24px; margin-top: auto; }
  @media (max-width: 860px) {
    .hero, .grid { grid-template-columns: 1fr; }
    .art { display: none; }
    .shapes { grid-template-columns: repeat(2, 1fr); }
    .preview { position: static; }
  }
</style>
