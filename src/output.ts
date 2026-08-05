export type ErrorCode =
  | 'BAD_INPUT'
  | 'NOT_AUTHENTICATED'
  | 'QUOTA_LOW'
  | 'RATE_LIMITED'
  | 'GRAPHQL_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR';

const EXIT: Record<ErrorCode, number> = {
  GRAPHQL_ERROR: 1,
  NOT_AUTHENTICATED: 2,
  QUOTA_LOW: 3,
  RATE_LIMITED: 4,
  NOT_FOUND: 5,
  NETWORK_ERROR: 6,
  BAD_INPUT: 7,
};

export class CliError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public hint?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function writeStdout(data: unknown, pretty: boolean): void {
  process.stdout.write(JSON.stringify(data, null, pretty ? 2 : undefined) + '\n');
}

export function failAndExit(e: unknown): never {
  if (e instanceof CliError) {
    const payload: Record<string, unknown> = { code: e.code, message: e.message };
    if (e.hint) payload.hint = e.hint;
    if (e.details !== undefined) payload.details = e.details;
    process.stderr.write(JSON.stringify(payload) + '\n');
    process.exit(EXIT[e.code]);
  }
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(JSON.stringify({ code: 'GRAPHQL_ERROR', message: msg }) + '\n');
  process.exit(1);
}
