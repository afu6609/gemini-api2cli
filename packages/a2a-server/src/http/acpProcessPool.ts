/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, rm, mkdir, copyFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from '@google/gemini-cli-core';
import * as path from 'node:path';
import * as acp from '@agentclientprotocol/sdk';
import type {
  SessionNotification,
  ContentBlock,
} from '@agentclientprotocol/sdk';
import { logger } from '../utils/logger.js';

// Re-export types for consumers
export type { ContentBlock, SessionNotification };

type AcpWorkerState = 'starting' | 'ready' | 'error' | 'dead';

export interface AcpSessionInfo {
  acpSessionId: string;
  credentialId: string;
  createdAt: number;
  lastActivity: number;
}

export interface AcpWorkerInfo {
  credentialId: string;
  state: AcpWorkerState;
  sessionCount: number;
  lastActivity: number;
}

interface PromptListener {
  onUpdate: (update: SessionNotification) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface AcpPoolDeps {
  cliEntryPath: string;
  spawnProcess: typeof spawn;
}

export interface AcpPoolSettings {
  idleTimeoutMs: number;
  mcpEnabled: boolean;
  extensionsEnabled: boolean;
  skillsEnabled: boolean;
  proxyUrl: string;
  maxWorkers: number;
  failoverWorkers: number;
}

const GEMINI_DIR_NAME = '.gemini';
// 0 means "never time out" — workers stay alive until explicit shutdown.
// The admin console exposes this as seconds; see promptApiConsole.ts.
const DEFAULT_IDLE_TIMEOUT_MS = 0;

function buildAcpChildEnv(
  isolatedHomeDir: string,
  settings: AcpPoolSettings,
): NodeJS.ProcessEnv {
  const env = { ...process.env };

  env['GEMINI_CLI_HOME'] = isolatedHomeDir;
  env['GOOGLE_GENAI_USE_GCA'] = 'true';
  env['HOME'] = isolatedHomeDir;
  env['USERPROFILE'] = isolatedHomeDir;

  if (!settings.mcpEnabled) {
    env['GEMINI_MCP_DISABLED'] = 'true';
  }
  if (!settings.extensionsEnabled) {
    env['GEMINI_EXTENSIONS_DISABLED'] = 'true';
  }
  if (!settings.skillsEnabled) {
    env['GEMINI_SKILLS_DISABLED'] = 'true';
  }
  if (settings.proxyUrl) {
    env['HTTP_PROXY'] = settings.proxyUrl;
    env['HTTPS_PROXY'] = settings.proxyUrl;
    env['http_proxy'] = settings.proxyUrl;
    env['https_proxy'] = settings.proxyUrl;
  }

  return env;
}

/**
 * A single long-lived CLI process running in ACP mode.
 * Can switch credentials at runtime via re-authentication.
 */
export class AcpWorker {
  credentialId: string;
  private child: ChildProcessWithoutNullStreams | undefined;
  private connection: acp.ClientSideConnection | undefined;
  private _state: AcpWorkerState = 'starting';
  private sessions = new Map<string, AcpSessionInfo>();
  private promptListeners = new Map<string, PromptListener>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimeoutMs: number;
  private _lastActivity = Date.now();
  private tempDir: string | undefined;
  private workspaceCwd: string | undefined;
  private defaultSessionId: string | undefined;
  private onDead: (() => void) | undefined;

  constructor(
    credentialId: string,
    idleTimeoutMs: number,
    onDead?: () => void,
  ) {
    this.credentialId = credentialId;
    // Use `??` so an explicit 0 ("never timeout") passes through unchanged.
    // `||` would coerce 0 to the default, silently overriding the operator's
    // choice to keep workers alive indefinitely.
    this.idleTimeoutMs = idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.onDead = onDead;
  }

  get state(): AcpWorkerState {
    return this._state;
  }
  get lastActivity(): number {
    return this._lastActivity;
  }
  get sessionCount(): number {
    return this.sessions.size;
  }

  getInfo(): AcpWorkerInfo {
    return {
      credentialId: this.credentialId,
      state: this._state,
      sessionCount: this.sessions.size,
      lastActivity: this._lastActivity,
    };
  }

  getSessions(): AcpSessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Start the CLI process in ACP mode, initialize and authenticate.
   */
  async start(
    deps: AcpPoolDeps,
    settings: AcpPoolSettings,
    credentialHomeDir: string,
  ): Promise<void> {
    // Create isolated temp directory for this worker
    this.tempDir = await mkdtemp(path.join(tmpdir(), 'gemini-acp-'));
    const homeDir = path.join(this.tempDir, 'home');
    const cwd = path.join(this.tempDir, 'workspace');
    const geminiDir = path.join(homeDir, GEMINI_DIR_NAME);
    await mkdir(geminiDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    this.workspaceCwd = cwd;

    // Copy credential files from source
    const credFiles = ['oauth_creds.json', 'gemini-credentials.json'];
    const sourceGeminiDir = path.join(credentialHomeDir, GEMINI_DIR_NAME);
    for (const file of credFiles) {
      const src = path.join(sourceGeminiDir, file);
      if (existsSync(src)) {
        await copyFile(src, path.join(geminiDir, file));
      }
    }

    const args = ['--no-warnings=DEP0040', deps.cliEntryPath, '--acp'];

    const env = buildAcpChildEnv(homeDir, settings);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    this.child = deps.spawnProcess(process.execPath, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as unknown as ChildProcessWithoutNullStreams;

    // Log stderr in real-time
    let stderrBuf = '';
    this.child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuf += text;
      logger.error(`[ACP][stderr] ${text.trim()}`);
    });

    // Detect crash
    this.child.on('exit', (code) => {
      if (this._state !== 'dead') {
        logger.error(
          `[ACP] Worker for credential ${this.credentialId} exited with code ${String(code)}`,
        );
        if (stderrBuf.trim()) {
          logger.error(`[ACP] stderr: ${stderrBuf.trim()}`);
        }
        this._state = 'dead';
        // Reject any pending prompts
        for (const [, listener] of this.promptListeners) {
          listener.onError(
            new Error(`ACP process exited unexpectedly (code ${String(code)})`),
          );
        }
        this.promptListeners.clear();
        this.onDead?.();
      }
    });

    // Create ACP connection
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const stdout = Readable.toWeb(
      this.child.stdout,
    ) as ReadableStream<Uint8Array>;
    const stdin = Writable.toWeb(
      this.child.stdin,
    ) as WritableStream<Uint8Array>;
    const stream = acp.ndJsonStream(stdin, stdout);

    this.connection = new acp.ClientSideConnection(
      () => ({
        sessionUpdate: async (params: SessionNotification) => {
          const listener = this.promptListeners.get(params.sessionId);
          if (listener) {
            listener.onUpdate(params);
          }
        },
        // Auto-approve all tool calls in API gateway mode
        requestPermission: async () => ({
          outcome: {
            outcome: 'selected' as const,
            optionId: 'allow_once',
          },
        }),
      }),
      stream,
    );

    try {
      await this.connection.initialize({
        clientVersion: '1.0.0',
        protocolVersion: acp.PROTOCOL_VERSION,
        capabilities: {},
      });

      await this.connection.authenticate({
        methodId: 'oauth-personal',
      });

      this._state = 'ready';
      this.resetIdleTimer();
      logger.info(`[ACP] Worker started for credential ${this.credentialId}`);
    } catch (err) {
      this._state = 'error';
      logger.error(
        `[ACP] Worker init failed for credential ${this.credentialId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.shutdown();
      throw err;
    }
  }

  /**
   * Create a new session in this worker.
   */
  async createSession(cwd?: string): Promise<string> {
    if (this._state !== 'ready' || !this.connection) {
      throw new Error('ACP worker not ready');
    }

    const sessionCwd = cwd || this.workspaceCwd || '/tmp';
    logger.info(`[ACP] Creating session with cwd: ${sessionCwd}`);
    let sessionId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const resp = await this.connection.newSession({
        cwd: sessionCwd,
        mcpServers: [],
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      sessionId = resp.sessionId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      logger.error(`[ACP] newSession error: ${msg}`);
      throw err instanceof Error ? err : new Error(msg);
    }

    this.sessions.set(sessionId, {
      acpSessionId: sessionId,
      credentialId: this.credentialId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });

    this.touchActivity();
    logger.info(
      `[ACP] Session ${sessionId} created on credential ${this.credentialId}`,
    );
    return sessionId;
  }

  /**
   * Get the default session, creating it on first call.
   * Subsequent calls reuse the same session (no re-initialization).
   */
  async getOrCreateDefaultSession(): Promise<string> {
    if (this.defaultSessionId && this.sessions.has(this.defaultSessionId)) {
      this.touchActivity();
      return this.defaultSessionId;
    }
    const sessionId = await this.createSession();
    this.defaultSessionId = sessionId;
    return sessionId;
  }

  /**
   * Send a prompt and stream back session updates.
   * Returns a promise that resolves when the prompt turn is complete.
   */
  async prompt(
    sessionId: string,
    contentBlocks: ContentBlock[],
    onUpdate: (update: SessionNotification) => void,
  ): Promise<acp.PromptResponse> {
    if (this._state !== 'ready' || !this.connection) {
      throw new Error('ACP worker not ready');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Cancel any pending prompt on the same session
    if (this.promptListeners.has(sessionId)) {
      try {
        await this.connection.cancel({ sessionId });
      } catch {
        // ignore cancel errors
      }
    }

    this.touchActivity();
    session.lastActivity = Date.now();

    return new Promise<acp.PromptResponse>((resolve, reject) => {
      this.promptListeners.set(sessionId, {
        onUpdate,
        onDone: () => {
          // Will be resolved by the prompt() return
        },
        onError: (err: Error) => {
          this.promptListeners.delete(sessionId);
          reject(err);
        },
      });

      this.connection!.prompt({
        sessionId,
        prompt: contentBlocks,
      })
        .then((response) => {
          this.promptListeners.delete(sessionId);
          this.touchActivity();
          resolve(response);
        })
        .catch((err: unknown) => {
          this.promptListeners.delete(sessionId);
          let msg: string;
          if (err instanceof Error) {
            reject(err);
            return;
          }
          if (typeof err === 'string') {
            msg = err;
          } else {
            try {
              msg = JSON.stringify(err);
            } catch {
              msg = String(err);
            }
          }
          reject(new Error(msg));
        });
    });
  }

  /**
   * Set the model for a session.
   */
  async setSessionModel(sessionId: string, modelId: string): Promise<void> {
    if (this._state !== 'ready' || !this.connection) {
      throw new Error('ACP worker not ready');
    }
    await this.connection.unstable_setSessionModel({ sessionId, modelId });
    this.touchActivity();
  }

  /**
   * Switch this worker to a different credential by copying new credential
   * files into the isolated home and re-authenticating.
   */
  async switchCredential(
    newCredentialId: string,
    newCredentialHomeDir: string,
  ): Promise<void> {
    if (this._state !== 'ready' || !this.connection || !this.tempDir) {
      throw new Error('ACP worker not ready for credential switch');
    }

    // Clear old credential files, then copy new ones
    const geminiDir = path.join(this.tempDir, 'home', GEMINI_DIR_NAME);
    const sourceGeminiDir = path.join(newCredentialHomeDir, GEMINI_DIR_NAME);
    const credFiles = ['oauth_creds.json', 'gemini-credentials.json'];
    for (const file of credFiles) {
      const target = path.join(geminiDir, file);
      try {
        await unlink(target);
      } catch {
        /* file may not exist */
      }
      const src = path.join(sourceGeminiDir, file);
      if (existsSync(src)) {
        await copyFile(src, target);
      }
    }

    // Re-authenticate with the new credentials
    await this.connection.authenticate({
      methodId: 'oauth-personal',
    });

    this.credentialId = newCredentialId;
    this.touchActivity();
    logger.info(`[ACP] Worker switched credential to ${newCredentialId}`);
  }

  /**
   * Cancel an ongoing prompt.
   */
  async cancelPrompt(sessionId: string): Promise<void> {
    if (this.connection && this._state === 'ready') {
      await this.connection.cancel({ sessionId });
    }
  }

  /**
   * Destroy a specific session.
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.promptListeners.delete(sessionId);
    if (this.sessions.size === 0) {
      this.resetIdleTimer();
    }
  }

  /**
   * Shut down this worker, kill the process.
   */
  async shutdown(): Promise<void> {
    this._state = 'dead';
    this.clearIdleTimer();

    // Reject pending prompts
    for (const [, listener] of this.promptListeners) {
      listener.onError(new Error('ACP worker shutting down'));
    }
    this.promptListeners.clear();
    this.sessions.clear();

    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
    this.connection = undefined;

    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      this.tempDir = undefined;
    }

    logger.info(`[ACP] Worker shut down for credential ${this.credentialId}`);
  }

  private touchActivity(): void {
    this._lastActivity = Date.now();
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (this.idleTimeoutMs > 0 && this._state === 'ready') {
      this.idleTimer = setTimeout(() => {
        logger.info(
          `[ACP] Worker idle timeout for credential ${this.credentialId}, shutting down`,
        );
        void this.shutdown().then(() => this.onDead?.());
      }, this.idleTimeoutMs);
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }
}

/**
 * Pool of ACP workers, one per credential.
 */
export class AcpProcessPool {
  private workers = new Map<string, AcpWorker>();
  private deps: AcpPoolDeps;

  constructor(deps: AcpPoolDeps) {
    this.deps = deps;
  }

  /**
   * Get or create a worker for the given credential.
   * When maxWorkers > 0 and the pool is full, evicts the least recently active worker.
   */
  async getOrCreate(
    credentialId: string,
    credentialHomeDir: string,
    settings: AcpPoolSettings,
  ): Promise<AcpWorker> {
    let worker = this.workers.get(credentialId);
    if (worker && worker.state === 'ready') {
      return worker;
    }

    // Clean up dead worker if exists
    if (worker && worker.state !== 'ready') {
      this.workers.delete(credentialId);
    }

    // At capacity: try to switch an existing idle worker's credential instead of cold-starting
    const max =
      settings.maxWorkers > 0
        ? settings.maxWorkers + (settings.failoverWorkers || 0)
        : 0;
    if (max > 0 && this.workers.size >= max) {
      // Find the least recently active idle worker to reuse
      let reuseKey: string | undefined;
      let reuseTime = Infinity;
      for (const [key, w] of this.workers) {
        if (
          w.state === 'ready' &&
          w.sessionCount === 0 &&
          w.lastActivity < reuseTime
        ) {
          reuseTime = w.lastActivity;
          reuseKey = key;
        }
      }
      // Only switch workers with no active sessions to avoid breaking in-flight requests

      if (reuseKey) {
        const reuseWorker = this.workers.get(reuseKey)!;
        try {
          logger.info(
            `[ACP] Pool at capacity (${max}), switching worker ${reuseKey} → ${credentialId}`,
          );
          await reuseWorker.switchCredential(credentialId, credentialHomeDir);
          // Re-key in the map
          this.workers.delete(reuseKey);
          this.workers.set(credentialId, reuseWorker);
          return reuseWorker;
        } catch (err) {
          logger.warn(
            `[ACP] Credential switch failed, falling back to evict+rebuild: ${err instanceof Error ? err.message : String(err)}`,
          );
          // Switch failed, evict and rebuild below
          this.workers.delete(reuseKey);
          void reuseWorker.shutdown();
        }
      } else {
        // No idle worker to switch — evict the least recently active one as last resort
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [key, w] of this.workers) {
          if (w.lastActivity < oldestTime) {
            oldestTime = w.lastActivity;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          logger.info(
            `[ACP] Pool at capacity (${max}), evicting worker ${oldestKey}`,
          );
          const evicted = this.workers.get(oldestKey);
          this.workers.delete(oldestKey);
          if (evicted) void evicted.shutdown();
        }
      }
    }

    worker = new AcpWorker(credentialId, settings.idleTimeoutMs, () => {
      // Use worker.credentialId (not the captured closure value)
      // because switchCredential may have changed it
      this.workers.delete(worker!.credentialId);
    });

    this.workers.set(credentialId, worker);

    try {
      await worker.start(this.deps, settings, credentialHomeDir);
    } catch (err) {
      this.workers.delete(credentialId);
      throw err;
    }

    return worker;
  }

  /**
   * Destroy a specific worker by credential ID.
   */
  async destroy(credentialId: string): Promise<void> {
    const worker = this.workers.get(credentialId);
    if (worker) {
      this.workers.delete(credentialId);
      await worker.shutdown();
    }
  }

  /**
   * Destroy all workers.
   */
  async destroyAll(): Promise<void> {
    const shutdowns = Array.from(this.workers.values()).map((w) =>
      w.shutdown(),
    );
    this.workers.clear();
    await Promise.all(shutdowns);
    logger.info('[ACP] All workers destroyed');
  }

  /**
   * Get status of all workers.
   */
  getStatus(): { workers: AcpWorkerInfo[] } {
    return {
      workers: Array.from(this.workers.values()).map((w) => w.getInfo()),
    };
  }

  /**
   * Get all sessions across all workers.
   */
  getAllSessions(): AcpSessionInfo[] {
    const sessions: AcpSessionInfo[] = [];
    for (const worker of this.workers.values()) {
      sessions.push(...worker.getSessions());
    }
    return sessions;
  }

  /**
   * Find the worker that owns a session.
   */
  findWorkerBySession(sessionId: string): AcpWorker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.getSessions().some((s) => s.acpSessionId === sessionId)) {
        return worker;
      }
    }
    return undefined;
  }

  /**
   * Speculative lookup: returns the worker for the given credential only if
   * it is already in 'ready' state. Never evicts, never spawns — callers use
   * this for opportunistic operations (e.g. credential prefetch) where a
   * cache miss must NOT impact other in-flight requests.
   */
  getReadyWorker(credentialId: string): AcpWorker | undefined {
    const worker = this.workers.get(credentialId);
    return worker && worker.state === 'ready' ? worker : undefined;
  }

  /**
   * Pre-warm a worker for the given credential so the first request avoids cold start.
   */
  async warmUp(
    credentialId: string,
    credentialHomeDir: string,
    settings: AcpPoolSettings,
  ): Promise<void> {
    try {
      await this.getOrCreate(credentialId, credentialHomeDir, settings);
      logger.info(`[ACP] Worker pre-warmed for credential ${credentialId}`);
    } catch (err) {
      logger.warn(
        `[ACP] Worker warm-up failed for credential ${credentialId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  get size(): number {
    return this.workers.size;
  }
}
