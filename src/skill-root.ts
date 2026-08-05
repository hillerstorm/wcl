import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null | undefined;

/**
 * Root of a repo checkout (package.json + skills/wcl/SKILL.md), found by
 * walking up from the running script. Null when installed via npm — the
 * published package ships only dist/, so the marker never matches.
 */
export function skillRoot(): string | null {
  if (cached !== undefined) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'skills', 'wcl', 'SKILL.md'))) {
      return (cached = dir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (cached = null);
}

/** Where config.json + credentials.json live: $WCL_CONFIG_DIR, else the repo checkout root, else XDG. */
export function configRoot(): string {
  return (
    process.env.WCL_CONFIG_DIR ??
    skillRoot() ??
    join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'wcl')
  );
}

/** Where the response cache lives: $WCL_CACHE_DIR, else <repo>/.cache, else XDG. */
export function cacheRoot(): string {
  if (process.env.WCL_CACHE_DIR) return process.env.WCL_CACHE_DIR;
  const root = skillRoot();
  return root ? join(root, '.cache') : join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'wcl');
}
