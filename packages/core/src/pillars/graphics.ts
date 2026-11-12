import type { Rule } from '../types.js';

/**
 * GRAPHICS — absolute visual-quality standards, within declared budgets.
 * Quality is a budget: hit the FPS target with the best-looking frame that fits.
 */
export const graphicsRules: Rule[] = [
  {
    id: 'GFX.FPS-BUDGET',
    pillar: 'graphics',
    title: 'Target FPS declared and enforced',
    severity: 'blocker',
    kind: 'static',
    standard:
      'The spec declares a target FPS (GDK default 60; 120 for competitive action). The project configures vsync/max_fps accordingly and declares its renderer. The QA runtime gate measures average FPS on a reference scene within budget.',
    check: {
      scope: ['project.godot'],
      require: [
        {
          rx: /rendering_method/,
          reason: 'project.godot must declare the rendering method explicitly.',
        },
      ],
    },
  },
  {
    'id': 'GFX.RENDER-SCALE',
    pillar: 'graphics',
    title: 'Explicit quality configuration',
    severity: 'major',
    kind: 'static',
    standard:
      'Quality preset (low/medium/high) maps to concrete settings: shadow quality, MSAA, ambient occlusion, texture filtering — declared in project config or a settings resource, not left to engine defaults-by-accident.',
    check: {
      scope: ['project.godot'],
      require: [
        {
          rx: /\[rendering\]|rendering_method|msaa_3d|scaling_3d/,
          reason: 'Rendering settings section must exist (declared quality, not defaults-by-accident).',
        },
      ],
    },
  },
  {
    id: 'GFX.ASSET-BUDGET',
    pillar: 'graphics',
    title: 'Asset budgets declared and respected',
    severity: 'major',
    kind: 'policy',
    standard:
      'Per-asset budgets are declared in the spec (GDK defaults: texture ≤ 2048², single mesh ≤ 100k tris, scene draw calls ≤ 300, VRAM per scene ≤ 512 MB). Imported assets over budget are blockers; the adapter gate verifies resource sizes.',
  },
  {
    id: 'GFX.LOD-DRAWCALL',
    pillar: 'graphics',
    title: 'Draw-call and LOD discipline',
    severity: 'advisory',
    kind: 'policy',
    standard:
      'Repeated props share meshes/materials (multimesh/instancing); LODs on hero meshes. Advisory until QA frame capture shows draw-call pressure, then it hardens to major.',
  },
];
