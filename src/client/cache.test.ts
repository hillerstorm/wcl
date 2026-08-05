import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheGet, cacheSet, cacheClear, cacheStats, cacheKey } from './cache.js';

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'wcl-cache-'));
  process.env.WCL_CACHE_DIR = dir;
});

describe('cache', () => {
  it('cacheKey is stable across variable-order permutations', () => {
    const k1 = cacheKey('fresh', 'query { x }', { a: 1, b: 2 });
    const k2 = cacheKey('fresh', 'query { x }', { b: 2, a: 1 });
    expect(k1).toBe(k2);
  });

  it('cacheKey differs across instances', () => {
    const k1 = cacheKey('fresh', 'query { x }', {});
    const k2 = cacheKey('retail', 'query { x }', {});
    expect(k1).not.toBe(k2);
  });

  it('cacheGet returns null for missing key', () => {
    expect(cacheGet('nope')).toBeNull();
  });

  it('cacheSet + cacheGet roundtrip honors TTL', () => {
    cacheSet('k', { hello: 'world' }, 3600);
    expect(cacheGet('k')).toEqual({ hello: 'world' });
  });

  it('expired entries return null', () => {
    cacheSet('k', { v: 1 }, -1);
    expect(cacheGet('k')).toBeNull();
  });

  it('corrupt entry returns null and self-cleans', () => {
    cacheSet('k', { v: 1 }, 3600);
    const dir = process.env.WCL_CACHE_DIR!;
    const file = readdirSync(dir).find((f) => f.startsWith('k.'))!;
    writeFileSync(join(dir, file), 'not json');
    expect(cacheGet('k')).toBeNull();
  });

  it('cacheClear with no prefix wipes everything', () => {
    cacheSet('a', { v: 1 }, 3600);
    cacheSet('b', { v: 2 }, 3600);
    cacheClear();
    expect(cacheGet('a')).toBeNull();
    expect(cacheGet('b')).toBeNull();
  });

  it('cacheStats reports entry count', () => {
    cacheSet('a', { v: 1 }, 3600);
    cacheSet('b', { v: 2 }, 3600);
    const s = cacheStats();
    expect(s.entries).toBe(2);
    expect(s.bytes).toBeGreaterThan(0);
  });
});
