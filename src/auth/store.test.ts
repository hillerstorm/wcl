import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, statSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCredentials, writeCredentials, clearCredentials, type Credentials } from './store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wcl-store-'));
  process.env.WCL_CONFIG_DIR = dir;
});

const sample: Credentials = {
  access_token: 'a.t',
  refresh_token: 'r.t',
  expires_at: 1_700_000_000_000,
  token_type: 'Bearer',
};

describe('credentials store', () => {
  it('returns null when no credentials file', () => {
    expect(readCredentials()).toBeNull();
  });

  it('writes 0600 file and reads it back', () => {
    writeCredentials(sample);
    const file = join(dir, 'credentials.json');
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(readCredentials()).toEqual(sample);
  });

  it('writes atomically via .tmp + rename', () => {
    writeCredentials(sample);
    const raw = readFileSync(join(dir, 'credentials.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('clearCredentials removes the file', () => {
    writeCredentials(sample);
    clearCredentials();
    expect(readCredentials()).toBeNull();
  });

  it('returns null when file is corrupt rather than throwing', () => {
    writeCredentials(sample);
    rmSync(join(dir, 'credentials.json'));
    writeFileSync(join(dir, 'credentials.json'), '{not json');
    expect(readCredentials()).toBeNull();
  });
});
