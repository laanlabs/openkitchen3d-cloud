// Kitchen catalogs. All sizes in mm.
//
// - `starter`: the OpenKitchen3D generic starter catalog, identical to the iOS app's
//   KitchenCatalog.swift (same product ids and SKU patterns) so iOS projects import losslessly.
// - `na` / `eu`: built from openkitchen3d-www catalog/data/items.json (schema v1),
//   redistributable items only (see scripts/build-catalog.mjs).
import generic from './generic.json';
import type { CabinetFamily, CatalogId, FinishIds } from '../model/types';

export type CatalogTab = 'base' | 'wall' | 'tall' | 'appliance' | 'island' | 'extras';
export type Role =
  | 'base' | 'drawer' | 'sink' | 'dishwasher' | 'range' | 'fridge' | 'wall' | 'hood'
  | 'tall' | 'oven' | 'corner' | 'island' | 'filler' | 'panel';
export type FrontKind =
  | 'doors' | 'drawers' | 'sink' | 'range' | 'fridge' | 'dishwasher' | 'hood' | 'oven'
  | 'open' | 'filler' | 'panel' | 'microwave' | 'beverage';

export interface Variant {
  width: number;
  height: number;
  depth: number;
  sku: string;
  doors: number;
  drawers: number;
}

export interface Product {
  id: string;
  catalog: CatalogId | 'shared';
  name: string;
  family: CabinetFamily;
  tab: CatalogTab;
  role?: Role;
  variants: Variant[];
  elevation: number;
  openPlanCategory: string;
  hasCountertop: boolean;
  fronts: FrontKind;
  /** Estimated list price for a width, in the catalog currency. */
  price: (v: Variant) => number;
  license: string;
}

export const COUNTERTOP = { thickness: 40, overhang: 20 };
export const TOE_KICK = 100;

const starterVersion = 'generic-starter@0.1';
export const catalogVersion = (id: CatalogId) =>
  id === 'starter' ? starterVersion : `openkitchen3d-${id}@${(generic as { schemaVersion: number }).schemaVersion}`;

// ---------- pricing (estimates, USD) ----------
const basePrice = (v: Variant) => 140 + 0.3 * v.width + 55 * v.drawers;
const wallPrice = (v: Variant) => 85 + 0.22 * v.width * Math.max(0.5, v.height / 720);
const tallPrice = (v: Variant) => 320 + 0.55 * v.width * (v.height / 2100);
const islandPrice = (v: Variant) => 520 + 0.75 * v.width;
const fixed = (n: number) => () => n;

// ---------- starter (mirrors iOS KitchenCatalog.swift) ----------
interface StarterDef {
  id: string; name: string; family: CabinetFamily; widths: number[]; depth: number; height: number;
  elevation: number; sku: string; cat: string; top: boolean; fronts: FrontKind; doors?: number; drawers?: number;
  role?: Role; price: (v: Variant) => number; tab?: CatalogTab;
}

const starterDefs: StarterDef[] = [
  { id: 'base-1d', name: 'Base, 1 door', family: 'base', widths: [300, 400, 450, 500, 600], depth: 580, height: 870, elevation: 0, sku: 'B1D-{w}', cat: 'base_cabinet', top: true, fronts: 'doors', doors: 1, role: 'base', price: basePrice },
  { id: 'base-2d', name: 'Base, 2 doors', family: 'base', widths: [600, 800, 900, 1000], depth: 580, height: 870, elevation: 0, sku: 'B2D-{w}', cat: 'base_cabinet', top: true, fronts: 'doors', doors: 2, price: basePrice },
  { id: 'base-3dr', name: 'Base, 3 drawers', family: 'base', widths: [400, 450, 500, 600, 800, 900], depth: 580, height: 870, elevation: 0, sku: 'B3DR-{w}', cat: 'base_cabinet', top: true, fronts: 'drawers', drawers: 3, role: 'drawer', price: basePrice },
  { id: 'base-sink', name: 'Sink base', family: 'base', widths: [600, 800, 900, 1000], depth: 580, height: 870, elevation: 0, sku: 'SB-{w}', cat: 'sink_k', top: true, fronts: 'sink', doors: 2, role: 'sink', price: (v) => basePrice(v) + 180 },
  { id: 'base-corner', name: 'Blind corner base', family: 'base', widths: [900, 1000, 1200], depth: 580, height: 870, elevation: 0, sku: 'BBC-{w}', cat: 'base_cabinet', top: true, fronts: 'doors', doors: 1, role: 'corner', price: (v) => basePrice(v) + 90 },
  { id: 'base-filler', name: 'Base filler', family: 'filler', widths: [25, 50, 75, 100, 150], depth: 580, height: 870, elevation: 0, sku: 'FIL-{w}', cat: 'base_filler', top: true, fronts: 'filler', role: 'filler', price: fixed(35), tab: 'extras' },
  { id: 'wall-1d', name: 'Wall, 1 door', family: 'wall', widths: [300, 400, 450, 500, 600], depth: 330, height: 720, elevation: 1450, sku: 'W1D-{w}', cat: 'wall_cabinet', top: false, fronts: 'doors', doors: 1, role: 'wall', price: wallPrice },
  { id: 'wall-2d', name: 'Wall, 2 doors', family: 'wall', widths: [600, 800, 900], depth: 330, height: 720, elevation: 1450, sku: 'W2D-{w}', cat: 'wall_cabinet', top: false, fronts: 'doors', doors: 2, price: wallPrice },
  { id: 'wall-open', name: 'Open shelf', family: 'wall', widths: [300, 400, 450, 500, 600, 800, 900], depth: 300, height: 360, elevation: 1500, sku: 'WOS-{w}', cat: 'wall_shelf', top: false, fronts: 'open', price: (v) => 40 + 0.12 * v.width },
  { id: 'wall-hood', name: 'Range hood', family: 'wall', widths: [600, 750, 900], depth: 480, height: 400, elevation: 1550, sku: 'APP-HD-{w}', cat: 'range_hood', top: false, fronts: 'hood', role: 'hood', price: (v) => 299 + 0.25 * v.width, tab: 'appliance' },
  { id: 'tall-pantry', name: 'Pantry', family: 'tall', widths: [450, 500, 600], depth: 580, height: 2170, elevation: 0, sku: 'T2D-{w}', cat: 'tall_cabinet', top: false, fronts: 'doors', doors: 2, role: 'tall', price: tallPrice },
  { id: 'tall-oven', name: 'Oven tower', family: 'tall', widths: [600], depth: 580, height: 2170, elevation: 0, sku: 'TOV-{w}', cat: 'oven', top: false, fronts: 'oven', role: 'oven', price: (v) => tallPrice(v) + 1100 },
  { id: 'app-fridge', name: 'Refrigerator', family: 'appliance', widths: [600, 700, 900], depth: 700, height: 1800, elevation: 0, sku: 'APP-REF-{w}', cat: 'fridge', top: false, fronts: 'fridge', role: 'fridge', price: (v) => 999 + 1.2 * v.width },
  { id: 'app-range', name: 'Range / stove', family: 'appliance', widths: [600, 750, 900], depth: 600, height: 870, elevation: 0, sku: 'APP-RNG-{w}', cat: 'stove', top: false, fronts: 'range', role: 'range', price: (v) => 699 + 0.8 * v.width },
  { id: 'app-dw', name: 'Dishwasher', family: 'appliance', widths: [450, 600], depth: 580, height: 870, elevation: 0, sku: 'APP-DW-{w}', cat: 'dishwasher', top: true, fronts: 'dishwasher', role: 'dishwasher', price: fixed(649) },
  { id: 'island', name: 'Island', family: 'island', widths: [1200, 1500, 1800, 2100, 2400], depth: 900, height: 870, elevation: 0, sku: 'ISL-{w}', cat: 'island', top: true, fronts: 'doors', doors: 2, role: 'island', price: islandPrice },
  { id: 'island-sink', name: 'Island with sink', family: 'island', widths: [1800, 2100, 2400], depth: 1000, height: 870, elevation: 0, sku: 'ISLS-{w}', cat: 'island', top: true, fronts: 'sink', doors: 2, price: (v) => islandPrice(v) + 260 }
];

const familyTab = (f: CabinetFamily): CatalogTab =>
  f === 'filler' || f === 'panel' ? 'extras' : (f as CatalogTab);

function starterProduct(d: StarterDef): Product {
  return {
    id: d.id,
    catalog: 'starter',
    name: d.name,
    family: d.family,
    tab: d.tab ?? familyTab(d.family),
    role: d.role,
    variants: d.widths.map((w) => ({
      width: w, height: d.height, depth: d.depth, sku: d.sku.replace('{w}', String(w)),
      doors: d.doors ?? 0,
      drawers: d.drawers ?? 0
    })),
    elevation: d.elevation,
    openPlanCategory: d.cat,
    hasCountertop: d.top,
    fronts: d.fronts,
    price: d.price,
    license: 'MIT'
  };
}

const starter = starterDefs.map(starterProduct);

// ---------- generic NA / EU from items.json ----------
interface RawItem {
  id: string; catalogFamily: string; region: string; kind: string; cabinetClass: string;
  applianceType: string | null; sku: string; name: string; w: number; h: number; d: number;
  configuration: Record<string, unknown>; license: string;
}

const cleanName = (n: string) =>
  n
    .replace(/\s*\([^)]*\)/g, (m) => (/depth|built-in|compact|single|double|over/i.test(m) ? m : ''))
    .replace(/\s*\d+(\.\d+)?"(\s*×\s*\d+(\.\d+)?")?(,\s*\d+"\s*deep)?/g, '')
    .replace(/\s*\d+(\s*×\s*\d+)?\s*mm/g, '')
    .replace(/\s+—.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const inches = (mm: number) => `${Math.round(mm / 25.4 * 2) / 2}"`;

function genericProducts(): Product[] {
  const items = (generic as { items: RawItem[] }).items;
  const groups = new Map<string, RawItem[]>();
  for (const it of items) {
    if (it.sku === 'TK96') continue; // toe-kick is generated per run
    if (it.applianceType && ['cooktop', 'sink', 'disposal'].includes(it.applianceType)) continue; // counter/under-sink inserts
    const prefix = it.sku.match(/^[A-Z]+/)?.[0] ?? it.sku;
    const key =
      it.kind === 'appliance'
        ? `${it.catalogFamily}|${it.applianceType}|${cleanName(it.name)}`
        : it.kind === 'panel'
          ? `${it.catalogFamily}|${it.sku}`
          : `${it.catalogFamily}|${it.cabinetClass}|${prefix}|${it.h}|${it.d}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  const out: Product[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.w - b.w);
    const first = list[0];
    const eu = first.catalogFamily === 'generic-eu';
    const catalog: CatalogId = eu ? 'eu' : 'na';
    const plinth = eu && (first.cabinetClass === 'base' || first.cabinetClass === 'tall') ? 150 : 0;
    let family: CabinetFamily;
    let role: Role | undefined;
    let fronts: FrontKind = 'doors';
    let elevation = 0;
    let cat = 'base_cabinet';
    let top = false;
    let price: (v: Variant) => number = basePrice;
    const prefix = first.sku.match(/^[A-Z]+/)?.[0] ?? '';
    const wallElevation = (h: number) => (eu ? 1450 : h <= 610 ? 2134 - h : 1372);

    if (first.kind === 'appliance') {
      family = 'appliance';
      cat = 'base_cabinet';
      switch (first.applianceType) {
        case 'dishwasher': role = 'dishwasher'; fronts = 'dishwasher'; cat = 'dishwasher'; top = true; price = fixed(first.w < 500 ? 599 : 699); break;
        case 'range': role = 'range'; fronts = 'range'; cat = 'stove'; price = (v) => 899 + 1.1 * (v.width - 600); break;
        case 'refrigerator': role = 'fridge'; fronts = 'fridge'; cat = 'fridge'; price = (v) => (v.height > 2000 ? 7999 : 1299 + 1.4 * v.width); break;
        case 'range-hood': family = 'wall'; role = 'hood'; fronts = 'hood'; cat = 'range_hood'; elevation = 1600; price = (v) => 349 + 0.2 * v.width; break;
        case 'wall-oven': family = 'tall'; fronts = 'oven'; cat = 'oven'; price = (v) => (v.height > 1000 ? 2499 : 1499); break;
        case 'microwave': fronts = 'microwave'; elevation = first.sku.includes('OTR') ? 1500 : 0; if (elevation) family = 'wall'; price = fixed(399); top = !elevation; break;
        case 'beverage': fronts = 'beverage'; top = true; price = fixed(899); break;
        default: price = fixed(499);
      }
    } else if (first.kind === 'filler') {
      family = 'filler'; role = 'filler'; fronts = 'filler'; cat = 'base_filler'; price = fixed(35);
    } else if (first.kind === 'panel') {
      family = 'panel'; role = 'panel'; fronts = 'panel'; cat = 'base_filler'; price = fixed(85);
    } else {
      switch (first.cabinetClass) {
        case 'wall':
          family = 'wall'; cat = 'wall_cabinet'; role = 'wall'; elevation = wallElevation(first.h); price = wallPrice; break;
        case 'tall':
          family = 'tall'; cat = prefix === 'OV' ? 'oven' : 'tall_cabinet'; role = prefix === 'OV' ? 'oven' : 'tall';
          fronts = prefix === 'OV' ? 'oven' : 'doors'; price = prefix === 'OV' ? (v) => tallPrice(v) + 400 : tallPrice; break;
        case 'corner':
          if (first.h < 1500 && first.d < 400) { family = 'wall'; cat = 'wall_cabinet'; elevation = wallElevation(first.h); price = wallPrice; }
          else { family = 'base'; top = true; role = 'corner'; price = (v) => basePrice(v) + 120; }
          break;
        default:
          family = 'base'; top = true;
          role = prefix === 'SB' ? 'sink' : first.configuration.drawers === 3 || prefix === 'DB' || prefix === 'UD' ? 'drawer' : 'base';
          fronts = role === 'sink' ? 'sink' : role === 'drawer' ? 'drawers' : 'doors';
          cat = role === 'sink' ? 'sink_k' : 'base_cabinet';
          price = role === 'sink' ? (v) => basePrice(v) + 180 : basePrice;
      }
    }

    // Thin parts get a real layout depth so they occupy their slot in the run.
    const layoutDepth = (it: RawItem) =>
      family === 'filler' || family === 'panel' ? (it.h > 2000 ? 610 : it.h > 800 ? (eu ? 560 : 610) : eu ? 320 : 305) : it.d;

    let name = cleanName(first.name);
    if ((family === 'wall' || family === 'tall') && first.kind === 'cabinet')
      name += eu ? ` · H ${first.h}` : ` · ${inches(first.h)} high`;
    if (first.kind === 'cabinet' && first.cabinetClass === 'wall' && first.d > 400) name += eu ? '' : `, ${inches(first.d)} deep`;

    out.push({
      id: key.replace(/[|\s]+/g, '-').toLowerCase(),
      catalog,
      name,
      family,
      tab: first.kind === 'appliance' ? 'appliance' : familyTab(family),
      role,
      variants: list.map((it) => ({
        width: it.w,
        height: it.h + plinth,
        depth: layoutDepth(it),
        sku: it.sku,
        doors: Number(it.configuration.doors ?? (fronts === 'doors' ? (it.w >= 600 ? 2 : 1) : 0)),
        drawers: Number(it.configuration.drawers ?? 0)
      })),
      elevation,
      openPlanCategory: cat,
      hasCountertop: top,
      fronts,
      price,
      license: first.license
    });
  }
  // Disambiguate products that share a name (e.g. two lazy-susan footprints).
  const seen = new Map<string, Product[]>();
  for (const p of out) seen.set(`${p.catalog}|${p.name}`, [...(seen.get(`${p.catalog}|${p.name}`) ?? []), p]);
  for (const list of seen.values())
    if (list.length > 1)
      for (const p of list) p.name += p.catalog === 'eu' ? ` · D ${p.variants[0].depth}` : ` · ${inches(p.variants[0].depth)} deep`;
  return out;
}

const generics = genericProducts();

/** Products shared into the NA/EU catalogs where items.json has no equivalent yet. */
const sharedFor = (id: CatalogId) =>
  starter
    .filter((p) => p.family === 'island' || (id === 'eu' && (p.family === 'appliance' || p.id === 'wall-hood')) || p.id === 'wall-open')
    .map((p) => ({ ...p, catalog: 'shared' as const }));

export const allProducts: Product[] = [...starter, ...generics];
const byId = new Map(allProducts.map((p) => [p.id, p]));

export const catalogs: { id: CatalogId; name: string; blurb: string }[] = [
  { id: 'starter', name: 'OpenKitchen3D Starter', blurb: 'Metric generic cabinets — same catalog as the iOS app' },
  { id: 'na', name: 'Generic North America', blurb: 'Framed cabinets in standard inch sizes + typical appliances' },
  { id: 'eu', name: 'Generic Europe', blurb: 'Frameless 150–1000 mm units on a 150 mm plinth' }
];

const catalogCache = new Map<CatalogId, Product[]>();
export function productsFor(id: CatalogId): Product[] {
  if (!catalogCache.has(id)) {
    catalogCache.set(id, id === 'starter' ? starter : [...generics.filter((p) => p.catalog === id), ...sharedFor(id)]);
  }
  return catalogCache.get(id)!;
}

export const product = (id: string): Product | undefined => byId.get(id);

export function variantFor(p: Product, width: number): Variant {
  return p.variants.reduce((best, v) => (Math.abs(v.width - width) < Math.abs(best.width - width) ? v : best), p.variants[0]);
}

export function defaultVariant(p: Product): Variant {
  return p.variants.find((v) => v.width === 600) ?? p.variants.find((v) => v.width === 610) ?? p.variants[Math.floor(p.variants.length / 2)];
}

/** Product for a role, preferring the given catalog, then the shared/starter set. */
export function productForRole(id: CatalogId, role: Role): Product | undefined {
  return productsFor(id).find((p) => p.role === role) ?? starter.find((p) => p.role === role);
}

// ---------- finishes ----------
export interface Swatch { id: string; name: string; hex: string; roughness?: number; metalness?: number; pricePerM2?: number }

export const fronts: Swatch[] = [
  { id: 'white-matte', name: 'White matte', hex: '#F2F1EC' },
  { id: 'cashmere', name: 'Cashmere', hex: '#D9CFC1' },
  { id: 'sage', name: 'Sage green', hex: '#9CAF94' },
  { id: 'navy', name: 'Navy', hex: '#2E3B55' },
  { id: 'oak', name: 'Natural oak', hex: '#C39A6B' },
  { id: 'walnut', name: 'Walnut', hex: '#6B4A33' },
  { id: 'graphite', name: 'Graphite', hex: '#45474B' },
  { id: 'black', name: 'Matte black', hex: '#222326' },
  { id: 'stainless', name: 'Stainless', hex: '#C9CCCF', roughness: 0.3, metalness: 0.8 }
];
export const carcasses: Swatch[] = [
  { id: 'white', name: 'White', hex: '#F4F4F2' },
  { id: 'light-oak', name: 'Light oak', hex: '#D8BC94' },
  { id: 'anthracite', name: 'Anthracite', hex: '#3B3D40' }
];
export const handles: Swatch[] = [
  { id: 'bar-steel', name: 'Steel bar', hex: '#BFC2C6', metalness: 1, roughness: 0.25 },
  { id: 'bar-black', name: 'Black bar', hex: '#1E1F21', metalness: 0.6, roughness: 0.4 },
  { id: 'knob-brass', name: 'Brass knob', hex: '#C29B57', metalness: 1, roughness: 0.3 },
  { id: 'none', name: 'Handleless', hex: '#888888' }
];
export const countertops: Swatch[] = [
  { id: 'quartz-white', name: 'White quartz', hex: '#ECEBE7', roughness: 0.25, pricePerM2: 420 },
  { id: 'marble', name: 'Carrara marble', hex: '#E4E2DE', roughness: 0.2, pricePerM2: 640 },
  { id: 'butcher-block', name: 'Butcher block', hex: '#B9864F', roughness: 0.6, pricePerM2: 260 },
  { id: 'concrete', name: 'Concrete', hex: '#9C9A95', roughness: 0.8, pricePerM2: 380 },
  { id: 'black-granite', name: 'Black granite', hex: '#2B2B2D', roughness: 0.2, pricePerM2: 480 },
  { id: 'laminate', name: 'White laminate', hex: '#F1F0EC', roughness: 0.5, pricePerM2: 120 }
];

export const handlePrice = 9;

export const swatch = (list: Swatch[], id: string) => list.find((s) => s.id === id) ?? list[0];

export const defaultStyle: FinishIds = { front: 'white-matte', carcass: 'white', handle: 'bar-steel', countertop: 'quartz-white' };

export const stylePresets: { id: string; name: string; style: FinishIds }[] = [
  { id: 'scandi', name: 'Scandinavian', style: { front: 'white-matte', carcass: 'white', handle: 'bar-steel', countertop: 'butcher-block' } },
  { id: 'modern', name: 'Modern dark', style: { front: 'graphite', carcass: 'anthracite', handle: 'none', countertop: 'quartz-white' } },
  { id: 'farmhouse', name: 'Farmhouse', style: { front: 'sage', carcass: 'white', handle: 'knob-brass', countertop: 'butcher-block' } },
  { id: 'classic', name: 'Classic navy', style: { front: 'navy', carcass: 'white', handle: 'knob-brass', countertop: 'marble' } },
  { id: 'warm', name: 'Warm walnut', style: { front: 'walnut', carcass: 'light-oak', handle: 'bar-black', countertop: 'black-granite' } },
  { id: 'minimal', name: 'Cashmere minimal', style: { front: 'cashmere', carcass: 'white', handle: 'none', countertop: 'concrete' } }
];
