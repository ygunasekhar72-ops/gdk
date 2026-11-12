#!/usr/bin/env node
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import {
  loadSpec,
  planTeam,
  runGates,
  godotAdapter,
  adapterForProject,
  ALL_RULES,
  type GameSpec,
  type GateReport,
} from '@gdk/core';

const VERSION = '0.1.0';

function usage(): string {
  return `GDK — Game Development Kit for AI agents (v${VERSION})

USAGE
  gdk new <name> [--dir <path>]          Scaffold a Godot multiplayer arena project from the GDK template
  gdk plan [--spec <file|'-'>]           Print the agent team plan (phases + roster) for a spec
  gdk agents [--spec <file|'-'>]         Print the specialist agent roster + missions
  gdk gates <projectDir> [--json]        Run all GDK quality gates against a project
  gdk standards [pillar]                 Print rule catalog (all | graphics|physics|logic|multiplayer|security|qa)

EXAMPLES
  gdk new coin-arena --dir ./coin-arena
  gdk plan --spec ./coin-arena/gdk.game.json
  gdk gates ./coin-arena
`;
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  return args[i + 1];
}

function readSpecArg(args: string[]): GameSpec {
  const specArg = argValue(args, '--spec');
  if (!specArg || specArg === '-') {
    const raw = fs.readFileSync(0, 'utf8');
    return loadSpec(raw);
  }
  return loadSpec(specArg);
}

function renderPlanMarkdown(plan: ReturnType<typeof planTeam>): string {
  const lines: string[] = [];
  lines.push(`# GDK Team Plan — ${plan.project} (${plan.engine})`);
  lines.push('');
  lines.push('## Phases');
  for (const p of plan.phases) {
    lines.push(`### ${p.name}`);
    lines.push(`- **Goal:** ${p.goal}`);
    lines.push(`- **Agents:** ${p.agents.join(', ')}`);
    lines.push(`- **Exit gates:** ${p.exitGates.length > 0 ? p.exitGates.join(', ') : '(none)'}`);
    lines.push('');
  }
  lines.push('## Roster');
  for (const a of plan.roster) {
    lines.push(`### ${a.agent} — ${a.role}`);
    lines.push(`- **Goal:** ${a.goal}`);
    lines.push(`- **Load skills:** ${a.skills.join(', ')}`);
    lines.push(`- **Owns rules:** ${a.ownsRules.join(', ')}`);
    lines.push(`- **Deliverables:** ${a.deliverables.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderReport(report: GateReport): string {
  const lines: string[] = [];
  const icon = (s: string) => (s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : 'SKIP');
  lines.push(`GDK Gate Report — ${report.project} [${report.engine}]`);
  lines.push(`Verdict: ${report.passed ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');
  for (const r of report.results) {
    lines.push(`[${icon(r.status)}] ${r.ruleId.padEnd(22)} (${r.severity}) ${r.message}`);
    for (const e of r.evidence.slice(0, 4)) lines.push(`        ${e}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(usage());
    process.exit(0);
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  try {
    if (cmd === 'new') {
      const name = args[1];
      if (!name || name.startsWith('--')) {
        console.error('usage: gdk new <name> [--dir <path>]');
        process.exit(2);
      }
      const dirArg = argValue(args, '--dir');
      const dest = nodePath.resolve(dirArg ?? name);
      if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
        console.error(`refusing to scaffold into non-empty directory: ${dest}`);
        process.exit(2);
      }
      const res = godotAdapter.scaffoldProject(dest, {
        name,
        genre: 'arena',
        engine: 'godot',
        dimensions: '3d',
        multiplayer: { enabled: true, mode: 'realtime-authoritative', maxPlayers: 8, tickRate: 60 },
        physics: { needs: true, tickRate: 60, gravity: [0, -9.8, 0] },
        graphics: { targetFps: 60, qualityPreset: 'medium' },
        security: { dedicatedServer: true, chat: false, economy: false },
      });
      console.log(`✔ scaffolded ${name} → ${dest} (${res.files} files)`);
      console.log('next: gdk gates ' + dest);
      process.exit(0);
    }

    if (cmd === 'plan' || cmd === 'agents') {
      const spec = readSpecArg(args);
      const plan = planTeam(spec);
      console.log(renderPlanMarkdown(plan));
      process.exit(0);
    }

    if (cmd === 'gates') {
      const dir = args[1];
      if (!dir) {
        console.error('usage: gdk gates <projectDir> [--json]');
        process.exit(2);
      }
      const wantJson = args.includes('--json');
      const { adapter } = adapterForProject(nodePath.resolve(dir));
      const report = await runGates(nodePath.resolve(dir), adapter);
      if (wantJson) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(renderReport(report));
      }
      process.exit(report.passed ? 0 : 1);
    }

    if (cmd === 'standards') {
      const pillar = args[1];
      const rules = pillar && pillar !== 'all'
        ? ALL_RULES.filter((r) => r.pillar === pillar)
        : ALL_RULES;
      if (rules.length === 0) {
        console.error(`unknown pillar: ${pillar} (use all|graphics|physics|logic|multiplayer|security|qa)`);
        process.exit(2);
      }
      for (const r of rules) {
        console.log(`${r.id}  [${r.severity}/${r.kind}]  ${r.title}`);
        console.log(`    ${r.standard}`);
        console.log('');
      }
      process.exit(0);
    }

    console.error(`unknown command: ${cmd}`);
    console.log(usage());
    process.exit(2);
  } catch (e) {
    console.error(`gdk: ${(e as Error).message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`gdk: ${e?.message ?? e}`);
  process.exit(1);
});
