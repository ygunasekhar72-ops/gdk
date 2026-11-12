import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import type { RuleResult, Rule } from './types.js';

/**
 * Declarative static scanner for GDK gates.
 *
 * Security posture:
 * - Walk root resolved once; every visited path asserted inside it.
 * - Symlinks never followed.
 * - No process spawning; no dynamic RegExp construction.
 * - Patterns are precompiled regex literals from the GDK rule catalog
 *   (trusted, versioned source) — never read from scanned project files.
 */
export interface ScannedFile {
  rel: string;
  text: string;
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.godot', 'dist', '.zcode']);

function inside(root: string, target: string): boolean {
  const rel = nodePath.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !nodePath.isAbsolute(rel));
}

export function walkFiles(root: string): ScannedFile[] {
  const out: ScannedFile[] = [];
  const base = nodePath.resolve(root);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return out;
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        const child = nodePath.join(dir, e.name);
        if (!inside(base, child)) continue;
        visit(child);
        continue;
      }
      if (!e.isFile()) continue;
      const abs = nodePath.join(dir, e.name);
      if (!inside(base, abs)) continue;
      const rel = nodePath.relative(base, abs).split(nodePath.sep).join('/');
      let text: string;
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      out.push({ rel, text });
    }
  };
  visit(base);
  return out;
}

/** Segment glob: `*` within one path segment, `**` across segments. No RegExp built. */
export function globMatch(pattern: string, rel: string): boolean {
  const segs = pattern.split('/');
  const parts = rel.split('/');
  return matchSegs(segs, 0, parts, 0);
}

function matchSegs(segs: string[], si: number, parts: string[], pi: number): boolean {
  if (si === segs.length) return pi === parts.length;
  const seg = segs[si]!;
  if (seg === '**') {
    for (let k = pi; k <= parts.length; k++) {
      if (matchSegs(segs, si + 1, parts, k)) return true;
    }
    return false;
  }
  if (pi === parts.length) return false;
  const part = parts[pi]!;
  if (!segStar(seg, part)) return false;
  return matchSegs(segs, si + 1, parts, pi + 1);
}

function segStar(seg: string, part: string): boolean {
  // Match one path segment where '*' spans any characters inside it.
  // pieces = seg split on '*'; part must start with pieces[0] (if any),
  // end with pieces[last] (if any), and contain middle pieces in order.
  const pieces = seg.split('*');
  if (pieces.length === 1) return seg === part;
  let pos = 0;
  const first = pieces[0]!;
  const last = pieces[pieces.length - 1]!;
  if (first !== '') {
    if (!part.startsWith(first)) return false;
    pos = first.length;
  }
  let end = part.length;
  if (last !== '') {
    if (part.length < last.length || !part.endsWith(last)) return false;
    end = part.length - last.length;
  }
  for (let i = 1; i < pieces.length - 1; i++) {
    const piece = pieces[i]!;
    if (piece === '') continue;
    const idx = part.indexOf(piece, pos);
    if (idx < 0 || idx + piece.length > end) return false;
    pos = idx + piece.length;
  }
  return pos <= end;
}

export function runStaticCheck(rule: Rule, root: string): RuleResult {
  const base: RuleResult = {
    ruleId: rule.id,
    status: 'pass',
    severity: rule.severity,
    evidence: [],
    message: '',
  };
  const check = rule.check;
  if (!check) {
    base.status = 'skipped';
    base.message = 'no declarative check (adapter/runtime handles it)';
    return base;
  }
  const files = walkFiles(root);
  const violations: string[] = [];
  const evidence: string[] = [];
  for (const { rx, reason, exemptAuthoritative } of check.forbid ?? []) {
    for (const f of files) {
      if (!inScope(check.scope, f.rel)) continue;
      // Authoritative sim modules may perform state mutations that client
      // code must never do — that is the capability boundary itself.
      if (exemptAuthoritative && f.text.includes('GDK:AUTHORITATIVE')) continue;
      if (rx.test(f.text)) violations.push(`${f.rel}: ${String(rx)} → ${reason}`);
    }
  }
  for (const { rx, reason } of check.require ?? []) {
    let found = false;
    for (const f of files) {
      if (!inScope(check.scope, f.rel)) continue;
      if (rx.test(f.text)) {
        found = true;
        evidence.push(`${f.rel}: ${String(rx)}`);
        break;
      }
    }
    if (!found) violations.push(`REQUIRED missing → ${reason}`);
  }
  if (violations.length > 0) {
    base.status = 'fail';
    base.message = violations.join(' | ');
    base.evidence = violations;
  } else {
    base.status = 'pass';
    base.message = `static check ok (${evidence.length} required pattern(s) evidenced)`;
    base.evidence = evidence.slice(0, 12);
  }
  return base;
}

function inScope(scope: string[], rel: string): boolean {
  return scope.some((s) => globMatch(s, rel));
}
