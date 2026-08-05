import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runFight } from './fight.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-fight-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-fight-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('fight', () => {
  it('fetches a fight and damage-done table', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: { reportData: { report: {
          fights: [{ id: 3, name: 'Magtheridon', startTime: 0, endTime: 300_000, encounterID: 651, kill: true }],
          table: { data: { entries: [{ name: 'Hillzy', total: 1234 }] } },
        } } },
      }), { status: 200 }),
    );
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runFight({ code: 'ABC', fightId: 3, instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.fight.name).toBe('Magtheridon');
    expect(parsed.damageDone.entries[0].name).toBe('Hillzy');
  });
});
