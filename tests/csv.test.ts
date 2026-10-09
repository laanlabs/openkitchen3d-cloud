import { describe, expect, it } from 'vitest';
import { defaultRoom, newProject, propose } from '../src/lib/layout/templates';
import { scheduleCsv } from '../src/lib/io/csv';

const mk = (units: 'metric' | 'imperial') =>
  propose(newProject({ name: 'CSV', room: defaultRoom('rectangle'), catalogId: units === 'imperial' ? 'na' : 'starter', units }), 'l');

describe('schedule CSV', () => {
  it('uses the project units and names the currency', () => {
    expect(scheduleCsv(mk('metric')).split('\r\n')[0]).toContain('Width (mm)');
    const imperial = scheduleCsv(mk('imperial'));
    expect(imperial.split('\r\n')[0]).toContain('Width (in)');
    expect(imperial.split('\r\n')[0]).toContain('Unit price (USD)');
  });

  it('neutralises spreadsheet formulas in imported text', () => {
    const p = mk('metric');
    p.kitchen.cabinets[0].sku = '=HYPERLINK("http://x","y")';
    const csv = scheduleCsv(p);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csv).not.toMatch(/,"=HYPERLINK/);
  });
});
