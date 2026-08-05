import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheSet } from '../client/cache.js';
import { runCache } from './cache.js';

beforeEach(() => {
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-cmd-cache-'));
});

describe('cache command', () => {
  it('stats reports counts', () => {
    cacheSet('a', { v: 1 }, 3600);
    cacheSet('b', { v: 2 }, 3600);
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    runCache({ action: 'stats', pretty: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.entries).toBe(2);
  });

  it('clear with no prefix wipes everything', () => {
    cacheSet('a', { v: 1 }, 3600);
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    runCache({ action: 'clear', pretty: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.removed).toBe(1);
  });
});
