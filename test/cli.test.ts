import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '../src/cli.ts');

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', CLI, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: e.status ?? 1,
    };
  }
}

describe('cli', () => {
  it('shows --help with all subcommands', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    for (const cmd of ['auth', 'query', 'report', 'fight', 'player', 'cast-snapshot', 'search', 'quota', 'cache']) {
      expect(r.stdout).toContain(cmd);
    }
  });

  it('exits nonzero on unknown subcommand', () => {
    const r = runCli(['nonsense']);
    expect(r.status).not.toBe(0);
  });
});
