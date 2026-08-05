import { gqlRequest, type Instance } from '../client/graphql.js';
import { EVENTS_QUERY, EVENTS_PROBE_QUERY } from '../queries/events.graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface EventsOptions {
  code: string;
  fightId: number;
  type: string;
  source?: string;
  target?: string;
  ability?: number;
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

interface Actor { id: number; name?: string; type?: string; subType?: string; petOwner?: number | null }

function resolveActor(actors: Actor[], ref: string, role: string): number {
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

  const probe = await gqlRequest({
    instance: opts.instance, query: EVENTS_PROBE_QUERY,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  });
  const probeReport = (probe.data as any)?.reportData?.report;
  const fight = probeReport?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);

  const actors: Actor[] = probeReport?.masterData?.actors ?? [];
  const sourceID = opts.source !== undefined ? resolveActor(actors, opts.source, 'source') : undefined;
  const targetID = opts.target !== undefined ? resolveActor(actors, opts.target, 'target') : undefined;

  const start = opts.start ?? fight.startTime;
  const end = opts.end ?? fight.endTime;

  const events: any[] = [];
  let cursor = start;
  let pages = 0;
  let nextPageTimestamp: number | null = null;
  let rateLimit = probe.rateLimit;
  while (pages < opts.maxPages) {
    const r = await gqlRequest({
      instance: opts.instance, query: EVENTS_QUERY,
      variables: {
        code: opts.code, fightId: opts.fightId, dataType, start: cursor, end, limit: opts.limit,
        ...(sourceID !== undefined ? { sourceID } : {}),
        ...(targetID !== undefined ? { targetID } : {}),
        ...(opts.ability !== undefined ? { abilityID: opts.ability } : {}),
      },
      useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
    });
    rateLimit = r.rateLimit ?? rateLimit;
    const page = (r.data as any)?.reportData?.report?.events;
    if (!page) throw new CliError('NOT_FOUND', `no events returned for fight ${opts.fightId}`);
    events.push(...(page.data ?? []));
    pages += 1;
    nextPageTimestamp = page.nextPageTimestamp ?? null;
    if (nextPageTimestamp === null) break;
    cursor = nextPageTimestamp;
  }
  const truncated = nextPageTimestamp !== null;

  const filter = {
    dataType,
    ...(sourceID !== undefined ? { sourceID } : {}),
    ...(targetID !== undefined ? { targetID } : {}),
    ...(opts.ability !== undefined ? { abilityID: opts.ability } : {}),
    start, end,
  };
  const meta = {
    fight: { id: fight.id, name: fight.name, startTime: fight.startTime, endTime: fight.endTime },
    filter, count: events.length, pages,
    ...(truncated ? { truncated: true, nextPageTimestamp } : {}),
  };

  if (opts.summary) {
    const abilityNames = new Map<number, string>(
      (probeReport?.masterData?.abilities ?? []).map((a: any) => [a.gameID, a.name]));
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
