/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import { EventEmitter } from 'node:events';
import type {
  SpawnOptions,
  ChildProcessWithoutNullStreams,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPromptApiRouter,
  PROMPT_API_OPENAI_COMPLETIONS_ROUTE,
  PROMPT_API_CONSOLE_ROUTE,
  PROMPT_API_CREDENTIAL_ROUTE,
  PROMPT_API_CREDENTIALS_ROUTE,
  PROMPT_API_CREDENTIAL_LOGIN_ROUTE,
  PROMPT_API_CREDENTIAL_LOGIN_COMPLETE_ROUTE,
  PROMPT_API_CREDENTIAL_LOGIN_STATUS_ROUTE,
  PROMPT_API_CURRENT_CREDENTIAL_ROUTE,
  PROMPT_API_CURRENT_MODEL_ROUTE,
  PROMPT_API_HEALTH_ROUTE,
  PROMPT_API_MODELS_ROUTE,
  PROMPT_API_QUOTA_ROUTE,
  PROMPT_API_QUOTAS_ROUTE,
  type PromptApiDependencies,
} from './promptApi.js';
import { PromptCredentialStore } from './promptCredentialStore.js';
import { CodeAssistServer } from '@google/gemini-cli-core';

// Set a fixed auth token for tests so the auth middleware passes.
const TEST_TOKEN = 'test-token-for-tests';
process.env['GEMINI_PROMPT_API_TOKEN'] = TEST_TOKEN;

type MockChildProcess = ChildProcessWithoutNullStreams &
  EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    emitClose: (exitCode: number | null) => void;
  };

function createMockChildProcess(): MockChildProcess {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let closed = false;

  const child = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    stdio: [stdin, stdout, stderr],
    pid: 1234,
    spawnfile: process.execPath,
    spawnargs: [],
    connected: false,
    killed: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    [Symbol.dispose]: vi.fn(),
    kill: vi.fn(() => {
      if (closed) {
        return true;
      }
      closed = true;
      child.killed = true;
      stdout.end();
      stderr.end();
      emitter.emit('close', null);
      return true;
    }),
    disconnect: vi.fn(),
    send: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
    emitClose: (exitCode: number | null) => {
      if (closed) {
        return;
      }
      closed = true;
      child.exitCode = exitCode;
      stdout.end();
      stderr.end();
      emitter.emit('close', exitCode);
    },
  });

  return child as unknown as MockChildProcess;
}

type MockSpawnOptions = Pick<SpawnOptions, 'cwd' | 'env'>;

function createTestApp(overrides: PromptApiDependencies): express.Express {
  const app = express();
  app.use(express.json());
  // Inject the test auth token into every request so auth middleware passes.
  app.use((req, _res, next) => {
    if (!req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${TEST_TOKEN}`;
    }
    next();
  });
  app.use(createPromptApiRouter(overrides));
  return app;
}

describe('Prompt API routes', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('returns aggregated assistant text for JSON chat requests', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const credentialStoreRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-credentials-'),
    );
    tempDirs.push(credentialStoreRoot);
    const sourceGeminiCliHome = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-home-'),
    );
    tempDirs.push(sourceGeminiCliHome);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');
    const sourceGeminiDir = path.join(sourceGeminiCliHome, '.gemini');
    mkdirSync(sourceGeminiDir, { recursive: true });
    writeFileSync(
      path.join(sourceGeminiDir, 'oauth_creds.json'),
      JSON.stringify({ access_token: 'test-token' }),
      { encoding: 'utf8', flag: 'w' },
    );
    writeFileSync(
      path.join(sourceGeminiDir, 'gemini-credentials.json'),
      'encrypted-credentials',
      { encoding: 'utf8', flag: 'w' },
    );

    let capturedPromptOverridePath: string | undefined;
    let capturedSystemPrompt: string | undefined;
    let capturedCwd: string | undefined;
    let capturedGeminiCliHome: string | undefined;
    let capturedOauthCreds: string | undefined;
    let capturedEncryptedCredentials: string | undefined;
    let capturedGoogleAuthEnv: string | undefined;
    let capturedArgs: string[] = [];

    const spawnProcess = ((
      command: string,
      argsOrOptions?: readonly string[] | MockSpawnOptions,
      maybeOptions?: MockSpawnOptions,
    ) => {
      expect(command).toBe(process.execPath);
      let args: readonly string[] = [];
      let options: MockSpawnOptions | undefined;
      if (Array.isArray(argsOrOptions)) {
        args = argsOrOptions;
        options = maybeOptions;
      } else {
        options = argsOrOptions as MockSpawnOptions | undefined;
      }
      capturedArgs = [...args];
      const rawCwd = options?.cwd;
      capturedCwd = typeof rawCwd === 'string' ? rawCwd : rawCwd?.toString();

      const env = options?.env;
      capturedPromptOverridePath = env?.['GEMINI_SYSTEM_MD'];
      capturedGeminiCliHome = env?.['GEMINI_CLI_HOME'];
      capturedGoogleAuthEnv = env?.['GOOGLE_GENAI_USE_GCA'];
      capturedSystemPrompt = capturedPromptOverridePath
        ? readFileSync(capturedPromptOverridePath, 'utf8')
        : undefined;
      if (capturedGeminiCliHome) {
        const isolatedGeminiDir = path.join(capturedGeminiCliHome, '.gemini');
        const isolatedOauthCreds = path.join(
          isolatedGeminiDir,
          'oauth_creds.json',
        );
        const isolatedEncryptedCreds = path.join(
          isolatedGeminiDir,
          'gemini-credentials.json',
        );
        capturedOauthCreds = existsSync(isolatedOauthCreds)
          ? readFileSync(isolatedOauthCreds, 'utf8')
          : undefined;
        capturedEncryptedCredentials = existsSync(isolatedEncryptedCreds)
          ? readFileSync(isolatedEncryptedCreds, 'utf8')
          : undefined;
      }

      const child = createMockChildProcess();
      setTimeout(() => {
        child.stdout.write(
          `${JSON.stringify({
            type: 'init',
            timestamp: '2026-03-23T00:00:00.000Z',
          })}\n`,
        );
        child.stdout.write(
          `${JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: 'Hello ',
            delta: true,
          })}\n`,
        );
        child.stdout.write(
          `${JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: 'world',
            delta: true,
          })}\n`,
        );
        child.emitClose(0);
      }, 0);
      return child;
    }) as unknown as PromptApiDependencies['spawnProcess'];

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      spawnProcess,
      sourceGeminiCliHome,
      credentialStoreRoot,
      timeoutMs: 5000,
    });

    process.env['GEMINI_SYSTEM_MD'] = 'C:\\should-not-pass.md';
    const response = await request(app)
      .post(PROMPT_API_OPENAI_COMPLETIONS_ROUTE)
      .send({
        messages: [
          { role: 'system', content: 'You are a very focused assistant.' },
          { role: 'user', content: 'Say hello' },
        ],
        model: 'gemini-2.5-pro',
      });
    delete process.env['GEMINI_SYSTEM_MD'];

    expect(response.status).toBe(200);
    expect(response.body.object).toBe('chat.completion');
    expect(response.body.choices[0].message.content).toBe('Hello world');
    expect(response.body.choices[0].finish_reason).toBe('stop');
    expect(capturedSystemPrompt).toBe('You are a very focused assistant.');
    expect(capturedCwd).toBeDefined();
    expect(capturedCwd).not.toBe(workspaceRoot);
    expect(capturedGeminiCliHome).toBeDefined();
    expect(capturedGeminiCliHome).not.toBe(sourceGeminiCliHome);
    expect(capturedOauthCreds).toContain('test-token');
    expect(capturedEncryptedCredentials).toBe('encrypted-credentials');
    expect(capturedGoogleAuthEnv).toBe('true');
    expect(capturedArgs).toEqual(
      expect.arrayContaining([
        '--prompt',
        'Say hello',
        '--output-format',
        'stream-json',
        '--model',
        'gemini-2.5-pro',
      ]),
    );
    expect(capturedPromptOverridePath).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(existsSync(capturedPromptOverridePath!)).toBe(false);
    expect(existsSync(capturedGeminiCliHome!)).toBe(false);
  });

  it('lists and updates the default prompt API model', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    let capturedArgs: string[] = [];
    const spawnProcess = ((
      _command?: string,
      argsOrOptions?: readonly string[] | MockSpawnOptions,
      _maybeOptions?: MockSpawnOptions,
    ) => {
      if (Array.isArray(argsOrOptions)) {
        capturedArgs = [...argsOrOptions];
      }

      const child = createMockChildProcess();
      setTimeout(() => {
        child.stdout.write(
          `${JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: 'ok',
            delta: true,
          })}\n`,
        );
        child.emitClose(0);
      }, 0);
      return child;
    }) as unknown as PromptApiDependencies['spawnProcess'];

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      spawnProcess,
      timeoutMs: 5000,
    });

    const healthResponse = await request(app).get(PROMPT_API_HEALTH_ROUTE);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.sessionPolicy).toBe('per-request');

    const modelsResponse = await request(app).get(PROMPT_API_MODELS_ROUTE);
    expect(modelsResponse.status).toBe(200);
    expect(modelsResponse.body.currentModel).toMatchObject({
      id: 'auto-gemini-2.5',
      label: 'Auto (Gemini 2.5)',
      known: true,
    });
    expect(modelsResponse.body.sessionPolicy).toBe('per-request');
    expect(Array.isArray(modelsResponse.body.models)).toBe(true);
    expect(modelsResponse.body.models.length).toBeGreaterThan(0);
    expect(Array.isArray(modelsResponse.body.aliases)).toBe(true);
    expect(modelsResponse.body.aliases.length).toBeGreaterThan(0);

    const updateResponse = await request(app)
      .put(PROMPT_API_CURRENT_MODEL_ROUTE)
      .send({ model: 'gemini-2.5-flash' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.currentModel).toMatchObject({
      id: 'gemini-2.5-flash',
      label: 'gemini-2.5-flash',
      known: true,
    });

    const currentResponse = await request(app).get(
      PROMPT_API_CURRENT_MODEL_ROUTE,
    );
    expect(currentResponse.status).toBe(200);
    expect(currentResponse.body.currentModel).toMatchObject({
      id: 'gemini-2.5-flash',
      label: 'gemini-2.5-flash',
      known: true,
    });

    const chatResponse = await request(app)
      .post(PROMPT_API_OPENAI_COMPLETIONS_ROUTE)
      .send({
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'hello' },
        ],
      });

    expect(chatResponse.status).toBe(200);
    expect(capturedArgs).toEqual(
      expect.arrayContaining(['--model', 'gemini-2.5-flash']),
    );
  });

  it('logs in and switches credentials without requiring chat requests to specify them', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const credentialStoreRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-credentials-'),
    );
    tempDirs.push(credentialStoreRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    let copiedOauthCreds: string | undefined;
    const spawnProcess = ((
      _command?: string,
      argsOrOptions?: readonly string[] | MockSpawnOptions,
      _maybeOptions?: MockSpawnOptions,
    ) => {
      const options = Array.isArray(argsOrOptions)
        ? _maybeOptions
        : (argsOrOptions as MockSpawnOptions | undefined);
      const env = options?.env;
      const child = createMockChildProcess();

      const isolatedHome = env?.['GEMINI_CLI_HOME'];
      if (isolatedHome) {
        const oauthCredsPath = path.join(
          isolatedHome,
          '.gemini',
          'oauth_creds.json',
        );
        copiedOauthCreds = existsSync(oauthCredsPath)
          ? readFileSync(oauthCredsPath, 'utf8')
          : undefined;
      }

      setTimeout(() => {
        child.stdout.write(
          `${JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: 'ok',
            delta: true,
          })}\n`,
        );
        child.emitClose(0);
      }, 0);
      return child;
    }) as unknown as PromptApiDependencies['spawnProcess'];

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      credentialStoreRoot,
      spawnProcess,
      timeoutMs: 5000,
    });

    vi.spyOn(OAuth2Client.prototype, 'getToken').mockImplementation(
      (async () => ({
        tokens: {
          access_token: 'credential-token',
          refresh_token: 'credential-refresh-token',
          token_type: 'Bearer',
        },
        res: undefined,
      })) as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: 'tester@example.com' }),
      }),
    );

    const loginResponse = await request(app)
      .post(PROMPT_API_CREDENTIAL_LOGIN_ROUTE)
      .send({ label: 'Primary Google' });
    expect(loginResponse.status).toBe(202);
    expect(loginResponse.body.credential).toMatchObject({
      label: 'Primary Google',
      isCurrent: false,
    });
    expect(loginResponse.body.login.status).toBe('awaiting_callback');
    expect(loginResponse.body.login.authUrl).toContain('https://');
    expect(loginResponse.body.login.redirectUri).toContain('http://127.0.0.1:');

    const loginStatusResponse = await request(app).get(
      PROMPT_API_CREDENTIAL_LOGIN_STATUS_ROUTE.replace(
        ':loginId',
        loginResponse.body.login.loginId as string,
      ),
    );
    expect(loginStatusResponse.status).toBe(200);
    expect(loginStatusResponse.body.login.status).toBe('awaiting_callback');

    const authUrl = new URL(loginResponse.body.login.authUrl as string);
    const state = authUrl.searchParams.get('state');
    const callbackUrl = `${loginResponse.body.login.redirectUri}?code=test-auth-code&state=${state}`;

    const completeResponse = await request(app)
      .post(
        PROMPT_API_CREDENTIAL_LOGIN_COMPLETE_ROUTE.replace(
          ':loginId',
          loginResponse.body.login.loginId as string,
        ),
      )
      .send({ callbackUrl });
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.login.status).toBe('succeeded');

    const credentialsResponse = await request(app).get(
      PROMPT_API_CREDENTIALS_ROUTE,
    );
    expect(credentialsResponse.status).toBe(200);
    expect(credentialsResponse.body.credentials).toHaveLength(1);
    expect(credentialsResponse.body.credentials[0]).toMatchObject({
      email: 'tester@example.com',
      isCurrent: true,
    });
    const credentialId = credentialsResponse.body.credentials[0].id as string;

    const currentCredentialResponse = await request(app).get(
      PROMPT_API_CURRENT_CREDENTIAL_ROUTE,
    );
    expect(currentCredentialResponse.status).toBe(200);
    expect(currentCredentialResponse.body.currentCredential).toMatchObject({
      id: credentialId,
      email: 'tester@example.com',
      isCurrent: true,
    });

    const switchResponse = await request(app)
      .put(PROMPT_API_CURRENT_CREDENTIAL_ROUTE)
      .send({ credentialId });
    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.currentCredential.id).toBe(credentialId);

    const chatResponse = await request(app)
      .post(PROMPT_API_OPENAI_COMPLETIONS_ROUTE)
      .send({
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'hello' },
        ],
      });
    expect(chatResponse.status).toBe(200);
    expect(copiedOauthCreds).toContain('credential-token');
  });

  it('returns quota data for all credentials or a specific credential', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const credentialStoreRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-credentials-'),
    );
    tempDirs.push(credentialStoreRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    const credentialStore = new PromptCredentialStore(credentialStoreRoot);
    const primaryCredential = await credentialStore.createCredential(
      'Primary Google',
      'cred-primary',
    );
    const primaryGeminiDir = path.join(
      credentialStore.getCredentialHomeDir(primaryCredential.id),
      '.gemini',
    );
    mkdirSync(primaryGeminiDir, { recursive: true });
    writeFileSync(
      path.join(primaryGeminiDir, 'oauth_creds.json'),
      JSON.stringify({
        access_token: 'quota-token',
        refresh_token: 'quota-refresh-token',
        token_type: 'Bearer',
      }),
    );
    writeFileSync(
      path.join(primaryGeminiDir, 'google_accounts.json'),
      JSON.stringify({ active: 'quota@example.com', old: [] }),
    );
    await credentialStore.markCredentialLoggedIn(primaryCredential.id);
    await credentialStore.setCurrentCredential(primaryCredential.id);

    await credentialStore.createCredential(
      'Secondary Google',
      'cred-secondary',
    );

    vi.spyOn(CodeAssistServer.prototype, 'loadCodeAssist').mockResolvedValue({
      currentTier: { id: 'standard-tier', name: 'Standard' },
      cloudaicompanionProject: 'test-project',
      paidTier: {
        id: 'paid-tier',
        name: 'Paid',
        availableCredits: [
          { creditType: 'GOOGLE_ONE_AI', creditAmount: '321' },
        ],
      },
    });
    vi.spyOn(CodeAssistServer.prototype, 'retrieveUserQuota').mockResolvedValue(
      {
        buckets: [
          {
            modelId: 'gemini-2.5-pro',
            remainingAmount: '75',
            remainingFraction: 0.75,
            resetTime: '2026-03-25T00:00:00.000Z',
            tokenType: 'TOKENS',
          },
        ],
      },
    );

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      credentialStoreRoot,
      timeoutMs: 5000,
    });

    const allQuotasResponse = await request(app).get(PROMPT_API_QUOTAS_ROUTE);
    expect(allQuotasResponse.status).toBe(200);
    expect(allQuotasResponse.body.currentCredentialId).toBe('cred-primary');
    expect(allQuotasResponse.body.quotas).toHaveLength(2);
    const primaryQuota = allQuotasResponse.body.quotas.find(
      (quota: { credential?: { id?: string } }) =>
        quota.credential?.id === 'cred-primary',
    );
    const secondaryQuota = allQuotasResponse.body.quotas.find(
      (quota: { credential?: { id?: string } }) =>
        quota.credential?.id === 'cred-secondary',
    );
    expect(primaryQuota).toBeDefined();
    expect(secondaryQuota).toBeDefined();
    expect(primaryQuota).toMatchObject({
      status: 'ok',
      projectId: 'test-project',
      userTier: 'paid-tier',
      userTierName: 'Paid',
      creditBalance: 321,
    });
    expect(primaryQuota!.quotaSummary).toMatchObject({
      totals: {
        remaining: 75,
        limit: 100,
        resetTime: '2026-03-25T00:00:00.000Z',
      },
    });
    expect(secondaryQuota).toMatchObject({
      credential: {
        id: 'cred-secondary',
      },
      status: 'not_logged_in',
    });

    const singleQuotaResponse = await request(app).get(
      PROMPT_API_QUOTA_ROUTE.replace(':credentialId', 'cred-primary'),
    );
    expect(singleQuotaResponse.status).toBe(200);
    expect(singleQuotaResponse.body).toMatchObject({
      status: 'ok',
      credential: {
        id: 'cred-primary',
        isCurrent: true,
      },
      projectId: 'test-project',
      userTier: 'paid-tier',
      creditBalance: 321,
    });
    expect(singleQuotaResponse.body.quota.buckets).toHaveLength(1);
  });

  it('keeps quota totals nullable when only remainingFraction is returned', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const credentialStoreRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-credentials-'),
    );
    tempDirs.push(credentialStoreRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    const credentialStore = new PromptCredentialStore(credentialStoreRoot);
    const credential = await credentialStore.createCredential(
      'Fraction Only',
      'cred-fraction-only',
    );
    const geminiDir = path.join(
      credentialStore.getCredentialHomeDir(credential.id),
      '.gemini',
    );
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      path.join(geminiDir, 'oauth_creds.json'),
      JSON.stringify({
        access_token: 'fraction-token',
        refresh_token: 'fraction-refresh-token',
        token_type: 'Bearer',
      }),
    );
    await credentialStore.markCredentialLoggedIn(credential.id);
    await credentialStore.setCurrentCredential(credential.id);

    vi.spyOn(CodeAssistServer.prototype, 'loadCodeAssist').mockResolvedValue({
      currentTier: { id: 'google-one-ai-pro', name: 'Google One AI Pro' },
      cloudaicompanionProject: 'fraction-project',
    });
    vi.spyOn(CodeAssistServer.prototype, 'retrieveUserQuota').mockResolvedValue(
      {
        buckets: [
          {
            modelId: 'gemini-2.5-pro',
            remainingFraction: 1,
            resetTime: '2026-03-25T08:48:48.000Z',
            tokenType: 'TOKENS',
          },
          {
            modelId: 'gemini-2.5-flash',
            remainingFraction: 1,
            resetTime: '2026-03-25T08:48:48.000Z',
            tokenType: 'TOKENS',
          },
        ],
      },
    );

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      credentialStoreRoot,
      timeoutMs: 5000,
    });

    const response = await request(app).get(
      PROMPT_API_QUOTA_ROUTE.replace(':credentialId', credential.id),
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.quotaSummary.totals).toMatchObject({
      remaining: null,
      limit: null,
      minRemainingFractionPercent: 100,
      maxRemainingFractionPercent: 100,
      allModelsFull: true,
      modelCount: 2,
      resetTime: '2026-03-25T08:48:48.000Z',
    });
    expect(response.body.quotaSummary.models).toHaveLength(2);
  });

  it('serves the management console and deletes credentials through the API', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const credentialStoreRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-credentials-'),
    );
    tempDirs.push(credentialStoreRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    const credentialStore = new PromptCredentialStore(credentialStoreRoot);
    const credential = await credentialStore.createCredential(
      'Delete Me',
      'cred-delete',
    );
    await credentialStore.setCurrentCredential(credential.id);

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      credentialStoreRoot,
      timeoutMs: 5000,
    });

    const consoleResponse = await request(app).get(PROMPT_API_CONSOLE_ROUTE);
    expect(consoleResponse.status).toBe(200);
    expect(consoleResponse.headers['content-type']).toContain('text/html');
    expect(consoleResponse.text).toContain('Gemini');
    expect(consoleResponse.text).toContain('/v1/openai/chat/completions');

    const deleteOneResponse = await request(app).delete(
      PROMPT_API_CREDENTIAL_ROUTE.replace(':credentialId', credential.id),
    );
    expect(deleteOneResponse.status).toBe(200);
    expect(deleteOneResponse.body.deletedCredentialId).toBe('cred-delete');

    const credentialsAfterDelete = await request(app).get(
      PROMPT_API_CREDENTIALS_ROUTE,
    );
    expect(credentialsAfterDelete.status).toBe(200);
    expect(credentialsAfterDelete.body.credentials).toHaveLength(0);

    await credentialStore.createCredential('Delete All', 'cred-delete-all');
    await credentialStore.setCurrentCredential('cred-delete-all');

    const deleteAllResponse = await request(app).delete(
      PROMPT_API_CREDENTIALS_ROUTE,
    );
    expect(deleteAllResponse.status).toBe(200);
    expect(deleteAllResponse.body.currentCredentialId).toBeNull();
    expect(deleteAllResponse.body.credentials).toHaveLength(0);
  });

  it('streams SSE output via OpenAI-compatible route and reports errors', async () => {
    const workspaceRoot = mkdtempSync(
      path.join(tmpdir(), 'gemini-prompt-api-workspace-'),
    );
    tempDirs.push(workspaceRoot);
    const fakeCliEntry = path.join(workspaceRoot, 'fake-cli.js');
    writeFileSync(fakeCliEntry, '// fake cli entry\n');

    const spawnProcess = ((
      _command?: string,
      _argsOrOptions?: readonly string[] | MockSpawnOptions,
      _maybeOptions?: MockSpawnOptions,
    ) => {
      const child = createMockChildProcess();
      setTimeout(() => {
        child.stdout.write(
          `${JSON.stringify({
            type: 'init',
            timestamp: '2026-03-23T00:00:00.000Z',
            session_id: 'test-session',
          })}\n`,
        );
        child.stdout.write(
          `${JSON.stringify({
            type: 'message',
            role: 'assistant',
            content: 'Partial answer',
            delta: true,
          })}\n`,
        );
        child.stderr.write('Authentication failed');
        child.emitClose(1);
      }, 0);
      return child;
    }) as unknown as PromptApiDependencies['spawnProcess'];

    const app = createTestApp({
      workspaceRoot,
      cliEntryPath: fakeCliEntry,
      spawnProcess,
      timeoutMs: 5000,
    });

    const response = await request(app)
      .post(PROMPT_API_OPENAI_COMPLETIONS_ROUTE)
      .send({
        messages: [
          { role: 'system', content: 'You are a streaming assistant.' },
          { role: 'user', content: 'Say hello' },
        ],
        stream: true,
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const lines = response.text
      .trim()
      .split('\n')
      .filter((l: string) => l.startsWith('data: ') && l !== 'data: [DONE]');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // First data line should contain the partial answer chunk
    const firstChunk = JSON.parse(lines[0].replace('data: ', ''));
    expect(firstChunk.object).toBe('chat.completion.chunk');
    expect(firstChunk.choices[0].delta.content).toBe('Partial answer');

    // Last line should contain the error
    const lastChunk = JSON.parse(lines[lines.length - 1].replace('data: ', ''));
    expect(lastChunk.choices[0].delta.content).toContain('Error');
  });
});
