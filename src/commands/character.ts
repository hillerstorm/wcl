import { gqlRequest, jsonScalarError, type Instance } from '../client/graphql.js';
import {
  CHARACTER_QUERY, RANKED_CHARACTERS_QUERY, type CharacterQueryData, type RankedCharactersQueryData,
} from '../queries/character.graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface CharacterOptions {
  name?: string;
  server?: string;
  region?: string;
  /** WCL character ID — replaces the name/server/region lookup. */
  id?: number;
  /** Report code — resolves `name` to an ID through the report's ranked characters. */
  report?: string;
  zone?: number;
  metric?: string;
  spec?: string;
  difficulty?: number;
  size?: number;
  partition?: number;
  json: boolean;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
}

const ONE_HOUR = 3600;

// WCL v2 class IDs (shared across instances).
const CLASS_NAMES: Record<number, string> = {
  1: 'Death Knight', 2: 'Druid', 3: 'Hunter', 4: 'Mage', 5: 'Monk', 6: 'Paladin',
  7: 'Priest', 8: 'Rogue', 9: 'Shaman', 10: 'Warlock', 11: 'Warrior', 12: 'Demon Hunter', 13: 'Evoker',
};

function pad(v: unknown, w: number): string {
  return String(v ?? '').padStart(w);
}

async function idFromReport(opts: CharacterOptions, code: string, name: string): Promise<number> {
  const r = await gqlRequest<RankedCharactersQueryData>({
    instance: opts.instance, query: RANKED_CHARACTERS_QUERY, variables: { code },
    useCache: opts.useCache, cacheTtlSeconds: ONE_HOUR, force: opts.force,
    // WCL fills rankedCharacters in after upload — don't pin an empty answer.
    cacheable: d => !!d?.reportData?.report?.rankedCharacters?.length,
  });
  const report = r.data?.reportData?.report;
  if (!report) throw new CliError('NOT_FOUND', `report ${code} not found`, 'check the code + --instance');
  const ranked = (report.rankedCharacters ?? []).filter(c => c != null);
  const label = (c: (typeof ranked)[number]) => `${c.name} (${c.server?.slug}/${c.server?.region?.slug}, id ${c.id})`;
  let hits = ranked.filter(c => c.name?.toLowerCase() === name.toLowerCase());
  // Same name on several servers: <server> / <region>, when given, pick one.
  if (hits.length > 1 && opts.server) hits = hits.filter(c => c.server?.slug?.toLowerCase() === opts.server!.toLowerCase());
  if (hits.length > 1 && opts.region) hits = hits.filter(c => c.server?.region?.slug?.toLowerCase() === opts.region!.toLowerCase());
  if (hits.length > 1) {
    throw new CliError('BAD_INPUT', `report ${code} ranks ${hits.length} characters named ${name}`, `pass --id: ${hits.map(label).join(', ')}`);
  }
  if (hits.length === 0) {
    throw new CliError('NOT_FOUND', `character ${name} is not among report ${code}'s ranked characters`,
      ranked.length ? `ranked there: ${ranked.map(label).join(', ')}` : 'the report has no ranked characters (yet)');
  }
  return hits[0]!.id;
}

type Lookup = { id: number } | { name: string; server: string; region: string };

async function lookupVariables(opts: CharacterOptions): Promise<Lookup> {
  if (opts.id !== undefined) return { id: opts.id };
  if (opts.report) {
    if (!opts.name) throw new CliError('BAD_INPUT', '--report needs a character <name> to look up in that report');
    return { id: await idFromReport(opts, opts.report, opts.name) };
  }
  if (!opts.name || !opts.server || !opts.region) {
    throw new CliError('BAD_INPUT', 'character needs <name> <server> <region>, or --id <characterId>, or <name> --report <code>');
  }
  return { name: opts.name, server: opts.server.toLowerCase(), region: opts.region.toLowerCase() };
}

export async function runCharacter(opts: CharacterOptions): Promise<void> {
  const lookup = await lookupVariables(opts);
  const r = await gqlRequest<CharacterQueryData>({
    instance: opts.instance, query: CHARACTER_QUERY,
    variables: {
      ...lookup,
      ...(opts.zone !== undefined ? { zoneID: opts.zone } : {}),
      ...(opts.metric !== undefined ? { metric: opts.metric } : {}),
      ...(opts.spec !== undefined ? { specName: opts.spec } : {}),
      ...(opts.difficulty !== undefined ? { difficulty: opts.difficulty } : {}),
      ...(opts.size !== undefined ? { size: opts.size } : {}),
      ...(opts.partition !== undefined ? { partition: opts.partition } : {}),
    },
    useCache: opts.useCache, cacheTtlSeconds: ONE_HOUR, force: opts.force,
    cacheable: d => !jsonScalarError(d?.characterData?.character?.zoneRankings),
  });
  const character = r.data?.characterData?.character;
  if (!character) {
    if ('id' in lookup) throw new CliError('NOT_FOUND', `character id ${lookup.id} not found`);
    // Forever's regions share their slugs (US, EU, …) with the host's own, so a slug never reaches them.
    throw new CliError('NOT_FOUND', `character ${lookup.name} on ${lookup.server}/${lookup.region} not found`,
      'check spelling; server is the slug (lowercase, no spaces), region is e.g. us / eu — or use <name> --report <code> / --id <characterId> (the only way to reach Forever characters)');
  }
  const rankingsError = jsonScalarError(character.zoneRankings);
  if (rankingsError) {
    throw new CliError('GRAPHQL_ERROR', `zone rankings for ${character.name} (id ${character.id}): ${rankingsError}`, 'check --zone / --difficulty / --size');
  }

  if (opts.json) {
    writeStdout({ character, rateLimit: r.rateLimit }, opts.pretty);
    return;
  }

  const zr = character.zoneRankings;
  const className = CLASS_NAMES[character.classID] ?? `class:${character.classID}`;
  const lines: string[] = [];
  if (!zr) {
    lines.push(`${character.name} (${className}) — no rankings found for the requested zone/filters`);
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  const head = [
    `${character.name} (${className})`,
    zr.zone != null ? `zone ${zr.zone}` : null,
    zr.partition != null ? `partition ${zr.partition}` : null,
    zr.difficulty != null ? `difficulty ${zr.difficulty}` : null,
    zr.size != null ? `size ${zr.size}` : null,
    zr.metric ? `metric ${zr.metric}` : null,
  ].filter(Boolean).join('  ');
  const avgs = [
    zr.bestPerformanceAverage != null ? `best avg ${zr.bestPerformanceAverage.toFixed(1)}` : null,
    zr.medianPerformanceAverage != null ? `median avg ${zr.medianPerformanceAverage.toFixed(1)}` : null,
  ].filter(Boolean).join('  ');
  lines.push(avgs ? `${head}  —  ${avgs}` : head);

  for (const as of zr.allStars ?? []) {
    lines.push(`all-stars [${as.spec}]: ${as.points?.toFixed?.(1) ?? as.points}/${as.possiblePoints} pts  rank ${as.rank}  region ${as.regionRank}  server ${as.serverRank}`);
  }

  lines.push('');
  lines.push('BOSS'.padEnd(26) + pad('BEST%', 6) + pad('MED%', 6) + pad('BEST', 12) + pad('KILLS', 6) + pad('SRVR#', 7) + pad('RGN#', 7) + '  SPEC');
  for (const rk of zr.rankings ?? []) {
    if (!rk.encounter?.name) continue;
    lines.push(
      String(rk.encounter.name).padEnd(26)
      + pad(rk.rankPercent != null ? rk.rankPercent.toFixed(1) : '-', 6)
      + pad(rk.medianPercent != null ? rk.medianPercent.toFixed(1) : '-', 6)
      + pad(rk.bestAmount != null ? Math.floor(rk.bestAmount) : '-', 12)
      + pad(rk.totalKills ?? '-', 6)
      + pad(rk.allStars?.serverRank ?? '-', 7)
      + pad(rk.allStars?.regionRank ?? '-', 7)
      + '  ' + (rk.bestSpec ?? rk.spec ?? ''),
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
}
