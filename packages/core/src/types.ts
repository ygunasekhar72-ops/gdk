/**
 * GDK core types — shared by the planner, gate runner, CLI and MCP server.
 */

/** The six GDK pillars. QA is cross-cutting but treated as a first-class pillar. */
export type PillarId =
  | 'graphics'
  | 'physics'
  | 'logic'
  | 'multiplayer'
  | 'security'
  | 'qa';

export type Severity = 'blocker' | 'major' | 'advisory';

/** How a rule is verified. */
export type CheckKind =
  /** File/config scanning — runs without the engine installed. */
  | 'static'
  /** Needs the engine binary (headless run/sim). */
  | 'runtime'
  /** Completeness of the declared spec/config — checked by core itself. */
  | 'policy';

/** A declarative static check attached to a rule. */
export interface StaticCheck {
  /** Glob-style scope with simple star wildcards (multi-star + slash patterns). */
  scope: string[];
  /** No file in scope may contain these regexes (blocker-level violations). */
  forbid?: { rx: RegExp; reason: string; exemptAuthoritative?: boolean }[];
  /** Patterns that must exist somewhere in scope (e.g. input clamping). */
  require?: { rx: RegExp; reason: string }[];
}

/** One non-negotiable GDK standard. */
export interface Rule {
  id: string;
  pillar: PillarId;
  title: string;
  severity: Severity;
  kind: CheckKind;
  /** The standard, written for the agents that must honor it. */
  standard: string;
  /** Declarative static check (when kind === 'static'). */
  check?: StaticCheck;
}

export type RuleResultStatus = 'pass' | 'fail' | 'skipped';

export interface RuleResult {
  ruleId: string;
  status: RuleResultStatus;
  severity: Severity;
  /** Machine-readable evidence: file paths, matched patterns, sim outputs. */
  evidence: string[];
  message: string;
}

export interface GateReport {
  project: string;
  engine: string;
  ranAt: string;
  results: RuleResult[];
  /** Gate passes only if every blocker/major rule passed (advisories may fail). */
  passed: boolean;
  blockersFailed: string[];
  majorsFailed: string[];
  skipped: string[];
}

/** A specialist agent the orchestrator should spawn. */
export interface AgentMission {
  agent: string;
  role: string;
  goal: string;
  /** Skill files the agent must load before working. */
  skills: string[];
  /** Rule IDs this agent owns — gate failures on these route back to it. */
  ownsRules: string[];
  deliverables: string[];
}

export interface Phase {
  name: string;
  goal: string;
  agents: string[];
  /** Gate rules that must pass before the phase is accepted. */
  exitGates: string[];
}

export interface TeamPlan {
  project: string;
  engine: string;
  phases: Phase[];
  roster: AgentMission[];
}

/** gdk.game.json — the machine-readable declaration of the game to build. */
export interface GameSpec {
  name: string;
  genre: string;
  engine: 'godot' | 'web' | 'unity' | 'unreal';
  dimensions: '2d' | '3d';
  multiplayer: {
    enabled: boolean;
    mode?: 'realtime-authoritative' | 'turn-based' | 'cooperative';
    maxPlayers?: number;
    tickRate?: number;
  };
  physics: {
    needs: boolean;
    tickRate?: number;
    gravity?: [number, number, number];
  };
  graphics: {
    targetFps: number;
    qualityPreset?: 'low' | 'medium' | 'high';
  };
  security: {
    dedicatedServer?: boolean;
    chat?: boolean;
    economy?: boolean;
  };
  platforms?: string[];
}

export class SpecError extends Error {}
