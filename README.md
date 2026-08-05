# wcl — Warcraft Logs CLI

A command-line client for the [Warcraft Logs](https://www.warcraftlogs.com) GraphQL API with OAuth PKCE auth, disk caching, rate-limit awareness, and optional [WoWSims](https://github.com/wowsims) database enrichment. Built for verifying sim damage calculations against real combat logs — but useful for any scripted WCL data access.

Also ships as an [agent skill](#using-as-an-agent-skill) so coding agents (Claude Code, Cursor, etc.) can drive it.

## Install

```sh
npm install -g @hillerstorm/wcl
```

Or from source:

```sh
git clone https://github.com/hillerstorm/wcl
cd wcl
npm install
npm run build
npm link   # puts `wcl` on your $PATH
```

Requires Node 22+.

## Getting started

**1. Register an API client** at <https://www.warcraftlogs.com/api/clients/>:

- Name: anything you like
- Redirect URL: `http://localhost:31337/callback`
- Tick **Public Client** (the CLI uses PKCE — no client secret involved)

**2. Configure:**

```sh
wcl init
```

Interactive prompt for your client ID and, optionally, per-expansion WoWSims repo paths (used to enrich responses with item/spell data from the sim's `db.json` — hit Enter to skip any you don't have). Re-run any time; type `-` at a prompt to clear a value.

**3. Authenticate:**

```sh
wcl auth
```

Opens your browser for the OAuth flow and stores tokens locally (`0600`). Re-run with `--reset` to start over.

**4. Try it:**

```sh
wcl quota                                          # rate-limit usage
wcl search --encounter "Gruul the Dragonkiller" --class hunter --spec beastmastery
wcl fights <reportCode> --boss                     # fight list for a report
wcl actors <reportCode> --class hunter             # resolve actor IDs
wcl events <reportCode> <fightId> --source "Playername" --summary
wcl player <reportCode> <fightId> "Playername"     # full player snapshot
wcl character "Playername" <server-slug> <region>  # zone rankings
```

All output is JSON (add `--pretty` for human-readable). Errors go to stderr as JSON with stable `code` values and exit codes.

## Commands

| Command | Purpose |
|---|---|
| `wcl auth [--reset]` | OAuth PKCE flow |
| `wcl quota` | Current rate-limit usage |
| `wcl query --file q.graphql [--var k=v] [--var k:=json]…` | Raw GraphQL escape hatch |
| `wcl report <code>` | Report metadata, fights, masterData |
| `wcl fights <code>` | Compact fight table |
| `wcl actors <code>` | Actor table with resolved pet owners |
| `wcl events <code> <fightId>` | Filtered event stream, auto-paginated |
| `wcl fight <code> <fightId>` | Fight metadata + damage-done table |
| `wcl player <code> <fightId> <name>` | Player snapshot, casts, damage, buffs |
| `wcl cast-snapshot <code> <fightId> <name>` | Full state snapshot around a single cast |
| `wcl gear <code> <fightId> <name>` | Gear/enchants/gems/temp-enchants for a player (boss fights only) |
| `wcl search` | Public-log discovery via rankings |
| `wcl character <name> <server> <region>` | Character zone rankings |
| `wcl cache stats` / `wcl cache clear` | Cache management |

Run any command with `--help` for full flags. Global flags: `--instance` / `--expansion` select the WCL host (retail, fresh, classic, vanilla, sod) and sim enrichment; `--no-cache`, `--force`, `--pretty`.

## Data locations

| | Repo checkout | npm install |
|---|---|---|
| `config.json`, `credentials.json` | repo root (gitignored) | `~/.config/wcl/` |
| response cache | `<repo>/.cache/` | `~/.cache/wcl/` |

Override with `$WCL_CONFIG_DIR`, `$WCL_CACHE_DIR`, `$WCL_CLIENT_ID`, `$WCL_WOWSIMS_ROOT`.

## Rate limits & caching

WCL grants a points-per-hour quota. Every response carries a `rateLimit` footer; the CLI refuses new requests above 95% usage unless `--force` is passed. Report-shaped data is cached on disk for 7 days, searches for 1 hour.

## Using as an agent skill

The skill definition lives in [`skills/wcl/SKILL.md`](skills/wcl/SKILL.md):

```sh
npx skills add hillerstorm/wcl
```

or symlink `skills/wcl` into your agent's skills directory (e.g. `~/.claude/skills/wcl`). The skill expects the `wcl` binary on `$PATH` — install it via npm or from source as above.

## Development

```sh
npm run dev -- quota   # run from TypeScript source (tsx)
npm test               # vitest
npm run typecheck      # tsc --noEmit
npm run build          # esbuild bundle → dist/cli.js
```

## Attribution & terms

Data comes from [Warcraft Logs](https://www.warcraftlogs.com), fetched through the official v2 GraphQL API. This is an unofficial tool — not affiliated with, sponsored, or endorsed by RPGLogs / Archon.

Your use of the API is subject to the [RPGLogs API Terms of Service](https://www.archon.gg/classic-mop/articles/help/rpg-logs-api-terms-of-service). In particular: every user registers **their own** API client (`wcl init` — no developer credentials ship with this project, and yours should stay out of any fork you publish), and commercial use of API data requires prior approval from RPGLogs.

## License

[MIT](LICENSE.md)
