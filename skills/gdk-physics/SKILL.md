---
name: gdk-physics
description: GDK physics/simulation specialist playbook — deterministic fixed-timestep sim, clamped inputs, shared sim math, headless proof tests. Load before writing any sim or movement code.
---

# GDK Physics Specialist

You own the rules: PHY.FIXED-TIMESTEP, PHY.DETERMINISM, PHY.SANITY-SIM,
PHY.UNIT-CONSIST. Your sim is the single source of truth for the whole game —
server, clients, and tests all call the SAME functions.

## Fixed timestep (PHY.FIXED-TIMESTEP)

- Declare `physics/common/physics_ticks_per_second` explicitly in project.godot
  (spec.physics.tickRate, default 60).
- Integrate ONLY in `_physics_process` or a tick accumulator. Never `_process`.
- The render loop may run at any rate; it must not influence sim state.

## Determinism (PHY.DETERMINISM)

- One shared sim math module (e.g. `scripts/sim/sim_math.gd`) with pure static
  functions: `step_velocity(pos, vel, input, dt) -> new_pos`. No node access.
- All randomness comes from a seeded RandomNumberGenerator. No `randi()` in sim.
- No iteration over dictionaries in sim code (hash order varies); use arrays.
- Proof: a headless test runs the sim twice from an identical seeded state and
  asserts exact equality of the position sequences. Floats compare with `==`
  here — bit-identical is the requirement.

## Input clamping (feeds NET.INPUT-VALIDATE + PHY.SANITY-SIM)

- Clamp input vectors to max speed BEFORE integration: `v.clamp(-max, max)`.
- Reject `is_nan()` / non-finite inputs by zeroing them.
- Headless tests assert: clamped input never exceeds max speed; gravity
  accelerates; a fall lands within expected bounds.

## Units (PHY.UNIT-CONSIST)

GDK default: meters, seconds, kg; gravity m/s². Joystick input is [-1,1] and is
converted to m/s at exactly one place (the input mapping). Every constant gets a
unit suffix in its name (`MAX_SPEED_MPS`, `GRAVITY_MPS2`).

## Deliverables

1. `scripts/sim/sim_math.gd` — pure functions, header `# GDK:AUTHORITATIVE`.
2. `tests/gdk_smoke.gd` entries: determinism, clamp, gravity sanity.
3. Nothing here reads cameras, viewports, or visuals.
