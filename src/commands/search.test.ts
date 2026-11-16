import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runSearch } from './search.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-search-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-search-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const base = { order: 'amount' as const, limit: 20, page: 1, force: true, pretty: false, useCache: false };

describe('search', () => {
  it('resolves encounter name to ID then fetches rankings', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { worldData: { expansions: [{ zones: [{ encounters: [{ id: 651, name: 'Magtheridon' }] }] }] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { worldData: { encounter: { name: 'Magtheridon', characterRankings: {
          rankings: [{ name: 'Hillzy', amount: 1500, reportCode: 'ABC', class: 'Hunter', spec: 'Beast Mastery' }],
          page: 1, hasMorePages: false,
        } } } },
      }), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runSearch({ encounter: 'Magtheridon', className: 'Hunter', spec: 'Beast Mastery',
                      order: 'amount', limit: 20, page: 1, instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.rankings[0].name).toBe('Hillzy');
  });

  it('omits guildName from the query and filters by guild client-side', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({
        data: { worldData: { encounter: { name: 'Magtheridon', characterRankings: {
          rankings: [
            { name: 'Hillzy', amount: 1500, guild: { name: 'Mythic' } },
            { name: 'Other', amount: 1600, guild: { name: 'Casuals' } },
            { name: 'Pugger', amount: 1400 },
          ],
          page: 1, hasMorePages: false,
        } } } },
      }), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runSearch({ encounter: '651', guild: 'mythic',
                      order: 'amount', limit: 20, page: 1, instance: 'classic', force: true, pretty: false, useCache: false });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.query).not.toContain('guildName');
    expect(body.variables).not.toHaveProperty('guildName');
    const parsed = JSON.parse(out.join(''));
    expect(parsed.rankings).toHaveLength(1);
    expect(parsed.rankings[0].name).toBe('Hillzy');
  });

  it('accepts a numeric encounter ID directly without resolving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({
        data: { worldData: { encounter: { name: 'Magtheridon', characterRankings: { rankings: [], page: 1, hasMorePages: false } } } },
      }), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runSearch({ encounter: '651', order: 'amount', limit: 20, page: 1, instance: 'fresh', force: true, pretty: false, useCache: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails when WCL returns a rankings error instead of rankings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { worldData: { encounter: { name: 'The Drowned City', characterRankings: { error: 'Invalid raid zone specified.' } } } },
    }), { status: 200 }));
    await expect(runSearch({ ...base, encounter: '12970', instance: 'forever' }))
      .rejects.toMatchObject({ code: 'GRAPHQL_ERROR', message: expect.stringContaining('Invalid raid zone specified.'), hint: expect.stringContaining('zone') });
  });

  it('never caches a rankings error, so a retry asks WCL again', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      data: { worldData: { encounter: { name: 'Onyxia', characterRankings: { error: "Fight data doesn't exist yet. Try again later." } } } },
    }), { status: 200 }));
    const opts = { ...base, encounter: '251084', instance: 'forever' as const, useCache: true };
    await expect(runSearch(opts)).rejects.toMatchObject({ code: 'GRAPHQL_ERROR' });
    await expect(runSearch(opts)).rejects.toMatchObject({ code: 'GRAPHQL_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves Forever encounter names through the Forever expansion, not the host\'s own list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { worldData: { expansion: { id: 3001, zones: [{ id: 3001, encounters: [{ id: 251084, name: 'Onyxia' }] }] } } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { worldData: { encounter: { name: 'Onyxia', characterRankings: { rankings: [], page: 1, hasMorePages: false } } } },
      }), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runSearch({ ...base, encounter: 'onyxia', instance: 'forever' });
    const lookup = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(lookup.query).toContain('expansion(id: $expansionId)');
    expect(lookup.variables).toEqual({ expansionId: 3001 });
    const search = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(search.variables.encounterId).toBe(251084);
  });

  it('accepts a numeric difficulty ID alongside n|h|m', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({
        data: { worldData: { encounter: { name: 'X', characterRankings: { rankings: [], page: 1, hasMorePages: false } } } },
      }), { status: 200 }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const opts = { ...base, encounter: '651', instance: 'fresh' as const };
    await runSearch({ ...opts, difficulty: '10' });
    await runSearch({ ...opts, difficulty: 'h' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).variables.difficulty).toBe(10);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).variables.difficulty).toBe(4);
    await expect(runSearch({ ...opts, difficulty: 'x' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await runSearch({ ...opts, difficulty: '' });
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).variables.difficulty).toBeNull();
  });
});
