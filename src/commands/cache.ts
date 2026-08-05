import { cacheStats, cacheClear } from '../client/cache.js';
import { writeStdout, CliError } from '../output.js';

export interface CacheOptions { action: string; prefix?: string; pretty: boolean; }

export function runCache(opts: CacheOptions): void {
  if (opts.action === 'stats') {
    writeStdout(cacheStats(), opts.pretty);
  } else if (opts.action === 'clear') {
    const removed = cacheClear(opts.prefix);
    writeStdout({ removed }, opts.pretty);
  } else {
    throw new CliError('BAD_INPUT', `cache subcommand must be "stats" or "clear", got "${opts.action}"`);
  }
}
