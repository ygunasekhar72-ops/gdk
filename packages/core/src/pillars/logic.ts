import type { Rule } from '../types.js';

/**
 * GAME LOGIC — absolute rules-engine standards.
 * Game flow is a machine, not a pile of booleans.
 */
export const logicRules: Rule[] = [
  {
    id: 'LOG.FSM',
    pillar: 'logic',
    title: 'Game flow expressed as an explicit state machine',
    severity: 'blocker',
    kind: 'static',
    standard:
      'Top-level game flow (menu → lobby → playing → round_end → …) is one explicit FSM: a state enum/const set and a single transition function (match on state). Each state declares its legal transitions. No cross-cutting boolean spaghetti.',
    check: {
      scope: ['**/*.gd'],
      require: [
        { rx: /enum\s+GameState|const\s+STATE_\w+\s*=/, reason: 'A GameState enum (or equivalent named states) is required.' },
        { rx: /match\s+state|func\s+_?transition/, reason: 'A single transition function (match on state) is required.' },
      ],
    },
  },
  {
    id: 'LOG.SIM-RENDER-SEPARATION',
    pillar: 'logic',
    title: 'Simulation and rendering are separate layers',
    severity: 'blocker',
    kind: 'static',
    standard:
      'Sim logic (rules, scoring, progression) is pure/data-driven and never reads render-side nodes (Camera, CanvasItem, visual effects). Rendering reads sim state and draws. This keeps the sim headless-testable and portable (the server runs it without a viewport).',
    check: {
      scope: ['**/*.gd'],
      forbid: [
        {
          rx: /get_viewport\(\)\.get_camera/,
          reason: 'Sim must never depend on the camera/render tree.',
        },
        {
          rx: /get_node_or_null\([^)]*Camera/,
          reason: 'Sim must not look up camera nodes.',
        },
      ],
    },
  },
  {
    id: 'LOG.EVENTS-DETERMINISTIC',
    pillar: 'logic',
    title: 'Game events ordered by tick, not by frame',
    severity: 'major',
    kind: 'static',
    standard:
      'Gameplay events (spawn, pickup, score, transitions) are stamped with the sim tick they occurred on and processed in tick order. Frame-timed timers (SceneTreeTimer for gameplay) are forbidden for anything affecting sim state — use tick timers so replays/rollback stay exact.',
    check: {
      scope: ['**/*.gd'],
      require: [
        { rx: /tick/, reason: 'Tick-stamped event handling required (no frame-timer gameplay logic).' },
      ],
    },
  },
  {
    id: 'LOG.SAVE-SAFE',
    pillar: 'logic',
    title: 'Sim state serializable (replay/rollback-ready)',
    severity: 'advisory',
    kind: 'policy',
    standard:
      'Sim state must be expressible as plain data (dicts/arrays of primitives) so replays, rollback, and saves come free. Node references or viewport lookups inside sim state break all three.',
  },
];
