import { Command } from 'commander';
import { CliError, failAndExit } from './output.js';
import { defaultInstanceForExpansion, isExpansion } from './enrich/expansion.js';
import { ALL_INSTANCES, isInstance, type Instance } from './client/graphql.js';

const program = new Command();

program
  .name('wcl')
  .description('Warcraft Logs CLI — fetch, search, and verify against the WCL GraphQL API')
  .version('0.1.0')
  .option('--instance <inst>', 'WCL instance: fresh (TBC) | classic (MoP) | vanilla (Era) | sod | retail')
  .option('--expansion <exp>', 'sim project for enrichment: tbc | mop | classic | sod')
  .option('--no-cache', 'bypass disk cache for this call')
  .option('--force', 'ignore rate-limit threshold')
  .option('--pretty', 'human-readable JSON output');

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

program.command('init')
  .description('Interactive first-time setup (client ID + sim paths) — writes config.json')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    try {
      await runInit();
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('auth')
  .description('Run PKCE OAuth flow and save tokens')
  .option('--reset', 'delete existing credentials before re-authing')
  .action(async (opts: { reset?: boolean }) => {
    const { runAuth } = await import('./commands/auth.js');
    try {
      await runAuth(opts);
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('quota')
  .description('Show current WCL rate-limit usage')
  .action(async () => {
    const opts = program.optsWithGlobals() as { instance?: string; expansion?: string; force?: boolean; pretty?: boolean };
    const { runQuota } = await import('./commands/quota.js');
    try {
      await runQuota({ instance: resolveInstance(opts), force: !!opts.force, pretty: !!opts.pretty });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('query')
  .description('Raw GraphQL passthrough')
  .option('--file <path>', 'read query from file')
  .option('--stdin', 'read query from stdin')
  .option('--var <kv...>', 'variable as key=value (repeatable)', [])
  .action(async (cmdOpts: { file?: string; stdin?: boolean; var?: string[] }) => {
    const g = program.optsWithGlobals() as any;
    const { runQuery } = await import('./commands/query.js');
    try {
      await runQuery({
        instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
        ...(cmdOpts.file ? { file: cmdOpts.file } : {}),
        stdin: !!cmdOpts.stdin,
        vars: cmdOpts.var ?? [],
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('report')
  .description('Fetch report metadata + masterData + fights')
  .argument('<code>', 'WCL report code')
  .action(async (code: string) => {
    const g = program.optsWithGlobals() as any;
    const { runReport } = await import('./commands/report.js');
    try {
      await runReport({
        code, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
        ...(g.expansion ? { expansion: g.expansion } : {}),
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('fight')
  .description('Fetch fight metadata + damage-done table')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .action(async (code: string, fightId: number) => {
    const g = program.optsWithGlobals() as any;
    const { runFight } = await import('./commands/fight.js');
    try {
      await runFight({
        code, fightId, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
        ...(g.expansion ? { expansion: g.expansion } : {}),
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('fights')
  .description('Compact fight list for a report (text table; --json for structured)')
  .argument('<code>', 'WCL report code')
  .option('--boss', 'only boss fights (encounterID != 0)')
  .option('--kills', 'only kills')
  .option('--encounter <name>', 'filter by fight name substring')
  .option('--json', 'emit JSON instead of a text table')
  .action(async (code: string, cmdOpts: { boss?: boolean; kills?: boolean; encounter?: string; json?: boolean }) => {
    const g = program.optsWithGlobals() as any;
    const { runFights } = await import('./commands/fights.js');
    try {
      await runFights({
        code, boss: !!cmdOpts.boss, kills: !!cmdOpts.kills, json: !!cmdOpts.json,
        ...(cmdOpts.encounter ? { encounter: cmdOpts.encounter } : {}),
        instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('actors')
  .description('Compact actor list for a report (text table; --json for structured)')
  .argument('<code>', 'WCL report code')
  .option('--type <t>', 'player | pet | npc | all (default: player, or all with --owner)')
  .option('--class <name>', 'filter by class (subType)')
  .option('--name <substr>', 'filter by name substring')
  .option('--owner <idOrName>', 'only pets owned by this player')
  .option('--json', 'emit JSON instead of a text table')
  .action(async (code: string, cmdOpts: { type?: string; class?: string; name?: string; owner?: string; json?: boolean }) => {
    const g = program.optsWithGlobals() as any;
    const { runActors } = await import('./commands/actors.js');
    try {
      await runActors({
        code, json: !!cmdOpts.json,
        ...(cmdOpts.type ? { type: cmdOpts.type } : {}),
        ...(cmdOpts.class ? { className: cmdOpts.class } : {}),
        ...(cmdOpts.name ? { name: cmdOpts.name } : {}),
        ...(cmdOpts.owner ? { owner: cmdOpts.owner } : {}),
        instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

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
  .action(async (code: string, fightId: number, cmdOpts: any) => {
    const g = program.optsWithGlobals() as any;
    const { runEvents } = await import('./commands/events.js');
    try {
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
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('player')
  .description('Fetch player snapshot, casts, damage, buffs for a fight')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .argument('<name>', 'player name')
  .action(async (code: string, fightId: number, name: string) => {
    const g = program.optsWithGlobals() as any;
    const { runPlayer } = await import('./commands/player.js');
    try {
      await runPlayer({
        code, fightId, name, instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
        ...(g.expansion ? { expansion: g.expansion } : {}),
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('cast-snapshot')
  .description('Full snapshot for a single cast: caster gear/talents/buffs + target debuffs at T')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer)', intArg('fightId'))
  .argument('<name>', 'player name')
  .option('--at <ms>', 'absolute fight-time in ms', intArg('--at'))
  .option('--ability <id>', 'ability ID (use with --index)', intArg('--ability'))
  .option('--index <n>', 'Nth cast of ability (1-indexed)', intArg('--index'))
  .option('--window <ms>', 'surrounding-casts window (default 5000)', intArg('--window'), 5000)
  .action(async (code: string, fightId: number, name: string, cmdOpts: { at?: number; ability?: number; index?: number; window: number }) => {
    const g = program.optsWithGlobals() as any;
    const { runCastSnapshot } = await import('./commands/cast-snapshot.js');
    try {
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
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

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
  .action(async (cmdOpts: any) => {
    const g = program.optsWithGlobals() as any;
    const { runSearch } = await import('./commands/search.js');
    try {
      if (!cmdOpts.encounter) throw new CliError('BAD_INPUT', '--encounter is required');
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
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

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
  .action(async (name: string, server: string, region: string, cmdOpts: any) => {
    const g = program.optsWithGlobals() as any;
    const { runCharacter } = await import('./commands/character.js');
    try {
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
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('gear')
  .description('Fetch a player\'s gear/enchants/gems for a boss fight')
  .argument('<code>', 'WCL report code')
  .argument('<fightId>', 'fight ID (integer, must be a boss fight)', intArg('fightId'))
  .argument('<name>', 'player name')
  .action(async (code: string, fightId: number, name: string) => {
    const g = program.optsWithGlobals() as any;
    const { runGear } = await import('./commands/gear.js');
    try {
      await runGear({
        code, fightId, name,
        instance: resolveInstance(g), force: !!g.force, pretty: !!g.pretty,
        useCache: g.cache !== false,
        ...(g.expansion ? { expansion: g.expansion } : {}),
      });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

program.command('cache')
  .description('cache stats | cache clear [--prefix <q>]')
  .argument('<action>', 'stats | clear')
  .option('--prefix <p>', 'restrict clear to keys with this prefix')
  .action(async (action: string, cmdOpts: { prefix?: string }) => {
    const g = program.optsWithGlobals() as any;
    const { runCache } = await import('./commands/cache.js');
    try {
      runCache({ action, ...(cmdOpts.prefix ? { prefix: cmdOpts.prefix } : {}), pretty: !!g.pretty });
    } catch (e) {
      const { failAndExit } = await import('./output.js');
      failAndExit(e);
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (e) {
  failAndExit(e);
}
