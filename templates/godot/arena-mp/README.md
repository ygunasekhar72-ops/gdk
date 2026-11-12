# GDK Coin Arena — server-authoritative multiplayer template (Godot 4)

A complete, gate-compliant starting point for realtime multiplayer games:
the server decides, clients speak inputs and draw snapshots.

## Run

```bash
# dedicated server
godot --path . -- --server

# client (another terminal / machine)
godot --path .
```

WASD/arrows to move. Collect coins; first to 10 wins the round; rounds reset
automatically. Two clients on the same LAN share the authoritative world.

## Architecture (read this before changing anything)

```
scripts/sim/sim_math.gd      GDK:AUTHORITATIVE  shared deterministic math (the ONLY integrator)
scripts/game/game_state.gd   explicit FSM (LOBBY → PLAYING → ROUND_END), pure
scripts/net/server_sim.gd    GDK:AUTHORITATIVE  the authoritative server simulation
scripts/net/client_net.gd    input send + prediction/reconciliation + snapshot interpolation
scripts/main.gd              role wiring + dumb visuals (reads state, never decides it)
tests/gdk_smoke.gd           GDK:TEST headless proof suite
```

Message flow: `input {seq, mv} → server validates/clamps → fixed-tick sim →
snapshot {tick, players, coins, state} → clients interpolate remotes and
reconcile the local player`.

## GDK standards this template embodies

| Rule | Where |
|---|---|
| NET.SRV-AUTH | all state mutation in GDK:AUTHORITATIVE files, server only |
| NET.TICK-FIXED | 60 Hz physics tick declared in project.godot; sim in fixed steps |
| NET.INPUT-VALIDATE | sanitize_input: NaN rejection + clamp; rate limiter + kick |
| NET.SNAPSHOT-INTERP | client_net buffers snapshots, lerps remotes 100 ms behind |
| NET.PREDICT-RECONCILE | client predicts via shared math, resimulates unacked inputs |
| PHY.DETERMINISM | seeded RNG only; proof: 300-tick trace byte-identical |
| SEC.NEVER-TRUST-CLIENT | score/pickups decided server-side; replayed seq rejected |
| SEC.RATE-LIMIT | per-peer token budget per tick; sustained flooding → kick |
| LOG.FSM | one GameState enum, one legality table, no boolean spaghetti |

## Test

```bash
godot --headless --path . --script tests/gdk_smoke.gd
# expect: GDK:ALL-TESTS-PASS
```

Or run the whole gate set from the kit: `gdk gates <this-directory>`.
