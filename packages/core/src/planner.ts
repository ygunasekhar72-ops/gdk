import type { GameSpec, Phase, Rule, TeamPlan, AgentMission } from './types.js';
import { ALL_RULES, rulesForPillar } from './rules.js';

/**
 * Team planner: turns a GameSpec into the specialist roster and phase plan
 * that a GDK orchestrator (lead agent) executes.
 */

interface RoleDef {
  agent: string;
  role: string;
  goal: string;
  skills: string[];
  pillarRules: string[];
  deliverables: string[];
  when: (spec: GameSpec) => boolean;
}

const ROLES: RoleDef[] = [
  {
    agent: 'gdk-scaffold',
    role: 'Project bootstrap',
    goal: 'Create the project from the GDK engine template and wire gdk.game.json + engine config to spec values.',
    skills: ['gdk/gdk-lead'],
    pillarRules: ['QA.SPEC-COMPLETE'],
    deliverables: ['project tree', 'gdk.game.json', 'engine config matching spec'],
    when: () => true,
  },
  {
    agent: 'gdk-physics',
    role: 'Sim & maths specialist',
    goal: 'Build the deterministic shared sim (tick loop, integration, clamped inputs) as pure data logic; write the determinism and sanity tests.',
    skills: ['gdk/gdk-physics'],
    pillarRules: ['PHY.FIXED-TIMESTEP', 'PHY.DETERMINISM', 'PHY.SANITY-SIM', 'PHY.UNIT-CONSIST'],
    deliverables: ['shared sim module (GDK:AUTHORITATIVE)', 'tests/sim determinism + sanity'],
    when: (s) => s.physics.needs || s.multiplayer.enabled,
  },
  {
    agent: 'gdk-logic',
    role: 'Game-rules specialist',
    goal: 'Express game flow as an explicit FSM with tick-stamped events; keep sim pure and headless-testable.',
    skills: ['gdk/gdk-logic'],
    pillarRules: ['LOG.FSM', 'LOG.SIM-RENDER-SEPARATION', 'LOG.EVENTS-DETERMINISTIC', 'LOG.SAVE-SAFE'],
    deliverables: ['FSM module', 'tick event bus', 'FSM transition tests'],
    when: () => true,
  },
  {
    agent: 'gdk-netcode',
    role: 'Netcode specialist',
    goal: 'Wire server-authoritative replication: input stream up, snapshot stream down, interpolation + prediction/reconciliation on clients.',
    skills: ['gdk/gdk-netcode'],
    pillarRules: ['NET.SRV-AUTH', 'NET.TICK-FIXED', 'NET.INPUT-VALIDATE', 'NET.SNAPSHOT-INTERP', 'NET.PREDICT-RECONCILE', 'NET.LAGCOMP'],
    deliverables: ['server sim wiring', 'client net module', 'snapshot buffer/interpolator'],
    when: (s) => s.multiplayer.enabled,
  },
  {
    agent: 'gdk-graphics',
    role: 'Visuals specialist',
    goal: 'Deliver the best-looking frame that fits the FPS budget: declared renderer/quality config, budgeted assets, instancing discipline.',
    skills: ['gdk/gdk-graphics'],
    pillarRules: ['GFX.FPS-BUDGET', 'GFX.RENDER-SCALE', 'GFX.ASSET-BUDGET', 'GFX.LOD-DRAWCALL'],
    deliverables: ['rendering config', 'scenes/materials within budget'],
    when: () => true,
  },
  {
    agent: 'gdk-security',
    role: 'Adversary-in-residence',
    goal: 'Threat-model the build as a hostile client; audit authority boundaries, rate limiting, secrets, transport; write the security section of the report.',
    skills: ['gdk/gdk-security'],
    pillarRules: ['SEC.NEVER-TRUST-CLIENT', 'SEC.SECRETS-SCAN', 'SEC.RATE-LIMIT', 'SEC.SANITIZE', 'SEC.TRANSPORT'],
    deliverables: ['threat model', 'authority audit notes', 'security gate green'],
    when: (s) => s.multiplayer.enabled || (s.security?.economy ?? false),
  },
  {
    agent: 'gdk-qa',
    role: 'Gatekeeper',
    goal: 'Run the GDK gates, drive scripted playtests, and block the build until every blocker/major rule passes.',
    skills: ['gdk/gdk-qa'],
    pillarRules: ['QA.TESTS-PRESENT', 'QA.TESTS-PASS', 'QA.SPEC-COMPLETE', 'QA.PLAYTEST-SCRIPT'],
    deliverables: ['gate report', 'playtest log', 'final verdict'],
    when: () => true,
  },
];

export function planTeam(spec: GameSpec): TeamPlan {
  const roster: AgentMission[] = ROLES.filter((r) => r.when(spec)).map((r) => ({
    agent: r.agent,
    role: r.role,
    goal: r.goal,
    skills: r.skills,
    ownsRules: r.pillarRules,
    deliverables: r.deliverables,
  }));

  const rulesOwnedBy = (agent: string): Rule[] => {
    const def = ROLES.find((r) => r.agent === agent)!;
    return ALL_RULES.filter((r) => def.pillarRules.includes(r.id));
  };

  const gateIds = (pillar: string): string[] => rulesForPillar(pillar as never).map((r) => r.id);

  const phases: Phase[] = [
    {
      name: '1 · scaffold',
      goal: 'Project exists, spec declared, engine config matches spec.',
      agents: ['gdk-scaffold'],
      exitGates: ['QA.SPEC-COMPLETE'],
    },
    {
      name: '2 · simulation',
      goal: 'Deterministic shared sim + FSM exist and pass headless tests.',
      agents: ['gdk-physics', 'gdk-logic'],
      exitGates: [...gateIds('physics').filter((id) => id !== 'PHY.DETERMINISM'), 'LOG.FSM', 'LOG.SIM-RENDER-SEPARATION'],
    },
    {
      name: '3 · netcode',
      goal: 'Server-authoritative replication with validated inputs, snapshots, prediction.',
      agents: ['gdk-netcode', 'gdk-security'],
      exitGates: spec.multiplayer.enabled ? gateIds('multiplayer') : [],
    },
    {
      name: '4 · graphics',
      goal: 'Look and feel within the FPS/asset budget; quality config explicit.',
      agents: ['gdk-graphics'],
      exitGates: gateIds('graphics').filter((id) => id !== 'GFX.LOD-DRAWCALL'),
    },
    {
      name: '5 · hardening',
      goal: 'Hostile-client audit passes; secrets scan clean; rate limiting in place.',
      agents: ['gdk-security'],
      exitGates: gateIds('security'),
    },
    {
      name: '6 · acceptance',
      goal: 'All gates green; scripted playtest completes the full loop.',
      agents: ['gdk-qa'],
      exitGates: gateIds('qa'),
    },
  ];

  const needed = spec.multiplayer.enabled
    ? phases
    : phases.filter((p) => p.name !== '3 · netcode' || p.agents.some((a) => a !== 'gdk-netcode' && a !== 'gdk-security'));

  return {
    project: spec.name,
    engine: spec.engine,
    phases: needed,
    roster,
  };
}
