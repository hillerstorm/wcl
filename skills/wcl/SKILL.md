---
name: wcl
description: Warcraft Logs CLI for fetching report data, searching public logs, and verifying sim damage calculations against real-world combat logs. Use when the user asks about WCL logs, wants to fetch a specific report/fight/player, compare sim output to a real log, or search rankings for candidate logs.
allowed-tools: Bash(wcl:*)
---

# WCL — Warcraft Logs skill

A CLI wrapping the WCL GraphQL API with PKCE auth, disk caching, and rate-limit awareness.

## First-time setup

If `wcl` is not on `$PATH`:

1. Install: `npm install -g @hillerstorm/wcl` — or from source: `git clone https://github.com/hillerstorm/wcl && cd wcl && npm install && npm run build && npm link`.
2. Register a public client at https://www.warcraftlogs.com/api/clients/ — name it anything, set redirect URL to `http://localhost:31337/callback`, tick "Public Client".
3. `wcl init` — interactive prompt for client ID and per-expansion sim-repo paths. Hit Enter to skip any expansion you don't have cloned. Re-run any time to update; type `-` at a prompt to clear a value.
4. `wcl auth` — opens a browser, runs PKCE OAuth, persists tokens (0600). Re-run with `--reset` to clear and redo.

Alternative (non-interactive): write `config.json` by hand (see `config.example.json` in the repo), or set `$WCL_CLIENT_ID` / `$WCL_WOWSIMS_ROOT` env vars.

CLI data (`config.json`, `credentials.json`, `.cache/`) lives at the repo root (gitignored) when running from a checkout, else in `~/.config/wcl` and `~/.cache/wcl` (npm installs). The env vars `WCL_CONFIG_DIR` / `WCL_CACHE_DIR` / `WCL_WOWSIMS_ROOT` override the corresponding paths (used by the test suite).

## Commands

| Command | Purpose |
|---|---|
| `wcl auth [--reset]` | OAuth PKCE flow |
| `wcl quota` | Show current rate-limit usage |
| `wcl query --file q.graphql [--var k=v] [--var k:=json]…` or `wcl query --stdin` | Raw GraphQL escape hatch (`k=v` auto-types digits/booleans; `k:=json` sends raw JSON, e.g. `code:='"123"'` for a digit-only string) |
| `wcl report <code>` | Report metadata, fights, masterData |
| `wcl fights <code> [--boss --kills --encounter <name> --json]` | Compact fight table: id, kill/wipe/trash, duration, start/end ms |
| `wcl actors <code> [--type player\|pet\|npc\|all --class <c> --name <substr> --owner <player> --json]` | Compact actor table with resolved pet owners |
| `wcl events <code> <fightId> [--type damage\|casts\|buffs\|debuffs\|healing\|…] [--source <id\|name>] [--target <id\|name>] [--ability <id>] [--hostile] [--start/--end ms] [--jsonl \| --summary]` | Full event stream, auto-paginated past the 10k limit |
| `wcl fight <code> <fightId>` | Fight metadata + damage-done table |
| `wcl player <code> <fightId> <name>` | Player snapshot, casts, damage, buffs |
| `wcl cast-snapshot <code> <fightId> <name> --at <ms> [--window N]` | Full snapshot for a single cast |
| `wcl cast-snapshot <code> <fightId> <name> --ability <id> --index <N>` | Nth cast of an ability |
| `wcl gear <code> <fightId> <name>` | Gear/enchants/gems/temp-enchants for a player (boss fights only) |
| `wcl search --encounter <name-or-id> [--class --spec --difficulty --region --server --guild --order --limit --page]` | Public-log discovery |
| `wcl character <name> <server-slug> <region> [--zone <id> --metric <m> --spec <s> --difficulty <n> --size <n> --partition <n> --json]` | Character zone rankings: per-boss best%, kills, server/region rank |
| `wcl cache stats` / `wcl cache clear [--prefix p]` | Cache management |

## Global flags

| Flag | Purpose |
|---|---|
| `--instance fresh\|classic\|vanilla\|sod\|retail` | API host. Default: derived from `--expansion`, else `fresh`. |
| `--expansion tbc\|mop\|classic\|sod` | Enrich response with sim db.json |
| `--no-cache` | Bypass disk cache |
| `--force` | Ignore rate-limit threshold |
| `--pretty` | Human-readable JSON output |

### Expansion ↔ instance map

| Expansion | Default instance (WCL host) | Content |
|---|---|---|
| `tbc` | `fresh` → `fresh.warcraftlogs.com` | TBC / Classic Anniversary |
| `mop` | `classic` → `classic.warcraftlogs.com` | Mists of Pandaria / Classic Progression |
| `classic` | `vanilla` → `vanilla.warcraftlogs.com` | Vanilla / Classic Era |
| `sod` | `sod` → `sod.warcraftlogs.com` | Season of Discovery |
| (none) | `retail` → `www.warcraftlogs.com` | Retail (no sim enrichment) |

Passing `--expansion <x>` is usually sufficient — the instance is auto-derived. Override with `--instance` only when you want to mix (e.g., query a fresh log without sim enrichment).

Each expansion's sim-repo path is read from `config.json` (`simPaths.<expansion>`) — set via `wcl init`. Expansions without a configured path skip enrichment.

## Damage-verification workflow

1. `wcl search --encounter <name> --class <c> --spec <s>` — find a candidate log.
2. `wcl fights <code> --boss` — compact fight list with start/end windows (use `wcl report` only when you need full masterData JSON).
3. `wcl actors <code> [--class <c>]` — resolve player/pet actor IDs; `--owner <player>` lists a player's pets.
4. `wcl events <code> <fightId> --source <player> --summary` — per-ability damage totals and counts, or
   `--type buffs --ability <id> --jsonl` for a raw event stream. Auto-paginates; source/target accept names.
   Events default to the friendlies' perspective — add `--hostile` for boss/NPC activity
   (e.g. `--type casts --hostile --source <boss>` for a boss rotation, or `--type damage --hostile` for raid damage taken).
   Do NOT hand-write `events(...)` GraphQL via `wcl query` — `wcl events` covers filtering, pagination, and name resolution.
5. `wcl cast-snapshot <code> <fightId> <player> --at <ms> --expansion <exp>` — full
   snapshot for sim comparison. The response includes:
   - the cast event + associated damage events
   - caster gear, talents, combatantInfo
   - active buffs on caster at T (folded from the fight's buff event stream)
   - active debuffs on the target at T
   - surrounding casts within ±window ms
   - `rateLimit` footer

## Gear (`wcl gear`)

Fetches the gear snapshot WCL audits at the start of each boss fight, via `playerDetails(includeCombatantInfo: true)`. Boss fights only (`encounterID != 0`) — on trash pulls WCL returns no combatant info (exit 7, `BAD_INPUT`). Returns 19-slot `gearIds[]` (0 = empty slot) plus per-item `itemId`, `slotName`, `itemLevel`, `quality`, `enchantId`/`enchantName`, `temporaryEnchantId`/`temporaryEnchantName` (Windfury, poisons, sharpening stones), `gemIds[]`, `setId`. With `--expansion`, every item is joined against the sim's `db.json` and the result includes `simItem.scalingOptions.stats` ready for sim consumption.

## JSON output shapes

Every API-backed JSON command prints ONE top-level object with a `rateLimit` key — index by key, never `[0]`. Exceptions: `quota` prints the rate-limit object itself, `events --jsonl` prints bare events, `cache` is local. `fights`, `actors` and `character` print a text table unless `--json`.

| Command | Top-level keys |
|---|---|
| `report` | `report`, `rateLimit` |
| `fights --json` | `fights`, `rateLimit` |
| `actors --json` | `actors`, `rateLimit` |
| `fight` | `fight`, `damageDone`, `rateLimit` |
| `events` | `fight`, `filter`, `count`, `pages`, `truncated`?, `nextPageTimestamp`?, `events`, `rateLimit` |
| `events --summary` | as `events`, but `byType`, `byAbility`, `bySource`, `byTarget` instead of `events` |
| `events --jsonl` | no wrapper: one raw event object per line, no `rateLimit` |
| `player` | `player`, `casts`, `damage`, `buffs`, `truncated`?, `rateLimit` |
| `cast-snapshot` | `cast`, `fight`, `caster`, `target`, `damageEvents`, `surroundingCasts`, `rateLimit` |
| `gear` | `player`, `fight`, `gearIds`, `items`, `rateLimit` — the per-item list is `items`, not `gear` |
| `search` | `encounter`, `rankings`, `page`, `hasMorePages`, `rateLimit` |
| `character --json` | `character`, `rateLimit` |
| `query` | `data`, `rateLimit`, `errors`? |
| `quota` | `pointsSpent`, `pointsAllowed`, `pointsResetIn`, `ratio` (same shape as every `rateLimit`) |
| `cache stats` / `cache clear` | `entries`, `bytes`, `dir` / `removed` |

```sh
wcl actors <code> --json | jq '.actors[] | select(.name == "Foo") | .id'
wcl gear <code> <fightId> Foo | jq '.items[] | {slotName, itemId, enchantId}'
```

On failure stdout is EMPTY: the error JSON goes to stderr and the exit code is non-zero (see Errors). Never `2>/dev/null` a wcl call — `wcl gear … > f 2>/dev/null` leaves an empty file that fails to parse ("Expecting value: line 1 column 1") and hides the real cause (trash pull, wrong name, 401, quota). Redirect stderr to a file (`2>err.txt`) or leave it visible, and read it before retrying. Judge success by the exit code, not by stderr being empty: a successful call can still print a `partial-graphql-errors` warning there.

## Rate limit

WCL uses a points-per-hour quota. API-backed JSON output carries a `rateLimit` field (stored with the response, so stale on a cache hit — `wcl quota` is live). The skill
refuses requests when usage > 95% unless `--force` is passed; `wcl quota` itself is never blocked. Cache TTLs:
report/fights/actors/fight/player/events/cast-snapshot = 7 days (events cache per page), search = 1 hour, quota = never cached.

## Errors

All errors are emitted as JSON on stderr with `{ code, message, hint?, details? }`:

| code | exit | meaning |
|---|---|---|
| `BAD_INPUT` | 7 | usage error |
| `NOT_AUTHENTICATED` | 2 | run `wcl auth` |
| `QUOTA_LOW` | 3 | usage > 95%. Reset time: `details.resetInSeconds` in this error, or `wcl quota` → `pointsResetIn` (v1.2.0+ always reports; older versions guard `quota` too — use `wcl quota --force`). `--force` bypasses the guard for one call. Sweeps: stop on exit 3, sleep until reset, resume — never loop with `--force`. |
| `RATE_LIMITED` | 4 | server-side 429 — wait and retry |
| `GRAPHQL_ERROR` | 1 | WCL returned errors |
| `NOT_FOUND` | 5 | report/fight/player not found |
| `NETWORK_ERROR` | 6 | transient — retry |
