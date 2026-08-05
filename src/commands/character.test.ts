import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runCharacter } from './character.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-ch-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-ch-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const character = {
  data: { characterData: { character: {
    id: 123, name: 'Frederiko', classID: 11,
    zoneRankings: {
      bestPerformanceAverage: 92.14, medianPerformanceAverage: 78.4,
      zone: 33, partition: 2, difficulty: 4, size: 10, metric: 'dps',
      allStars: [{ spec: 'Fury', points: 512.3, possiblePoints: 1200, rank: 40, regionRank: 12, serverRank: 3 }],
      rankings: [
        { encounter: { id: 1602, name: 'Immerseus' }, rankPercent: 99.2, medianPercent: 87.5, bestAmount: 412345.6,
          totalKills: 12, spec: 'Fury', bestSpec: 'Fury', allStars: { serverRank: 3, regionRank: 45 } },
        { encounter: { id: 1603, name: 'Sha of Pride' }, rankPercent: 71.0, medianPercent: 60.2, bestAmount: 350000.1,
          totalKills: 8, spec: 'Fury', bestSpec: 'Arms', allStars: { serverRank: 9, regionRank: 210 } },
      ],
    },
  } } },
};

const baseOpts = {
  name: 'Frederiko', server: 'Golemagg', region: 'EU', json: false,
  instance: 'classic' as const, force: true, pretty: false, useCache: false,
};

describe('character', () => {
  it('prints a summary header, all-stars, and per-boss table', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(character), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runCharacter(baseOpts);

    const text = out.join('');
    expect(text).toContain('Frederiko (Warrior)');
    expect(text).toContain('best avg 92.1');
    expect(text).toContain('all-stars [Fury]');
    expect(text).toMatch(/Immerseus\s+99\.2\s+87\.5\s+412345\s+12\s+3\s+45\s+Fury/);
    expect(text).toMatch(/Sha of Pride\s+71\.0.*Arms/);
    // server slug and region are lowercased for the API
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as any).body);
    expect(body.variables.server).toBe('golemagg');
    expect(body.variables.region).toBe('eu');
  });

  it('--json emits the raw character payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(character), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runCharacter({ ...baseOpts, json: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.character.zoneRankings.rankings.length).toBe(2);
  });

  it('passes optional filters through as variables', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(character), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCharacter({ ...baseOpts, zone: 33, metric: 'dps', spec: 'Fury', difficulty: 4, size: 10, partition: 2 });

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as any).body);
    expect(body.variables).toMatchObject({ zoneID: 33, metric: 'dps', specName: 'Fury', difficulty: 4, size: 10, partition: 2 });
  });

  it('fails NOT_FOUND for an unknown character', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { characterData: { character: null } } }), { status: 200 }));
    await expect(runCharacter(baseOpts)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('handles a character with no rankings gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(
      { data: { characterData: { character: { id: 1, name: 'Fresh', classID: 4, zoneRankings: null } } } }), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runCharacter(baseOpts);

    expect(out.join('')).toContain('no rankings found');
  });
});
