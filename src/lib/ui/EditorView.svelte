<script lang="ts">
  import { onMount } from 'svelte';
  import type { Project } from '../model/types';
  import { Editor, type ViewMode } from './editor.svelte';
  import PlanView from './PlanView.svelte';
  import Viewer3D from './Viewer3D.svelte';
  import ElevationView from './ElevationView.svelte';
  import CatalogPanel from './CatalogPanel.svelte';
  import RoomPanel from './RoomPanel.svelte';
  import StylePanel from './StylePanel.svelte';
  import Inspector from './Inspector.svelte';
  import ChecksPanel from './ChecksPanel.svelte';
  import Schedule from './Schedule.svelte';
  import Logo from './Logo.svelte';
  import { fmtArea, money } from '../model/units';
  import { download, dataUrlToBlob } from '../io/download';
  import { fileName, toOpenPlan } from '../io/openplan';
  import { scheduleCsv } from '../io/csv';
  import { shareUrl } from '../io/share';
  import { iosImportUrl, transferJson } from '../io/transfer';
  import { saveProject } from '../io/storage';
  import { uid } from '../model/types';
  import { track } from '../firebase';

  let { project, readonly = false }: { project: Project; readonly?: boolean } = $props();

  // The router remounts this component per project, so the initial props are all we need.
  // svelte-ignore state_referenced_locally
  const editor = new Editor(project, { readonly });
  // svelte-ignore state_referenced_locally
  if (readonly) editor.view = '3d';
  // svelte-ignore state_referenced_locally
  let left = $state<'catalog' | 'room' | 'style'>(project.kitchen.cabinets.length ? 'catalog' : 'room');
  let showChecks = $state(false);
  let showSchedule = $state(false);
  let showExport = $state(false);
  let sheet = $state<'left' | 'right' | null>(null);
  let viewer: Viewer3D | undefined = $state();
  let narrow = $state(false);
  let shareFallback = $state('');
  let iosLink = $state('');

  const p = $derived(editor.project);
  const errors = $derived(editor.warnings.filter((w) => w.severity === 'error').length);
  const warns = $derived(editor.warnings.filter((w) => w.severity === 'warning').length);
  const topArea = $derived(editor.parts.filter((g) => g.kind === 'countertop').reduce((s, g) => s + (g.area ?? 0), 0));

  const views: { id: ViewMode; name: string }[] = [
    { id: '2d', name: '2D' }, { id: '3d', name: '3D' }, { id: 'split', name: 'Split' }, { id: 'elevation', name: 'Elevation' }
  ];


  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
    const c = editor.selectedCabinet;
    if (!c) { if (e.key === 'Escape') editor.selection = null; return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.remove(c.id); }
    else if (e.key.toLowerCase() === 'r' && !mod) editor.rotate(c.id, e.shiftKey ? -90 : 90);
    else if (e.key.toLowerCase() === 'd' && !mod) editor.duplicate(c.id);
    else if (e.key === 'Escape') editor.selection = null;
  }

  onMount(() => {
    const mq = matchMedia('(max-width: 860px)');
    const set = () => { narrow = mq.matches; if (narrow && editor.view === 'split') editor.view = readonly ? '3d' : '2d'; };
    set();
    mq.addEventListener('change', set);
    const beforeUnload = () => { void editor.flush(); };
    addEventListener('beforeunload', beforeUnload);
    return () => { mq.removeEventListener('change', set); removeEventListener('beforeunload', beforeUnload); void editor.flush(); };
  });

  async function exportAs(kind: 'json' | 'csv' | 'png' | 'glb' | 'print' | 'project') {
    showExport = false;
    track('export', { kind });
    if (kind === 'json') download(fileName(p, 'openplan3d', 'json'), JSON.stringify(toOpenPlan(p), null, 2), 'application/json');
    if (kind === 'project') download(fileName(p, 'openkitchen3d', 'json'), JSON.stringify(p, null, 2), 'application/json');
    if (kind === 'csv') download(fileName(p, 'schedule', 'csv'), scheduleCsv(p), 'text/csv');
    if (kind === 'png') {
      if (!viewer) { editor.view = 'split'; await new Promise((r) => setTimeout(r, 400)); }
      if (viewer) download(fileName(p, '3d', 'png'), await dataUrlToBlob(viewer.screenshot()));
    }
    if (kind === 'glb') {
      if (!viewer) { editor.view = 'split'; await new Promise((r) => setTimeout(r, 400)); }
      if (viewer) download(fileName(p, 'model', 'glb'), await viewer.exportGlb());
    }
    if (kind === 'print') {
      await editor.flush();
      window.open(`#/print/${p.id}`, '_blank');
    }
  }

  async function share() {
    const url = shareUrl(p);
    track('share');
    try {
      if (navigator.share && narrow) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); editor.notify('Share link copied — anyone with it can view this design in 3D'); }
    } catch {
      shareFallback = url;
    }
  }

  async function sendToIos() {
    showExport = false;
    await editor.flush();
    iosLink = await iosImportUrl(p);
    track('send_to_ios');
  }

  async function makeCopy() {
    const copy: Project = { ...structuredClone(p), id: uid(), name: `${p.name} (copy)`, updatedAt: new Date().toISOString() };
    await saveProject(copy);
    location.hash = `#/p/${copy.id}`;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="editor" class:readonly>
  <header class="top">
    <a class="home" href="#/" title="All kitchens"><Logo size={26} /></a>
    {#if readonly}
      <strong class="title">{p.name}</strong>
      <span class="pill">View only</span>
    {:else}
      <input class="title" value={p.name} aria-label="Kitchen name" onchange={(e) => editor.rename((e.currentTarget as HTMLInputElement).value || 'My kitchen')} />
      <span class="save {editor.saveState}" title="Projects are saved in this browser automatically">
        {editor.saveState === 'saving' ? 'Saving…' : editor.saveState === 'error' ? 'Not saved!' : '✓ Saved'}
      </span>
      <div class="group">
        <button class="icon" onclick={() => editor.undo()} disabled={!editor.undoCount} title="Undo (⌘Z)">↶</button>
        <button class="icon" onclick={() => editor.redo()} disabled={!editor.redoCount} title="Redo (⇧⌘Z)">↷</button>
      </div>
    {/if}
    <div class="seg views" role="tablist" aria-label="View">
      {#each views.filter((v) => !(narrow && v.id === 'split')) as v (v.id)}
        <button role="tab" class:on={editor.view === v.id} aria-selected={editor.view === v.id} onclick={() => (editor.view = v.id)}>{v.name}</button>
      {/each}
    </div>
    <div class="spacer"></div>
    {#if !readonly}
      <button class="btn checks" class:bad={errors} class:meh={!errors && warns} onclick={() => (showChecks = !showChecks)} title="Design checks">
        {errors ? `⛔ ${errors}` : warns ? `⚠️ ${warns}` : '✓'} <span class="hide-sm">Checks</span>
      </button>
    {/if}
    <button class="btn hide-sm" onclick={() => (showSchedule = true)}>Item list</button>
    {#if readonly}
      <button class="btn primary" onclick={makeCopy}>Make an editable copy</button>
    {:else}
      <div class="menu">
        <button class="btn" onclick={() => (showExport = !showExport)} aria-expanded={showExport}>Export ▾</button>
        {#if showExport}
          <div class="dropdown" role="menu">
            <button onclick={() => exportAs('print')}>🖨 Print / PDF (plan, elevations, list)</button>
            <button onclick={() => exportAs('csv')}>📋 Item list (CSV)</button>
            <button onclick={sendToIos}>📱 Open in the iOS app</button>
            <button onclick={() => exportAs('json')}>📐 OpenPlan3D JSON</button>
            <button onclick={() => exportAs('project')}>💾 OpenKitchen3D project</button>
            <button onclick={() => exportAs('png')}>🖼 3D image (PNG)</button>
            <button onclick={() => exportAs('glb')}>🧊 3D model (GLB)</button>
          </div>
        {/if}
      </div>
      <button class="btn primary" onclick={share}>Share</button>
    {/if}
  </header>

  <div class="body">
    {#if !readonly}
      <aside class="left" class:open={sheet === 'left'}>
        <div class="seg tabs" role="tablist">
          <button role="tab" class:on={left === 'room'} onclick={() => (left = 'room')}>Room</button>
          <button role="tab" class:on={left === 'catalog'} onclick={() => (left = 'catalog')}>Cabinets</button>
          <button role="tab" class:on={left === 'style'} onclick={() => (left = 'style')}>Style</button>
        </div>
        <div class="panel">
          {#if left === 'catalog'}<CatalogPanel {editor} />{:else if left === 'room'}<RoomPanel {editor} />{:else}<StylePanel {editor} />{/if}
        </div>
      </aside>
    {/if}

    <main class="canvas view-{editor.view}">
      {#if editor.view === '2d' || editor.view === 'split'}
        <div class="pane"><PlanView {editor} /></div>
      {/if}
      {#if editor.view === '3d' || editor.view === 'split'}
        <div class="pane"><Viewer3D bind:this={viewer} {editor} compact={editor.view === 'split'} /></div>
      {/if}
      {#if editor.view === 'elevation'}
        <div class="pane"><ElevationView {editor} /></div>
      {/if}
      {#if showChecks}
        <div class="drawer"><ChecksPanel {editor} onclose={() => (showChecks = false)} /></div>
      {/if}
    </main>

    {#if !readonly}
      <aside class="right" class:open={sheet === 'right'}>
        <Inspector {editor} />
      </aside>
    {/if}
  </div>

  <footer class="totals">
    <span><strong>{p.kitchen.cabinets.length}</strong> units</span>
    <span class="hide-sm">Worktop <strong>{fmtArea(topArea, p.units)}</strong></span>
    <span class="hide-sm">{p.walls.length} walls · {p.openings.length} openings</span>
    <span class="spacer"></span>
    <button class="link" onclick={() => (showSchedule = true)}>Estimated total <strong class="price">{money(editor.total, p.kitchen.currency)}</strong></button>
    {#if narrow && !readonly}
      <button class="btn small" onclick={() => (sheet = sheet === 'left' ? null : 'left')}>＋ Add</button>
      <button class="btn small" class:primary={!!editor.selection} onclick={() => (sheet = sheet === 'right' ? null : 'right')}>{editor.selection ? 'Edit selected' : 'Project'}</button>
    {/if}
  </footer>

  {#if sheet}<button class="scrim" aria-label="Close panel" onclick={() => (sheet = null)}></button>{/if}

  {#if showSchedule}
    <div class="modal-bg" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) showSchedule = false; }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Item list">
        <div class="mhead">
          <h3>Item list</h3>
          <div class="group">
            <button class="btn" onclick={() => exportAs('csv')}>Download CSV</button>
            {#if !readonly}<button class="btn" onclick={() => exportAs('print')}>Print / PDF</button>{/if}
            <button class="btn" onclick={() => (showSchedule = false)}>Close</button>
          </div>
        </div>
        <p class="muted small">Auto-added parts are generated from your runs and update whenever the design changes — nothing is removed without showing here.</p>
        <Schedule {editor} />
      </div>
    </div>
  {/if}

  {#if iosLink}
    <div class="modal-bg" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) iosLink = ''; }}>
      <div class="modal share" role="dialog" aria-modal="true" aria-label="Open in the iOS app">
        <h3>Open in OpenKitchen3D for iOS</h3>
        <p class="muted small">On an iPhone or iPad with the app installed, tap the button. On a computer, copy the link to your phone or AirDrop the file and open it with OpenKitchen3D.</p>
        <a class="btn primary big" href={iosLink}>Open in the app</a>
        <div class="group">
          <button class="btn" onclick={async () => { try { await navigator.clipboard.writeText(iosLink); editor.notify('App link copied'); } catch { shareFallback = iosLink; } }}>Copy app link</button>
          <button class="btn" onclick={() => download(fileName(p, 'openplan3d', 'json'), JSON.stringify(transferJson(p), null, 2), 'application/json')}>Download file for AirDrop</button>
        </div>
        <p class="muted small">Walls, doors, windows, cabinets, finishes and verification travel to the app. Styles, catalog and worktop settings come back unchanged when you send it back to the web.</p>
        <p class="muted small">Don't have the app yet? <a href="https://openkitchen3d.com/app" target="_blank" rel="noopener">Get OpenKitchen3D for iPhone, iPad and Mac</a>.</p>
        <div class="mhead"><span></span><button class="btn" onclick={() => (iosLink = '')}>Done</button></div>
      </div>
    </div>
  {/if}

  {#if shareFallback}
    <div class="modal-bg" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) shareFallback = ''; }}>
      <div class="modal share" role="dialog" aria-modal="true" aria-label="Share link">
        <h3>Share this design</h3>
        <p class="muted small">Anyone with this link can view the kitchen in 3D and make their own copy. The design travels inside the link — nothing is uploaded.</p>
        <input type="text" readonly value={shareFallback} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        <div class="mhead"><span></span><button class="btn" onclick={() => (shareFallback = '')}>Done</button></div>
      </div>
    </div>
  {/if}

  {#if editor.toast}
    <div class="toast" role="status">
      <strong>{editor.toast.text}</strong>
      {#if editor.toast.detail?.length}
        <ul>{#each editor.toast.detail as d}<li>Also: {d}</li>{/each}</ul>
      {/if}
      {#if !readonly && editor.undoCount}<button class="link" onclick={() => { editor.undo(); editor.toast = null; }}>Undo</button>{/if}
    </div>
  {/if}
</div>

<style>
  .editor { display: grid; grid-template-rows: auto 1fr auto; height: 100dvh; background: var(--bg); }
  .top { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--border); min-width: 0; }
  .home { display: flex; align-items: center; text-decoration: none; }
  .title { font-weight: 700; font-size: 15px; border: 1px solid transparent; background: transparent; padding: 4px 6px; border-radius: 6px; min-width: 60px; max-width: 220px; }
  input.title:hover, input.title:focus { border-color: var(--border); background: var(--bg); }
  .save { font-size: 12px; color: var(--ok); white-space: nowrap; }
  .save.saving { color: var(--ink-soft); }
  .save.error { color: var(--danger); font-weight: 700; }
  .group { display: flex; gap: 4px; }
  .icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--panel); font-size: 16px; cursor: pointer; color: inherit; }
  .icon:disabled { opacity: .35; cursor: default; }
  .views { margin-left: 8px; }
  .spacer { flex: 1; }
  .pill { font-size: 11px; background: var(--accent-bg); color: var(--accent-ink); padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .checks.bad { border-color: var(--danger); color: var(--danger); }
  .checks.meh { border-color: var(--warn); }
  .menu { position: relative; }
  .dropdown { position: absolute; right: 0; top: calc(100% + 6px); background: var(--panel); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); padding: 6px; z-index: 30; display: flex; flex-direction: column; min-width: 270px; }
  .dropdown button { text-align: left; background: none; border: 0; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: inherit; }
  .dropdown button:hover { background: var(--accent-bg); }

  .body { display: grid; grid-template-columns: 300px 1fr 290px; min-height: 0; }
  .readonly .body { grid-template-columns: 1fr; }
  aside { background: var(--panel); min-height: 0; overflow: auto; padding: 12px; }
  .left { border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .left .tabs { width: 100%; }
  .left .tabs button { flex: 1; }
  .panel { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  .right { border-left: 1px solid var(--border); }
  .canvas { position: relative; display: grid; min-height: 0; min-width: 0; }
  .canvas.view-split { grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
  .pane { position: relative; min-height: 0; min-width: 0; }
  .drawer { position: absolute; top: 12px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 12px; z-index: 5; }

  .totals { display: flex; align-items: center; gap: 16px; padding: 8px 14px; background: var(--panel); border-top: 1px solid var(--border); font-size: 13px; }
  .price { font-size: 16px; color: var(--accent-ink); margin-left: 4px; }
  .link { background: none; border: 0; cursor: pointer; color: inherit; font-size: 13px; padding: 0; }

  .modal-bg { position: fixed; inset: 0; background: rgba(15, 23, 30, .45); display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; z-index: 50; padding: 16px; }
  .modal { background: var(--panel); border-radius: 14px; width: min(1000px, 100%); min-width: 0; max-width: 100%; max-height: 90dvh; display: flex; flex-direction: column; padding: 16px; gap: 6px; box-shadow: var(--shadow); }
  .modal :global(.sched) { flex: 1; min-height: 0; min-width: 0; overflow: auto; }
  .modal.share { width: min(560px, 100%); gap: 10px; }
  .mhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mhead h3 { margin: 0; }
  .small { font-size: 12px; margin: 0 0 6px; }

  .toast { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); background: #1e2a33; color: white; padding: 10px 14px; border-radius: 10px; box-shadow: var(--shadow); z-index: 60; font-size: 13px; max-width: min(520px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 4px; }
  .toast ul { margin: 0; padding-left: 18px; opacity: .85; }
  .toast .link { color: #7fe3ea; font-weight: 700; align-self: flex-start; }
  .scrim { display: none; }

  @media (max-width: 1180px) {
    .body { grid-template-columns: 270px 1fr 250px; }
  }
  @media (max-width: 860px) {
    .body { grid-template-columns: 1fr; }
    .hide-sm { display: none; }
    .title { max-width: 120px; }
    .save { display: none; }
    .views { margin-left: 0; }
    aside.left, aside.right { position: fixed; left: 0; right: 0; bottom: 0; height: 62dvh; z-index: 40; border-radius: 16px 16px 0 0; box-shadow: var(--shadow); transform: translateY(105%); transition: transform .22s ease; border: 0; }
    aside.open { transform: none; }
    .scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.25); z-index: 35; border: 0; }
    .top { flex-wrap: wrap; row-gap: 6px; }
    .totals { gap: 10px; }
  }
</style>
