import type { Credentials } from './store.js';
import { TOKEN_URL } from './constants.js';
import { CliError } from '../output.js';

export interface ExchangeArgs { code: string; verifier: string; redirectUri: string; clientId: string; }
export interface RefreshArgs { refreshToken: string; clientId: string; }

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

async function post(body: URLSearchParams): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CliError(
      'NOT_AUTHENTICATED',
      `token endpoint returned ${res.status}: ${text.slice(0, 200)}`,
      'check the client ID or re-run: wcl auth',
    );
  }
  const json = (await res.json()) as TokenResponse;
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    token_type: 'Bearer',
  };
}

export function exchangeCode(a: ExchangeArgs): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: a.code,
    redirect_uri: a.redirectUri,
    client_id: a.clientId,
    code_verifier: a.verifier,
  });
  return post(body);
}

export function refreshTokens(a: RefreshArgs): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: a.refreshToken,
    client_id: a.clientId,
  });
  return post(body);
}
