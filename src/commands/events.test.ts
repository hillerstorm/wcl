import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runEvents } from './events.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-ev-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-ev-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

const probe = {
  data: { reportData: { report: {
    fights: [{ id: 13, name: 'Garrosh Hellscream', startTime: 1000, endTime: 301_000 }],
    masterData: {
      actors: [
        { id: 33, name: 'Hillzy', type: 'Player', subType: 'Hunter', petOwner: null },
        { id: 44, name: 'Wolf', type: 'Pet', subType: 'Unknown', petOwner: 33 },
      ],
      abilities: [
        { gameID: 3044, name: 'Arcane Shot' },
        { gameID: 56641, name: 'Steady Shot' },
      ],
    },
  } } },
};

function eventsPage(events: unknown[], next: number | null) {
  return { data: { reportData: { report: { events: { data: events, nextPageTimestamp: next } } } } };
}

const baseOpts = {
  code: 'ABC', fightId: 13, type: 'damage', limit: 10000, maxPages: 20,
  hostile: false, jsonl: false, summary: false,
  instance: 'fresh' as const, force: true, pretty: false, useCache: false,
};

describe('events', () => {
  it('resolves source name, paginates until nextPageTimestamp is null, merges pages', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage(
        [{ type: 'damage', timestamp: 1100, sourceID: 33, targetID: 60, abilityGameID: 3044, amount: 500 }], 150_000)), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage(
        [{ type: 'damage', timestamp: 150_100, sourceID: 33, targetID: 60, abilityGameID: 56641, amount: 700 }], null)), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts, source: 'hillzy' });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.count).toBe(2);
    expect(parsed.pages).toBe(2);
    expect(parsed.truncated).toBeUndefined();
    expect(parsed.filter.sourceID).toBe(33);
    expect(parsed.events[1].abilityGameID).toBe(56641);
    // second page resumed from nextPageTimestamp
    const secondBody = JSON.parse((fetchSpy.mock.calls[2]![1] as any).body);
    expect(secondBody.variables.start).toBe(150_000);
    expect(secondBody.variables.end).toBe(301_000);
  });

  it('--summary aggregates by ability with resolved names', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage([
        { type: 'damage', timestamp: 1100, sourceID: 33, targetID: 60, abilityGameID: 3044, amount: 500 },
        { type: 'damage', timestamp: 1200, sourceID: 33, targetID: 60, abilityGameID: 3044, amount: 600 },
        { type: 'damage', timestamp: 1300, sourceID: 44, targetID: 60, abilityGameID: 56641, amount: 100 },
      ], null)), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { reportData: { report: { masterData: { abilities: [
          { gameID: 3044, name: 'Arcane Shot' },
          { gameID: 56641, name: 'Steady Shot' },
        ] } } } },
      }), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts, summary: true });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.count).toBe(3);
    expect(parsed.events).toBeUndefined();
    expect(parsed.byType.damage).toBe(3);
    expect(parsed.byAbility[0]).toEqual({ id: 3044, name: 'Arcane Shot', count: 2, total: 1100 });
    expect(parsed.bySource[0]).toEqual({ id: 33, name: 'Hillzy', count: 2 });
  });

  it('--jsonl emits one event per line with no wrapper', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage([
        { type: 'cast', timestamp: 1100, abilityGameID: 3044 },
        { type: 'cast', timestamp: 1200, abilityGameID: 3044 },
      ], null)), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts, type: 'casts', jsonl: true });

    const lines = out.join('').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).type).toBe('cast');
  });

  it('marks output truncated when max-pages is hit', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage(
        [{ type: 'damage', timestamp: 1100 }], 150_000)), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts, maxPages: 1 });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.truncated).toBe(true);
    expect(parsed.nextPageTimestamp).toBe(150_000);
  });

  it('fetches the report probe once across fights (per-report cache key)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      const v = body.variables ?? {};
      const report = v.dataType
        ? { events: { data: [{ type: 'damage', timestamp: 1100 }], nextPageTimestamp: null } }
        : { fights: [
            { id: 13, name: 'Garrosh Hellscream', startTime: 1000, endTime: 301_000 },
            { id: 14, name: 'Garrosh Hellscream', startTime: 400_000, endTime: 700_000 },
          ], masterData: { actors: [] } };
      return new Response(JSON.stringify({ data: { reportData: { report } } }), { status: 200 });
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runEvents({ ...baseOpts, useCache: true, fightId: 13 });
    await runEvents({ ...baseOpts, useCache: true, fightId: 14 });

    const probeCalls = fetchMock.mock.calls
      .filter(c => !(JSON.parse((c[1] as any).body).variables?.dataType));
    expect(probeCalls.length).toBe(1);
  });

  it('--hostile passes hostilityType Enemies and records it in the filter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage(
        [{ type: 'cast', timestamp: 1100, sourceID: 60, abilityGameID: 144821 }], null)), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts, type: 'casts', hostile: true });

    const eventsBody = JSON.parse((fetchSpy.mock.calls[1]![1] as any).body);
    expect(eventsBody.variables.hostility).toBe('Enemies');
    const parsed = JSON.parse(out.join(''));
    expect(parsed.filter.hostility).toBe('Enemies');
    expect(parsed.count).toBe(1);
  });

  it('omits hostility from variables and filter by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(eventsPage([], null)), { status: 200 }));
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });

    await runEvents({ ...baseOpts });

    const eventsBody = JSON.parse((fetchSpy.mock.calls[1]![1] as any).body);
    expect('hostility' in eventsBody.variables).toBe(false);
    expect('hostility' in JSON.parse(out.join('')).filter).toBe(false);
  });

  it('rejects an unknown --type', async () => {
    await expect(runEvents({ ...baseOpts, type: 'nonsense' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('fails on unknown source name with a hint', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(probe), { status: 200 }));
    await expect(runEvents({ ...baseOpts, source: 'Nobody' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
