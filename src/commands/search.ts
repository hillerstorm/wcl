import { gqlRequest, jsonScalarError, INSTANCE_EXPANSION_ID, type Instance } from '../client/graphql.js';
import {
  ENCOUNTER_LOOKUP, EXPANSION_ENCOUNTER_LOOKUP, SEARCH_QUERY,
  type EncounterLookupData, type ExpansionEncounterLookupData, type SearchQueryData,
} from '../queries/search.graphql.js';
import { writeStdout, CliError } from '../output.js';

const DIFFICULTY_MAP: Record<string, number> = { n: 3, h: 4, m: 5, normal: 3, heroic: 4, mythic: 5 };

export interface SearchOptions {
  encounter: string;
  className?: string;
  spec?: string;
  difficulty?: string;
  region?: string;
  server?: string;
  guild?: string;
  order: 'amount' | 'date';
  limit: number;
  page: number;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
}

async function resolveEncounterId(name: string, instance: Instance, useCache: boolean, force: boolean): Promise<number> {
  const expansionId = INSTANCE_EXPANSION_ID[instance];
  const r = await gqlRequest<EncounterLookupData & ExpansionEncounterLookupData>({
    instance,
    query: expansionId === undefined ? ENCOUNTER_LOOKUP : EXPANSION_ENCOUNTER_LOOKUP,
    variables: expansionId === undefined ? {} : { expansionId },
    useCache, cacheTtlSeconds: 24 * 3600, force,
  });
  const world = r.data?.worldData;
  const expansions = world?.expansions ?? (world?.expansion ? [world.expansion] : []);
  for (const exp of expansions) for (const zone of exp.zones ?? []) for (const enc of zone.encounters ?? []) {
    if (enc.name?.toLowerCase() === name.toLowerCase()) return enc.id;
  }
  throw new CliError('NOT_FOUND', `encounter "${name}" not found in worldData`, 'pass a numeric ID or check spelling');
}

function rankingsHint(error: string): string | undefined {
  if (/invalid raid zone/i.test(error)) {
    return 'WCL serves no rankings for this encounter\'s zone (Forever dungeon runs, zone 3000, are one such) — check the encounter ID and --instance';
  }
  if (/doesn't exist yet/i.test(error)) return 'WCL has no ranking data for this encounter yet';
  return undefined;
}

export async function runSearch(opts: SearchOptions): Promise<void> {
  let encounterId: number;
  if (/^\d+$/.test(opts.encounter)) {
    encounterId = parseInt(opts.encounter, 10);
  } else {
    encounterId = await resolveEncounterId(opts.encounter, opts.instance, opts.useCache, opts.force);
  }

  // A bare number is a WCL difficulty ID, for games the n/h/m names don't cover (Forever dungeons are 10).
  const wanted = opts.difficulty?.toLowerCase();
  const difficulty = !wanted ? undefined : /^\d+$/.test(wanted) ? Number(wanted) : DIFFICULTY_MAP[wanted];
  if (wanted && difficulty === undefined) {
    throw new CliError('BAD_INPUT', `--difficulty must be n|h|m|normal|heroic|mythic or a numeric difficulty ID`);
  }

  const r = await gqlRequest<SearchQueryData>({
    instance: opts.instance, query: SEARCH_QUERY,
    variables: {
      encounterId,
      className: opts.className ?? null,
      spec: opts.spec ?? null,
      difficulty: difficulty ?? null,
      page: opts.page,
      serverRegion: opts.region ?? null,
      serverSlug: opts.server ?? null,
    },
    useCache: opts.useCache, cacheTtlSeconds: 3600, force: opts.force,
    cacheable: d => !jsonScalarError(d?.worldData?.encounter?.characterRankings),
  });
  const enc = r.data?.worldData?.encounter;
  if (!enc) throw new CliError('NOT_FOUND', `encounter ${encounterId} returned no data`);

  const rankingsError = jsonScalarError(enc.characterRankings);
  if (rankingsError) {
    throw new CliError('GRAPHQL_ERROR', `rankings for encounter ${encounterId} (${enc.name}): ${rankingsError}`, rankingsHint(rankingsError));
  }

  let all = enc.characterRankings?.rankings ?? [];
  // The rankings API has no guild argument on any WCL instance; filter client-side.
  if (opts.guild) {
    const wanted = opts.guild.toLowerCase();
    all = all.filter((rk: any) => rk.guild?.name?.toLowerCase() === wanted);
  }
  const sorted = opts.order === 'date'
    ? [...all].sort((a: any, b: any) => (b.startTime ?? 0) - (a.startTime ?? 0))
    : [...all].sort((a: any, b: any) => (b.amount ?? 0) - (a.amount ?? 0));
  const limited = sorted.slice(0, opts.limit);

  writeStdout({
    encounter: { id: encounterId, name: enc.name },
    rankings: limited,
    page: enc.characterRankings?.page ?? opts.page,
    hasMorePages: enc.characterRankings?.hasMorePages ?? false,
    rateLimit: r.rateLimit,
  }, opts.pretty);
}
