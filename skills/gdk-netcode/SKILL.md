---
name: gdk-netcode
description: GDK netcode specialist playbook — server-authoritative replication, validated inputs, snapshot interpolation, prediction with reconciliation. Load before writing any multiplayer code.
---

# GDK Netcode Specialist

You own: NET.SRV-AUTH, NET.TICK-FIXED, NET.INPUT-VALIDATE, NET.SNAPSHOT-INTERP,
NET.PREDICT-RECONCILE, NET.LAGCOMP. The architecture is fixed:

```
client                          server (GDK:AUTHORITATIVE sim)
  │ input {seq, tick, move}  ──▶ │ validate+clamp → integrate on fixed tick
  │                              │ simulate coins/score/round FSM
  ◀── snapshots {tick, state} ── │ broadcast every tick (unreliable)
  │ interpolate remotes          │
  │ predict self + reconcile ack │
```

## Non-negotiables

1. **Server is the only authority.** Clients send input vectors. Position, score,
   pickups, round state are computed server-side. No client ever writes an
   authoritative field, and no RPC hands authority to a peer
   (SEC.NEVER-TRUST-CLIENT).
2. **Validate everything before applying** (NET.INPUT-VALIDATE): clamp magnitude
   to MAX_SPEED_MPS, zero NaN via `is_nan()`, rate-limit per peer — if a peer
   sends inputs faster than the tick rate, drop the excess and kick after
   sustained abuse (SEC.RATE-LIMIT).
3. **Fixed tick** (NET.TICK-FIXED): sim advances in `_physics_process` only.
4. **Snapshots** (NET.SNAPSHOT-INTERP): server broadcasts `{tick, players[]}` at
   tick rate on an unreliable channel. Clients buffer snapshots and render remote
   players ~100 ms in the past, interpolating (`lerp`) between the two surrounding
   snapshots. Never snap remote entities per-packet.
5. **Prediction + reconciliation** (NET.PREDICT-RECONCILE): the local player
   applies the SAME `sim_math` functions immediately (0-latency feel). Snapshots
   carry the acked input `tick`; on ack, if server state ≠ predicted state beyond
   epsilon, re-simulate all pending inputs from the server state and correct
   smoothly (snap only if error > 0.5 m).
6. **Lag comp** (NET.LAGCOMP): document the strategy when combat exists; not
   required for movement/coop demos.

## Godot mapping

- Transport: `ENetMultiplayerPeer` (server: `create_server(port, max_clients)`;
  clients: `create_client(ip, port)`). Dev builds may run plain; production
  switches to DTLS (SEC.TRANSPORT).
- Do NOT use `MultiplayerSynchronizer` for authoritative state — it replicates in
  whichever direction authority points and hides the message flow. Use explicit
  `multiplayer.multiplayer_peer.put_var/get_var` on a fixed channel, or
  `rpc_unreliable` into exactly one server-side receiver. Explicit beats magic.
- One input packet per rendered frame is fine (they are cheap); the server
  consumes them on its tick clock.

## Deliverables

1. `scripts/net/server_sim.gd` — GDK:AUTHORITATIVE, validation + integration.
2. `scripts/net/client_net.gd` — send inputs, buffer snapshots, interpolate,
   predict/reconcile self.
3. `scripts/sim/sim_math.gd` is imported, never duplicated.
