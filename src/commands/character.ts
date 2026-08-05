import { gqlRequest, type Instance } from '../client/graphql.js';
import { CHARACTER_QUERY } from '../queries/character.graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface CharacterOptions {
  name: string;
  server: string;
  region: string;
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

export async function runCharacter(opts: CharacterOptions): Promise<void> {
  const r = await gqlRequest({
    instance: opts.instance, query: CHARACTER_QUERY,
    variables: {
      name: opts.name, server: opts.server.toLowerCase(), region: opts.region.toLowerCase(),
      ...(opts.zone !== undefined ? { zoneID: opts.zone } : {}),
      ...(opts.metric !== undefined ? { metric: opts.metric } : {}),
      ...(opts.spec !== undefined ? { specName: opts.spec } : {}),
      ...(opts.difficulty !== undefined ? { difficulty: opts.difficulty } : {}),
      ...(opts.size !== undefined ? { size: opts.size } : {}),
      ...(opts.partition !== undefined ? { partition: opts.partition } : {}),
    },
    useCache: opts.useCache, cacheTtlSeconds: ONE_HOUR, force: opts.force,
  });
  const character = (r.data as any)?.characterData?.character;
  if (!character) {
    throw new CliError('NOT_FOUND', `character ${opts.name} on ${opts.server}/${opts.region} not found`,
      'check spelling; server is the slug (lowercase, no spaces), region is e.g. us / eu');
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
