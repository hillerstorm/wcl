import { gqlRequest, type Instance } from '../client/graphql.js';
import { CAST_SNAPSHOT_QUERY } from '../queries/cast-snapshot.graphql.js';
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

export async function runCastSnapshot(opts: CastSnapshotOptions): Promise<void> {
  if (opts.at === undefined && (opts.ability === undefined || opts.index === undefined)) {
    throw new CliError('BAD_INPUT', 'cast-snapshot requires --at <ms> or --ability <id> --index <N>');
  }

  const probe = await gqlRequest({
    instance: opts.instance,
    query: /* GraphQL */ `query CSProbe($code: String!, $fightId: Int!) {
      reportData { report(code: $code) {
        fights(fightIDs: [$fightId]) { id startTime endTime }
        masterData { actors { id name type subType } }
      } }
    }`,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });
  const probeReport = (probe.data as any)?.reportData?.report;
  const fight = probeReport?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);
  const actor = probeReport?.masterData?.actors?.find((a: any) => a.name === opts.name && a.type === 'Player');
  if (!actor) throw new CliError('NOT_FOUND', `player "${opts.name}" not in fight`);

  const r = await gqlRequest({
    instance: opts.instance, query: CAST_SNAPSHOT_QUERY,
    variables: { code: opts.code, fightId: opts.fightId, start: fight.startTime, end: fight.endTime },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });
  const report = (r.data as any)?.reportData?.report;

  const playerCasts: any[] = (report.casts?.data ?? []).filter((e: any) => e.sourceID === actor.id);

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

  const damageData: any[] = report.damage?.data ?? [];
  const damageEvents = damageData.filter(d =>
    d.sourceID === actor.id &&
    d.abilityGameID === cast.abilityGameID &&
    d.timestamp >= cast.timestamp - 50 &&
    d.timestamp <= cast.timestamp + 1500,
  );

  const buffEvents: RawAuraEvent[] = (report.buffs?.data ?? []).map((e: any) => ({
    type: e.type, timestamp: e.timestamp, abilityGameID: e.abilityGameID,
    sourceID: e.sourceID, targetID: e.targetID, stack: e.stack,
  }));
  const activeBuffs = activeAurasAt(buffEvents, actor.id, T);

  const targetID: number | undefined = cast.targetID ?? damageEvents[0]?.targetID;
  const debuffEvents: RawAuraEvent[] = (report.debuffs?.data ?? []).map((e: any) => ({
    type: e.type, timestamp: e.timestamp, abilityGameID: e.abilityGameID,
    sourceID: e.sourceID, targetID: e.targetID, stack: e.stack,
  }));
  const activeDebuffs = targetID !== undefined ? activeAurasAt(debuffEvents, targetID, T) : [];

  const allPlayers = [
    ...(report.playerDetails?.data?.playerDetails?.dps ?? []),
    ...(report.playerDetails?.data?.playerDetails?.healers ?? []),
    ...(report.playerDetails?.data?.playerDetails?.tanks ?? []),
  ];
  const playerDetail = allPlayers.find((p: any) => p.id === actor.id || p.name === opts.name);

  let payload: any = {
    cast,
    fight: {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
      encounterID: (report.fights?.[0] as any)?.encounterID,
      kill: (report.fights?.[0] as any)?.kill,
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

  writeStdout({ ...payload, rateLimit: r.rateLimit }, opts.pretty);
}
