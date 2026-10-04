// Builds src/lib/catalog/generic.json from the openkitchen3d-www catalog
// (schema v1, mm). Only items with license.redistributionAllowed ship with
// the app; IKEA SEKTION and other reference-only data is dropped here.
//
//   node scripts/build-catalog.mjs [path/to/items.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? resolve(root, '../openkitchen3d-www/catalog/data/items.json');
const items = JSON.parse(readFileSync(src, 'utf8'));

const kept = items.filter((i) => i.license?.redistributionAllowed === true);
const out = kept.map((i) => ({
  id: i.id,
  catalogFamily: i.catalogFamily,
  region: i.region,
  kind: i.kind,
  cabinetClass: i.cabinetClass,
  applianceType: i.applianceType,
  sku: i.sku,
  name: i.name,
  w: i.dimensions.widthMm,
  h: i.dimensions.heightMm,
  d: i.dimensions.depthMm,
  configuration: i.configuration ?? {},
  license: i.license.spdx ?? i.license.status
}));

writeFileSync(
  resolve(root, 'src/lib/catalog/generic.json'),
  JSON.stringify({ source: 'openkitchen3d-www/catalog/data/items.json', schemaVersion: 1, total: items.length, items: out }, null, 1) + '\n'
);
console.log(`catalog: ${items.length} items read, ${out.length} redistributable kept, ${items.length - out.length} reference-only dropped`);
