<script lang="ts">
  import { onMount } from 'svelte';
  import type { Project } from '../model/types';
  import { uid } from '../model/types';
  import Logo from './Logo.svelte';
  import MiniPlan from './MiniPlan.svelte';
  import { decodePayload } from '../io/transfer';
  import { fromOpenPlan, isOpenPlanJson, isWebProject } from '../io/openplan';
  import { loadProject, saveProject } from '../io/storage';
  import { track } from '../firebase';

  let { version, payload }: { version: string; payload: string } = $props();

  let phase = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state('');
  let project = $state<Project | null>(null);
  let existing = $state<Project | null>(null);
  let producer = $state('');

  onMount(async () => {
    try {
      if (version !== 'v1') throw new Error(`This link uses transfer format “${version}”, which this version of the planner does not understand. Update the iOS app or reload the page.`);
      const j = (await decodePayload(payload)) as Record<string, any>;
      if (!isWebProject(j) && !isOpenPlanJson(j)) throw new Error('The link does not contain a kitchen.');
      producer = isWebProject(j) ? 'web' : (j.openkitchen3d?.producer ?? 'ios');
      project = fromOpenPlan(j);
      existing = (await loadProject(project.id)) ?? null;
      phase = 'ready';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  });

  async function open(mode: 'new' | 'replace' | 'copy') {
    if (!project) return;
    const p: Project = mode === 'copy'
      ? { ...project, id: uid(), name: `${project.name} (from ${producer === 'web' ? 'web' : 'iPhone'})` }
      : { ...project, updatedAt: new Date().toISOString() };
    await saveProject(p);
    track('import_link', { producer, mode });
    location.replace(`#/p/${p.id}`);
  }
</script>

<div class="wrap">
  <header><a href="#/"><Logo word /></a></header>
  <main class="card">
    {#if phase === 'loading'}
      <p class="muted">Opening kitchen…</p>
    {:else if phase === 'error'}
      <h1>Couldn't open this link</h1>
      <p class="err">{error}</p>
      <a class="btn" href="#/">Go to your kitchens</a>
    {:else if project}
      <span class="from">{producer === 'web' ? 'Shared from OpenKitchen3D web' : 'Sent from the OpenKitchen3D iOS app'}</span>
      <h1>{project.name}</h1>
      <p class="muted">{project.walls.length} walls · {project.openings.length} doors & windows · {project.kitchen.cabinets.length} units{project.fixtures.length ? ` · ${project.fixtures.length} scanned fixtures` : ''}</p>
      <div class="plan"><MiniPlan {project} height={260} /></div>
      {#if !project.walls.every((w) => w.verified) || !project.ceilingVerified}
        <p class="note">Some dimensions aren't field-verified yet — check them before ordering.</p>
      {/if}
      {#if existing}
        <p>This kitchen is already in this browser{existing.updatedAt > project.updatedAt ? ', and the copy here was edited more recently' : ''}.</p>
        <div class="actions">
          <button class="btn primary" onclick={() => open('replace')}>Replace with this version</button>
          <button class="btn" onclick={() => open('copy')}>Keep both</button>
          <a class="btn" href="#/p/{existing.id}">Open the one here</a>
        </div>
      {:else}
        <div class="actions"><button class="btn primary big" onclick={() => open('new')}>Open in the planner</button></div>
      {/if}
      <p class="muted small">The kitchen travels inside the link and is saved only in this browser.</p>
    {/if}
  </main>
</div>

<style>
  .wrap { min-height: 100dvh; background: var(--bg); padding: 16px; }
  header { max-width: 640px; margin: 0 auto 16px; }
  header a { text-decoration: none; }
  .card { max-width: 640px; margin: 0 auto; background: var(--panel); border-radius: 16px; box-shadow: var(--shadow); padding: 24px; display: flex; flex-direction: column; gap: 10px; }
  h1 { margin: 0; font-size: 24px; }
  .from { font-size: 12px; font-weight: 700; color: var(--accent-ink); text-transform: uppercase; letter-spacing: .05em; }
  .plan { background: var(--bg-plan); border-radius: 12px; padding: 12px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .note { background: var(--warn-bg); color: var(--warn-ink); padding: 8px 10px; border-radius: 8px; font-size: 13px; margin: 0; }
  .err { color: var(--danger); }
  .small { font-size: 12px; }
</style>
