import { gqlRequest, type Instance } from '../client/graphql.js';
import { writeStdout, CliError } from '../output.js';
import { isExpansion, type Expansion } from '../enrich/expansion.js';
import { loadDb } from '../enrich/db.js';

export interface GearOptions {
  code: string;
  fightId: number;
  name: string;
  instance: Instance;
  force: boolean;
  pretty: boolean;
  useCache: boolean;
  expansion?: string;
}

const SLOT_NAMES = [
  'Head', 'Neck', 'Shoulder', 'Shirt', 'Chest', 'Waist', 'Legs', 'Feet',
  'Wrist', 'Hands', 'Finger1', 'Finger2', 'Trinket1', 'Trinket2', 'Back',
  'MainHand', 'OffHand', 'Ranged', 'Tabard',
] as const;

const QUALITY_NAMES = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact', 'heirloom'] as const;

const QUERY = /* GraphQL */ `query Gear($code: String!, $fightId: Int!) {
  reportData { report(code: $code) {
    fights(fightIDs: [$fightId]) { id startTime endTime kill encounterID }
    playerDetails(fightIDs: [$fightId], includeCombatantInfo: true)
  } }
}`;

export async function runGear(opts: GearOptions): Promise<void> {
  const res = await gqlRequest({
    instance: opts.instance, query: QUERY,
    variables: { code: opts.code, fightId: opts.fightId },
    useCache: opts.useCache, cacheTtlSeconds: 7 * 24 * 3600, force: opts.force,
  });
  const report = (res.data as any)?.reportData?.report;
  const fight = report?.fights?.[0];
  if (!fight) throw new CliError('NOT_FOUND', `fight ${opts.fightId} not in report ${opts.code}`);

  const roles = report?.playerDetails?.data?.playerDetails ?? {};
  const players = (Object.values(roles) as any[][]).flat();
  const player = players.find(p => p?.name === opts.name);
  if (!player) throw new CliError('NOT_FOUND', `player "${opts.name}" not in fight ${opts.fightId}`, 'check spelling / case');

  // On trash pulls WCL returns combatantInfo as an empty array instead of an object.
  const ci = player.combatantInfo;
  const gear: any[] = (ci && !Array.isArray(ci) ? ci.gear : null) ?? [];
  if (gear.length === 0) {
    if (fight.encounterID === 0 || fight.encounterID == null) {
      throw new CliError('BAD_INPUT', `fight ${opts.fightId} is a trash pull (no encounterID) — gear is only audited for boss fights`);
    }
    throw new CliError('NOT_FOUND', `no combatantInfo gear for "${opts.name}" in fight ${opts.fightId}`);
  }

  const gearIds = SLOT_NAMES.map((_, slot) => gear.find(g => g.slot === slot)?.id ?? 0);

  let items: any[] = gear
    .filter(g => (g.id ?? 0) > 0)
    .map(g => ({
      slotIndex: g.slot,
      slotName: SLOT_NAMES[g.slot] ?? `Slot${g.slot}`,
      itemId: g.id,
      name: g.name ?? null,
      itemLevel: g.itemLevel ?? null,
      quality: QUALITY_NAMES[g.quality] ?? String(g.quality),
      enchantId: g.permanentEnchant ?? null,
      enchantName: g.permanentEnchantName ?? null,
      temporaryEnchantId: g.temporaryEnchant ?? null,
      temporaryEnchantName: g.temporaryEnchantName ?? null,
      gemIds: ((g.gems ?? []) as any[]).map(x => x.id),
      setId: g.setID ?? null,
    }));

  if (opts.expansion) {
    if (!isExpansion(opts.expansion)) throw new CliError('BAD_INPUT', `unknown expansion: ${opts.expansion}`);
    const db = loadDb(opts.expansion as Expansion);
    if (db) {
      const itemById = new Map((db.items ?? []).map((i: any) => [i.id, i]));
      items = items.map(it => ({ ...it, simItem: itemById.get(it.itemId) ?? null }));
    }
  }

  writeStdout({
    player: { id: player.id, name: player.name },
    fight: { id: fight.id, encounterID: fight.encounterID, kill: fight.kill, startTime: fight.startTime, endTime: fight.endTime },
    gearIds,
    items,
    rateLimit: res.rateLimit,
  }, opts.pretty);
}
