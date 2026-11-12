import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameSpec, SpecError } from './types.js';

/**
 * Load + validate gdk.game.json. This spec is the contract between the
 * requesting agent and the whole kit.
 */
export const SPEC_FILENAME = 'gdk.game.json';

export function loadSpec(specOrPath: string): GameSpec {
  let raw: string;
  if (specOrPath.trim().startsWith('{')) {
    raw = specOrPath;
  } else {
    // Path containment (no traversal): resolve against the working directory
    // and verify the target never escapes it. Only .json files are read.
    const root = path.resolve(process.cwd());
    const resolved = path.resolve(root, specOrPath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new SpecError(`spec path escapes the working directory: ${specOrPath}`);
    }
    if (!resolved.toLowerCase().endsWith('.json')) {
      throw new SpecError(`spec path must point to a .json file: ${resolved}`);
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      throw new SpecError(`spec not found: ${resolved}`);
    }
    if (!stat.isFile()) {
      throw new SpecError(`spec path is not a regular file: ${resolved}`);
    }
    raw = fs.readFileSync(resolved, 'utf8');
  }

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new SpecError(`spec is not valid JSON: ${(e as Error).message}`);
  }
  return validateSpec(obj);
}

export function validateSpec(obj: unknown): GameSpec {
  const o = obj as Record<string, unknown>;
  const need = (cond: boolean, msg: string) => {
    if (!cond) throw new SpecError(msg);
  };
  need(typeof o === 'object' && o !== null, 'spec must be a JSON object');
  need(typeof o.name === 'string' && o.name.length > 0, 'spec.name required');
  need(typeof o.genre === 'string' && o.genre.length > 0, 'spec.genre required');
  need(
    ['godot', 'web', 'unity', 'unreal'].includes(o.engine as string),
    `spec.engine must be godot|web|unity|unreal (got: ${String(o.engine)})`
  );
  need(['2d', '3d'].includes(o.dimensions as string), 'spec.dimensions must be 2d|3d');
  need(typeof o.multiplayer === 'object' && o.multiplayer !== null, 'spec.multiplayer required');
  const mp = o.multiplayer as Record<string, unknown>;
  need(typeof mp.enabled === 'boolean', 'spec.multiplayer.enabled required');
  if (mp.enabled) {
    need(
      ['realtime-authoritative', 'turn-based', 'cooperative'].includes(mp.mode as string),
      'spec.multiplayer.mode must be realtime-authoritative|turn-based|cooperative'
    );
    need(typeof mp.maxPlayers === 'number' && mp.maxPlayers >= 2, 'spec.multiplayer.maxPlayers >= 2 required for multiplayer games');
    need(typeof mp.tickRate === 'number' && mp.tickRate >= 20 && mp.tickRate <= 128, 'spec.multiplayer.tickRate must be 20..128');
  }
  need(typeof o.physics === 'object' && o.physics !== null, 'spec.physics required');
  const ph = o.physics as Record<string, unknown>;
  need(typeof ph.needs === 'boolean', 'spec.physics.needs required');
  if (ph.needs) {
    need(typeof ph.tickRate === 'number' && ph.tickRate >= 20 && ph.tickRate <= 240, 'spec.physics.tickRate must be 20..240');
  }
  need(typeof o.graphics === 'object' && o.graphics !== null, 'spec.graphics required');
  const gfx = o.graphics as Record<string, unknown>;
  need(
    typeof gfx.targetFps === 'number' && [30, 60, 120, 144, 240].includes(gfx.targetFps),
    'spec.graphics.targetFps must be one of 30|60|120|144|240'
  );
  if (gfx.qualityPreset !== undefined) {
    need(['low', 'medium', 'high'].includes(gfx.qualityPreset as string), 'spec.graphics.qualityPreset must be low|medium|high');
  }
  need(typeof o.security === 'object' && o.security !== null, 'spec.security required');

  return o as unknown as GameSpec;
}
