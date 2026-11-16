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

const common = { json: false, force: true, pretty: false, useCache: false };
const baseOpts = { ...common, name: 'Frederiko', server: 'Golemagg', region: 'EU', instance: 'classic' as const };
const forever = { ...common, instance: 'forever' as const };

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

  it('--id looks the character up by ID, without name/server/region', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(character), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCharacter({ ...forever, id: 123 });

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as any).body);
    expect(body.variables).toEqual({ id: 123 });
  });

  it('--report resolves the name to an ID through the report\'s ranked characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { reportData: { report: { rankedCharacters: [{ id: 7, name: 'Other' }, { id: 123, name: 'Frederiko' }] } } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(character), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCharacter({ ...forever, name: 'frederiko', report: 'ABC' });

    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as any).body).variables).toEqual({ code: 'ABC' });
    expect(JSON.parse((fetchSpy.mock.calls[1]![1] as any).body).variables).toEqual({ id: 123 });
  });

  it('--report fails NOT_FOUND, naming who is ranked, when the character is not in the report', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { reportData: { report: { rankedCharacters: [{ id: 7, name: 'Other' }] } } },
    }), { status: 200 }));
    await expect(runCharacter({ ...forever, name: 'Ghost', report: 'ABC' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', hint: expect.stringContaining('Other') });
  });

  it('--report refuses to guess between same-named characters unless <server> picks one', async () => {
    const twins = { data: { reportData: { report: { rankedCharacters: [
      null,
      { id: 1, name: 'Thrall', server: { slug: 'pvp', region: { slug: 'US' } } },
      { id: 2, name: 'Thrall', server: { slug: 'normal', region: { slug: 'US' } } },
    ] } } } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u: any, init: any) =>
      new Response(JSON.stringify(JSON.parse(init.body).query.includes('rankedCharacters') ? twins : character), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(runCharacter({ ...forever, name: 'Thrall', report: 'ABC' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT', hint: expect.stringContaining('id 2') });
    await runCharacter({ ...forever, name: 'Thrall', server: 'Normal', report: 'ABC' });
    expect(JSON.parse((fetchSpy.mock.calls.at(-1)![1] as any).body).variables).toEqual({ id: 2 });
  });

  it('--report does not cache an empty ranked-characters answer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      data: { reportData: { report: { rankedCharacters: [] } } },
    }), { status: 200 }));
    const opts = { ...forever, name: 'Ghost', report: 'ABC', useCache: true };
    await expect(runCharacter(opts)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(runCharacter(opts)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects a lookup with neither name/server/region, --id nor --report', async () => {
    await expect(runCharacter({ ...common, name: 'Frederiko', instance: 'classic' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('points a failed name lookup at --report / --id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { characterData: { character: null } } }), { status: 200 }));
    await expect(runCharacter({ ...baseOpts, instance: 'forever' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', hint: expect.stringContaining('--report') });
  });

  it('fails on a zoneRankings error instead of printing an empty table, and does not cache it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      data: { characterData: { character: { id: 123, name: 'Frederiko', classID: 11, zoneRankings: { error: 'Unsupported zone specified.' } } } },
    }), { status: 200 }));
    const opts = { ...baseOpts, zone: 999999, useCache: true };
    await expect(runCharacter(opts)).rejects.toMatchObject({ code: 'GRAPHQL_ERROR', message: expect.stringContaining('Unsupported zone specified.') });
    await expect(runCharacter({ ...opts, json: true })).rejects.toMatchObject({ code: 'GRAPHQL_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
