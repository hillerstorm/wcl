import type { SimDb } from './db.js';

interface Indexes {
  spellById: Map<number, { id: number; name: string }>;
  itemById: Map<number, { id: number; name: string; [k: string]: unknown }>;
}

function buildIndexes(db: SimDb): Indexes {
  return {
    spellById: new Map((db.spells ?? []).map(s => [s.id, s])),
    itemById: new Map((db.items ?? []).map(i => [i.id, i])),
  };
}

function pickSimName(idx: Indexes, id: number | undefined | null): string | null {
  if (typeof id !== 'number') return null;
  return idx.spellById.get(id)?.name ?? null;
}

function pickSimItem(idx: Indexes, id: number | undefined | null) {
  if (typeof id !== 'number') return null;
  return idx.itemById.get(id) ?? null;
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walk(node: unknown, idx: Indexes, parentKey?: string): unknown {
  if (Array.isArray(node)) return node.map(n => walk(n, idx, parentKey));
  if (!isPlainObj(node)) return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = walk(v, idx, k);
  }

  if (typeof out.abilityGameID === 'number') {
    out.simName = pickSimName(idx, out.abilityGameID as number);
  }
  if (isPlainObj(out.ability) && typeof (out.ability as any).gameID === 'number') {
    (out.ability as any).simName = pickSimName(idx, (out.ability as any).gameID);
  }
  if (parentKey === 'gear' && typeof out.id === 'number') {
    out.simItem = pickSimItem(idx, out.id as number);
  }

  return out;
}

export function enrich<T>(payload: T, db: SimDb | null): T {
  if (!db) return payload;
  const idx = buildIndexes(db);
  return walk(payload, idx) as T;
}
