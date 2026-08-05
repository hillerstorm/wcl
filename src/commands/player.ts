import { gqlRequest, type Instance } from '../client/graphql.js';
import { PLAYER_DETAILS_QUERY, type PlayerDetailsData } from '../queries/probe.graphql.js';
import { fetchReportProbe, requireFight } from '../client/probe.js';
import { fetchEventStream } from '../client/event-stream.js';
import { writeStdout, CliError } from '../output.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';
import { enrich } from '../enrich/apply.js';

export interface PlayerOptions {
  code: string; fightId: number; name: string; instance: Instance;
  force: boolean; pretty: boolean; useCache: boolean; expansion?: string;
}

const SEVEN_DAYS = 7 * 24 * 3600;

export async function runPlayer(opts: PlayerOptions): Promise<void> {
  const probe = await fetchReportProbe({ instance: opts.instance, code: opts.code, useCache: opts.useCache, force: opts.force });
  const fight = requireFight(probe, opts.fightId, opts.code);

  const actor = probe.actors.find(a => a.name === opts.name && a.type === 'Player');
  if (!actor) throw new CliError('NOT_FOUND', `player "${opts.name}" not found in report`, 'check spelling / case');

  // Server-side actor filters + pagination: complete streams at a fraction of the
  // API points of the old whole-raid fetch, with no silent 10k-event cap.
  const common = {
    instance: opts.instance, code: opts.code, fightId: opts.fightId,
    start: fight.startTime, end: fight.endTime,
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  };
  const [detailsR, casts, damage, buffs] = await Promise.all([
    gqlRequest<PlayerDetailsData>({
      instance: opts.instance, query: PLAYER_DETAILS_QUERY,
      variables: { code: opts.code, fightId: opts.fightId },
      useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
    }),
    fetchEventStream({ ...common, dataType: 'Casts', sourceID: actor.id }),
    fetchEventStream({ ...common, dataType: 'DamageDone', sourceID: actor.id }),
    fetchEventStream({ ...common, dataType: 'Buffs', targetID: actor.id }),
  ]);

  const pd = detailsR.data?.reportData?.report?.playerDetails?.data?.playerDetails;
  const detail = [...(pd?.dps ?? []), ...(pd?.healers ?? []), ...(pd?.tanks ?? [])]
    .find((p: any) => p.id === actor.id || p.name === opts.name);

  let payload: any = {
    player: { id: actor.id, name: actor.name, subType: actor.subType, detail },
    casts: casts.events,
    damage: damage.events,
    buffs: buffs.events,
    ...(casts.truncated || damage.truncated || buffs.truncated
      ? { truncated: { casts: casts.truncated, damage: damage.truncated, buffs: buffs.truncated } }
      : {}),
  };

  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    payload = enrich(payload, loadDb(opts.expansion as Expansion));
  }

  const rateLimit = buffs.rateLimit ?? damage.rateLimit ?? casts.rateLimit ?? probe.rateLimit;
  writeStdout({ ...payload, rateLimit }, opts.pretty);
}
