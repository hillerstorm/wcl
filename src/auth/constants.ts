import { configPath, readConfig } from '../config.js';
import { CliError } from '../output.js';

export const REDIRECT_URI = 'http://localhost:31337/callback';
export const CALLBACK_PORT = 31337;
export const AUTHORIZE_URL = 'https://www.warcraftlogs.com/oauth/authorize';
export const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';

export function getClientId(): string {
  const fromEnv = process.env.WCL_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const cfg = readConfig();
  if (typeof cfg.clientId === 'string' && cfg.clientId.trim()) {
    return cfg.clientId.trim();
  }

  const where = configPath();
  throw new CliError(
    'BAD_INPUT',
    'WCL client ID not configured.',
    `Run \`wcl init\`, set $WCL_CLIENT_ID, or copy config.example.json to ${where} and fill in your client ID. Register a public client at https://www.warcraftlogs.com/api/clients/ with redirect URL ${REDIRECT_URI}.`,
  );
}
