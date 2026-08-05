import { gqlRequest, type Instance } from './graphql.js';
import { REPORT_PROBE_QUERY } from '../queries/probe.graphql.js';
import { CliError } from '../output.js';
import type { RateLimit } from './rate-limit.js';

export interface ProbeFight {
  id: number;
  name?: string;
  startTime: number;
  endTime: number;
  encounterID?: number;
  kill?: boolean | null;
}

export interface ProbeActor {
  id: number;
  name?: string;
  type?: string;
  subType?: string;
  petOwner?: number | null;
}

export interface ReportProbe {
  fights: ProbeFight[];
  actors: ProbeActor[];
  rateLimit: RateLimit | null;
}

export interface ProbeArgs {
  instance: Instance;
  code: string;
  useCache: boolean;
  force: boolean;
}

const SEVEN_DAYS = 7 * 24 * 3600;

export async function fetchReportProbe(args: ProbeArgs): Promise<ReportProbe> {
  const r = await gqlRequest({
    instance: args.instance, query: REPORT_PROBE_QUERY,
    variables: { code: args.code },
    useCache: args.useCache, cacheTtlSeconds: SEVEN_DAYS, force: args.force,
  });
  const report = (r.data as any)?.reportData?.report;
  if (!report) throw new CliError('NOT_FOUND', `report ${args.code} not found`);
  return {
    fights: report.fights ?? [],
    actors: report.masterData?.actors ?? [],
    rateLimit: r.rateLimit,
  };
}

export function requireFight(probe: ReportProbe, fightId: number, code: string): ProbeFight {
  const fight = probe.fights.find(f => f.id === fightId);
  if (!fight) throw new CliError('NOT_FOUND', `fight ${fightId} not in report ${code}`);
  return fight;
}
