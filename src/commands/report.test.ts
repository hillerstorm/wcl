import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runReport } from './report.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-report-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-report-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('report', () => {
  it('fetches a report and emits {report, rateLimit}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: { reportData: { report: { title: 'Karazhan', code: 'ABC', startTime: 1, endTime: 2, owner: { name: 'X' }, fights: [], masterData: {} } } },
      }), { status: 200 }),
    );
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { out.push(c.toString()); return true; });
    await runReport({ code: 'ABC', instance: 'fresh', force: true, pretty: false, useCache: false });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.report.title).toBe('Karazhan');
  });
});
