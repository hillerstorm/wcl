import { gqlRequest, type Instance } from '../client/graphql.js';
import { REPORT_ABILITIES_QUERY, type ReportAbilitiesData } from '../queries/probe.graphql.js';
import { fetchReportProbe, requireFight, type ProbeActor } from '../client/probe.js';
import { fetchEventStream } from '../client/event-stream.js';
import { writeStdout, CliError } from '../output.js';

export interface EventsOptions {
  code: string;
  fightId: number;
  type: string;
  source?: string;
  target?: string;
  ability?: number;
  hostile: boolean;
  start?: number;
  end?: number;
  limit: number;
  maxPages: number;
  jsonl: boolean;
  summary: boolean;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
}

const SEVEN_DAYS = 7 * 24 * 3600;

const DATA_TYPES: Record<string, string> = {
  damage: 'DamageDone',
  damagedone: 'DamageDone',
  damagetaken: 'DamageTaken',
  cast: 'Casts',
  casts: 'Casts',
  buff: 'Buffs',
  buffs: 'Buffs',
  debuff: 'Debuffs',
  debuffs: 'Debuffs',
  heal: 'Healing',
  heals: 'Healing',
  healing: 'Healing',
  death: 'Deaths',
  deaths: 'Deaths',
  resource: 'Resources',
  resources: 'Resources',
  interrupts: 'Interrupts',
  dispels: 'Dispels',
  summons: 'Summons',
  threat: 'Threat',
  combatantinfo: 'CombatantInfo',
  all: 'All',
};

function normalizeDataType(t: string): string {
  const v = DATA_TYPES[t.toLowerCase().replace(/[-_]/g, '')];
  if (!v) {
    throw new CliError('BAD_INPUT', `unknown --type: ${t}`,
      `one of: damage, damage-taken, casts, buffs, debuffs, healing, deaths, resources, interrupts, dispels, summons, threat, combatantinfo, all`);
  }
  return v;
}

function resolveActor(actors: ProbeActor[], ref: string, role: string): number {
  if (/^\d+$/.test(ref)) return parseInt(ref, 10);
  const matches = actors.filter(a => a.name?.toLowerCase() === ref.toLowerCase());
  if (matches.length === 0) {
    throw new CliError('NOT_FOUND', `${role} "${ref}" not found in report`, 'check spelling, or pass a numeric actor ID (see: wcl actors <code>)');
  }
  const players = matches.filter(a => a.type === 'Player');
  const pick = players.length === 1 ? players[0] : matches.length === 1 ? matches[0] : undefined;
  if (!pick) {
    throw new CliError('BAD_INPUT', `${role} "${ref}" is ambiguous — pass a numeric actor ID`, undefined,
      matches.map(m => ({ id: m.id, type: m.type, subType: m.subType })));
  }
  return pick.id;
}

interface Tally { count: number; total: number }

function buildSummary(events: any[], abilityNames: Map<number, string>, actorNames: Map<number, string>) {
  const byType = new Map<string, number>();
  const byAbility = new Map<number, Tally>();
  const bySource = new Map<number, number>();
  const byTarget = new Map<number, number>();
  for (const e of events) {
    if (typeof e.type === 'string') byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    if (typeof e.abilityGameID === 'number') {
      const t = byAbility.get(e.abilityGameID) ?? { count: 0, total: 0 };
      t.count += 1;
      if (typeof e.amount === 'number') t.total += e.amount;
      byAbility.set(e.abilityGameID, t);
    }
    if (typeof e.sourceID === 'number') bySource.set(e.sourceID, (bySource.get(e.sourceID) ?? 0) + 1);
    if (typeof e.targetID === 'number') byTarget.set(e.targetID, (byTarget.get(e.targetID) ?? 0) + 1);
  }
  const actorList = (m: Map<number, number>) => [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: actorNames.get(id) ?? null, count }));
  return {
    byType: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
    byAbility: [...byAbility.entries()]
      .sort((a, b) => b[1].total - a[1].total || b[1].count - a[1].count)
      .map(([id, t]) => ({ id, name: abilityNames.get(id) ?? null, count: t.count, total: t.total })),
    bySource: actorList(bySource),
    byTarget: actorList(byTarget),
  };
}

export async function runEvents(opts: EventsOptions): Promise<void> {
  const dataType = normalizeDataType(opts.type);

  const probe = await fetchReportProbe({ instance: opts.instance, code: opts.code, useCache: opts.useCache, force: opts.force });
  const fight = requireFight(probe, opts.fightId, opts.code);

  const actors = probe.actors;
  const sourceID = opts.source !== undefined ? resolveActor(actors, opts.source, 'source') : undefined;
  const targetID = opts.target !== undefined ? resolveActor(actors, opts.target, 'target') : undefined;

  const start = opts.start ?? fight.startTime;
  const end = opts.end ?? fight.endTime;

  const stream = await fetchEventStream({
    instance: opts.instance, code: opts.code, fightId: opts.fightId, dataType,
    start, end, limit: opts.limit, maxPages: opts.maxPages,
    ...(sourceID !== undefined ? { sourceID } : {}),
    ...(targetID !== undefined ? { targetID } : {}),
    ...(opts.ability !== undefined ? { abilityID: opts.ability } : {}),
    ...(opts.hostile ? { hostility: 'Enemies' as const } : {}),
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  });
  const { events, pages, truncated, nextPageTimestamp } = stream;
  const rateLimit = stream.rateLimit ?? probe.rateLimit;

  const filter = {
    dataType,
    ...(sourceID !== undefined ? { sourceID } : {}),
    ...(targetID !== undefined ? { targetID } : {}),
    ...(opts.ability !== undefined ? { abilityID: opts.ability } : {}),
    ...(opts.hostile ? { hostility: 'Enemies' } : {}),
    start, end,
  };
  const meta = {
    fight: { id: fight.id, name: fight.name, startTime: fight.startTime, endTime: fight.endTime },
    filter, count: events.length, pages,
    ...(truncated ? { truncated: true, nextPageTimestamp } : {}),
  };

  if (opts.summary) {
    const abilitiesR = await gqlRequest<ReportAbilitiesData>({
      instance: opts.instance, query: REPORT_ABILITIES_QUERY,
      variables: { code: opts.code },
      useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
    });
    const abilityNames = new Map<number, string>(
      (abilitiesR.data?.reportData?.report?.masterData?.abilities ?? []).map(a => [a.gameID, a.name ?? '']));
    const actorNames = new Map<number, string>(actors.map(a => [a.id, a.name ?? '']));
    writeStdout({ ...meta, ...buildSummary(events, abilityNames, actorNames), rateLimit }, opts.pretty);
    return;
  }
  if (opts.jsonl) {
    for (const e of events) process.stdout.write(JSON.stringify(e) + '\n');
    return;
  }
  writeStdout({ ...meta, events, rateLimit }, opts.pretty);
}
