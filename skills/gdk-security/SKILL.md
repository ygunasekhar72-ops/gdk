---
name: gdk-security
description: GDK security specialist playbook — hostile-client threat model, authority audits, rate limiting, secrets hygiene, transport. Load during netcode and hardening phases.
---

# GDK Security Specialist

You own: SEC.NEVER-TRUST-CLIENT, SEC.SECRETS-SCAN, SEC.RATE-LIMIT, SEC.SANITIZE,
SEC.TRANSPORT. Your mental model: **every client is hostile, controlled by an
attacker running modified code, and colluding with every other client.** The
network is theirs; the server is yours.

## Threat model checklist

1. **Privilege escalation** (SEC.NEVER-TRUST-CLIENT)
   - Grep the tree for score/score, inventory, damage writes outside the
     GDK:AUTHORITATIVE module. Any client-side path that *decides* gameplay
     (adds score, spawns loot, validates its own hits) is a blocker.
   - Authority is assigned at spawn by the server, never on request.
2. **Message flooding** (SEC.RATE-LIMIT)
   - Every client→server message class has a per-peer budget: inputs ≤ 2× tick
     rate, chat ≤ 5/s, joins ≤ 3/min. Enforce with tick counters; kick on abuse;
     log the kick with peer id.
3. **Injection via user strings** (SEC.SANITIZE)
   - Names/chat: strip control chars, clamp length (names ≤ 16, chat ≤ 120),
     treat as opaque data at render time (no RichText BBCode passthrough).
4. **Secret leakage** (SEC.SECRETS-SCAN)
   - Run the secrets gate; treat any hit as blocker. Clients never hold keys —
     external services are proxied server-side.
5. **Transport** (SEC.TRANSPORT)
   - Dev LAN: plain ENet acceptable, must be flagged in the spec/report.
   - Production: DTLS (ENet) or wss (WebSocket) with real certs. Plaintext
     internet multiplayer is a blocker.
6. **Cheat surface audit** (advisory, documented in report)
   - Speedhacks: server clamps movement per tick → impossible.
   - Teleport: server validates displacement per tick (≤ max speed × dt).
   - Packet replay: input seq/tick monotonicity enforced — stale/duplicate seq
     dropped.
   - DoS: rate limits above + max_clients cap + join cooldown.

## Deliverables

1. Threat model section in the project report (each threat → mitigation → rule).
2. Security gate fully green (or skipped rules explained).
3. Written verdict: "exploitable paths: <list>" or "none found".
