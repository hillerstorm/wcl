import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configRoot } from './skill-root.js';

export interface UserConfig {
  clientId?: string;
  simPaths?: Record<string, string>;
}

export function configPath(): string {
  return join(configRoot(), 'config.json');
}

export function readConfig(): UserConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as UserConfig;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

export function writeConfig(cfg: UserConfig): string {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  return path;
}
