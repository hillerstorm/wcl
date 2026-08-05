import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runFights } from './fights.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-fi-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-fi-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const report = {
  data: { reportData: { report: {
    code: 'ABC',
    fights: [
      { id: 1, name: 'Chum Kiu', encounterID: 0, startTime: 0, endTime: 60_000, kill: null, difficulty: null, size: null },
      { id: 2, name: 'Immerseus', encounterID: 1602, startTime: 100_000, endTime: 375_200, kill: true, difficulty: 4, size: 10 },
      { id: 3, name: 'Sha of Pride', encounterID: 1603, startTime: 400_000, endTime: 500_000, kill: false, difficulty: 4, size: 10 },
    ],
    masterData: { actors: [], abilities: [] },
  } } },
};

const baseOpts = {
  code: 'ABC', boss: false, kills: false, json: false,
  instance: 'fresh' as const, force: true, pretty: false, useCache: false,
};

describe('fights', () => {
  it('prints a text table with kill/wipe/trash and durations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runFights(baseOpts);

    const lines = out.join('').trim().split('\n');
    expect(lines.length).toBe(4); // header + 3 fights
    expect(lines[0]).toMatch(/^ID\s+RESULT\s+DIFF\s+SIZE\s+DUR\s+START\s+END\s+NAME$/);
    expect(lines[1]).toContain('trash');
    expect(lines[2]).toContain('kill');
    expect(lines[2]).toContain('275.2s');
    expect(lines[2]).toContain('Immerseus');
    expect(lines[3]).toContain('wipe');
  });

  it('--boss --kills filters to boss kills, --json emits structured output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runFights({ ...baseOpts, boss: true, kills: true, json: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.fights.length).toBe(1);
    expect(parsed.fights[0].name).toBe('Immerseus');
  });

  it('--encounter filters by name substring', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runFights({ ...baseOpts, encounter: 'pride', json: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.fights.length).toBe(1);
    expect(parsed.fights[0].id).toBe(3);
  });
});
