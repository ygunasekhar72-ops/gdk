# GDK — Game Development Kit for AI agents

GDK lets AI coding agents **build or clone games at absolute quality** by giving
them three things:

1. **A team plan** — the specialist agents to spawn (physics, logic, netcode,
   graphics, security, QA) with missions, ordered phases, and exit gates.
2. **Absolute standards** — per-pillar playbooks (`skills/`) that turn "make it
   good" into enforceable rules with IDs (`NET.SRV-AUTH`, `PHY.DETERMINISM`, …).
3. **Quality gates** — a machine-checkable build verifier (`gdk gates`) that
   *rejects* a game until every blocker/major rule passes: static scans, policy
   checks, and headless engine tests.

"Absolute" is not a vibe here — it is a gate report.

## The pillars

| Pillar | Core law | Example rules |
|---|---|---|
| Multiplayer | The server is the only authority; clients are microphones and screens | `NET.SRV-AUTH`, `NET.TICK-FIXED`, `NET.INPUT-VALIDATE`, `NET.SNAPSHOT-INTERP`, `NET.PREDICT-RECONCILE` |
| Physics/Maths | Same inputs + same seed ⇒ same world, proven by headless test | `PHY.FIXED-TIMESTEP`, `PHY.DETERMINISM`, `PHY.SANITY-SIM` |
| Logic | Game flow is an explicit FSM; sim and render are separate layers | `LOG.FSM`, `LOG.SIM-RENDER-SEPARATION`, `LOG.EVENTS-DETERMINISTIC` |
| Security | Every client is hostile and colluding with every other client | `SEC.NEVER-TRUST-CLIENT`, `SEC.SECRETS-SCAN`, `SEC.RATE-LIMIT` |
| Graphics | Hit the FPS target with the best-looking frame that fits | `GFX.FPS-BUDGET`, `GFX.RENDER-SCALE`, `GFX.ASSET-BUDGET` |
| QA | No green report, no build | `QA.TESTS-PASS`, `QA.PLAYTEST-SCRIPT`, `QA.SPEC-COMPLETE` |

Full catalog: `gdk standards all` (27 rules).

## The three doors

```
                     ┌─────────────────────────────┐
   MCP client        │  packages/mcp   gdk_plan_game   gdk_run_gates   │
   (Cursor, ZCode…) ─▶  packages/cli   gdk new · plan · gates · agents │
   terminal/agent    │  skills/ + agents/  specialist playbooks       │
                     └─────────────────────────────┘
                                   │
                          packages/core (rules, planner, gate runner)
                                   │
                     adapters → templates/godot/arena-mp (first engine)
```

## Quickstart

```bash
npm install && npm run build

# 1. Scaffold a server-authoritative multiplayer game
node packages/cli/dist/index.js new coin-arena --dir ./coin-arena

# 2. Get the agent team plan (who to spawn, in what order, owning which gates)
node packages/cli/dist/index.js plan --spec ./coin-arena/gdk.game.json

# 3. Verify it
node packages/cli/dist/index.js gates ./coin-arena
```

## Fresh-clone setup (for humans and coding agents)

The repo is self-contained: `npm install && npm run build` gives you the CLI,
the MCP server, the planner, and **all static gates** — no engine required.

**Runtime gates** (determinism, sanity sim, playtest) additionally need a Godot
4.x binary with a console/headless entry point:

1. Download the official build for your platform from
   [godotengine.org/download](https://godotengine.org/download) and unzip it
   anywhere (verify the SHA512 against the release's `SHA512-SUMS.txt`).
2. Point GDK at it — either set an env var or put it on `PATH`:
   ```bash
   export GODOT_BIN=/path/to/Godot_v4.x-stable_linux.x86_64        # linux
   export GODOT_BIN="C:/path/to/Godot_v4.x-stable_win64_console.exe"  # windows
   ```
3. Verify: `gdk gates <project>` should now show the runtime rules as `PASS`
   instead of `SKIP`. Skipped runtime gates are reported honestly — never
   upgraded to passes.

**Register the MCP server with any MCP host** (ZCode, Cursor, opencode, …):

```json
{
  "mcpServers": {
    "gdk": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/packages/mcp/dist/index.js"]
    }
  }
}
```

**Agent playbooks:** point your specialists at `skills/gdk-*/SKILL.md`
(`gdk-lead` is the orchestrator's entry point) and install `agents/*.md` into
your agent host if it supports custom agent definitions.

## Repository map

```
packages/core    pillar rules + gate runner + team planner + Godot adapter
packages/cli     `gdk` command line (new / plan / agents / gates / standards)
packages/mcp     MCP server exposing the same powers to any MCP host
skills/          the 7 specialist playbooks (gdk-lead, -physics, -logic, -netcode, -graphics, -security, -qa)
agents/          agent definitions to install into your agent host
templates/       engine templates; godot/arena-mp is the flagship
docs/            architecture deep-dive
```

## How an agent builds a game through GDK

1. Declare `gdk.game.json` (or let `gdk-lead` write it from prose).
2. `gdk plan` → phases + roster (scaffold → simulation → netcode → graphics →
   hardening → acceptance).
3. Spawn the roster (each specialist loads its `gdk-*` skill).
4. After every phase, `gdk gates <dir>` — failures route to the rule's owner.
5. Acceptance requires: all blockers/majors green (skips explained) + the
   headless playtest completing the full game loop.

## Roadmap

- More adapters: web (Three.js/Colyseus), Unity; the core is engine-agnostic.
- Runtime performance gates (frame capture, draw-call budget measurement).
- Gate packs as plugins (third-party rule catalogs).

MIT licensed.
