import type { Rule } from '../types.js';

/**
 * MULTIPLAYER — absolute netcode standards.
 * The one commandment: the server is the only authority. Clients are
 * microphones (inputs) and screens (rendered snapshots), nothing more.
 */
export const multiplayerRules: Rule[] = [
  {
    id: 'NET.SRV-AUTH',
    pillar: 'multiplayer',
    title: 'Server-authoritative state',
    severity: 'blocker',
    kind: 'static',
    standard:
      'All gameplay state that matters (positions, score, economy) lives server-side. Clients send INPUTS only. State mutations of authoritative fields happen exclusively in code marked GDK:AUTHORITATIVE and executed behind an is-server branch. A client must never be able to write its own position, score, or inventory.',
    check: {
      scope: ['**/*.gd'],
      forbid: [
        {
          rx: /set_multiplayer_authority\s*\(\s*multiplayer\.get_remote_sender_id\(\)/,
          reason: 'Authority handed to whoever asks — trivially exploitable. Authority is set at spawn time by the server.',
        },
      ],
      require: [
        {
          rx: /GDK:AUTHORITATIVE/,
          reason: 'No authoritative simulation file found — exactly one GDK:AUTHORITATIVE-marked server sim module is required.',
        },
      ],
    },
  },
  {
    id: 'NET.TICK-FIXED',
    pillar: 'multiplayer',
    title: 'Fixed simulation tick, decoupled from render',
    severity: 'blocker',
    kind: 'static',
    standard:
      'The simulation advances on a fixed tick (physics_ticks_per_second, default 60). Never integrate gameplay state in _process()/per-frame callbacks; use _physics_process() or an explicit tick accumulator. Render may run at any rate; sim rate is constant.',
    check: {
      scope: ['project.godot', '**/*.gd'],
      require: [
        {
          rx: /physics_ticks_per_second/,
          reason: 'project.godot must declare the fixed physics tick rate explicitly.',
        },
      ],
    },
  },
  {
    id: 'NET.INPUT-VALIDATE',
    pillar: 'multiplayer',
    title: 'Every client input validated and clamped server-side',
    severity: 'blocker',
    kind: 'static',
    standard:
      'Before the server applies any client input it must: clamp magnitudes to declared maxima, reject impossible values (NaN, non-finite), and rate-limit message frequency. If the server can be asked to do it, the server checks it first.',
    check: {
      scope: ['**/*.gd'],
      require: [
        { rx: /clamp/, reason: 'Authoritative sim must clamp client inputs.' },
        { rx: /is_nan|is_finite/, reason: 'Authoritative sim must reject NaN/non-finite input values.' },
      ],
    },
  },
  {
    id: 'NET.SNAPSHOT-INTERP',
    pillar: 'multiplayer',
    title: 'Remote entities interpolated between snapshots',
    severity: 'major',
    kind: 'static',
    standard:
      'Remote players are rendered by interpolating between the two most recent buffered server snapshots (~100 ms behind). Never teleport a remote entity to each packet that arrives — visible rubber-banding and jitter.',
    check: {
      scope: ['**/*.gd'],
      require: [
        { rx: /lerp|interpolate|slerp/, reason: 'Snapshot interpolation required for remote entities.' },
      ],
    },
  },
  {
    id: 'NET.PREDICT-RECONCILE',
    pillar: 'multiplayer',
    title: 'Local prediction with server reconciliation',
    severity: 'major',
    kind: 'static',
    standard:
      'The locally-controlled player predicts its own movement with the same shared sim math the server uses, then reconciles against acknowledged server state: keep pending inputs since the acked tick, re-simulate from server state, correct smoothly (snap only beyond an error threshold). Input latency must feel ~0 ms; correctness belongs to the server.',
    check: {
      scope: ['**/*.gd'],
      require: [
        { rx: /ack|reconcil/i, reason: 'Reconciliation against acknowledged server ticks required.' },
      ],
    },
  },
  {
    id: 'NET.LAGCOMP',
    pillar: 'multiplayer',
    title: 'Lag compensation documented for hit-based games',
    severity: 'advisory',
    kind: 'policy',
    standard:
      'Games with hitscan/projectile combat must document a lag-compensation strategy (server rewinds to shooter-perceived state, bounded by max rewind window). Advisory for movement/coop demos; enforced once combat exists.',
  },
];
