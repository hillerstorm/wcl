import { gqlRequest, type Instance } from '../client/graphql.js';
import { REPORT_QUERY } from '../queries/report.graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface FightsOptions {
  code: string;
  boss: boolean;
  kills: boolean;
  encounter?: string;
  json: boolean;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
}

const SEVEN_DAYS = 7 * 24 * 3600;

function pad(v: unknown, w: number): string {
  return String(v ?? '').padEnd(w);
}

export async function runFights(opts: FightsOptions): Promise<void> {
  const r = await gqlRequest({
    instance: opts.instance, query: REPORT_QUERY,
    variables: { code: opts.code },
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  });
  const report = (r.data as any)?.reportData?.report;
  if (!report) throw new CliError('NOT_FOUND', `report ${opts.code} not found`, 'check the code + --instance');

  let fights: any[] = report.fights ?? [];
  if (opts.boss) fights = fights.filter(f => f.encounterID);
  if (opts.kills) fights = fights.filter(f => f.kill === true);
  if (opts.encounter) {
    const wanted = opts.encounter.toLowerCase();
    fights = fights.filter(f => f.name?.toLowerCase().includes(wanted));
  }

  if (opts.json) {
    writeStdout({ fights, rateLimit: r.rateLimit }, opts.pretty);
    return;
  }

  const lines = [pad('ID', 5) + pad('RESULT', 7) + pad('DIFF', 5) + pad('SIZE', 5) + pad('DUR', 9) + pad('START', 10) + pad('END', 10) + 'NAME'];
  for (const f of fights) {
    const result = !f.encounterID ? 'trash' : f.kill ? 'kill' : 'wipe';
    const dur = ((f.endTime - f.startTime) / 1000).toFixed(1) + 's';
    lines.push(pad(f.id, 5) + pad(result, 7) + pad(f.difficulty, 5) + pad(f.size, 5) + pad(dur, 9) + pad(f.startTime, 10) + pad(f.endTime, 10) + (f.name ?? ''));
  }
  process.stdout.write(lines.join('\n') + '\n');
}
