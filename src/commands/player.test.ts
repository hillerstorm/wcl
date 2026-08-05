import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runPlayer } from './player.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-pl-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-pl-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const hillzy = { id: 7, name: 'Hillzy', type: 'Player', subType: 'Hunter' };
const details = { data: { playerDetails: { dps: [{ id: 7, name: 'Hillzy', combatantInfo: { gear: [], talents: [] } }] } } };

// Serves the meta query and per-stream event queries based on the request body.
function mockWcl(actors: any[], streams: Record<string, any[]>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const v = body.variables ?? {};
    const report = v.dataType
      ? { events: { data: streams[v.dataType] ?? [], nextPageTimestamp: null } }
      : { fights: [{ id: 3, startTime: 0, endTime: 300_000 }], masterData: { actors }, playerDetails: details };
    return new Response(JSON.stringify({ data: { reportData: { report } } }), { status: 200 });
  });
}

describe('player', () => {
  it('resolves player name to actor and emits gear, casts, buffs', async () => {
    const fetchMock = mockWcl([hillzy], {
      Casts: [{ type: 'cast', abilityGameID: 34120, timestamp: 100, sourceID: 7 }],
    });
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runPlayer({ code: 'ABC', fightId: 3, name: 'Hillzy', instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.player.name).toBe('Hillzy');
    expect(parsed.casts.length).toBe(1);
    expect(parsed.truncated).toBeUndefined();

    // every event query is filtered to the resolved actor
    for (const call of fetchMock.mock.calls) {
      const v = JSON.parse((call[1] as any).body).variables ?? {};
      if (v.dataType === 'Casts' || v.dataType === 'DamageDone') expect(v.sourceID).toBe(7);
      if (v.dataType === 'Buffs') expect(v.targetID).toBe(7);
    }
  });

  it('paginates event streams past the server page cap', async () => {
    const c1 = { type: 'cast', abilityGameID: 34120, timestamp: 100, sourceID: 7 };
    const c2 = { type: 'cast', abilityGameID: 34120, timestamp: 200_000, sourceID: 7 };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      const v = body.variables ?? {};
      let report: any;
      if (v.dataType === 'Casts') {
        report = { events: v.start < 150_000 ? { data: [c1], nextPageTimestamp: 150_000 } : { data: [c2], nextPageTimestamp: null } };
      } else if (v.dataType) {
        report = { events: { data: [], nextPageTimestamp: null } };
      } else if (body.query.includes('casts:')) {
        // legacy whole-fight query: the server silently caps each stream at one page
        report = {
          masterData: { actors: [hillzy] }, playerDetails: details,
          casts: { data: [c1] }, damage: { data: [] }, buffs: { data: [] },
        };
      } else {
        report = { fights: [{ id: 3, startTime: 0, endTime: 300_000 }], masterData: { actors: [hillzy] }, playerDetails: details };
      }
      return new Response(JSON.stringify({ data: { reportData: { report } } }), { status: 200 });
    });

    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runPlayer({ code: 'ABC', fightId: 3, name: 'Hillzy', instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.casts.map((c: any) => c.timestamp)).toEqual([100, 200_000]);
  });

  it('errors NOT_FOUND when name does not exist', async () => {
    mockWcl([], {});
    await expect(runPlayer({ code: 'ABC', fightId: 3, name: 'Ghost', instance: 'fresh', force: true, pretty: false, useCache: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
