import type { Credentials } from './store.js';
import { TOKEN_URL } from './constants.js';
import { CliError } from '../output.js';

export interface ExchangeArgs { code: string; verifier: string; redirectUri: string; clientId: string; }
export interface RefreshArgs { refreshToken: string; clientId: string; }

interface TokenResponse {
  access_token: string;
  refresh_token?: string;  // RFC 6749 §6: the server MAY omit it on refresh
  expires_in: number;
  token_type: 'Bearer';
}

async function post(body: URLSearchParams): Promise<TokenResponse> {
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
  return (await res.json()) as TokenResponse;
}

function toCredentials(json: TokenResponse, refreshToken: string): Credentials {
  return {
    access_token: json.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + json.expires_in * 1000,
    token_type: 'Bearer',
  };
}

export async function exchangeCode(a: ExchangeArgs): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: a.code,
    redirect_uri: a.redirectUri,
    client_id: a.clientId,
    code_verifier: a.verifier,
  });
  const json = await post(body);
  if (!json.refresh_token) {
    throw new CliError('NOT_AUTHENTICATED', 'token endpoint returned no refresh_token');
  }
  return toCredentials(json, json.refresh_token);
}

export async function refreshTokens(a: RefreshArgs): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: a.refreshToken,
    client_id: a.clientId,
  });
  const json = await post(body);
  return toCredentials(json, json.refresh_token ?? a.refreshToken);
}
