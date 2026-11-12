import type { PillarId, Rule } from './types.js';
import { multiplayerRules } from './pillars/multiplayer.js';
import { physicsRules } from './pillars/physics.js';
import { logicRules } from './pillars/logic.js';
import { securityRules } from './pillars/security.js';
import { graphicsRules } from './pillars/graphics.js';
import { qaRules } from './pillars/qa.js';

export const ALL_RULES: Rule[] = [
  ...multiplayerRules,
  ...physicsRules,
  ...logicRules,
  ...securityRules,
  ...graphicsRules,
  ...qaRules,
];

export const RULES_BY_ID = new Map(ALL_RULES.map((r) => [r.id, r]));

export function rulesForPillar(pillar: PillarId): Rule[] {
  return ALL_RULES.filter((r) => r.pillar === pillar);
}
