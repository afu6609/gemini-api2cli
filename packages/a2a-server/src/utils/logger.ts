/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import winston from 'winston';
import Transport from 'winston-transport';

import { logBuffer, type LogLevel } from '../http/logBuffer.js';

/**
 * Custom winston transport that mirrors every log entry into the in-memory
 * LogBuffer so the admin console can replay recent logs and stream new ones.
 *
 * Deliberately minimal: it never blocks the logger (callback is invoked
 * synchronously), and never throws — a misbehaving buffer must not break
 * normal logging.
 */
class LogBufferTransport extends Transport {
  override log(info: winston.Logform.TransformableInfo, callback: () => void) {
    try {
      // Winston signals end-of-processing for observers via 'logged'.
      setImmediate(() => {
        this.emit('logged', info);
      });

      const rec: Record<string, unknown> = info;
      // Extract well-known winston fields into locals so typeof operates
      // on a variable (no-restricted-syntax forbids typeof on object
      // property access expressions).
      const rawLevel = rec['level'];
      const message = rec['message'];
      const timestamp = rec['timestamp'];
      const level = typeof rawLevel === 'string' ? rawLevel : 'info';
      const ts =
        typeof timestamp === 'string' && timestamp.length > 0
          ? Date.parse(timestamp) || Date.now()
          : Date.now();

      // Gather "extra" fields: everything except the well-known winston keys.
      const rest: Record<string, unknown> = {};
      for (const key of Object.keys(rec)) {
        if (key === 'level' || key === 'message' || key === 'timestamp') {
          continue;
        }
        // Winston uses Symbols for internal metadata; Object.keys skips them.
        rest[key] = rec[key];
      }

      logBuffer.push({
        ts,
        level: normalizeLevel(level),
        message: typeof message === 'string' ? message : safeStringify(message),
        rest: Object.keys(rest).length > 0 ? rest : undefined,
      });
    } catch {
      // Swallow — buffering must never break primary logging path.
    }
    callback();
  }
}

function normalizeLevel(level: string): LogLevel {
  switch (level) {
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
      return level;
    default:
      return 'info';
  }
}

function safeStringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Minimum level to emit. Env override lets operators raise to 'debug' so the
// admin console's "All (debug)" filter actually has content to show.
const DEFAULT_LOG_LEVEL = process.env['LOG_LEVEL']?.toLowerCase() || 'info';

const logger = winston.createLogger({
  level: DEFAULT_LOG_LEVEL,
  format: winston.format.combine(
    // First, add a timestamp to the log info object
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS A', // Custom timestamp format
    }),
    // Here we define the custom output format
    winston.format.printf((info) => {
      const { level, timestamp, message, ...rest } = info;
      return (
        `[${level.toUpperCase()}] ${timestamp} -- ${message}` +
        `${Object.keys(rest).length > 0 ? `\n${JSON.stringify(rest, null, 2)}` : ''}`
      ); // Only print ...rest if present
    }),
  ),
  transports: [
    new winston.transports.Console(),
    // Mirror into in-memory buffer for the /v1/logs admin endpoints.
    new LogBufferTransport(),
  ],
});

export { logger };
