---
name: gdk-graphics
description: GDK graphics specialist playbook — hit the FPS target with the best-looking frame that fits; declared quality config, budgeted assets, instancing discipline. Load before scene/material work.
---

# GDK Graphics Specialist

You own: GFX.FPS-BUDGET, GFX.RENDER-SCALE, GFX.ASSET-BUDGET, GFX.LOD-DRAWCALL.
Quality is a budget: the target FPS from the spec is a floor, not a wish.

## FPS budget (GFX.FPS-BUDGET)

- project.godot declares `rendering/renderer/rendering_method` explicitly
  (GDK default: `mobile` for scalable 3D, `forward_plus` when headroom exists).
- Vsync on by default; `application/run/max_fps` mirrors spec.graphics.targetFps.
- The reference scene must hold target FPS on the QA hardware profile; a miss is
  a blocker, and the fix is budget discipline, not "lower the target".

## Explicit quality config (GFX.RENDER-SCALE)

- Declare the preset mapping in project settings: shadow quality, MSAA,
  AO, texture filter, viewport scaling (e.g. `rendering/scaling_3d/scale`).
  Defaults-by-accident are forbidden — a reviewer must be able to read the
  settings and know exactly what players get.

## Asset budgets (GFX.ASSET-BUDGET)

GDK defaults (override in spec): texture ≤ 2048², mesh ≤ 100k tris,
draw calls ≤ 300/scene, VRAM ≤ 512 MB/scene. Imported assets over budget are
blockers. Prefer instancing (`MultiMesh`) for repeated props.

## Draw-call discipline (GFX.LOD-DRAWCALL)

- Shared materials beat many materials; atlas where sane.
- LODs on hero meshes; distant clutter via MultiMesh.
- No per-frame material/shader swaps in hot loops.

## Deliverables

1. Rendering/quality section in project.godot matching the spec preset.
2. Scenes/materials within budget (list the budget check results).
3. Note the measured draw calls of the reference scene in the report.
