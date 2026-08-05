import { describe, it, expect } from 'vitest';
import { enrich } from './apply.js';
import type { SimDb } from './db.js';

const db: SimDb = {
  items: [{ id: 30900, name: 'Ashtongue Talisman of Swiftness', stats: { agility: 23 } }],
  spells: [
    { id: 34120, name: 'Steady Shot' },
    { id: 19434, name: 'Aimed Shot' },
  ],
};

describe('enrich.apply', () => {
  it('annotates abilityGameID → simName in events', () => {
    const payload = { events: { data: [{ type: 'cast', abilityGameID: 34120, sourceID: 7 }] } };
    const out = enrich(payload, db);
    expect((out as any).events.data[0].simName).toBe('Steady Shot');
    expect((out as any).events.data[0].abilityGameID).toBe(34120);
  });

  it('annotates gear[].id → simItem with stats preserved', () => {
    const payload = { gear: [{ id: 30900, slot: 'trinket1' }] };
    const out = enrich(payload, db) as any;
    expect(out.gear[0].simItem.name).toBe('Ashtongue Talisman of Swiftness');
    expect(out.gear[0].simItem.stats.agility).toBe(23);
  });

  it('sets simName: null for unknown spell IDs without throwing', () => {
    const payload = { events: { data: [{ type: 'cast', abilityGameID: 999999 }] } };
    const out = enrich(payload, db) as any;
    expect(out.events.data[0].simName).toBeNull();
  });

  it('walks deeply nested structures', () => {
    const payload = {
      report: {
        casts: { data: [{ abilityGameID: 19434 }] },
        debuffs: { data: [{ ability: { gameID: 34120 } }] },
      },
    };
    const out = enrich(payload, db) as any;
    expect(out.report.casts.data[0].simName).toBe('Aimed Shot');
    expect(out.report.debuffs.data[0].ability.simName).toBe('Steady Shot');
  });

  it('returns the original payload unchanged when db is null', () => {
    const payload = { events: { data: [{ abilityGameID: 34120 }] } };
    expect(enrich(payload, null)).toEqual(payload);
  });

  it('does not mutate the input', () => {
    const payload = { events: { data: [{ abilityGameID: 34120 }] } };
    const before = JSON.stringify(payload);
    enrich(payload, db);
    expect(JSON.stringify(payload)).toBe(before);
  });
});
