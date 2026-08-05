import open from 'open';
import { generateVerifier, deriveChallenge, generateState } from '../auth/pkce.js';
import { startCallbackServer } from '../auth/callback-server.js';
import { exchangeCode } from '../auth/exchange.js';
import { writeCredentials, clearCredentials } from '../auth/store.js';
import { CliError } from '../output.js';
import { getClientId, REDIRECT_URI, CALLBACK_PORT, AUTHORIZE_URL } from '../auth/constants.js';

export interface AuthOptions { reset?: boolean }

export async function runAuth(opts: AuthOptions): Promise<void> {
  if (opts.reset) clearCredentials();

  const clientId = getClientId();

  const verifier = generateVerifier();
  const challenge = deriveChallenge(verifier);
  const state = generateState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const url = `${AUTHORIZE_URL}?${params}`;

  const server = await startCallbackServer(CALLBACK_PORT);

  try {
    await open(url);
    process.stderr.write(`Opened browser. Waiting for callback at ${REDIRECT_URI}...\n`);
  } catch {
    process.stderr.write(`Could not open a browser. Paste this URL manually:\n\n${url}\n\n`);
  }

  let result: { code: string; state: string };
  try {
    result = await server.awaitCallback();
  } finally {
    server.close();
  }

  if (result.state !== state) {
    throw new CliError('BAD_INPUT', 'OAuth state mismatch — possible CSRF, aborting.');
  }

  const creds = await exchangeCode({
    code: result.code,
    verifier,
    redirectUri: REDIRECT_URI,
    clientId,
  });
  writeCredentials(creds);
  process.stdout.write(JSON.stringify({ status: 'authenticated', expires_at: creds.expires_at }) + '\n');
}
