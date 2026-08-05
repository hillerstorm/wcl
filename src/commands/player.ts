import { gqlRequest, type Instance } from '../client/graphql.js';
import { PLAYER_QUERY } from '../queries/player.graphql.js';
import { writeStdout, CliError } from '../output.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';
import { enrich } from '../enrich/apply.js';

export interface PlayerOptions {
  code: string; fightId: number; name: string; instance: Instance;
  force: boolean; pretty: boolean; useCache: boolean; expansion?: string;
}

export async function runPlayer(opts: PlayerOptions): Promise<void> {
  const probe = await gqlRequest({
    instance: opts.instance,
    query: /* GraphQL */ `query Probe($code: String!, $fightId: Int!) {
      reportData { report(code: $code) { fights(fightIDs: [$fightId]) { id startTime endTime } } }
    }`,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });
  const fight = (probe.data as any)?.reportData?.report?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);

  const r = await gqlRequest({
    instance: opts.instance, query: PLAYER_QUERY,
    variables: { code: opts.code, fightId: opts.fightId, start: fight.startTime, end: fight.endTime },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });

  const report = (r.data as any)?.reportData?.report;
  const actor = report?.masterData?.actors?.find((a: any) => a.name === opts.name && a.type === 'Player');
  if (!actor) throw new CliError('NOT_FOUND', `player "${opts.name}" not found in report`, 'check spelling / case');

  const dps = report?.playerDetails?.data?.playerDetails?.dps ?? [];
  const healers = report?.playerDetails?.data?.playerDetails?.healers ?? [];
  const tanks = report?.playerDetails?.data?.playerDetails?.tanks ?? [];
  const detail = [...dps, ...healers, ...tanks].find((p: any) => p.id === actor.id || p.name === opts.name);

  let payload: any = {
    player: { id: actor.id, name: actor.name, subType: actor.subType, detail },
    casts: (report.casts?.data ?? []).filter((e: any) => e.sourceID === actor.id),
    damage: (report.damage?.data ?? []).filter((e: any) => e.sourceID === actor.id),
    buffs: (report.buffs?.data ?? []).filter((e: any) => e.targetID === actor.id),
  };

  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    payload = enrich(payload, loadDb(opts.expansion as Expansion));
  }

  writeStdout({ ...payload, rateLimit: r.rateLimit }, opts.pretty);
}
