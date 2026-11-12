#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  loadSpec,
  planTeam,
  runGates,
  adapterForProject,
  ALL_RULES,
  type GameSpec,
} from '@gdk/core';

const server = new McpServer({
  name: 'gdk',
  version: '0.1.0',
});

server.tool(
  'gdk_plan_game',
  'Given a GDK game spec, return the specialist agent roster and phase plan a GDK orchestrator should execute.',
  { spec: z.string().describe('Game spec as JSON string or path to gdk.game.json') },
  async ({ spec }) => {
    const parsed = loadSpec(spec);
    const plan = planTeam(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
  }
);

server.tool(
  'gdk_run_gates',
  'Run all GDK quality gates (graphics, physics, logic, multiplayer, security, qa) against a game project directory. Returns per-rule results; blockers/majors failing = build rejected.',
  { project_dir: z.string().describe('Absolute path to the game project directory') },
  async ({ project_dir }) => {
    const { adapter } = adapterForProject(project_dir);
    const report = await runGates(project_dir, adapter);
    const verdict = report.passed ? 'PASS' : 'FAIL';
    return {
      content: [
        {
          type: 'text',
          text: `GDK gates verdict: ${verdict}\n\n${JSON.stringify(report, null, 2)}`,
        },
      ],
    };
  }
);

server.tool(
  'gdk_get_standards',
  'Return the GDK absolute standards (rule catalog) for one pillar or all pillars.',
  { pillar: z.string().optional().describe('graphics|physics|logic|multiplayer|security|qa (omit for all)') },
  async ({ pillar }) => {
    const rules =
      pillar && pillar !== 'all' ? ALL_RULES.filter((r) => r.pillar === pillar) : ALL_RULES;
    if (rules.length === 0) {
      return { content: [{ type: 'text', text: `unknown pillar: ${pillar}` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(rules, null, 2) }] };
  }
);

server.tool(
  'gdk_scaffold_project',
  'Scaffold a new Godot multiplayer arena game project from the GDK server-authoritative template.',
  {
    name: z.string().min(1),
    dir: z.string().describe('Destination directory (absolute or cwd-relative)'),
    spec_overrides: z.record(z.string(), z.any()).optional().describe('Partial GameSpec overrides'),
  },
  async ({ name, dir, spec_overrides }) => {
    const base: GameSpec = {
      name,
      genre: 'arena',
      engine: 'godot',
      dimensions: '3d',
      multiplayer: { enabled: true, mode: 'realtime-authoritative', maxPlayers: 8, tickRate: 60 },
      physics: { needs: true, tickRate: 60, gravity: [0, -9.8, 0] },
      graphics: { targetFps: 60, qualityPreset: 'medium' },
      security: { dedicatedServer: true, chat: false, economy: false },
    };
    const merged = { ...base, ...(spec_overrides ?? {}) } as GameSpec;
    const res = godotAdapter.scaffoldProject(dir, merged);
    return {
      content: [
        { type: 'text', text: `Scaffolded ${name} at ${dir} (${res.files} files). Next: gdk_run_gates on this directory.` },
      ],
    };
  }
);

async function run(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((e) => {
  console.error('gdk-mcp fatal:', e);
  process.exit(1);
});
