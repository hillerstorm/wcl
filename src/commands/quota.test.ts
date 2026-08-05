import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runQuota } from './quota.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-quota-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-quota-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('quota command', () => {
  it('prints rate-limit JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {}, rateLimitData: { pointsSpentThisHour: 5, limitPerHour: 1000, pointsResetIn: 600 } }), { status: 200 }),
    );
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { lines.push(c.toString()); return true; });

    await runQuota({ instance: 'fresh', force: true, pretty: false });

    const parsed = JSON.parse(lines.join(''));
    expect(parsed.pointsSpent).toBe(5);
    expect(parsed.pointsAllowed).toBe(1000);
  });
});
