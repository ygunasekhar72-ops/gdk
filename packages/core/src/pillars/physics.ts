import type { Rule } from '../types.js';

/**
 * PHYSICS — absolute maths & simulation standards.
 * Physics must be reproducible: same inputs + same seed => same world.
 */
export const physicsRules: Rule[] = [
  {
    id: 'PHY.FIXED-TIMESTEP',
    pillar: 'physics',
    title: 'Fixed timestep with explicit constants',
    severity: 'blocker',
    kind: 'static',
    standard:
      'Simulation runs at a fixed tick declared in engine config (default 60 Hz) with the engine jitter fix enabled. Variable-delta integration of gameplay state is forbidden — it breaks determinism and makes replays/rollback impossible.',
    check: {
      scope: ['project.godot'],
      require: [
        {
          rx: /physics_ticks_per_second/,
          reason: 'Fixed tick rate must be declared explicitly.',
        },
      ],
    },
  },
  {
    id: 'PHY.DETERMINISM',
    pillar: 'physics',
    title: 'Deterministic simulation proven by test',
    severity: 'blocker',
    kind: 'runtime',
    standard:
      'A headless determinism test drives the shared sim twice with identical seeded inputs and asserts identical outputs (position sequences exactly equal). Randomness in sim code comes exclusively from a seeded RNG. Float ops stay on one code path — no platform-varied fast-math.',
  },
  {
    id: 'PHY.SANITY-SIM',
    pillar: 'physics',
    title: 'Headless sanity simulation',
    severity: 'major',
    kind: 'runtime',
    standard:
      'A headless test asserts core physical truths: gravity accelerates, a clamped input never exceeds max speed, a body falling from height lands within expected time/velocity bounds. Physics never sim-tested is physics that is wrong.',
  },
  {
    id: 'PHY.UNIT-CONSIST',
    pillar: 'physics',
    title: 'One documented unit system',
    severity: 'major',
    kind: 'policy',
    standard:
      'Declare units once (GDK default: meters, seconds, kilograms; gravity in m/s²) and use them consistently. Document conversion points (e.g. joystick [-1,1] → m/s). Mixed unit systems are the classic source of "absolute nonsense maths".',
  },
];
