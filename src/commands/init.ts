import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { readConfig, writeConfig, type UserConfig } from '../config.js';
import { ALL_EXPANSIONS } from '../enrich/expansion.js';
import { REDIRECT_URI } from '../auth/constants.js';
import { CliError } from '../output.js';

export type Prompt = (question: string) => Promise<string>;
export interface InitIO { prompt: Prompt; log: (s: string) => void; pathExists?: (p: string) => boolean; }

function expandPath(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(p);
}

export async function buildConfig(current: UserConfig, io: InitIO): Promise<UserConfig> {
  const exists = io.pathExists ?? existsSync;

  io.log('wcl init — first-time setup.\n');
  io.log('Press Enter to keep the current value (shown in brackets). Type "-" to clear/skip.\n\n');

  // ── client ID ────────────────────────────────────────────
  let clientId = current.clientId?.trim() ?? '';
  for (;;) {
    const label = clientId ? `[${clientId.slice(0, 8)}…]` : '[required]';
    const ans = (await io.prompt(`WCL client ID ${label}: `)).trim();
    if (ans === '-') {
      io.log('  → client ID is required, cannot be cleared.\n');
      continue;
    }
    if (!ans) {
      if (clientId) break;
      io.log(`  → required. Register a public client at https://www.warcraftlogs.com/api/clients/ (redirect URL: ${REDIRECT_URI})\n`);
      continue;
    }
    clientId = ans;
    break;
  }

  // ── sim paths ────────────────────────────────────────────
  io.log('\nSim project paths (used for --expansion enrichment).\n');
  io.log('Enter the absolute path to each repo, or press Enter to skip.\n\n');

  const simPaths: Record<string, string> = { ...(current.simPaths ?? {}) };
  for (const exp of ALL_EXPANSIONS) {
    const currentPath = simPaths[exp] ?? '';
    const label = currentPath ? `[${currentPath}]` : '[skip]';
    const ans = (await io.prompt(`  ${exp} sim path ${label}: `)).trim();
    if (ans === '-') { delete simPaths[exp]; continue; }
    if (!ans) continue;
    const expanded = expandPath(ans);
    simPaths[exp] = expanded;
    const dbPath = join(expanded, 'assets', 'database', 'db.json');
    if (!exists(dbPath)) {
      io.log(`    note: ${dbPath} not found — saved anyway. Build the sim's db.json when ready.\n`);
    }
  }

  const result: UserConfig = { clientId };
  if (Object.keys(simPaths).length > 0) result.simPaths = simPaths;
  return result;
}

export async function runInit(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new CliError(
      'BAD_INPUT',
      'wcl init requires an interactive terminal (stdin is not a TTY).',
      'For non-interactive setup, copy config.example.json to config.json and edit it, or set $WCL_CLIENT_ID and $WCL_WOWSIMS_ROOT.',
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const result = await buildConfig(readConfig(), {
      prompt: (q) => rl.question(q),
      log: (s) => process.stderr.write(s),
    });
    const path = writeConfig(result);
    process.stderr.write(`\nWrote ${path}\n`);
    process.stderr.write('Next: run `wcl auth` to complete OAuth.\n');
    process.stdout.write(JSON.stringify({ status: 'initialized', path }) + '\n');
  } finally {
    rl.close();
  }
}
