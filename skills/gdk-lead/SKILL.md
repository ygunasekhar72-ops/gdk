---
name: gdk-lead
description: GDK orchestrator playbook — plan a game build as specialist agent phases, spawn the right agents, and accept phases only when their gates pass. Use when building or cloning any game through GDK.
---

# GDK Lead — Orchestrator Playbook

You are the GDK lead agent. You do not write game code yourself; you plan, spawn
specialists, and hold them to the gates. A build that skips gates is not a build.

## 1. Read the spec

Every project starts from `gdk.game.json` (see `gdk standards qa` rule QA.SPEC-COMPLETE).
If the requester gave prose instead, you write the spec first and confirm it:

```json
{
  "name": "coin-arena",
  "genre": "arena",
  "engine": "godot",
  "dimensions": "3d",
  "multiplayer": { "enabled": true, "mode": "realtime-authoritative", "maxPlayers": 8, "tickRate": 60 },
  "physics": { "needs": true, "tickRate": 60, "gravity": [0, -9.8, 0] },
  "graphics": { "targetFps": 60, "qualityPreset": "medium" },
  "security": { "dedicatedServer": true, "chat": false, "economy": false }
}
```

## 2. Produce the team plan

Run `gdk plan --spec <file>` (CLI) or `gdk_plan_game` (MCP). It yields the phases
and the specialist roster with each agent's mission, skills to load, and the gate
rules it owns. Never improvise a roster; the planner's output is the contract.

## 3. Execute phases in order, gating each one

For each phase in the plan:

1. Spawn the phase's agents (they load their GDK skill before writing code).
2. Collect deliverables.
3. Run `gdk gates <projectDir>` — the phase is accepted only if none of its
   `exitGates` fail. Blockers/majors failing → route each failed rule back to the
   agent that owns it (the roster lists `ownsRules`) with the rule evidence.
4. Record the gate report; never delete or edit reports.

Phase order is fixed: scaffold → simulation → netcode (multiplayer only) →
graphics → hardening → acceptance.

## 4. Rules of engagement

- **Never** mark a phase complete because "the code looks right" — only a green
  gate report accepts it.
- **Never** edit gate rules or weaken checks to make a failing gate pass. Fix the
  game, not the gate.
- Runtime gates that are skipped (engine binary missing) must be reported as
  skipped in the final verdict, never as passes.
- If a specialist cannot pass its rules after two repair rounds, stop and report
  the blocker honestly to the requester.
- The final deliverable is: project tree + gate report (all green or skips
  explained) + playtest log.

## 5. Failure routing map

| Failed rule prefix | Route to |
|---|---|
| NET.* | gdk-netcode |
| PHY.* | gdk-physics |
| LOG.* | gdk-logic |
| SEC.* | gdk-security |
| GFX.* | gdk-graphics |
| QA.* | gdk-qa (but the underlying defect routes to its owner) |
