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
  const dbDir = join(expPath, 'assets', 'database');
  const dbPath = join(dbDir, 'db.json');
  if (!existsSync(dbPath)) {
    process.stderr.write(`warning: enrichment skipped — ${dbPath} not found\n`);
    cache.set(exp, null);
    return null;
  }
  try {
    const db = JSON.parse(readFileSync(dbPath, 'utf8')) as SimDb;
    mergeLeftoverItems(db, join(dbDir, 'leftover_db.json'));
    cache.set(exp, db);
    return db;
  } catch (e) {
    process.stderr.write(`warning: enrichment skipped — failed to parse ${dbPath}: ${String(e)}\n`);
    cache.set(exp, null);
    return null;
  }
}

/**
 * The sims keep items their UI filters out (quest greens, random-suffix gear, …) in
 * leftover_db.json. Logs are full of those — most of a levelling Forever character's gear —
 * so append them for by-ID lookups. db.json wins on a duplicate ID.
 */
function mergeLeftoverItems(db: SimDb, leftoverPath: string): void {
  if (!existsSync(leftoverPath)) return;
  try {
    const leftover = JSON.parse(readFileSync(leftoverPath, 'utf8')) as SimDb;
    if (!Array.isArray(leftover.items)) return;
    const items = db.items ?? [];
    const known = new Set(items.map(i => i.id));
    db.items = [...items, ...leftover.items.filter(i => i != null && !known.has(i.id))];
  } catch (e) {
    process.stderr.write(`warning: ignoring ${leftoverPath}: ${String(e)}\n`);
  }
}

export function clearDbCache(): void { cache.clear(); }
