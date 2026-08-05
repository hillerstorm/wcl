import { readFileSync } from 'node:fs';
import { gqlRequest, type Instance } from '../client/graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface QueryOptions {
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
  file?: string;
  stdin: boolean;
  vars: string[];
}

function parseVars(vars: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of vars) {
    const eq = raw.indexOf('=');
    if (eq < 0) throw new CliError('BAD_INPUT', `--var expects key=value, got "${raw}"`);
    const k = raw.slice(0, eq);
    const v = raw.slice(eq + 1);
    if (/^-?\d+$/.test(v)) out[k] = parseInt(v, 10);
    else if (/^-?\d+\.\d+$/.test(v)) out[k] = parseFloat(v);
    else if (v === 'true' || v === 'false') out[k] = v === 'true';
    else out[k] = v;
  }
  return out;
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export async function runQuery(opts: QueryOptions): Promise<void> {
  let query: string;
  if (opts.file) {
    query = readFileSync(opts.file, 'utf8');
  } else if (opts.stdin) {
    query = await readStdin();
  } else {
    throw new CliError('BAD_INPUT', 'wcl query requires --file <path> or --stdin');
  }

  const variables = parseVars(opts.vars);
  const r = await gqlRequest({
    instance: opts.instance,
    query,
    variables,
    useCache: opts.useCache,
    cacheTtlSeconds: 0,
    force: opts.force,
  });
  writeStdout({ data: r.data, rateLimit: r.rateLimit, ...(r.errors ? { errors: r.errors } : {}) }, opts.pretty);
}
