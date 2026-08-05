import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheRoot } from '../skill-root.js';

interface Entry<T> { expiresAt: number; data: T; }

function cacheDir(): string {
  return cacheRoot();
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export function cacheKey(instance: string, query: string, vars: unknown): string {
  return createHash('sha256').update(instance).update('\0').update(query).update('\0').update(canonical(vars)).digest('hex').slice(0, 32);
}

function pathFor(key: string): string {
  return join(cacheDir(), `${key}.json`);
}

export function cacheGet<T>(key: string): T | null {
  const p = pathFor(key);
  if (!existsSync(p)) return null;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8')) as Entry<T>;
    if (entry.expiresAt < Date.now()) {
      rmSync(p);
      return null;
    }
    return entry.data;
  } catch {
    try { rmSync(p); } catch {}
    return null;
  }
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const entry: Entry<T> = { expiresAt: Date.now() + ttlSeconds * 1000, data };
  const final = pathFor(key);
  const tmp = final + '.tmp';
  writeFileSync(tmp, JSON.stringify(entry));
  renameSync(tmp, final);
}

export function cacheClear(prefix?: string): number {
  const dir = cacheDir();
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (prefix && !f.startsWith(prefix)) continue;
    rmSync(join(dir, f));
    removed++;
  }
  return removed;
}

export function cacheStats(): { entries: number; bytes: number; dir: string } {
  const dir = cacheDir();
  if (!existsSync(dir)) return { entries: 0, bytes: 0, dir };
  let entries = 0, bytes = 0;
  for (const f of readdirSync(dir)) {
    const s = statSync(join(dir, f));
    entries++;
    bytes += s.size;
  }
  return { entries, bytes, dir };
}
