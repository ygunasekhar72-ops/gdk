import type { Rule } from '../types.js';

/**
 * QA — absolute test standards. A game never sim-tested head-to-head
 * against its own standards is a prototype, not a deliverable.
 */
export const qaRules: Rule[] = [
  {
    id: 'QA.TESTS-PRESENT',
    pillar: 'qa',
    title: 'Test suite present in tree',
    severity: 'blocker',
    kind: 'static',
    standard:
      'A GDK-recognized test directory/script exists (adapter-defined, e.g. tests/ with a SceneTree runner). No tests = no gate = no build.',
    check: {
      scope: ['tests/**'],
      require: [
        { rx: /GDK:TEST/, reason: 'tests/ must contain a GDK-marked headless test script.' },
      ],
    },
  },
  {
    id: 'QA.TESTS-PASS',
    pillar: 'qa',
    title: 'Headless test suite green',
    severity: 'blocker',
    kind: 'runtime',
    standard:
      'The headless suite (engine CLI, no window) passes: determinism test, input-clamp test, FSM transition test, and at least one gameplay-rule test. Tests are the proof behind every other pillar.',
  },
  {
    id: 'QA.SPEC-COMPLETE',
    pillar: 'qa',
    title: 'gdk.game.json complete and consistent',
    severity: 'blocker',
    kind: 'policy',
    standard:
      'The project declares a valid gdk.game.json (name, genre, engine, dimensions, multiplayer config, physics config, target FPS). The spec is what the planner and gates reason over — an incomplete spec is an incomplete game.',
  },
  {
    id: 'QA.PLAYTEST-SCRIPT',
    pillar: 'qa',
    title: 'Scripted playtest scenario',
    severity: 'major',
    kind: 'runtime',
    standard:
      'A scripted end-to-end playtest (bot drives the game: move, collect/score, reach round end) runs headless and asserts the loop completes. Human playtesting supplements it; it never replaces it.',
  },
];
