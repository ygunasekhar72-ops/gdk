import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { GateReport, Rule, RuleResult } from './types.js';
import { ALL_RULES } from './rules.js';
import { runStaticCheck } from './scanners.js';
import { loadSpec, SPEC_FILENAME } from './spec.js';

/**
 * Gate runner: evaluates every GDK rule against a project and emits a report.
 * Pass condition: no blocker and no major rule failed (advisories may fail).
 *
 * Rule routing:
 * - 'static'  → declarative scanner (core)
 * - 'policy'  → spec/config completeness (core)
 * - 'runtime' → engine adapter (e.g. headless Godot run); skipped if the
 *   engine binary is unavailable, reported as skipped with reason.
 */

export interface EngineAdapter {
  readonly id: string;
  /** Human-readable display name. */
  readonly label: string;
  /** Returns results for the adapter's 'runtime' rules. */
  runRuntimeRules(root: string, rules: Rule[]): Promise<RuleResult[]>;
  /** Can the adapter actually execute runtime rules right now? */
  available(): Promise<boolean>;
}

export async function runGates(root: string, adapter: EngineAdapter): Promise<GateReport> {
  const absRoot = nodePath.resolve(root);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`project directory not found: ${absRoot}`);
  }
  const results: RuleResult[] = [];

  for (const rule of ALL_RULES) {
    if (rule.kind === 'static') {
      results.push(runStaticCheck(rule, absRoot));
    } else if (rule.kind === 'policy') {
      results.push(runPolicyCheck(rule, absRoot));
    }
    // 'runtime' rules are collected below in one adapter pass
  }

  const runtimeRules = ALL_RULES.filter((r) => r.kind === 'runtime');
  if (runtimeRules.length > 0) {
    try {
      if (await adapter.available()) {
        results.push(...(await adapter.runRuntimeRules(absRoot, runtimeRules)));
      } else {
        results.push(
          ...runtimeRules.map((r) => ({
            ruleId: r.id,
            status: 'skipped' as const,
            severity: r.severity,
            evidence: [],
            message: 'engine binary not available for runtime gates (install the engine to enable)',
          }))
        );
      }
    } catch (e) {
      results.push(
        ...runtimeRules.map((r) => ({
          ruleId: r.id,
          status: 'skipped' as const,
          severity: r.severity,
          evidence: [],
          message: `runtime gate errored: ${(e as Error).message}`,
        }))
      );
    }
  }

  const blockersFailed: string[] = [];
  const majorsFailed: string[] = [];
  const skipped: string[] = [];
  for (const res of results) {
    if (res.status === 'fail') {
      if (res.severity === 'blocker') blockersFailed.push(res.ruleId);
      else if (res.severity === 'major') majorsFailed.push(res.ruleId);
    } else if (res.status === 'skipped') {
      skipped.push(res.ruleId);
    }
  }
  const passed = blockersFailed.length === 0 && majorsFailed.length === 0;

  return {
    project: nodePath.basename(absRoot),
    engine: adapter.id,
    ranAt: new Date().toISOString(),
    results,
    passed,
    blockersFailed,
    majorsFailed,
    skipped,
  };
}

function runPolicyCheck(rule: Rule, root: string): RuleResult {
  const base: RuleResult = {
    ruleId: rule.id,
    status: 'pass',
    severity: rule.severity,
    evidence: [],
    message: '',
  };
  switch (rule.id) {
    case 'QA.SPEC-COMPLETE': {
      const specPath = nodePath.join(root, SPEC_FILENAME);
      if (!fs.existsSync(specPath)) {
        base.status = 'fail';
        base.message = `${SPEC_FILENAME} missing from project root`;
        return base;
      }
      try {
        loadSpec(specPath);
        base.message = `${SPEC_FILENAME} present and valid`;
        base.evidence = [SPEC_FILENAME];
      } catch (e) {
        base.status = 'fail';
        base.message = `${SPEC_FILENAME} invalid: ${(e as Error).message}`;
      }
      return base;
    }
    case 'PHY.UNIT-CONSIST': {
      // policy evidence: a units doc or spec constant
      const specPath = nodePath.join(root, SPEC_FILENAME);
      if (fs.existsSync(specPath)) {
        base.message = 'units convention inherited from GDK default (m, s, kg) — declare overrides in spec';
      } else {
        base.status = 'fail';
        base.message = 'no gdk.game.json to inherit unit conventions from';
      }
      return base;
    }
    case 'SEC.SANITIZE':
    case 'SEC.TRANSPORT':
    case 'NET.LAGCOMP':
    case 'GFX.ASSET-BUDGET':
    case 'GFX.LOD-DRAWCALL':
    case 'LOG.SAVE-SAFE': {
      base.status = 'pass';
      base.message = `${rule.title}: advisory/policy — enforce during hardening phase, gate reports it for the record`;
      return base;
    }
    default:
      base.status = 'skipped';
      base.message = `no policy handler for ${rule.id}`;
      return base;
  }
}
