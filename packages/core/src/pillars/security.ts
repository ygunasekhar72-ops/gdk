import type { Rule } from '../types.js';

/**
 * SECURITY — absolute game-security standards.
 * Threat model: every client is hostile, and every client is colluding
 * with every other client.
 */
export const securityRules: Rule[] = [
  {
    id: 'SEC.NEVER-TRUST-CLIENT',
    pillar: 'security',
    title: 'Never trust the client — zero privileged client logic',
    severity: 'blocker',
    kind: 'static',
    standard:
      'Score, currency, inventory, damage, win conditions: decided server-side only. Client code contains no branch that grants gameplay advantage (no client-computed damage upload, no "client says it collected the coin"). The client may *predict* outcomes; the server *decides* them.',
    check: {
      scope: ['**/*.gd'],
      forbid: [
        {
          rx: /score\s*\+=|score\s*=\s*score\s*\+/,
          exemptAuthoritative: true,
          reason: 'Score mutation outside the GDK:AUTHORITATIVE sim. Score changes flow through server-side pickup validation only.',
        },
        {
          rx: /rpc_id?\s*\([^)]*(_?add_score|_?set_score)/,
          exemptAuthoritative: true,
          reason: 'RPC that lets a peer change scores — must be server-computed.',
        },
        {
          rx: /get_multiplayer_authority\(\)\s*!=\s*1/,
          reason: 'Do not branch authority by "not 1" heuristics; use multiplayer.is_server().',
        },
      ],
    },
  },
  {
    id: 'SEC.SECRETS-SCAN',
    pillar: 'security',
    title: 'No secrets in the game tree',
    severity: 'blocker',
    kind: 'static',
    standard:
      'No API keys, tokens, passwords, private keys, or connection strings anywhere in the project. Game clients ship to hostile machines — anything in the tree is public. External services are called via a server proxy holding the secret.',
    check: {
      scope: ['**/*.gd', '**/*.json', '**/*.cfg', '**/*.env', '**/*.txt', 'project.godot'],
      forbid: [
        {
          rx: /(api[_-]?key|apikey|secret|token|password|passwd|bearer)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
          reason: 'Hardcoded credential-shaped string found. Move to server env config.',
        },
        {
          rx: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
          reason: 'Private key material in the tree.',
        },
        {
          rx: /(sk|pk)_(live|test)_[A-Za-z0-9]{16,}/,
          reason: 'Payment-provider style key found.',
        },
      ],
    },
  },
  {
    id: 'SEC.RATE-LIMIT',
    pillar: 'security',
    title: 'Server-side rate limiting on client messages',
    severity: 'major',
    kind: 'static',
    standard:
      'Every client→server message class (inputs, actions, chat, join) is rate-limited per peer: max frequency enforced via tick-countdown or token bucket; peers exceeding it are kicked. Unbounded RPC consumption is a trivial DoS vector.',
    check: {
      scope: ['**/*.gd'],
      require: [
        {
          rx: /rate_limit|RATE_LIMIT|_last_msg|msg_budget|_kick/,
          reason: 'No rate-limiting/kick mechanism found on the server receive path.',
        },
      ],
    },
  },
  {
    id: 'SEC.SANITIZE',
    pillar: 'security',
    title: 'User-supplied strings sanitized before broadcast',
    severity: 'major',
    kind: 'policy',
    standard:
      'Player names, chat, custom labels are length-limited and stripped of control/format characters before the server broadcasts them. They are data, never markup: rendering layers treat them as opaque text (no RichText/[url]/[img] passthrough).',
  },
  {
    id: 'SEC.TRANSPORT',
    pillar: 'security',
    title: 'Encrypted transport or explicitly dev-only',
    severity: 'major',
    kind: 'policy',
    standard:
      'Production multiplayer uses DTLS/TLS (ENet: dtls_client/dtls_server with a real certificate chain; WebSocket: wss). Plain transport is allowed only when the spec flags local dev — the gate report states this explicitly.',
  },
];
