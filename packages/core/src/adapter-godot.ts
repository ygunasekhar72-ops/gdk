import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineAdapter } from './gates.js';
import type { RuleResult } from './types.js';
import type { GameSpec, Rule } from './types.js';

/**
 * Godot 4 engine adapter.
 *
 * Runtime gates run the project's GDK test suite headlessly:
 *   godot --headless --path <project> --script tests/gdk_smoke.gd
 * The suite must exit 0 and print GDK:ALL-TESTS-PASS (see the arena template).
 *
 * Binary discovery order: $GODOT_BIN → `godot` → `godot4` on PATH.
 */

const RUNTIME_RULE_IDS = new Set(['PHY.DETERMINISM', 'PHY.SANITY-SIM', 'QA.TESTS-PASS', 'QA.PLAYTEST-SCRIPT']);

let cachedBinary: string | null | undefined;

function findGodotBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  const candidates: string[] = [];
  if (process.env.GODOT_BIN) candidates.push(process.env.GODOT_BIN);
  candidates.push('godot', 'godot4');
  for (const c of candidates) {
    try {
      const res = execFileSyncSafe(c, ['--version']);
      if (res.ok) {
        cachedBinary = c;
        return cachedBinary;
      }
    } catch {
      // keep looking
    }
  }
  cachedBinary = null;
  return cachedBinary;
}

/** execFileSync without shell interpolation (no command-injection surface). */
function execFileSyncSafe(bin: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(bin, args, { timeout: 15_000, shell: false, encoding: 'utf8' });
    return { ok: true, stdout: String(stdout ?? ''), stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { ok: false, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
}

export const godotAdapter: EngineAdapter & {
  scaffoldProject: (destDir: string, spec: GameSpec) => { files: number };
  templateDir: () => string;
} = {
  id: 'godot',
  label: 'Godot 4',

  async available(): Promise<boolean> {
    return findGodotBinary() !== null;
  },

  async runRuntimeRules(root: string, rules: Rule[]): Promise<RuleResult[]> {
    const bin = findGodotBinary();
    if (!bin) {
      return rules.map((r) => skipResult(r, 'godot binary not found'));
    }
    const testScript = findTestScript(root);
    if (!testScript) {
      return rules.map((r) => skipResult(r, 'tests/gdk_smoke.gd not found in project'));
    }
    const run = await runHeadless(bin, nodePath.resolve(root), testScript);
    const passed = run.ok && /GDK:ALL-TESTS-PASS/.test(run.stdout);
    const evidence = run.stdout
      .split('\n')
      .filter((l) => /GDK:(TEST|OK|FAIL)/.test(l))
      .slice(0, 30);
    return rules.map((r) => {
      if (!RUNTIME_RULE_IDS.has(r.id)) {
        return {
          ruleId: r.id,
          status: 'skipped',
          severity: r.severity,
          evidence: [],
          message: `not mapped to runtime runner in adapter`,
        };
      }
      if (!passed) {
        return {
          ruleId: r.id,
          status: 'fail',
          severity: r.severity,
          evidence: evidence.length > 0 ? evidence : [run.stderr.slice(0, 400) || run.stdout.slice(0, 400)],
          message: run.ok
            ? 'headless suite ran but did not print GDK:ALL-TESTS-PASS'
            : `headless run failed (exit ${run.code}): ${run.stderr.slice(0, 200)}`,
        };
      }
      return {
        ruleId: r.id,
        status: 'pass',
        severity: r.severity,
        evidence,
        message: 'headless suite green (determinism, sanity, FSM, playtest)',
      };
    });
  },

  templateDir(): string {
    // Climb from this compiled file to the repo root and find templates/godot.
    let dir = nodePath.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const candidate = nodePath.join(dir, 'templates', 'godot');
      if (fs.existsSync(candidate)) return candidate;
      dir = nodePath.dirname(dir);
    }
    throw new Error('GDK templates directory not found relative to the installed core package');
  },

  scaffoldProject(destDir: string, spec: GameSpec): { files: number } {
    const template = this.templateDir();
    const arena = nodePath.join(template, 'arena-mp');
    if (!fs.existsSync(arena)) {
      throw new Error(`arena template missing at ${arena}`);
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
    copy(arena, destDir);
    // Project-specific spec derived from the template's default + request overrides
    const specPath = nodePath.join(destDir, 'gdk.game.json');
    fs.writeFileSync(specPath, JSON.stringify({ ...defaultSpec(spec.name), ...specOverrides(spec) }, null, 2) + '\n', 'utf8');
    files++;
    return { files };
  },
};

function defaultSpec(name: string): GameSpec {
  return {
    name,
    genre: 'arena',
    engine: 'godot',
    dimensions: '3d',
    multiplayer: { enabled: true, mode: 'realtime-authoritative', maxPlayers: 8, tickRate: 60 },
    physics: { needs: true, tickRate: 60, gravity: [0, -9.8, 0] },
    graphics: { targetFps: 60, qualityPreset: 'medium' },
    security: { dedicatedServer: true, chat: false, economy: false },
    platforms: ['windows', 'linux', 'macos'],
  };
}

function specOverrides(spec: GameSpec): Partial<GameSpec> {
  const out: Partial<GameSpec> = {};
  if (spec.genre) out.genre = spec.genre;
  if (spec.multiplayer) out.multiplayer = spec.multiplayer;
  if (spec.physics) out.physics = spec.physics;
  if (spec.graphics) out.graphics = spec.graphics;
  if (spec.security) out.security = spec.security;
  if (spec.dimensions) out.dimensions = spec.dimensions;
  return out;
}

function findTestScript(root: string): string | null {
  const candidates = ['tests/gdk_smoke.gd', 'test/gdk_smoke.gd'];
  for (const c of candidates) {
    const p = nodePath.join(root, c);
    if (fs.existsSync(p)) return c;
  }
  return null;
}

function runHeadless(bin: string, projectRoot: string, testScriptRel: string): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Script path is passed as an argument (never interpolated into a shell string).
    execFile(
      bin,
      ['--headless', '--path', projectRoot, '--script', testScriptRel],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024, shell: false },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ ok: code === 0, code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      }
    );
  });
}

function skipResult(r: Rule, why: string): RuleResult {
  return { ruleId: r.id, status: 'skipped', severity: r.severity, evidence: [], message: why };
}
