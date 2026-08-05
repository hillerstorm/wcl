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
});
