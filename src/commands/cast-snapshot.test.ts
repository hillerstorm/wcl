import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runCastSnapshot } from './cast-snapshot.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-cs-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-cs-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const hillzy = { id: 7, name: 'Hillzy', type: 'Player', subType: 'Hunter' };
const details = { data: { playerDetails: { dps: [{ id: 7, name: 'Hillzy', combatantInfo: { gear: [{ id: 30900 }], talents: [] } }] } } };

// Serves the probe and per-stream event queries based on the request body.
function mockWcl(streams: Record<string, any[]>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const v = body.variables ?? {};
    const report = v.dataType
      ? { events: { data: streams[v.dataType] ?? [], nextPageTimestamp: null } }
      : {
          fights: [{ id: 3, startTime: 0, endTime: 300_000, encounterID: 651, kill: true }],
          masterData: { actors: [hillzy] },
          playerDetails: details,
        };
    return new Response(JSON.stringify({ data: { reportData: { report } } }), { status: 200 });
  });
}

const streams = {
  Casts: [
    { type: 'cast', timestamp: 150000, abilityGameID: 34120, sourceID: 7 },
    { type: 'cast', timestamp: 153000, abilityGameID: 34120, sourceID: 7 },
  ],
  DamageDone: [
    { type: 'damage', timestamp: 153500, abilityGameID: 34120, sourceID: 7, targetID: 99, amount: 1200, hitType: 1 },
  ],
  Buffs: [
    { type: 'applybuff', timestamp: 50000, abilityGameID: 23867, sourceID: 7, targetID: 7 },
  ],
  Debuffs: [
    { type: 'applydebuff', timestamp: 60000, abilityGameID: 1130, sourceID: 7, targetID: 99 },
  ],
};

describe('cast-snapshot', () => {
  it('selects the cast at --at and includes active buffs/debuffs', async () => {
    const fetchMock = mockWcl(streams);

    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runCastSnapshot({
      code: 'ABC', fightId: 3, name: 'Hillzy',
      at: 153000, window: 5000,
      instance: 'fresh', force: true, pretty: false, useCache: false,
    });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.cast.timestamp).toBe(153000);
    expect(parsed.caster.activeBuffs.some((b: any) => b.abilityGameID === 23867)).toBe(true);
    expect(parsed.target?.activeDebuffs?.some((d: any) => d.abilityGameID === 1130)).toBe(true);
    expect(parsed.surroundingCasts.length).toBeGreaterThanOrEqual(1);
    expect(parsed.fight.encounterID).toBe(651);

    // the debuff stream is fetched for the resolved target only
    const debuffCall = fetchMock.mock.calls
      .map(c => JSON.parse((c[1] as any).body).variables ?? {})
      .find(v => v.dataType === 'Debuffs');
    expect(debuffCall?.targetID).toBe(99);
  });

  it('finds a cast beyond the first event page (no silent truncation)', async () => {
    const c1 = { type: 'cast', timestamp: 100, abilityGameID: 34120, sourceID: 7 };
    const c2 = { type: 'cast', timestamp: 200_000, abilityGameID: 34120, sourceID: 7, targetID: 99 };

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
          fights: [{ id: 3, startTime: 0, endTime: 300_000, encounterID: 651, kill: true }],
          playerDetails: details,
          casts: { data: [c1] }, damage: { data: [] }, buffs: { data: [] }, debuffs: { data: [] },
        };
      } else {
        report = {
          fights: [{ id: 3, startTime: 0, endTime: 300_000, encounterID: 651, kill: true }],
          masterData: { actors: [hillzy] }, playerDetails: details,
        };
      }
      return new Response(JSON.stringify({ data: { reportData: { report } } }), { status: 200 });
    });

    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runCastSnapshot({
      code: 'ABC', fightId: 3, name: 'Hillzy', at: 200_000, window: 5000,
      instance: 'fresh', force: true, pretty: false, useCache: false,
    });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.cast.timestamp).toBe(200_000);
  });

  it('selects the Nth cast of an ability with --ability + --index', async () => {
    mockWcl(streams);

    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runCastSnapshot({
      code: 'ABC', fightId: 3, name: 'Hillzy',
      ability: 34120, index: 1, window: 5000,
      instance: 'fresh', force: true, pretty: false, useCache: false,
    });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.cast.timestamp).toBe(150000);
  });
});
