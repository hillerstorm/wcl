import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runCastSnapshot } from './cast-snapshot.js';

const probeReport = {
  data: { reportData: { report: {
    fights: [{ id: 3, startTime: 0, endTime: 300_000 }],
    masterData: { actors: [{ id: 7, name: 'Hillzy', type: 'Player', subType: 'Hunter' }] },
  } } },
};

const snapshotReport = {
  data: { reportData: { report: {
    fights: [{ id: 3, startTime: 0, endTime: 300_000, encounterID: 651, kill: true }],
    casts: { data: [
      { type: 'cast', timestamp: 150000, abilityGameID: 34120, sourceID: 7 },
      { type: 'cast', timestamp: 153000, abilityGameID: 34120, sourceID: 7 },
    ] },
    damage: { data: [
      { type: 'damage', timestamp: 153500, abilityGameID: 34120, sourceID: 7, targetID: 99, amount: 1200, hitType: 1 },
    ] },
    buffs: { data: [
      { type: 'applybuff', timestamp: 50000, abilityGameID: 23867, sourceID: 7, targetID: 7 },
    ] },
    debuffs: { data: [
      { type: 'applydebuff', timestamp: 60000, abilityGameID: 1130, sourceID: 7, targetID: 99 },
    ] },
    playerDetails: { data: { playerDetails: { dps: [{ id: 7, name: 'Hillzy', combatantInfo: { gear: [{ id: 30900 }], talents: [] } }] } } },
  } } },
};

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-cs-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-cs-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('cast-snapshot', () => {
  it('selects the cast at --at and includes active buffs/debuffs', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probeReport), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshotReport), { status: 200 }));

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
  });

  it('selects the Nth cast of an ability with --ability + --index', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probeReport), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshotReport), { status: 200 }));

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
