import { gqlRequest, type Instance } from '../client/graphql.js';
import { PLAYER_DETAILS_QUERY, type PlayerDetailsData } from '../queries/probe.graphql.js';
import { fetchReportProbe, requireFight } from '../client/probe.js';
import { fetchEventStream } from '../client/event-stream.js';
import { writeStdout, CliError } from '../output.js';
import { activeAurasAt, type RawAuraEvent } from '../snapshot/active-auras.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';
import { enrich } from '../enrich/apply.js';

export interface CastSnapshotOptions {
  code: string;
  fightId: number;
  name: string;
  at?: number;
  ability?: number;
  index?: number;
  window: number;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
  expansion?: string;
}

const SEVEN_DAYS = 7 * 24 * 3600;

function toAuraEvents(events: any[]): RawAuraEvent[] {
  return events.map((e: any) => ({
    type: e.type, timestamp: e.timestamp, abilityGameID: e.abilityGameID,
    sourceID: e.sourceID, targetID: e.targetID, stack: e.stack,
  }));
}

export async function runCastSnapshot(opts: CastSnapshotOptions): Promise<void> {
  if (opts.at === undefined && (opts.ability === undefined || opts.index === undefined)) {
    throw new CliError('BAD_INPUT', 'cast-snapshot requires --at <ms> or --ability <id> --index <N>');
  }

  const probe = await fetchReportProbe({ instance: opts.instance, code: opts.code, useCache: opts.useCache, force: opts.force });
  const fight = requireFight(probe, opts.fightId, opts.code);
  const actor = probe.actors.find(a => a.name === opts.name && a.type === 'Player');
  if (!actor) throw new CliError('NOT_FOUND', `player "${opts.name}" not in fight`);

  // Actor-filtered, paginated streams: complete data (no silent 10k cap) at a
  // fraction of the API points of the old four whole-raid fetches. Full-fight
  // windows keep the cache entries reusable across snapshots of the same fight.
  const common = {
    instance: opts.instance, code: opts.code, fightId: opts.fightId,
    start: fight.startTime, end: fight.endTime,
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  };
  const casts = await fetchEventStream({ ...common, dataType: 'Casts', sourceID: actor.id });
  const playerCasts: any[] = casts.events;

  let cast: any | undefined;
  if (opts.at !== undefined) {
    const at = opts.at;
    cast = playerCasts.reduce((best: any | undefined, e: any) =>
      best === undefined || Math.abs(e.timestamp - at) < Math.abs(best.timestamp - at) ? e : best,
      undefined as any | undefined);
    if (!cast || Math.abs(cast.timestamp - at) > 500) {
      throw new CliError('NOT_FOUND', `no cast within 500ms of t=${at} for ${opts.name}`);
    }
  } else {
    const matches = playerCasts.filter(e => e.abilityGameID === opts.ability);
    cast = matches[opts.index! - 1];
    if (!cast) throw new CliError('NOT_FOUND', `${opts.name} has only ${matches.length} casts of ability ${opts.ability}`);
  }

  const T = cast.timestamp;

  const surroundingCasts = playerCasts.filter(e => Math.abs(e.timestamp - T) <= opts.window && e !== cast);

  const [detailsR, damage, buffs] = await Promise.all([
    gqlRequest<PlayerDetailsData>({
      instance: opts.instance, query: PLAYER_DETAILS_QUERY,
      variables: { code: opts.code, fightId: opts.fightId },
      useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
    }),
    fetchEventStream({ ...common, dataType: 'DamageDone', sourceID: actor.id }),
    fetchEventStream({ ...common, dataType: 'Buffs', targetID: actor.id }),
  ]);

  const damageEvents = damage.events.filter((d: any) =>
    d.abilityGameID === cast.abilityGameID &&
    d.timestamp >= cast.timestamp - 50 &&
    d.timestamp <= cast.timestamp + 1500,
  );

  const activeBuffs = activeAurasAt(toAuraEvents(buffs.events), actor.id, T);

  const targetID: number | undefined = cast.targetID ?? damageEvents[0]?.targetID;
  let activeDebuffs: ReturnType<typeof activeAurasAt> = [];
  if (targetID !== undefined) {
    const debuffs = await fetchEventStream({ ...common, dataType: 'Debuffs', targetID });
    activeDebuffs = activeAurasAt(toAuraEvents(debuffs.events), targetID, T);
  }

  const pd = detailsR.data?.reportData?.report?.playerDetails?.data?.playerDetails;
  const allPlayers = [...(pd?.dps ?? []), ...(pd?.healers ?? []), ...(pd?.tanks ?? [])];
  const playerDetail = allPlayers.find((p: any) => p.id === actor.id || p.name === opts.name);

  let payload: any = {
    cast,
    fight: {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
      encounterID: fight.encounterID,
      kill: fight.kill,
    },
    caster: {
      id: actor.id, name: actor.name, subType: actor.subType,
      gear: playerDetail?.combatantInfo?.gear ?? [],
      talents: playerDetail?.combatantInfo?.talents ?? [],
      combatantInfo: playerDetail?.combatantInfo,
      activeBuffs,
    },
    target: targetID !== undefined ? { id: targetID, activeDebuffs } : null,
    damageEvents,
    surroundingCasts,
  };

  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    payload = enrich(payload, loadDb(opts.expansion as Expansion));
  }

  writeStdout({ ...payload, rateLimit: buffs.rateLimit ?? casts.rateLimit ?? probe.rateLimit }, opts.pretty);
}
