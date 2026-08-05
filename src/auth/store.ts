import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { configRoot } from '../skill-root.js';

export interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: 'Bearer';
}

function configDir(): string {
  return configRoot();
}

function file(): string {
  return join(configDir(), 'credentials.json');
}

export function readCredentials(): Credentials | null {
  const path = file();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Credentials;
    if (typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCredentials(c: Credentials): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = file();
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(c, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

export function clearCredentials(): void {
  const path = file();
  if (existsSync(path)) rmSync(path);
}
