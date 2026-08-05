import { gqlRequest, type Instance } from '../client/graphql.js';
import { PLAYER_META_QUERY } from '../queries/player.graphql.js';
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
  const meta = await gqlRequest({
    instance: opts.instance, query: PLAYER_META_QUERY,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  });
  const report = (meta.data as any)?.reportData?.report;
  const fight = report?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);

  const actor = report?.masterData?.actors?.find((a: any) => a.name === opts.name && a.type === 'Player');
  if (!actor) throw new CliError('NOT_FOUND', `player "${opts.name}" not found in report`, 'check spelling / case');

  const dps = report?.playerDetails?.data?.playerDetails?.dps ?? [];
  const healers = report?.playerDetails?.data?.playerDetails?.healers ?? [];
  const tanks = report?.playerDetails?.data?.playerDetails?.tanks ?? [];
  const detail = [...dps, ...healers, ...tanks].find((p: any) => p.id === actor.id || p.name === opts.name);

  // Server-side actor filters + pagination: complete streams at a fraction of the
  // API points of the old whole-raid fetch, with no silent 10k-event cap.
  const common = {
    instance: opts.instance, code: opts.code, fightId: opts.fightId,
    start: fight.startTime, end: fight.endTime,
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  };
  const [casts, damage, buffs] = await Promise.all([
    fetchEventStream({ ...common, dataType: 'Casts', sourceID: actor.id }),
    fetchEventStream({ ...common, dataType: 'DamageDone', sourceID: actor.id }),
    fetchEventStream({ ...common, dataType: 'Buffs', targetID: actor.id }),
  ]);

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

  const rateLimit = buffs.rateLimit ?? damage.rateLimit ?? casts.rateLimit ?? meta.rateLimit;
  writeStdout({ ...payload, rateLimit }, opts.pretty);
}
