import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runGear } from './gear.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-gear-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-gear-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const gearItem = (over: Record<string, unknown>) => ({
  id: 0, slot: 0, quality: 4, icon: 'x.jpg', name: 'Item', itemLevel: 100, ...over,
});

const bossResponse = {
  data: { reportData: { report: {
    fights: [{ id: 34, startTime: 1000, endTime: 61_000, kill: true, encounterID: 50650 }],
    playerDetails: { data: { playerDetails: {
      tanks: [],
      healers: [{ id: 7, name: 'Healy', combatantInfo: { stats: {}, gear: [gearItem({ id: 111, name: 'Hood' })] } }],
      dps: [{ id: 3, name: 'Zoox', combatantInfo: { stats: {}, gear: [
        gearItem({ id: 28275, name: 'Beast Lord Helm', quality: 3, itemLevel: 115, permanentEnchant: 3003, permanentEnchantName: '+5 AP', gems: [{ id: 28362, itemLevel: 60 }, { id: 32409, itemLevel: 70 }], setID: 650 }),
        gearItem({ id: 0, slot: 3 }),
        gearItem({ id: 29381, slot: 15, name: 'Crystalforged Sword', temporaryEnchant: 2629, temporaryEnchantName: 'Windfury' }),
      ] } }],
    } } },
  } } },
};

const trashResponse = {
  data: { reportData: { report: {
    fights: [{ id: 2, startTime: 0, endTime: 30_000, kill: null, encounterID: 0 }],
    playerDetails: { data: { playerDetails: {
      tanks: [], healers: [], dps: [{ id: 3, name: 'Zoox', combatantInfo: [] }],
    } } },
  } } },
};

const baseOpts = {
  code: 'ABC', fightId: 34, name: 'Zoox',
  instance: 'fresh' as const, force: true, pretty: false, useCache: false,
};

describe('gear', () => {
  it('maps combatantInfo gear to slots, enchants, gems, and gearIds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(bossResponse), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runGear(baseOpts);

    const parsed = JSON.parse(out.join(''));
    expect(parsed.player).toEqual({ id: 3, name: 'Zoox' });
    expect(parsed.fight.encounterID).toBe(50650);
    expect(parsed.gearIds).toHaveLength(19);
    expect(parsed.gearIds[0]).toBe(28275);
    expect(parsed.gearIds[3]).toBe(0);
    expect(parsed.gearIds[15]).toBe(29381);
    expect(parsed.items).toHaveLength(2); // empty slot 3 filtered out
    const helm = parsed.items[0];
    expect(helm).toMatchObject({
      slotIndex: 0, slotName: 'Head', itemId: 28275, name: 'Beast Lord Helm',
      itemLevel: 115, quality: 'rare', enchantId: 3003, enchantName: '+5 AP',
      gemIds: [28362, 32409], setId: 650,
    });
    const weapon = parsed.items[1];
    expect(weapon).toMatchObject({
      slotName: 'MainHand', temporaryEnchantId: 2629, temporaryEnchantName: 'Windfury',
      enchantId: null, gemIds: [],
    });
  });

  it('rejects trash pulls with BAD_INPUT (combatantInfo is an empty array)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(trashResponse), { status: 200 }));
    await expect(runGear({ ...baseOpts, fightId: 2 })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('errors NOT_FOUND for unknown players and missing fights', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(bossResponse), { status: 200 }));
    await expect(runGear({ ...baseOpts, name: 'Nobody' })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const noFight = { data: { reportData: { report: { fights: [], playerDetails: { data: { playerDetails: {} } } } } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(noFight), { status: 200 }));
    await expect(runGear(baseOpts)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
