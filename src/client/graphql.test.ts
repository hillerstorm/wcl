import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gqlRequest, INSTANCE_HOSTS } from './graphql.js';
import { writeCredentials } from '../auth/store.js';

beforeEach(() => {
  const cfg = mkdtempSync(join(tmpdir(), 'wcl-gql-cfg-'));
  const cache = mkdtempSync(join(tmpdir(), 'wcl-gql-cache-'));
  process.env.WCL_CONFIG_DIR = cfg;
  process.env.WCL_CACHE_DIR = cache;
  process.env.WCL_CLIENT_ID = 'test-client-id';
});

afterEach(() => { vi.restoreAllMocks(); });

describe('gqlRequest', () => {
  it('sends a POST with Authorization Bearer to the correct instance', async () => {
    writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { x: 1 }, rateLimitData: { pointsSpentThisHour: 5, limitPerHour: 1000, pointsResetIn: 600 } }), { status: 200 }),
    );

    const r = await gqlRequest({ instance: 'fresh', query: 'query { x }', variables: {}, force: true, useCache: false });
    expect(r.data).toEqual({ x: 1 });
    expect(r.rateLimit?.pointsAllowed).toBe(1000);

    const url = fetchMock.mock.calls[0]![0];
    expect(url).toBe(INSTANCE_HOSTS.fresh + '/api/v2/user');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
  });

  it('throws NOT_AUTHENTICATED when no credentials', async () => {
    await expect(gqlRequest({ instance: 'fresh', query: 'q', variables: {}, force: true, useCache: false }))
      .rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('refreshes when token is within 60s of expiry', async () => {
    writeCredentials({ access_token: 'old', refresh_token: 'r', expires_at: Date.now() + 30_000, token_type: 'Bearer' });

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, token_type: 'Bearer' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { x: 1 } }), { status: 200 }));

    await gqlRequest({ instance: 'fresh', query: 'q', variables: {}, force: true, useCache: false });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://www.warcraftlogs.com/oauth/token');
    const second = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
    expect(second.authorization).toBe('Bearer new');
  });

  it('throws GRAPHQL_ERROR when response has errors and no data', async () => {
    writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null, errors: [{ message: 'boom' }] }), { status: 200 }),
    );
    await expect(gqlRequest({ instance: 'fresh', query: 'q', variables: {}, force: true, useCache: false }))
      .rejects.toMatchObject({ code: 'GRAPHQL_ERROR' });
  });

  it('returns cached data on second call', async () => {
    writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { x: 1 } }), { status: 200 }),
    );

    await gqlRequest({ instance: 'fresh', query: 'q', variables: { a: 1 }, force: true, useCache: true, cacheTtlSeconds: 3600 });
    await gqlRequest({ instance: 'fresh', query: 'q', variables: { a: 1 }, force: true, useCache: true, cacheTtlSeconds: 3600 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws RATE_LIMITED on 429', async () => {
    writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    await expect(gqlRequest({ instance: 'fresh', query: 'q', variables: {}, force: true, useCache: false }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
