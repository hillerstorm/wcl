import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExpansionPath, isExpansion, ALL_EXPANSIONS, defaultInstanceForExpansion } from './expansion.js';
import { loadDb, clearDbCache } from './db.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wcl-exp-'));
  process.env.WCL_WOWSIMS_ROOT = root;
  clearDbCache();
});

describe('expansion', () => {
  it('isExpansion accepts known values only', () => {
    expect(isExpansion('tbc')).toBe(true);
    expect(isExpansion('mop')).toBe(true);
    expect(isExpansion('xyz')).toBe(false);
  });

  it('ALL_EXPANSIONS covers the documented four', () => {
    expect(ALL_EXPANSIONS).toEqual(['tbc', 'mop', 'classic', 'sod']);
  });

  it('resolveExpansionPath maps tbc → <root>/tbc-new and mop → <root>/mop', () => {
    expect(resolveExpansionPath('tbc')).toBe(join(root, 'tbc-new'));
    expect(resolveExpansionPath('mop')).toBe(join(root, 'mop'));
    expect(resolveExpansionPath('classic')).toBe(join(root, 'classic'));
    expect(resolveExpansionPath('sod')).toBe(join(root, 'sod'));
  });

  it('defaultInstanceForExpansion maps each expansion to its WCL subdomain', () => {
    expect(defaultInstanceForExpansion('tbc')).toBe('fresh');
    expect(defaultInstanceForExpansion('mop')).toBe('classic');
    expect(defaultInstanceForExpansion('classic')).toBe('vanilla');
    expect(defaultInstanceForExpansion('sod')).toBe('sod');
  });
});

describe('db loader', () => {
  it('loads + memoizes db.json from assets/database/', () => {
    const expPath = join(root, 'tbc-new', 'assets', 'database');
    mkdirSync(expPath, { recursive: true });
    writeFileSync(join(expPath, 'db.json'), JSON.stringify({ items: [{ id: 1, name: 'Sword' }], spells: [{ id: 100, name: 'Fireball' }] }));

    const db1 = loadDb('tbc');
    expect(db1?.items?.[0]?.name).toBe('Sword');
    expect(loadDb('tbc')).toBe(db1);
  });

  it('returns null when sim path is missing', () => {
    expect(loadDb('mop')).toBeNull();
  });
});
