/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitize log entries before they are exposed via the admin console logs API.
 *
 * Rules:
 *   - Bearer tokens  → `Bearer ***XXXX` (keep first 4 chars for correlation)
 *   - Google OAuth access tokens (`ya29.…`) → `ya29.***XXXX`
 *   - Gemini API keys (`AIza…`) → `AIza***XXXX` (suffix)
 *   - OpenAI-style keys (`sk-…`) → `sk-***XXXX` (suffix)
 *   - User home paths on Windows / Unix → `<home>/…`
 *   - JSON-field redaction for access_token / refresh_token / id_token /
 *     client_secret / api_key / password / authorization
 *   - Message truncation beyond MAX_MSG_LEN characters (avoid leaking large
 *     request/response payloads in the UI)
 *
 * All transformations run once per log entry. Complexity is O(n) in message
 * length; regex patterns avoid backtracking on adversarial inputs.
 */

import type { LogEntry } from './logBuffer.js';

// Bearer tokens: accept the full Base64URL charset (+ / = _ - .) — JWTs and
// OAuth access tokens routinely contain these characters; the earlier
// narrower class silently leaked them through.
const BEARER_RE = /Bearer\s+([A-Za-z0-9_.\-+/=]+)/gi;
const YA29_RE = /\bya29\.[\w\-./+=]+/g;
const AIZA_RE = /\bAIza[\w-]{20,}\b/g;
const SK_RE = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const USER_PATH_WIN_RE = /[A-Za-z]:\\Users\\[^\\/\s"']+/g;
const USER_PATH_UNIX_RE = /\/(?:home|Users)\/[^/\s"']+/g;
// JWT-shaped triple (header.payload.signature). The first segment must
// start with `eyJ` (base64url of `{"`) — the canonical opening of a JSON
// header object — to avoid false positives on ordinary dotted identifiers
// like package names or reverse-DNS ids. Each part keeps the 8-char
// minimum to reduce noise.
const JWT_RE =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// PEM-encoded material (RSA/EC/PKCS8 private keys, certificates, etc.).
const PEM_RE = /-----BEGIN [A-Z0-9 ]+-----[\s\S]+?-----END [A-Z0-9 ]+-----/g;
// JSON field redaction. Covers snake_case and camelCase / kebab-case for
// common secret keys. The value side uses the canonical "JSON string with
// escapes" pattern — `(?:\\.|[^"\\])*` — so `"token":"abc\"def"` redacts
// the whole value instead of stopping at the escaped inner quote.
const TOKEN_FIELD_RE =
  /"(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|api[_-]?token|authorization|password|secret|private[_-]?key)"\s*:\s*"(?:\\.|[^"\\])*"/gi;
// URL / form / env-style: access_token=xxx, token=xxx, api_key=xxx, etc.
// Terminates at &, whitespace, quote, or semicolon.
const TOKEN_QUERY_RE =
  /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|api[_-]?token|authorization|token|password|secret)=([^&\s"';]+)/gi;

/** Keys that should never have their values reach the log panel verbatim. */
const REDACT_KEY_RE =
  /^(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|api[_-]?token|x[_-]?api[_-]?key|authorization|password|secret|private[_-]?key)$/i;

/** Maximum characters per message; longer messages are truncated with a marker. */
const MAX_MSG_LEN = 2000;

function tail(s: string, n = 4): string {
  return s.length <= n ? s : s.slice(-n);
}

function head(s: string, n = 4): string {
  return s.length <= n ? s : s.slice(0, n);
}

/**
 * Sanitize a free-form string. Safe to run on any log message.
 *
 * Order matters: PEM and JWT patterns run first because they can contain
 * dots/slashes that later rules might otherwise mangle. User-path rules
 * run after token rules so a path accidentally matching token chars isn't
 * redacted twice.
 */
export function sanitizeString(input: string): string {
  let out = input;

  // High-value, high-specificity patterns first.
  out = out.replace(PEM_RE, '<redacted PEM>');
  // Structured field redactions before token shape matchers, so that a
  // value like `access_token=ya29.xxx` is handled by TOKEN_QUERY_RE rather
  // than being picked up as a bare ya29 token (which would leak the field
  // name context).
  out = out.replace(TOKEN_FIELD_RE, (_, key: string) => `"${key}":"***"`);
  out = out.replace(
    TOKEN_QUERY_RE,
    (_, key: string, value: string) => `${key}=***${tail(value)}`,
  );

  // Shape-based token scrubbers.
  out = out.replace(
    BEARER_RE,
    (_, token: string) => `Bearer ***${head(token)}`,
  );
  out = out.replace(
    YA29_RE,
    (m) => `ya29.***${tail(m.replace(/^ya29\./, ''))}`,
  );
  out = out.replace(AIZA_RE, (m) => `AIza***${tail(m)}`);
  out = out.replace(SK_RE, (m) => `sk-***${tail(m)}`);
  out = out.replace(JWT_RE, (m) => `<jwt:***${tail(m)}>`);

  // Windows: C:\Users\<name>\... → <home>\...
  out = out.replace(USER_PATH_WIN_RE, (m) => {
    // Skip past "C:\Users\<name>" to the trailing slash (index 9 ≈ length of "C:\Users\")
    const nameStart = m.indexOf('\\', 2) + 1; // past drive
    const after = m.indexOf('\\', nameStart + 1);
    return after > 0 ? `<home>${m.slice(after)}` : '<home>';
  });
  // Unix: /home/<name>/... or /Users/<name>/... → <home>/...
  out = out.replace(USER_PATH_UNIX_RE, (m) => {
    // m starts with "/home/" (6) or "/Users/" (7); find the slash after the username
    const firstSlashAfterPrefix = m.indexOf(
      '/',
      m.startsWith('/Users/') ? 7 : 6,
    );
    return firstSlashAfterPrefix > 0
      ? `<home>${m.slice(firstSlashAfterPrefix)}`
      : '<home>';
  });

  if (out.length > MAX_MSG_LEN) {
    const dropped = out.length - MAX_MSG_LEN;
    out = `${out.slice(0, MAX_MSG_LEN)}…[truncated ${dropped} chars]`;
  }

  return out;
}

/**
 * Recursively sanitize an arbitrary value — strings via {@link sanitizeString},
 * objects by copying with redacted keys replaced, arrays element-wise.
 *
 * Non-serializable values (functions, symbols, circular references) are
 * converted to safe placeholders so the buffer never breaks JSON.stringify.
 *
 * Circular detection uses a *path stack* (add on enter, remove on leave), not
 * a global visited set, so shared-but-not-circular subtrees like
 * `{a: shared, b: shared}` are sanitized twice correctly instead of being
 * replaced with "[circular]" on the second reference.
 */
export function sanitizeValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') {
    return `[${typeof value}]`;
  }
  if (typeof value !== 'object') return String(value);

  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((v) => sanitizeValue(v, seen));
    }

    // value is narrowed to `object`; Object.entries accepts any non-null object.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACT_KEY_RE.test(k)) {
        out[k] =
          typeof v === 'string' && v.length > 0 ? `***${tail(v)}` : '***';
      } else {
        out[k] = sanitizeValue(v, seen);
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Sanitize a record-like "rest" object attached to a log entry. Keeps the
 * return type precise (Record<string, unknown>) without unsafe assertions.
 */
function sanitizeRest(rest: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (REDACT_KEY_RE.test(k)) {
      out[k] = typeof v === 'string' && v.length > 0 ? `***${tail(v)}` : '***';
    } else {
      out[k] = sanitizeValue(v, seen);
    }
  }
  return out;
}

/**
 * Main entry point used by LogBuffer.push. Returns a new entry with
 * message + rest scrubbed; level / ts are untouched.
 */
export function sanitizeLogEntry(
  entry: Omit<LogEntry, 'id'>,
): Omit<LogEntry, 'id'> {
  return {
    ts: entry.ts,
    level: entry.level,
    message: sanitizeString(entry.message),
    rest:
      entry.rest && Object.keys(entry.rest).length > 0
        ? sanitizeRest(entry.rest)
        : undefined,
  };
}
