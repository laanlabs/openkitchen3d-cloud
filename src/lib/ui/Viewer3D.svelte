<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
  import { onMount } from 'svelte';
  import type { Editor } from './editor.svelte';
  import { buildCabinet, buildFixture, buildFloor, buildPart, buildWall, cabinetHash } from '../scene/build';
  import { inwardNormal, projectBounds, wallMid } from '../model/geometry';

  let { editor, compact = false }: { editor: Editor; compact?: boolean } = $props();

  let host: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  const roomGroup = new THREE.Group();
  const cabinetGroup = new THREE.Group();
  const partGroup = new THREE.Group();
  const fixtureGroup = new THREE.Group();
  const cabinetCache = new Map<string, { hash: string; obj: THREE.Object3D }>();
  let roomHash = '';
  let wallObjs: { obj: THREE.Object3D; mid: THREE.Vector3; n: THREE.Vector3 }[] = [];
  let openDoors = $state(false);
  let cutaway = $state(true);
  let fitted = false;
  let raf = 0;

  export function screenshot(): string {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  export async function exportGlb(): Promise<Blob> {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const root = new THREE.Group();
    for (const g of [roomGroup, cabinetGroup, partGroup]) root.add(g.clone(true));
    const result = await new GLTFExporter().parseAsync(root, { binary: true });
    return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  }

  export function fit(view: 'iso' | 'top' | 'front' = 'iso') {
    const b = projectBounds(editor.project);
    const cx = ((b.min.x + b.max.x) / 2) / 1000, cz = ((b.min.y + b.max.y) / 2) / 1000;
    const size = (Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 2500) / 1000) * Math.max(1, 1.1 / Math.max(0.3, camera.aspect));
    controls.target.set(cx, 0.9, cz);
    if (view === 'top') camera.position.set(cx, size * 1.9, cz + 0.001);
    else if (view === 'front') camera.position.set(cx, 1.5, cz + size * 1.25);
    else camera.position.set(cx + size * 0.75, size * 1.0, cz + size * 1.05);
    controls.update();
  }

  function syncRoom() {
    const p = editor.project;
    const hash = JSON.stringify([p.walls, p.openings, p.fixtures]);
    if (hash === roomHash) return;
    roomHash = hash;
    roomGroup.clear();
    fixtureGroup.clear();
    wallObjs = [];
    const floor = buildFloor(p);
    if (floor) roomGroup.add(floor);
    for (const w of p.walls) {
      const obj = buildWall(w, p.openings.filter((o) => o.wallId === w.id));
      roomGroup.add(obj);
      const m = wallMid(w);
      const n = inwardNormal(p, w);
      wallObjs.push({ obj, mid: new THREE.Vector3(m.x / 1000, 0, m.y / 1000), n: new THREE.Vector3(n.x, 0, n.y) });
    }
    for (const f of p.fixtures) fixtureGroup.add(buildFixture(f));
  }

  function syncCabinets() {
    const p = editor.project;
    const seen = new Set<string>();
    for (const c of p.kitchen.cabinets) {
      seen.add(c.id);
      const opts = { ceiling: p.ceilingHeight, open: openDoors, selected: editor.selection?.id === c.id };
      const hash = cabinetHash(c, p.kitchen.style, opts);
      const cached = cabinetCache.get(c.id);
      if (cached?.hash === hash) continue;
      if (cached) cabinetGroup.remove(cached.obj);
      const obj = buildCabinet(c, p.kitchen.style, opts);
      cabinetGroup.add(obj);
      cabinetCache.set(c.id, { hash, obj });
    }
    for (const [id, { obj }] of cabinetCache) if (!seen.has(id)) { cabinetGroup.remove(obj); cabinetCache.delete(id); }
    partGroup.clear();
    for (const part of editor.parts) partGroup.add(buildPart(part, p.kitchen.style));
  }

  $effect(() => {
    // track dependencies
    editor.project; editor.parts; editor.selection; openDoors;
    if (!renderer) return;
    syncRoom();
    syncCabinets();
    if (!fitted) { fit(); fitted = true; }
  });

  // ---- picking & dragging ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging: { id: string; plane: THREE.Plane; offset: THREE.Vector3 } | null = null;
  let downAt: { x: number; y: number } | null = null;

  function setNdc(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function onDown(e: PointerEvent) {
    setNdc(e);
    downAt = { x: e.clientX, y: e.clientY };
    const hit = raycaster.intersectObjects(cabinetGroup.children, true)[0];
    const id = hit?.object.userData.cabinetId as string | undefined;
    if (id && !editor.readonly) {
      editor.selection = { kind: 'cabinet', id };
      const c = editor.project.kitchen.cabinets.find((x) => x.id === id)!;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -c.anchor.elevation / 1000);
      const pt = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, pt);
      dragging = { id, plane, offset: new THREE.Vector3(c.anchor.x / 1000 - pt.x, 0, c.anchor.y / 1000 - pt.z) };
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
    } else if (id) {
      editor.selection = { kind: 'cabinet', id };
    }
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return;
    setNdc(e);
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dragging.plane, pt)) return;
    pt.add(dragging.offset);
    editor.dragTo(dragging.id, { x: pt.x * 1000, y: pt.z * 1000 });
  }

  function onUp(e: PointerEvent) {
    if (dragging) {
      editor.endDrag();
      dragging = null;
      controls.enabled = true;
    } else if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
      setNdc(e);
      const hit = raycaster.intersectObjects(cabinetGroup.children, true)[0];
      if (!hit) editor.selection = null;
    }
    downAt = null;
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef1f4');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 0.6;
    controls.maxDistance = 40;

    const hemi = new THREE.HemisphereLight('#ffffff', '#b9a98f', 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff6e8', 1.6);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#e3e6ea', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.003;
    ground.receiveShadow = true;
    scene.add(ground, roomGroup, fixtureGroup, partGroup, cabinetGroup);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    syncRoom();
    syncCabinets();
    fit();
    fitted = true;
    const b = projectBounds(editor.project);
    sun.target.position.set((b.min.x + b.max.x) / 2000, 0, (b.min.y + b.max.y) / 2000);
    sun.position.set(sun.target.position.x + 4, 8, sun.target.position.z + 5);

    const tick = () => {
      controls.update();
      // Cut away walls between the camera and the room, like a dollhouse.
      for (const w of wallObjs) {
        const toCam = camera.position.clone().sub(w.mid);
        w.obj.visible = !cutaway || toCam.dot(w.n) > -0.05 || camera.position.y > 12;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
    };
  });
</script>

<div class="viewer" bind:this={host} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} role="application" aria-label="3D view">
  <div class="tools" class:compact onpointerdown={(e) => e.stopPropagation()} onpointerup={(e) => e.stopPropagation()} role="toolbar" tabindex="-1">
    <button class="chip" onclick={() => fit('iso')} title="Reset view">⟲ View</button>
    <button class="chip" onclick={() => fit('top')} title="Top view">Top</button>
    <button class="chip" onclick={() => fit('front')} title="Eye level">Eye level</button>
    <button class="chip" class:on={openDoors} onclick={() => (openDoors = !openDoors)} title="Open doors and drawers">{openDoors ? 'Close doors' : 'Open doors'}</button>
    <button class="chip" class:on={cutaway} onclick={() => (cutaway = !cutaway)} title="Hide walls facing the camera">Cutaway</button>
  </div>
</div>

<style>
  .viewer { position: relative; width: 100%; height: 100%; overflow: hidden; touch-action: none; background: #eef1f4; }
  .viewer :global(canvas) { display: block; width: 100%; height: 100%; }
  .tools { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
  .tools.compact { bottom: 8px; left: 8px; }
</style>
