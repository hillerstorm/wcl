import { gqlRequest, type Instance } from '../client/graphql.js';
import { FIGHT_QUERY, type FightQueryData } from '../queries/fight.graphql.js';
import { writeStdout, CliError } from '../output.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';
import { enrich } from '../enrich/apply.js';

export interface FightOptions {
  code: string; fightId: number; instance: Instance; force: boolean; pretty: boolean; useCache: boolean; expansion?: string;
}

export async function runFight(opts: FightOptions): Promise<void> {
  const r = await gqlRequest<FightQueryData>({
    instance: opts.instance, query: FIGHT_QUERY,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });
  const report = r.data?.reportData?.report;
  const fight = report?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);

  let payload: any = { fight, damageDone: report?.table?.data };

  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    payload = enrich(payload, loadDb(opts.expansion as Expansion));
  }

  writeStdout({ ...payload, rateLimit: r.rateLimit }, opts.pretty);
}
