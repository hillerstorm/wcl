import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveExpansionPath, type Expansion } from './expansion.js';

export interface SimDb {
  items?: Array<{ id: number; name: string; stats?: Record<string, number>; [k: string]: unknown }>;
  spells?: Array<{ id: number; name: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

const cache = new Map<Expansion, SimDb | null>();

export function loadDb(exp: Expansion): SimDb | null {
  if (cache.has(exp)) return cache.get(exp)!;
  const expPath = resolveExpansionPath(exp);
  if (!expPath) {
    process.stderr.write(`warning: enrichment skipped — no sim path configured for ${exp} (run: wcl init)\n`);
    cache.set(exp, null);
    return null;
  }
  const dbPath = join(expPath, 'assets', 'database', 'db.json');
  if (!existsSync(dbPath)) {
    process.stderr.write(`warning: enrichment skipped — ${dbPath} not found\n`);
    cache.set(exp, null);
    return null;
  }
  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf8')) as SimDb;
    cache.set(exp, db);
    return db;
  } catch (e) {
    process.stderr.write(`warning: enrichment skipped — failed to parse ${dbPath}: ${String(e)}\n`);
    cache.set(exp, null);
    return null;
  }
}

export function clearDbCache(): void { cache.clear(); }
