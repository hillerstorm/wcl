import { gqlRequest, type Instance } from '../client/graphql.js';
import { REPORT_QUERY } from '../queries/report.graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface ActorsOptions {
  code: string;
  type?: string;
  className?: string;
  name?: string;
  owner?: string;
  json: boolean;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
}

const SEVEN_DAYS = 7 * 24 * 3600;

const TYPE_FILTERS: Record<string, string | null> = {
  player: 'Player',
  pet: 'Pet',
  npc: 'NPC',
  all: null,
};

function pad(v: unknown, w: number): string {
  return String(v ?? '').padEnd(w);
}

export async function runActors(opts: ActorsOptions): Promise<void> {
  const typeKey = (opts.type ?? (opts.owner ? 'all' : 'player')).toLowerCase();
  if (!(typeKey in TYPE_FILTERS)) {
    throw new CliError('BAD_INPUT', `unknown --type: ${opts.type}`, 'one of: player, pet, npc, all');
  }
  const typeFilter = TYPE_FILTERS[typeKey];

  const r = await gqlRequest({
    instance: opts.instance, query: REPORT_QUERY,
    variables: { code: opts.code },
    useCache: opts.useCache, cacheTtlSeconds: SEVEN_DAYS, force: opts.force,
  });
  const report = (r.data as any)?.reportData?.report;
  if (!report) throw new CliError('NOT_FOUND', `report ${opts.code} not found`, 'check the code + --instance');

  const all: any[] = report.masterData?.actors ?? [];
  const byId = new Map<number, any>(all.map(a => [a.id, a]));

  let ownerId: number | undefined;
  if (opts.owner !== undefined) {
    if (/^\d+$/.test(opts.owner)) {
      ownerId = parseInt(opts.owner, 10);
    } else {
      const wanted = opts.owner.toLowerCase();
      const owner = all.find(a => a.type === 'Player' && a.name?.toLowerCase() === wanted);
      if (!owner) throw new CliError('NOT_FOUND', `owner "${opts.owner}" not found among players`);
      ownerId = owner.id;
    }
  }

  let actors = all;
  if (typeFilter) actors = actors.filter(a => a.type === typeFilter);
  if (ownerId !== undefined) actors = actors.filter(a => a.petOwner === ownerId);
  if (opts.className) {
    const wanted = opts.className.toLowerCase();
    actors = actors.filter(a => a.subType?.toLowerCase() === wanted);
  }
  if (opts.name) {
    const wanted = opts.name.toLowerCase();
    actors = actors.filter(a => a.name?.toLowerCase().includes(wanted));
  }

  if (opts.json) {
    writeStdout({ actors, rateLimit: r.rateLimit }, opts.pretty);
    return;
  }

  const lines = [pad('ID', 6) + pad('TYPE', 8) + pad('CLASS', 14) + pad('OWNER', 14) + 'NAME'];
  for (const a of actors) {
    const owner = a.petOwner != null ? (byId.get(a.petOwner)?.name ?? a.petOwner) : '';
    lines.push(pad(a.id, 6) + pad(a.type, 8) + pad(a.subType, 14) + pad(owner, 14) + (a.name ?? ''));
  }
  process.stdout.write(lines.join('\n') + '\n');
}
