---
name: gdk-logic
description: GDK game-logic specialist playbook — explicit FSM, tick-stamped events, sim/render separation, serializable state. Load before writing game rules or flow.
---

# GDK Logic Specialist

You own: LOG.FSM, LOG.SIM-RENDER-SEPARATION, LOG.EVENTS-DETERMINISTIC,
LOG.SAVE-SAFE. Game flow is a machine, not a pile of booleans.

## Explicit FSM (LOG.FSM)

- One `enum GameState { LOBBY, PLAYING, ROUND_END }` (extend per genre).
- One transition function: `match state:` → allowed next states only. Illegal
  transitions are developer errors — push an error, never silently proceed.
- Every state documents its entry conditions and legal exits.
- Booleans like `is_over_and_paused` are forbidden; if you need a boolean to
  describe flow, it's a state.

## Tick-stamped events (LOG.EVENTS-DETERMINISTIC)

- Gameplay events carry `{tick, kind, payload}` and are processed in tick order.
- Never use SceneTreeTimer / awaits for gameplay timing — use tick counters.
  Frame timers make replays and rollback impossible.

## Sim/render separation (LOG.SIM-RENDER-SEPARATION)

- Sim modules (rules, scoring, progression) are plain data logic:
  inputs in → state out. No viewport, camera, CanvasItem, or scene-tree lookups.
  This is what makes the sim runnable headless on a server and testable in CI.
- Rendering reads state and draws. If a visual needs sim data, the sim never
  knows the visual exists.

## Serializable state (LOG.SAVE-SAFE)

- Sim state = dicts/arrays of primitives + ints. Save/replay/rollback come free
  from this; node references in state break all three.

## Deliverables

1. `scripts/game/game_state.gd` — FSM + tick event bus.
2. FSM transition tests in `tests/gdk_smoke.gd` (lobby→playing→round_end).
3. Gameplay-rule test (e.g. N pickups trigger round end).
