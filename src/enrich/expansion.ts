import { join } from 'node:path';
import { readConfig } from '../config.js';
import type { Instance } from '../client/graphql.js';

export type Expansion = 'tbc' | 'mop' | 'classic' | 'sod';
export const ALL_EXPANSIONS: readonly Expansion[] = ['tbc', 'mop', 'classic', 'sod'];

const DIR_NAMES: Record<Expansion, string> = {
  tbc: 'tbc-new',
  mop: 'mop',
  classic: 'classic',
  sod: 'sod',
};

const INSTANCE_FOR: Record<Expansion, Instance> = {
  tbc: 'fresh',
  mop: 'classic',
  classic: 'vanilla',
  sod: 'sod',
};

export function isExpansion(s: unknown): s is Expansion {
  return typeof s === 'string' && (ALL_EXPANSIONS as readonly string[]).includes(s);
}

export function resolveExpansionPath(exp: Expansion): string | null {
  const envRoot = process.env.WCL_WOWSIMS_ROOT;
  if (envRoot) return join(envRoot, DIR_NAMES[exp]);

  const fromConfig = readConfig().simPaths?.[exp]?.trim();
  if (fromConfig) return fromConfig;

  return null;
}

export function defaultInstanceForExpansion(exp: Expansion): Instance {
  return INSTANCE_FOR[exp];
}
