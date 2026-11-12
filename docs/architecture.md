# GDK Architecture

## Design principles

1. **Standards are data, not vibes.** Every "absolute" pillar is a rule catalog
   (`packages/core/src/pillars/*.ts`) with IDs, severities, and — where possible —
   machine-checkable conditions.
2. **Gates reject builds.** `gdk gates <dir>` returns a report; blockers/majors
   failing = rejected. Skips are reported as skips, never as passes.
3. **Engine-agnostic core, engine-specific adapters.** The rule catalog, planner,
   and gate runner know nothing about Godot; the adapter (`adapter-godot.ts`)
   knows nothing about other engines. New engines add an adapter + template.
4. **Capability boundary = the GDK:AUTHORITATIVE marker.** Static security rules
   forbid state-mutating patterns in client code; files marked `GDK:AUTHORITATIVE`
   (the server sim) are exempt for those rules only. The exemption IS the threat
   model made executable.

## Layer map

```
┌──────────────────────────────────────────────────────────────────┐
│ consumers                                                        │
│   packages/cli    gdk new · plan · agents · gates · standards    │
│   packages/mcp    gdk_plan_game · gdk_run_gates ·                │
│                   gdk_get_standards · gdk_scaffold_project       │
│   skills/ agents/ specialist playbooks loaded by spawned agents  │
├──────────────────────────────────────────────────────────────────┤
│ packages/core                                                    │
│   rules.ts        27 rules across 6 pillars                      │
│   spec.ts         gdk.game.json load + validation                │
│   planner.ts      spec → phases + agent roster + gate ownership  │
│   gates.ts        gate runner: static / policy / runtime routing │
│   scanners.ts     declarative file scanner (scope/forbid/require)│
│   adapter-godot   binary discovery, headless test run, scaffold  │
├──────────────────────────────────────────────────────────────────┤
│ templates/godot/arena-mp                                         │
│   sim_math.gd     GDK:AUTHORITATIVE shared deterministic math    │
│   server_sim.gd   GDK:AUTHORITATIVE authoritative world sim      │
│   client_net.gd   input stream, prediction+reconciliation, interp│
│   game_state.gd   pure FSM (LOBBY → PLAYING → ROUND_END)         │
│   main.gd         role wiring; visuals read, never decide        │
│   tests/gdk_smoke determinism · clamp · gravity · FSM · playtest │
└──────────────────────────────────────────────────────────────────┘
```

## Gate execution model

| Kind | Runs | Needs engine | Examples |
|---|---|---|---|
| `static` | regex scans over scoped files | no | `NET.SRV-AUTH`, `SEC.SECRETS-SCAN`, `LOG.FSM` |
| `policy` | spec/config completeness | no | `QA.SPEC-COMPLETE`, `GFX.ASSET-BUDGET` |
| `runtime` | engine headless run | yes | `PHY.DETERMINISM`, `QA.TESTS-PASS`, `QA.PLAYTEST-SCRIPT` |

Static checks are declarative: `scope` (segment globs), `forbid` (regex that
must not appear; optional `exemptAuthoritative`), `require` (regex that must
appear somewhere in scope). The scanner:

- resolves the project root once and asserts every visited path stays inside it;
- never follows symlinks;
- never spawns processes and never constructs RegExp dynamically
  (all patterns are precompiled literals from the versioned rule catalog).

Runtime gates run `godot --headless --path <project> --script tests/gdk_smoke.gd`
(script path passed as an argument, never interpolated into a shell string) and
require exit 0 plus the `GDK:ALL-TESTS-PASS` marker. Binary discovery:
`$GODOT_BIN` → `godot` → `godot4`.

## The arena template's netcode

```
client                                   server (GDK:AUTHORITATIVE)
  input {seq, mv}  ──unreliable_ordered──▶  rate-limit → seq monotonicity →
                                            NaN/NaN-reject → clamp → integrate
                                            pickups → score → FSM → round mgmt
  ◀─────────snapshot {t, st, p, c}────────  broadcast every tick
  predict self with shared sim_math        ack = last consumed input seq
  reconcile: resim pending inputs > ack    (velocity included for replay)
  remotes: lerp between buffered snaps     coins/scores/states carried in snap
```

Why explicit RPC messaging instead of `MultiplayerSynchronizer`: the synchronizer
replicates in whichever direction node authority points, which hides the message
flow and makes the authority boundary unauditable. GDK requires the boundary to
be grep-able — that is what the gates check.

## Extending GDK

- **New rule:** add to a pillar catalog with an ID, severity, and check. The
  planner's roster maps rule IDs to owning agents; gate failures route there.
- **New engine:** implement the `EngineAdapter` interface (available,
  runRuntimeRules, templateDir, scaffoldProject) and add a template.
- **New template genre:** copy `arena-mp`, keep the message flow, change the sim.
