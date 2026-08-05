import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '../src/cli.ts');

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  // Isolated config/cache dirs so the spawned CLI never sees real credentials.
  const env = {
    ...process.env,
    WCL_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'wcl-cli-cfg-')),
    WCL_CACHE_DIR: mkdtempSync(join(tmpdir(), 'wcl-cli-cache-')),
  };
  try {
    const stdout = execFileSync('npx', ['tsx', CLI, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
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

  it('rejects a non-integer numeric option as BAD_INPUT (exit 7)', () => {
    const r = runCli(['events', 'ABC123', '1', '--max-pages', 'abc']);
    expect(r.status).toBe(7);
    const err = JSON.parse(r.stderr);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.message).toMatch(/max-pages/);
  });

  it('rejects a non-integer fightId as BAD_INPUT (exit 7)', () => {
    const r = runCli(['fight', 'ABC123', 'xyz']);
    expect(r.status).toBe(7);
    expect(JSON.parse(r.stderr).code).toBe('BAD_INPUT');
  });

  it('rejects an unknown --instance as BAD_INPUT (exit 7)', () => {
    const r = runCli(['--instance', 'bogus', 'report', 'ABC123']);
    expect(r.status).toBe(7);
    const err = JSON.parse(r.stderr);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.hint).toMatch(/fresh/);
  });
});
