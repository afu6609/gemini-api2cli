/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-memory ring buffer for recent log entries, plus a pub/sub channel that
 * lets SSE clients stream new entries as they arrive.
 *
 * Design notes:
 *   - Capacity bounded (default 500) so the buffer cannot grow unbounded
 *     even under log storms. When the cap is exceeded, the oldest entry
 *     is dropped in O(1) via queue rotation.
 *   - Every entry is sanitized BEFORE being stored, so both historical
 *     snapshots and live SSE pushes return scrubbed data.
 *   - `id` is a monotonically increasing sequence so clients can resume
 *     from where they left off (`?afterId=`) without duplicate deliveries.
 */

import { EventEmitter } from 'node:events';
import { sanitizeLogEntry } from './logSanitize.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  /** Monotonically increasing sequence; starts at 1. */
  id: number;
  /** Milliseconds since epoch. */
  ts: number;
  level: LogLevel;
  message: string;
  /** Any extra fields winston attached to the log call. */
  rest?: Record<string, unknown>;
}

export interface LogQueryOptions {
  /** Minimum level to include (inclusive). */
  level?: LogLevel;
  /** Case-insensitive substring match against the message. */
  q?: string;
  /** Maximum entries to return (capped at buffer capacity). */
  limit?: number;
  /** Return only entries with id > afterId (incremental fetch). */
  afterId?: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function isValidLevel(v: unknown): v is LogLevel {
  return v === 'error' || v === 'warn' || v === 'info' || v === 'debug';
}

export class LogBuffer extends EventEmitter {
  private readonly entries: LogEntry[] = [];
  private seq = 0;
  private readonly capacity: number;

  constructor(capacity = 500) {
    super();
    this.capacity = Math.max(1, capacity | 0);
    // SSE connections each subscribe; bump the default 10-listener ceiling.
    this.setMaxListeners(200);
  }

  /**
   * Append a new entry. Values are sanitized here so downstream consumers
   * (HTTP handlers, SSE clients) never need to scrub again.
   */
  push(raw: Omit<LogEntry, 'id'>): void {
    const sanitized = sanitizeLogEntry(raw);
    const entry: LogEntry = { id: ++this.seq, ...sanitized };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    this.emit('entry', entry);
  }

  /**
   * Return a filtered snapshot of currently buffered entries, ordered by
   * ascending id (oldest first). Returned array is a copy — the buffer
   * itself is never exposed.
   */
  snapshot(opts: LogQueryOptions = {}): LogEntry[] {
    const minLevel =
      opts.level && isValidLevel(opts.level) ? LEVEL_ORDER[opts.level] : 0;
    const needle =
      typeof opts.q === 'string' && opts.q.length > 0
        ? opts.q.toLowerCase()
        : undefined;
    const afterId =
      typeof opts.afterId === 'number' && Number.isFinite(opts.afterId)
        ? opts.afterId
        : 0;
    const limit =
      typeof opts.limit === 'number' && opts.limit > 0
        ? Math.min(this.capacity, opts.limit | 0)
        : this.capacity;

    const result: LogEntry[] = [];
    for (const entry of this.entries) {
      if (entry.id <= afterId) continue;
      if (LEVEL_ORDER[entry.level] < minLevel) continue;
      if (needle && !entry.message.toLowerCase().includes(needle)) continue;
      result.push(entry);
    }
    // When more results exist than limit allows, keep the most recent.
    return result.length > limit ? result.slice(result.length - limit) : result;
  }

  /** Remove all entries. Sequence counter is NOT reset so SSE clients resuming
   * via afterId won't accidentally receive re-used ids. */
  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }

  get maxSize(): number {
    return this.capacity;
  }
}

// Module-level singleton. Capacity configurable via env var for ops tuning.
function resolveCapacity(): number {
  const raw = process.env['LOG_BUFFER_SIZE'];
  if (!raw) return 500;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export const logBuffer = new LogBuffer(resolveCapacity());
