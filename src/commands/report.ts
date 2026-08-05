import { gqlRequest, type Instance } from '../client/graphql.js';
import { REPORT_QUERY, type ReportQueryData } from '../queries/report.graphql.js';
import { writeStdout, CliError } from '../output.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';
import { enrich } from '../enrich/apply.js';

export interface ReportOptions {
  code: string;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
  expansion?: string;
}

const SEVEN_DAYS = 7 * 24 * 3600;

export async function runReport(opts: ReportOptions): Promise<void> {
  const r = await gqlRequest<ReportQueryData>({
    instance: opts.instance,
    query: REPORT_QUERY,
    variables: { code: opts.code },
    useCache: opts.useCache,
    cacheTtlSeconds: SEVEN_DAYS,
    force: opts.force,
  });
  const report = r.data?.reportData?.report;
  if (!report) throw new CliError('NOT_FOUND', `report ${opts.code} not found`, 'check the code + --instance');

  let enriched = report;
  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    const db = loadDb(opts.expansion as Expansion);
    enriched = enrich(report, db);
  }

  writeStdout({ report: enriched, rateLimit: r.rateLimit }, opts.pretty);
}
