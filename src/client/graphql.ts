import { readCredentials, writeCredentials, type Credentials } from '../auth/store.js';
import { refreshTokens } from '../auth/exchange.js';
import { getClientId } from '../auth/constants.js';
import { CliError } from '../output.js';
import { cacheGet, cacheSet, cacheKey } from './cache.js';
import { parseRateLimitData, checkQuota, RATE_LIMIT_FIELD, type RateLimit } from './rate-limit.js';

export type Instance = 'fresh' | 'classic' | 'vanilla' | 'sod' | 'retail';

export const INSTANCE_HOSTS: Record<Instance, string> = {
  fresh: 'https://fresh.warcraftlogs.com',
  classic: 'https://classic.warcraftlogs.com',
  vanilla: 'https://vanilla.warcraftlogs.com',
  sod: 'https://sod.warcraftlogs.com',
  retail: 'https://www.warcraftlogs.com',
};

export interface RequestArgs {
  instance: Instance;
  query: string;
  variables: Record<string, unknown>;
  useCache: boolean;
  cacheTtlSeconds?: number;
  force: boolean;
}

export interface RequestResult {
  data: unknown;
  rateLimit: RateLimit | null;
  errors?: { message: string }[];
}

async function ensureFreshCredentials(): Promise<Credentials> {
  let creds = readCredentials();
  if (!creds) throw new CliError('NOT_AUTHENTICATED', 'No credentials found.', 'run: wcl auth');
  if (creds.expires_at - Date.now() < 60_000) {
    try {
      const refreshed = await refreshTokens({ refreshToken: creds.refresh_token, clientId: getClientId() });
      writeCredentials(refreshed);
      creds = refreshed;
    } catch (e) {
      throw new CliError('NOT_AUTHENTICATED', 'Token refresh failed.', 'run: wcl auth --reset', { cause: String(e) });
    }
  }
  return creds;
}

function injectRateLimit(query: string): string {
  if (query.includes('rateLimitData')) return query;
  // Inject into the closing brace of the first top-level selection set, skipping
  // comments and strings so braces inside them don't confuse the scan. Documents
  // whose first definition isn't a plain query (mutation/subscription/fragment)
  // are sent untouched — rateLimitData is a Query field.
  let depth = 0;
  let firstBrace = -1;
  let i = 0;
  while (i < query.length) {
    const c = query[i];
    if (c === '#') {
      while (i < query.length && query[i] !== '\n') i++;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < query.length && query[i] !== '"') i += query[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '{') {
      if (depth === 0 && firstBrace < 0) firstBrace = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && firstBrace >= 0) {
        const prefix = query.slice(0, firstBrace).replace(/#[^\n]*/g, '').trim();
        if (prefix !== '' && !/^query\b/.test(prefix)) return query;
        return query.slice(0, i) + ` ${RATE_LIMIT_FIELD}\n` + query.slice(i);
      }
    }
    i++;
  }
  return query;
}

async function doFetch(url: string, token: string, query: string, variables: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
}

export async function gqlRequest(args: RequestArgs): Promise<RequestResult> {
  const { instance, query, variables, useCache, cacheTtlSeconds, force } = args;
  const url = INSTANCE_HOSTS[instance] + '/api/v2/user';
  const key = cacheKey(instance, query, variables);

  if (useCache) {
    const cached = cacheGet<RequestResult>(key);
    if (cached) return cached;
  }

  const creds = await ensureFreshCredentials();

  const queryWithLimit = injectRateLimit(query);

  let res: Response;
  try {
    res = await doFetch(url, creds.access_token, queryWithLimit, variables);
  } catch (e) {
    await new Promise(r => setTimeout(r, 500));
    try {
      res = await doFetch(url, creds.access_token, queryWithLimit, variables);
    } catch (e2) {
      throw new CliError('NETWORK_ERROR', `Network failure: ${String(e2)}`, 'transient — retry');
    }
  }

  if (res.status === 429) {
    throw new CliError('RATE_LIMITED', 'Server returned 429 Too Many Requests.', 'wait and retry');
  }
  if (res.status >= 500) {
    await new Promise(r => setTimeout(r, 500));
    try {
      res = await doFetch(url, creds.access_token, queryWithLimit, variables);
    } catch (e) {
      throw new CliError('NETWORK_ERROR', `Network failure: ${String(e)}`, 'transient — retry');
    }
    if (res.status >= 500) {
      throw new CliError('NETWORK_ERROR', `Server returned ${res.status}.`, 'transient — retry');
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CliError('GRAPHQL_ERROR', `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let payload: { data?: unknown; errors?: { message: string }[]; rateLimitData?: unknown };
  try {
    payload = (await res.json()) as typeof payload;
  } catch (e) {
    throw new CliError('NETWORK_ERROR', `Server returned unparseable JSON: ${String(e)}`, 'transient — retry');
  }
  const rateLimit = parseRateLimitData(payload as any) ?? parseRateLimitData((payload as any).data);

  if ((!payload.data || payload.data === null) && payload.errors && payload.errors.length > 0) {
    throw new CliError('GRAPHQL_ERROR', payload.errors.map(e => e.message).join('; '), undefined, payload.errors);
  }
  if (payload.errors && payload.errors.length > 0) {
    process.stderr.write(JSON.stringify({ warning: 'partial-graphql-errors', errors: payload.errors }) + '\n');
  }

  let visible: any = payload.data;
  if (visible && typeof visible === 'object' && 'rateLimitData' in visible) {
    const { rateLimitData: _, ...rest } = visible;
    visible = rest;
  }
  const result: RequestResult = { data: visible, rateLimit, ...(payload.errors ? { errors: payload.errors } : {}) };

  // A response with partial errors may be transiently degraded — never freeze it in the cache.
  const clean = !payload.errors || payload.errors.length === 0;
  if (useCache && clean && cacheTtlSeconds && cacheTtlSeconds > 0) {
    cacheSet(key, result, cacheTtlSeconds);
  }

  // The points are already spent, so cache first (above) — a --force retry is then served
  // from cache instead of paying for the same page twice.
  checkQuota(rateLimit, force);

  return result;
}
