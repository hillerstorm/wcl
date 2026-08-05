import { describe, it, expect, vi, afterEach } from 'vitest';
import { exchangeCode, refreshTokens } from './exchange.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('token exchange', () => {
  it('exchanges code + verifier for tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const before = Date.now();
    const result = await exchangeCode({ code: 'CODE', verifier: 'V', redirectUri: 'http://x', clientId: 'CID' });
    const after = Date.now();

    expect(result.access_token).toBe('a');
    expect(result.refresh_token).toBe('r');
    expect(result.expires_at).toBeGreaterThanOrEqual(before + 3600_000);
    expect(result.expires_at).toBeLessThanOrEqual(after + 3600_000);

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('https://www.warcraftlogs.com/oauth/token');
    const body = (call[1]!.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('code_verifier')).toBe('V');
    expect(body.get('client_id')).toBe('CID');
  });

  it('refreshes with refresh_token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'a2',
        refresh_token: 'r2',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200 }),
    );

    const r = await refreshTokens({ refreshToken: 'OLD', clientId: 'CID' });
    expect(r.access_token).toBe('a2');
    const body = (fetchMock.mock.calls[0]![1]!.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('OLD');
  });

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 401 }));
    await expect(exchangeCode({ code: 'C', verifier: 'V', redirectUri: 'r', clientId: 'cid' }))
      .rejects.toThrow(/401/);
  });
});
