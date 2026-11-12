import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineAdapter } from './gates.js';
import { loadSpec } from './spec.js';
import { godotAdapter } from './adapter-godot.js';
import type { GameSpec, Rule, RuleResult } from './types.js';

/**
 * Web (TypeScript/JavaScript) engine adapter.
 *
 * Runtime gates run the project's GDK test suite headlessly with Node's test
 * runner:
 *   node --test tests/
 * The suite must exit 0 and print GDK:ALL-TESTS-PASS (see the web example).
 *
 * Static rules are rewritten per engine: GDScript-scoped patterns become
 * TypeScript/JavaScript equivalents (regex literals only — never constructed
 * dynamically). Rules the engine cannot express fall back to the generic
 * check or are handled by spec applicability (e.g. NET.* on single-player).
 */

const RUNTIME_RULE_IDS = new Set(['PHY.DETERMINISM', 'PHY.SANITY-SIM', 'QA.TESTS-PASS', 'QA.PLAYTEST-SCRIPT']);

interface CheckOverride {
  scope?: string[];
  require?: { rx: RegExp; reason: string }[];
  forbid?: { rx: RegExp; reason: string; exemptAuthoritative?: boolean }[];
}

// Per-rule web equivalents. Only listed rules differ from the generic check.
const WEB_OVERRIDES: Record<string, CheckOverride> = {
  'PHY.FIXED-TIMESTEP': {
    scope: ['src/**', 'package.json'],
    require: [
      {
        rx: /FIXED_TICK|TICK_RATE|1\s*\/\s*60|fixedDt|STEP_MS/,
        reason: 'A fixed simulation tick constant must exist in the sim source (no variable-delta gameplay integration).',
      },
    ],
  },
  'NET.SRV-AUTH': {
    scope: ['**/*.ts', '**/*.js'],
  },
  'NET.TICK-FIXED': {
    scope: ['src/**'],
    require: [
      {
        rx: /FIXED_TICK|TICK_RATE|1\s*\/\s*60|fixedDt|STEP_MS/,
        reason: 'A fixed simulation tick constant must exist in the sim source.',
      },
    ],
  },
  'NET.INPUT-VALIDATE': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      { rx: /clamp/, reason: 'Authoritative sim must clamp client inputs.' },
      { rx: /is_nan|is_finite|isFinite|Number\.isFinite/, reason: 'Authoritative sim must reject NaN/non-finite input values.' },
    ],
  },
  'NET.SNAPSHOT-INTERP': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      { rx: /lerp|interpolate|slerp/i, reason: 'Snapshot interpolation required for remote entities.' },
    ],
  },
  'NET.PREDICT-RECONCILE': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      { rx: /ack|reconcil/i, reason: 'Reconciliation against acknowledged server ticks required.' },
    ],
  },
  'LOG.FSM': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      {
        rx: /enum\s+GameState|const\s+GameState\s*=|class\s+GameState/,
        reason: 'A GameState enum/const set (or equivalent named states) is required.',
      },
      {
        rx: /can_transition|canTransition|transitionTo|transition\(|switch\s*\(\s*[\w.]*state/i,
        reason: 'A single transition function/table (or switch on state) is required.',
      },
    ],
  },
  'LOG.SIM-RENDER-SEPARATION': {
    scope: ['src/sim/**', 'src/game/**'],
    forbid: [
      {
        rx: /document\.|window\.|canvas|getContext|requestAnimationFrame|\bctx\./,
        reason: 'Sim/game-state modules must not touch browser/render APIs (render reads state; sim never does).',
      },
    ],
  },
  'LOG.EVENTS-DETERMINISTIC': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      { rx: /tick/, reason: 'Tick-stamped event handling required (no frame-timer gameplay logic).' },
    ],
  },
  'SEC.NEVER-TRUST-CLIENT': {
    scope: ['**/*.ts', '**/*.js'],
  },
  'SEC.SECRETS-SCAN': {
    scope: ['**/*.ts', '**/*.js', '**/*.json', '**/*.html', '**/*.env', '**/*.txt'],
  },
  'SEC.RATE-LIMIT': {
    scope: ['**/*.ts', '**/*.js'],
    require: [
      {
        rx: /rate_limit|RATE_LIMIT|_last_msg|msg_budget|_kick|rateLimit|lastMsgTick/,
        reason: 'No rate-limiting mechanism found on the server receive path.',
      },
    ],
  },
  'GFX.FPS-BUDGET': {
    scope: ['src/**', 'index.html'],
    require: [
      {
        rx: /requestAnimationFrame|setTargetFps|FPS|frameBudget/i,
        reason: 'The render loop must target the declared FPS (rAF-driven loop or explicit frame budget).',
      },
    ],
  },
  'GFX.RENDER-SCALE': {
    scope: ['src/**', 'index.html'],
    require: [
      {
        rx: /devicePixelRatio|canvas\.width|setCanvasSize|resize|VIEW_W|VIEW_H|viewWidth/i,
        reason: 'Canvas/viewport sizing must be explicit (declared quality, not defaults-by-accident).',
      },
    ],
  },
  'QA.TESTS-PRESENT': {
    scope: ['tests/**'],
  },
};

function applyWebOverride(rule: Rule): Rule {
  const override = WEB_OVERRIDES[rule.id];
  if (!override || !rule.check) return rule;
  const check = { ...rule.check };
  if (override.scope) check.scope = override.scope;
  if (override.require) check.require = override.require;
  if (override.forbid) check.forbid = override.forbid;
  return { ...rule, check };
}

function runNodeTests(root: string): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }> {
  // Prefer the project's canonical test entry (`npm test`) so build steps run
  // before the suite. Spawn is argument-list based; the command is the fixed
  // string "npm test" and only the working directory is variable — no shell
  // string is built from project data.
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const bin = isWin ? 'cmd.exe' : 'npm';
    const args = isWin ? ['/d', '/s', '/c', 'npm test'] : ['test'];
    execFile(
      bin,
      args,
      { timeout: 300_000, maxBuffer: 16 * 1024 * 1024, shell: false, cwd: root },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ ok: code === 0, code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      }
    );
  });
}

export const webAdapter: EngineAdapter & {
  templateDir: () => string;
  scaffoldProject: (destDir: string, spec: GameSpec) => { files: number };
} = {
  id: 'web',
  label: 'Web (TypeScript/JavaScript)',

  async available(): Promise<boolean> {
    return true; // Node runs the tests; the browser is only needed to play.
  },

  async runRuntimeRules(root: string, rules: Rule[]): Promise<RuleResult[]> {
    const testsDir = nodePath.join(root, 'tests');
    if (!fs.existsSync(testsDir)) {
      return rules.map((r) => ({
        ruleId: r.id,
        status: 'skipped',
        severity: r.severity,
        evidence: [],
        message: 'no tests/ directory in project',
      }));
    }
    const run = await runNodeTests(root);
    const passed = run.ok && /GDK:ALL-TESTS-PASS/.test(run.stdout);
    const evidence = run.stdout
      .split('\n')
      .filter((l) => /GDK:(TEST|OK|FAIL)/.test(l))
      .slice(0, 30);
    return rules.map((r) => {
      if (!RUNTIME_RULE_IDS.has(r.id)) {
        return {
          ruleId: r.id,
          status: 'skipped' as const,
          severity: r.severity,
          evidence: [],
          message: 'not mapped to the web runtime runner',
        };
      }
      if (!passed) {
        return {
          ruleId: r.id,
          status: 'fail' as const,
          severity: r.severity,
          evidence: evidence.length > 0 ? evidence : [run.stderr.slice(0, 400) || run.stdout.slice(0, 400)],
          message: run.ok
            ? 'node test suite ran but did not print GDK:ALL-TESTS-PASS'
            : `node test suite failed (exit ${run.code})`,
        };
      }
      return {
        ruleId: r.id,
        status: 'pass' as const,
        severity: r.severity,
        evidence,
        message: 'headless node suite green (determinism, sanity, FSM, playtest)',
      };
    });
  },

  transformRule(rule: Rule): Rule {
    return applyWebOverride(rule);
  },

  templateDir(): string {
    let dir = nodePath.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const candidate = nodePath.join(dir, 'templates', 'web');
      if (fs.existsSync(candidate)) return candidate;
      dir = nodePath.dirname(dir);
    }
    throw new Error('GDK web templates directory not found relative to the installed core package');
  },

  scaffoldProject(destDir: string, spec: GameSpec): { files: number } {
    const template = nodePath.join(this.templateDir(), 'topdown-openworld');
    if (!fs.existsSync(template)) {
      throw new Error(`web template missing at ${template}`);
    }
    let files = 0;
    const copy = (src: string, dst: string) => {
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          const nd = nodePath.join(dst, e.name);
          fs.mkdirSync(nd, { recursive: true });
          copy(nodePath.join(src, e.name), nd);
        } else {
          fs.copyFileSync(nodePath.join(src, e.name), nodePath.join(dst, e.name));
          files++;
        }
      }
    };
    fs.mkdirSync(destDir, { recursive: true });
    copy(template, destDir);
    const specPath = nodePath.join(destDir, 'gdk.game.json');
    const webSpec: GameSpec = {
      ...spec,
      engine: 'web',
      dimensions: '2d',
      multiplayer: { enabled: false, mode: undefined, maxPlayers: undefined, tickRate: undefined },
      physics: { needs: true, tickRate: 60, gravity: [0, -9.8, 0] },
    };
    fs.writeFileSync(specPath, JSON.stringify(webSpec, null, 2) + '\n', 'utf8');
    files++;
    return { files };
  },
};

/** Pick the engine adapter for a project directory from its gdk.game.json. */
export function adapterForProject(root: string): { adapter: EngineAdapter; engine: string } {
  const specPath = nodePath.resolve(root, 'gdk.game.json');
  if (!fs.existsSync(specPath)) {
    throw new Error(`no gdk.game.json in ${nodePath.resolve(root)} — cannot pick an engine adapter`);
  }
  const spec = loadSpec(specPath);
  if (spec.engine === 'godot') {
    return { adapter: godotAdapter, engine: 'godot' };
  }
  if (spec.engine === 'web') {
    return { adapter: webAdapter, engine: 'web' };
  }
  throw new Error(`no GDK adapter for engine '${spec.engine}' yet (godot, web implemented)`);
}
