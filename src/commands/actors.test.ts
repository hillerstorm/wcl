import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runActors } from './actors.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-ac-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-ac-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const report = {
  data: { reportData: { report: {
    code: 'ABC',
    fights: [],
    masterData: { actors: [
      { id: 1, name: 'Hillzy', type: 'Player', subType: 'Hunter', petOwner: null },
      { id: 2, name: 'Bååge', type: 'Player', subType: 'Mage', petOwner: null },
      { id: 3, name: 'Wolf', type: 'Pet', subType: 'Unknown', petOwner: 1 },
      { id: 4, name: 'Garrosh Hellscream', type: 'NPC', subType: 'Boss', petOwner: null },
    ], abilities: [] },
  } } },
};

const baseOpts = {
  code: 'ABC', json: false,
  instance: 'fresh' as const, force: true, pretty: false, useCache: false,
};

describe('actors', () => {
  it('defaults to players only, as a text table', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runActors(baseOpts);

    const lines = out.join('').trim().split('\n');
    expect(lines.length).toBe(3); // header + 2 players
    expect(lines[0]).toMatch(/^ID\s+TYPE\s+CLASS\s+OWNER\s+NAME$/);
    expect(out.join('')).toContain('Hillzy');
    expect(out.join('')).not.toContain('Garrosh');
  });

  it('--owner lists a player\'s pets with the owner name resolved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runActors({ ...baseOpts, owner: 'hillzy', json: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.actors.length).toBe(1);
    expect(parsed.actors[0].name).toBe('Wolf');
  });

  it('--class and --type filter case-insensitively', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runActors({ ...baseOpts, type: 'all', className: 'mage', json: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.actors.length).toBe(1);
    expect(parsed.actors[0].name).toBe('Bååge');
  });

  it('rejects an unknown --type', async () => {
    await expect(runActors({ ...baseOpts, type: 'boss' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});
