# OpenKitchen3D Cloud — web kitchen planner

A free, open-source 3D kitchen planner that runs in the browser, in the spirit of HomeByMe's kitchen
layout tool. Pick a room shape, choose a starter layout, drop in cabinets that snap together and get a
priced item list with worktops, fillers and end panels added for you. Projects are local-first
(IndexedDB) — no account, no sales funnel.

Hosted on Firebase Hosting (project `openkitchen3d`, site `openkitchen3d-cloud`).

## Features

- **Start:** room templates (rectangle, L, galley, open plan) with inside dimensions, metric or imperial;
  or import an OpenKitchen3D iOS scan / OpenPlan3D JSON.
- **Starter layouts:** one wall, galley, L, U, L + island — each proposal passes the design checks with zero errors.
- **Catalogs:** the iOS generic starter set (same product ids/SKUs), plus Generic North America and Generic
  Europe built from `openkitchen3d-www/catalog/data/items.json` (redistributable items only — IKEA SEKTION is dropped).
- **Editing:** wall and neighbour snapping (toggle), click-to-add into the first free slot, drag from the
  catalog, rotate/duplicate/delete, undo/redo, keyboard shortcuts (⌘Z, ⇧⌘Z, R, D, Del).
- **Configure:** widths limited to catalog sizes, hinge side, wall-unit height, per-unit or per-run finishes.
- **Style:** one action restyles the whole kitchen (fronts, handles, worktop, carcass); one undo reverts it.
- **Generated parts:** one worktop slab per straight run (butt-jointed at corners), toe kicks, fillers
  (≤150 mm gaps) and finished end panels — badged "auto-added"; deleting a unit lists what else changed.
- **Views:** 2D plan with dimensions, 3D (procedural cabinets, cutaway walls, open doors), per-wall
  elevations with dimension chains (drag along the wall, drag wall units up/down), split view.
- **Design checks:** `OK-COLLIDE`, `OK-DOOR`, `OK-WINDOW`, `OK-OUTSIDE`, `OK-AISLE`, `OK-UNVERIFIED`
  (ported from iOS `Validation.swift`) plus `OK-SWING` and `OK-CEILING`.
- **Output:** running estimated total, item list (CSV), print/PDF page (plan, elevations, list),
  OpenPlan3D prepared-RoomPlan JSON (`docs/EXPORT_FORMAT.md` contract), project JSON, PNG, GLB,
  and a share link that carries the whole design in the URL fragment (nothing uploaded).

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: layout, run solver, validation, interchange
npm run check      # svelte-check
npm run catalog    # rebuild src/lib/catalog/generic.json from ../openkitchen3d-www
npm run deploy     # build + firebase deploy --only hosting
```

## Layout

```
src/lib/model/      types (mm, Project.kitchen schema from the handoff doc), geometry, units
src/lib/catalog/    catalogs, finishes, style presets, generic.json
src/lib/layout/     layout.ts (snapping, port of KitchenLayout.swift), runs.ts (run solver, schedule),
                    validation.ts, templates.ts (rooms + starter layouts)
src/lib/scene/      procedural three.js builder
src/lib/io/         OpenPlan3D import/export, IndexedDB storage, share links, CSV
src/lib/ui/         Svelte 5 components (editor, plan, 3D, elevation, panels, home wizard, print)
```

Units are millimetres everywhere; plan x → world X, plan y → world Z; cabinet rotation in degrees with
front = (−sin r, cos r), matching OpenPlan3D and the iOS app.

MIT licensed. Prices are planning estimates, not quotes. Powered by OpenPlan3D.
