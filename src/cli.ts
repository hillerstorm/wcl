import { Command } from 'commander';
import { CliError, failAndExit } from './output.js';
import { defaultInstanceForExpansion, isExpansion } from './enrich/expansion.js';
import { ALL_INSTANCES, isInstance, type Instance } from './client/graphql.js';

const program = new Command();

program
  .name('wcl')
  .description('Warcraft Logs CLI — fetch, search, and verify against the WCL GraphQL API')
  .version('1.0.0')
  .option('--instance <inst>', 'WCL instance: fresh (TBC) | classic (MoP) | vanilla (Era) | sod | retail')
  .option('--expansion <exp>', 'sim project for enrichment: tbc | mop | classic | sod')
  .option('--no-cache', 'bypass disk cache for this call')
  .option('--force', 'ignore rate-limit threshold')
  .option('--pretty', 'human-readable JSON output');

interface GlobalOpts {
  instance?: string;
  expansion?: string;
  cache: boolean;
  force?: boolean;
  pretty?: boolean;
}

function globals(): GlobalOpts {
  return program.optsWithGlobals<GlobalOpts>();
}

function resolveInstance(g: { instance?: string; expansion?: string }): Instance {
  if (g.instance) {
    if (!isInstance(g.instance)) {
      throw new CliError('BAD_INPUT', `unknown --instance: ${g.instance}`, `one of: ${ALL_INSTANCES.join(', ')}`);
    }
    return g.instance;
  }
  if (g.expansion && isExpansion(g.expansion)) return defaultInstanceForExpansion(g.expansion);
  return 'fresh';
}

function intArg(label: string): (value: string) => number {
  return (value) => {
    if (!/^-?\d+$/.test(value.trim())) {
      throw new CliError('BAD_INPUT', `${label} must be an integer, got "${value}"`);
    }
    return parseInt(value, 10);
  };
}

function wrapAction<A extends unknown[]>(fn: (...args: A) => Promise<void> | void): (...args: A) => Promise<void> {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      failAndExit(e);
    }
  };
}

program.command('init')
  .description('Interactive first-time setup (client ID + sim paths) — writes config.json')
  .action(wrapAction(async () => {
    const { runInit } = await import('./commands/init.js');
    await runInit();
  }));

program.command('auth')
  .description('Run PKCE OAuth flow and save tokens')
  .option('--reset', 'delete existing credentials before re-authing')
  .action(wrapAction(async (opts: { reset?: boolean }) => {
    const { runAuth } = await import('./commands/auth.js');
    await runAuth(opts);
  }));

program.command('quota')
  .description('Show current WCL rate-limit usage')
  .action(wrapAction(async () => {
    const g = globals();
    const { runQuota } = await import('./commands/quota.js');
    await runQuota({ instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty });
  }));

program.command('query')
  .description('Raw GraphQL passthrough')
  .option('--file <path>', 'read query from file')
  .option('--stdin', 'read query from stdin')
  .option('--var <kv...>', 'variable as key=value (auto-typed) or key:=json (raw JSON, repeatable)', [])
  .action(wrapAction(async (cmdOpts: { file?: string; stdin?: boolean; var?: string[] }) => {
    const g = globals();
    const { runQuery } = await import('./commands/query.js');
    await runQuery({
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(cmdOpts.file ? { file: cmdOpts.file } : {}),
      stdin: !!cmdOpts.stdin,
      vars: cmdOpts.var ?? [],
    });
  }));

program.command('report')
  .description('Fetch report metadata + masterData + fights')
  .argument('<code>', 'WCL report code')
  .action(wrapAction(async (code: string) => {
    const g = globals();
    const { runReport } = await import('./commands/report.js');
    await runReport({
      code, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(g.expansion ? { expansion: g.expansion } : {}),
    });
  }));

program.command('fight')
  .description('Fetch fight metadata + damage-done table')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .action(wrapAction(async (code: string, fightId: number) => {
    const g = globals();
    const { runFight } = await import('./commands/fight.js');
    await runFight({
      code, fightId, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(g.expansion ? { expansion: g.expansion } : {}),
    });
  }));

program.command('fights')
  .description('Compact fight list for a report (text table; --json for structured)')
  .argument('<code>', 'WCL report code')
  .option('--boss', 'only boss fights (encounterID != 0)')
  .option('--kills', 'only kills')
  .option('--encounter <name>', 'filter by fight name substring')
  .option('--json', 'emit JSON instead of a text table')
  .action(wrapAction(async (code: string, cmdOpts: { boss?: boolean; kills?: boolean; encounter?: string; json?: boolean }) => {
    const g = globals();
    const { runFights } = await import('./commands/fights.js');
    await runFights({
      code, boss: !!cmdOpts.boss, kills: !!cmdOpts.kills, json: !!cmdOpts.json,
      ...(cmdOpts.encounter ? { encounter: cmdOpts.encounter } : {}),
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
    });
  }));

program.command('actors')
  .description('Compact actor list for a report (text table; --json for structured)')
  .argument('<code>', 'WCL report code')
  .option('--type <t>', 'player | pet | npc | all (default: player, or all with --owner)')
  .option('--class <name>', 'filter by class (subType)')
  .option('--name <substr>', 'filter by name substring')
  .option('--owner <idOrName>', 'only pets owned by this player')
  .option('--json', 'emit JSON instead of a text table')
  .action(wrapAction(async (code: string, cmdOpts: { type?: string; class?: string; name?: string; owner?: string; json?: boolean }) => {
    const g = globals();
    const { runActors } = await import('./commands/actors.js');
    await runActors({
      code, json: !!cmdOpts.json,
      ...(cmdOpts.type ? { type: cmdOpts.type } : {}),
      ...(cmdOpts.class ? { className: cmdOpts.class } : {}),
      ...(cmdOpts.name ? { name: cmdOpts.name } : {}),
      ...(cmdOpts.owner ? { owner: cmdOpts.owner } : {}),
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
    });
  }));

interface EventsCmdOpts {
  type: string;
  source?: string;
  target?: string;
  ability?: number;
  start?: number;
  end?: number;
  limit: number;
  maxPages: number;
  jsonl?: boolean;
  summary?: boolean;
}

program.command('events')
  .description('Dump or summarize a fight\'s event stream (auto-paginates past the 10k-event limit)')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .option('--type <dataType>', 'damage | damage-taken | casts | buffs | debuffs | healing | deaths | resources | interrupts | dispels | summons | threat | all', 'damage')
  .option('--source <idOrName>', 'filter by source actor (numeric ID or name)')
  .option('--target <idOrName>', 'filter by target actor (numeric ID or name)')
  .option('--ability <id>', 'filter by ability game ID', intArg('--ability'))
  .option('--start <ms>', 'override window start (absolute report ms; default: fight start)', intArg('--start'))
  .option('--end <ms>', 'override window end (absolute report ms; default: fight end)', intArg('--end'))
  .option('--limit <n>', 'events per page', intArg('--limit'), 10000)
  .option('--max-pages <n>', 'pagination cap', intArg('--max-pages'), 20)
  .option('--jsonl', 'emit one event per line (no wrapper object)')
  .option('--summary', 'emit aggregate summary (counts by ability/type/source/target) instead of events')
  .action(wrapAction(async (code: string, fightId: number, cmdOpts: EventsCmdOpts) => {
    const g = globals();
    const { runEvents } = await import('./commands/events.js');
    await runEvents({
      code, fightId, type: cmdOpts.type,
      ...(cmdOpts.source !== undefined ? { source: cmdOpts.source } : {}),
      ...(cmdOpts.target !== undefined ? { target: cmdOpts.target } : {}),
      ...(cmdOpts.ability !== undefined ? { ability: cmdOpts.ability } : {}),
      ...(cmdOpts.start !== undefined ? { start: cmdOpts.start } : {}),
      ...(cmdOpts.end !== undefined ? { end: cmdOpts.end } : {}),
      limit: cmdOpts.limit, maxPages: cmdOpts.maxPages,
      jsonl: !!cmdOpts.jsonl, summary: !!cmdOpts.summary,
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
    });
  }));

program.command('player')
  .description('Fetch player snapshot, casts, damage, buffs for a fight')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .argument('<name>', 'player name')
  .action(wrapAction(async (code: string, fightId: number, name: string) => {
    const g = globals();
    const { runPlayer } = await import('./commands/player.js');
    await runPlayer({
      code, fightId, name, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(g.expansion ? { expansion: g.expansion } : {}),
    });
  }));

program.command('cast-snapshot')
  .description('Full snapshot for a single cast: caster gear/talents/buffs + target debuffs at T')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .argument('<name>', 'player name')
  .option('--at <ms>', 'absolute fight-time in ms', intArg('--at'))
  .option('--ability <id>', 'ability ID (use with --index)', intArg('--ability'))
  .option('--index <n>', 'Nth cast of ability (1-indexed)', intArg('--index'))
  .option('--window <ms>', 'surrounding-casts window (default 5000)', intArg('--window'), 5000)
  .action(wrapAction(async (code: string, fightId: number, name: string, cmdOpts: { at?: number; ability?: number; index?: number; window: number }) => {
    const g = globals();
    const { runCastSnapshot } = await import('./commands/cast-snapshot.js');
    await runCastSnapshot({
      code, fightId, name,
      ...(cmdOpts.at !== undefined ? { at: cmdOpts.at } : {}),
      ...(cmdOpts.ability !== undefined ? { ability: cmdOpts.ability } : {}),
      ...(cmdOpts.index !== undefined ? { index: cmdOpts.index } : {}),
      window: cmdOpts.window,
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(g.expansion ? { expansion: g.expansion } : {}),
    });
  }));

interface SearchCmdOpts {
  encounter?: string;
  class?: string;
  spec?: string;
  difficulty?: string;
  region?: string;
  server?: string;
  guild?: string;
  order: 'amount' | 'date';
  limit: number;
  page: number;
}

program.command('search')
  .description('Search public WCL rankings for an encounter')
  .option('--encounter <name-or-id>', 'encounter name or numeric ID')
  .option('--class <name>', 'class filter')
  .option('--spec <name>', 'spec filter')
  .option('--difficulty <d>', 'n | h | m | normal | heroic | mythic')
  .option('--region <region>', 'NA | EU | KR | TW | CN')
  .option('--server <slug>', 'server slug')
  .option('--guild <name>', 'guild name')
  .option('--order <field>', 'amount | date', 'amount')
  .option('--limit <n>', 'max results to print', intArg('--limit'), 20)
  .option('--page <n>', 'WCL ranking page (1-indexed)', intArg('--page'), 1)
  .action(wrapAction(async (cmdOpts: SearchCmdOpts) => {
    const g = globals();
    if (!cmdOpts.encounter) throw new CliError('BAD_INPUT', '--encounter is required');
    const { runSearch } = await import('./commands/search.js');
    await runSearch({
      encounter: cmdOpts.encounter,
      ...(cmdOpts.class ? { className: cmdOpts.class } : {}),
      ...(cmdOpts.spec ? { spec: cmdOpts.spec } : {}),
      ...(cmdOpts.difficulty ? { difficulty: cmdOpts.difficulty } : {}),
      ...(cmdOpts.region ? { region: cmdOpts.region } : {}),
      ...(cmdOpts.server ? { server: cmdOpts.server } : {}),
      ...(cmdOpts.guild ? { guild: cmdOpts.guild } : {}),
      order: cmdOpts.order, limit: cmdOpts.limit, page: cmdOpts.page,
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty, useCache: g.cache !== false,
    });
  }));

interface CharacterCmdOpts {
  zone?: number;
  metric?: string;
  spec?: string;
  difficulty?: number;
  size?: number;
  partition?: number;
  json?: boolean;
}

program.command('character')
  .description('Character zone rankings: per-boss best%, kills, server/region rank (text table; --json for structured)')
  .argument('<name>', 'character name')
  .argument('<server>', 'server slug (lowercase, no spaces)')
  .argument('<region>', 'region: us | eu | kr | tw | cn')
  .option('--zone <id>', 'zone ID (default: character\'s latest zone)', intArg('--zone'))
  .option('--metric <m>', 'dps | hps | bossdps | tankhps | playerscore | …')
  .option('--spec <name>', 'restrict rankings to a spec')
  .option('--difficulty <n>', 'difficulty ID', intArg('--difficulty'))
  .option('--size <n>', 'raid size', intArg('--size'))
  .option('--partition <n>', 'ranking partition', intArg('--partition'))
  .option('--json', 'emit JSON instead of a text table')
  .action(wrapAction(async (name: string, server: string, region: string, cmdOpts: CharacterCmdOpts) => {
    const g = globals();
    const { runCharacter } = await import('./commands/character.js');
    await runCharacter({
      name, server, region, json: !!cmdOpts.json,
      ...(cmdOpts.zone !== undefined ? { zone: cmdOpts.zone } : {}),
      ...(cmdOpts.metric !== undefined ? { metric: cmdOpts.metric } : {}),
      ...(cmdOpts.spec !== undefined ? { spec: cmdOpts.spec } : {}),
      ...(cmdOpts.difficulty !== undefined ? { difficulty: cmdOpts.difficulty } : {}),
      ...(cmdOpts.size !== undefined ? { size: cmdOpts.size } : {}),
      ...(cmdOpts.partition !== undefined ? { partition: cmdOpts.partition } : {}),
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
    });
  }));

program.command('gear')
  .description('Fetch a player\'s gear/enchants/gems for a boss fight')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer, must be a boss fight)', intArg('fightId'))
  .argument('<name>', 'player name')
  .action(wrapAction(async (code: string, fightId: number, name: string) => {
    const g = globals();
    const { runGear } = await import('./commands/gear.js');
    await runGear({
      code, fightId, name,
      instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
      useCache: g.cache !== false,
      ...(g.expansion ? { expansion: g.expansion } : {}),
    });
  }));

program.command('cache')
  .description('cache stats | cache clear [--prefix <q>]')
  .argument('<action>', 'stats | clear')
  .option('--prefix <p>', 'restrict clear to keys with this prefix')
  .action(wrapAction(async (action: string, cmdOpts: { prefix?: string }) => {
    const g = globals();
    const { runCache } = await import('./commands/cache.js');
    runCache({ action, ...(cmdOpts.prefix ? { prefix: cmdOpts.prefix } : {}), pretty: !!g.pretty });
  }));

try {
  await program.parseAsync(process.argv);
} catch (e) {
  failAndExit(e);
}
