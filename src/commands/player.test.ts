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

const probeReport = {
  data: { reportData: { report: { fights: [{ id: 3, startTime: 0, endTime: 300_000 }] } } },
};

const playerReport = {
  data: { reportData: { report: {
    masterData: { actors: [{ id: 7, name: 'Hillzy', type: 'Player', subType: 'Hunter' }] },
    playerDetails: { data: { playerDetails: { dps: [{ id: 7, name: 'Hillzy', combatantInfo: { gear: [], talents: [] } }] } } },
    casts: { data: [{ type: 'cast', abilityGameID: 34120, timestamp: 100, sourceID: 7 }] },
    damage: { data: [] },
    buffs: { data: [] },
  } } },
};

const playerReportEmpty = {
  data: { reportData: { report: {
    masterData: { actors: [] },
    playerDetails: { data: { playerDetails: { dps: [] } } },
    casts: { data: [] },
    damage: { data: [] },
    buffs: { data: [] },
  } } },
};

describe('player', () => {
  it('resolves player name to actor and emits gear, casts, buffs', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probeReport), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(playerReport), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runPlayer({ code: 'ABC', fightId: 3, name: 'Hillzy', instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.player.name).toBe('Hillzy');
    expect(parsed.casts.length).toBe(1);
  });

  it('errors NOT_FOUND when name does not exist', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probeReport), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(playerReportEmpty), { status: 200 }));
    await expect(runPlayer({ code: 'ABC', fightId: 3, name: 'Ghost', instance: 'fresh', force: true, pretty: false, useCache: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
