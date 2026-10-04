// OpenKitchen3D web project model. Every length is in millimetres.
// Plan space: x → world X, y → world Z (the OpenPlan3D / RoomPlan convention).
// Cabinet types follow the "Project.kitchen" schema in the developer handoff
// (KitchenCabinetInstance), so they can move into OpenPlan3D's Kitchen mode later.

export interface Vec2 { x: number; y: number }

export type CaptureSource = 'lidar' | 'arCorners' | 'manual' | 'web';
export type Units = 'metric' | 'imperial';
export type CatalogId = 'starter' | 'na' | 'eu';

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  /** Field-verified by the user. Scan geometry is never fabrication truth. */
  verified: boolean;
}

export type OpeningKind = 'door' | 'window' | 'opening';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Centre along the wall, 0…1 */
  position: number;
  width: number;
  height: number;
  sillHeight: number;
  hingeLeft?: boolean;
}

/** Something a scan recognised (existing fridge, sink…). A reference obstacle, never a design product. */
export interface Fixture {
  id: string;
  category: string;
  center: Vec2;
  rotation: number;
  width: number;
  depth: number;
  height: number;
}

export type CabinetFamily = 'base' | 'wall' | 'tall' | 'appliance' | 'island' | 'filler' | 'panel';

export interface FinishIds {
  front: string;
  carcass: string;
  handle: string;
  countertop: string;
}

export interface KitchenCabinetInstance {
  id: string;
  productId: string;
  sku: string;
  family: CabinetFamily;
  wallId?: string;
  /** Centre of the footprint in plan space; elevation = underside above floor. */
  anchor: { x: number; y: number; elevation: number };
  /** Degrees. OpenPlan3D convention: front = (−sin r, cos r); local +x runs along the width. */
  rotation: number;
  width: number;
  height: number;
  depth: number;
  configuration: { hinge?: 'left' | 'right'; [k: string]: unknown };
  /** Per-cabinet overrides of the kitchen style. */
  finishIds: Partial<FinishIds>;
  priceOverride?: number;
}

export interface KitchenSettings {
  catalogVersion: string;
  cabinets: KitchenCabinetInstance[];
  style: FinishIds;
  countertop: { thickness: number; overhang: number };
  currency: string;
}

export interface Project {
  schema: 'openkitchen3d/web-project@0.1';
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  catalogId: CatalogId;
  units: Units;
  captureSource: CaptureSource;
  ceilingHeight: number;
  ceilingVerified: boolean;
  walls: Wall[];
  openings: Opening[];
  fixtures: Fixture[];
  kitchen: KitchenSettings;
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().toUpperCase()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16).toUpperCase();
      });
