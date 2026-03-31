/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from '@google/gemini-cli-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import {
  CodeAssistServer,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  getG1CreditBalance,
  getDisplayString,
  setupUser,
  type BucketInfo,
} from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';
import {
  PromptCredentialStore,
  type PromptApiCredentialRecord,
} from './promptCredentialStore.js';
import { getPromptApiConsoleHtml } from './promptApiConsole.js';
import {
  promptApiAuthMiddleware,
  getPromptApiToken,
  setPromptApiToken,
  isOpenApiEnabled,
  setOpenApiEnabled,
} from './promptApiAuth.js';
import type { FormatAdapter } from './adapters/types.js';
import { geminiAdapter } from './adapters/geminiAdapter.js';
import { openaiAdapter } from './adapters/openaiAdapter.js';
import {
  AcpProcessPool,
  type ContentBlock,
  type SessionNotification,
} from './acpProcessPool.js';

export const PROMPT_API_GEMINI_GENERATE_ROUTE = '/v1/gemini/generateContent';
export const PROMPT_API_GEMINI_STREAM_ROUTE =
  '/v1/gemini/streamGenerateContent';
export const PROMPT_API_OPENAI_COMPLETIONS_ROUTE =
  '/v1/openai/chat/completions';
export const PROMPT_API_HEALTH_ROUTE = '/v1/health';
export const PROMPT_API_MODELS_ROUTE = '/v1/models';
export const PROMPT_API_CURRENT_MODEL_ROUTE = '/v1/models/current';
export const PROMPT_API_CONSOLE_ROUTE = '/manage';
export const PROMPT_API_CREDENTIALS_ROUTE = '/v1/credentials';
export const PROMPT_API_CREDENTIAL_ROUTE = '/v1/credentials/:credentialId';
export const PROMPT_API_CURRENT_CREDENTIAL_ROUTE = '/v1/credentials/current';
export const PROMPT_API_CREDENTIAL_LOGIN_ROUTE = '/v1/credentials/login';
export const PROMPT_API_CREDENTIAL_LOGIN_STATUS_ROUTE =
  '/v1/credentials/login/:loginId';
export const PROMPT_API_CREDENTIAL_LOGIN_COMPLETE_ROUTE =
  '/v1/credentials/login/:loginId/complete';
export const PROMPT_API_QUOTAS_ROUTE = '/v1/quotas';
export const PROMPT_API_QUOTA_ROUTE = '/v1/quotas/:credentialId';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const LOGIN_JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const WORKSPACE_PACKAGE_NAME = '@google/gemini-cli';
const GEMINI_DIR_NAME = '.gemini';
const OAUTH_CREDENTIAL_FILE_NAME = 'oauth_creds.json';
const GOOGLE_ACCOUNTS_FILE_NAME = 'google_accounts.json';
const AUTH_ARTIFACT_NAMES = [
  OAUTH_CREDENTIAL_FILE_NAME,
  'gemini-credentials.json',
  GOOGLE_ACCOUNTS_FILE_NAME,
] as const;
const OAUTH_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = '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';
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
const STRIPPED_CHILD_ENV_KEYS = [
  'CLOUD_SHELL',
  'GEMINI_API_KEY',
  'GEMINI_CLI_HOME',
  'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
  'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
  'GEMINI_CLI_USE_COMPUTE_ADC',
  'GEMINI_SYSTEM_MD',
  'GEMINI_WRITE_SYSTEM_MD',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_ACCESS_TOKEN',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_GENAI_USE_GCA',
  'GOOGLE_GENAI_USE_VERTEXAI',
] as const;
const DEFAULT_PROMPT_API_MODEL =
  process.env['GEMINI_PROMPT_API_DEFAULT_MODEL'] || DEFAULT_GEMINI_MODEL_AUTO;
const PROMPT_API_MODEL_OPTIONS = [
  {
    id: DEFAULT_GEMINI_MODEL_AUTO,
    label: getDisplayString(DEFAULT_GEMINI_MODEL_AUTO),
    kind: 'auto',
    isPreview: false,
  },
  {
    id: PREVIEW_GEMINI_MODEL_AUTO,
    label: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
    kind: 'auto',
    isPreview: true,
  },
  {
    id: DEFAULT_GEMINI_MODEL,
    label: getDisplayString(DEFAULT_GEMINI_MODEL),
    kind: 'pro',
    isPreview: false,
  },
  {
    id: PREVIEW_GEMINI_MODEL,
    label: getDisplayString(PREVIEW_GEMINI_MODEL),
    kind: 'pro',
    isPreview: true,
  },
  {
    id: PREVIEW_GEMINI_3_1_MODEL,
    label: getDisplayString(PREVIEW_GEMINI_3_1_MODEL),
    kind: 'pro',
    isPreview: true,
  },
  {
    id: DEFAULT_GEMINI_FLASH_MODEL,
    label: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
    kind: 'flash',
    isPreview: false,
  },
  {
    id: PREVIEW_GEMINI_FLASH_MODEL,
    label: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
    kind: 'flash',
    isPreview: true,
  },
  {
    id: DEFAULT_GEMINI_FLASH_LITE_MODEL,
    label: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
    kind: 'flash-lite',
    isPreview: false,
  },
  {
    id: PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
    label: getDisplayString(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL),
    kind: 'flash-lite',
    isPreview: true,
  },
] as const;
const PROMPT_API_MODEL_ALIASES = [
  {
    id: GEMINI_MODEL_ALIAS_AUTO,
    label: 'Auto',
    targetId: PREVIEW_GEMINI_MODEL_AUTO,
  },
  {
    id: GEMINI_MODEL_ALIAS_PRO,
    label: 'Pro',
    targetId: PREVIEW_GEMINI_MODEL,
  },
  {
    id: GEMINI_MODEL_ALIAS_FLASH,
    label: 'Flash',
    targetId: PREVIEW_GEMINI_FLASH_MODEL,
  },
  {
    id: GEMINI_MODEL_ALIAS_FLASH_LITE,
    label: 'Flash Lite',
    targetId: DEFAULT_GEMINI_FLASH_LITE_MODEL,
  },
] as const;

type StreamJsonEvent = {
  type: string;
  role?: string;
  content?: string;
  [key: string]: unknown;
};

type PromptCredentialLoginRequestBody = {
  credentialId?: unknown;
  label?: unknown;
};
type PromptCredentialLoginCompleteRequestBody = {
  callbackUrl?: unknown;
};

type NormalizedPromptRequest = {
  prompt: string;
  systemPrompt?: string;
  model?: string;
};

type SpawnProcess = typeof spawn;

export interface PromptApiDependencies {
  spawnProcess?: SpawnProcess;
  workspaceRoot?: string;
  cliEntryPath?: string;
  timeoutMs?: number;
  sourceGeminiCliHome?: string;
  credentialStoreRoot?: string;
}

class BadRequestError extends Error {}

type PromptApiSettings = {
  rotationEnabled: boolean;
  retryEnabled: boolean;
  retryCount: number;
  timeoutMs: number;
  mcpEnabled: boolean;
  extensionsEnabled: boolean;
  skillsEnabled: boolean;
  proxyUrl: string;
  acpIdleTimeoutMs: number;
  maxWorkers: number;
  failoverWorkers: number;
};

type PromptApiState = {
  currentModel: string;
  credentialStore: PromptCredentialStore;
  loginJobs: Map<string, PromptCredentialLoginJob>;
  settings: PromptApiSettings;
  acpPool: AcpProcessPool;
  rotationIndex: number;
  /** credentialId → timestamp when it was last marked unhealthy */
  credentialCooldowns: Map<string, number>;
};

const CREDENTIAL_COOLDOWN_MS = 60_000; // 1 minute cooldown after 429/auth failure
type PromptCredentialLoginJob = {
  id: string;
  status: 'awaiting_callback' | 'succeeded' | 'failed';
  credentialId: string;
  startedAt: string;
  authUrl: string;
  redirectUri: string;
  state: string;
  finishedAt?: string;
  error?: string;
};
type PromptApiCredentialQuotaStatus = 'ok' | 'not_logged_in' | 'error';
type PromptApiModelOption = (typeof PROMPT_API_MODEL_OPTIONS)[number];

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = findWorkspaceRoot(moduleDir);

function findWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
          name?: string;
        };
        if (pkg.name === WORKSPACE_PACKAGE_NAME) {
          return currentDir;
        }
      } catch {
        // Ignore invalid package files while walking up to the workspace root.
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Could not locate the Gemini CLI workspace root.');
    }
    currentDir = parentDir;
  }
}

function getTimeoutMs(explicitTimeoutMs?: number): number {
  if (typeof explicitTimeoutMs === 'number' && explicitTimeoutMs > 0) {
    return explicitTimeoutMs;
  }

  const envTimeout = Number(process.env['GEMINI_PROMPT_API_TIMEOUT_MS']);
  if (Number.isFinite(envTimeout) && envTimeout > 0) {
    return envTimeout;
  }

  return DEFAULT_TIMEOUT_MS;
}

function getCliEntryPath(workspaceRoot: string, cliEntryPath?: string): string {
  if (cliEntryPath) {
    return cliEntryPath;
  }

  const candidates = [
    path.join(workspaceRoot, 'packages', 'cli', 'dist', 'index.js'),
    path.join(workspaceRoot, 'bundle', 'gemini.js'),
  ];

  return (
    candidates.find((candidatePath) => existsSync(candidatePath)) ??
    candidates[0]
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type PromptOverride = {
  tempDir: string;
  homeDir: string;
  cwd: string;
  filePath?: string;
  cleanup: () => Promise<void>;
};

function getSourceGeminiCliHome(sourceGeminiCliHome?: string): string {
  return sourceGeminiCliHome ?? process.env['GEMINI_CLI_HOME'] ?? homedir();
}

async function copyFileIfExists(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  if (!existsSync(sourcePath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

function buildIsolatedChildEnv(
  isolatedHomeDir: string,
  promptPath: string | undefined,
  settings: PromptApiSettings,
): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of STRIPPED_CHILD_ENV_KEYS) {
    delete env[key];
  }

  env['GEMINI_CLI_HOME'] = isolatedHomeDir;
  env['GOOGLE_GENAI_USE_GCA'] = 'true';
  env['HOME'] = isolatedHomeDir;
  env['USERPROFILE'] = isolatedHomeDir;

  if (promptPath) {
    env['GEMINI_SYSTEM_MD'] = promptPath;
  }

  // Pass lite-mode flags to CLI child process
  if (!settings.mcpEnabled) {
    env['GEMINI_MCP_DISABLED'] = 'true';
  }
  if (!settings.extensionsEnabled) {
    env['GEMINI_EXTENSIONS_DISABLED'] = 'true';
  }
  if (!settings.skillsEnabled) {
    env['GEMINI_SKILLS_DISABLED'] = 'true';
  }

  // Proxy support for non-TUN mode
  if (settings.proxyUrl) {
    env['HTTP_PROXY'] = settings.proxyUrl;
    env['HTTPS_PROXY'] = settings.proxyUrl;
    env['http_proxy'] = settings.proxyUrl;
    env['https_proxy'] = settings.proxyUrl;
  }

  return env;
}

async function createPromptOverride(
  systemPrompt: string | undefined,
  sourceGeminiCliHome?: string,
): Promise<PromptOverride> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'gemini-prompt-api-'));
  const homeDir = path.join(tempDir, 'home');
  const cwd = path.join(tempDir, 'workspace');
  const isolatedGeminiDir = path.join(homeDir, GEMINI_DIR_NAME);

  await mkdir(cwd, { recursive: true });
  await mkdir(isolatedGeminiDir, { recursive: true });

  const sourceGeminiDir = path.join(
    getSourceGeminiCliHome(sourceGeminiCliHome),
    GEMINI_DIR_NAME,
  );
  await Promise.all(
    AUTH_ARTIFACT_NAMES.map((fileName) =>
      copyFileIfExists(
        path.join(sourceGeminiDir, fileName),
        path.join(isolatedGeminiDir, fileName),
      ),
    ),
  );

  let promptPath: string | undefined;
  if (systemPrompt !== undefined) {
    promptPath = path.join(tempDir, 'system.md');
    await writeFile(promptPath, systemPrompt, 'utf8');
  }

  return {
    tempDir,
    homeDir,
    cwd,
    filePath: promptPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

type PromptInvocation = {
  child: ChildProcessWithoutNullStreams;
  cleanup: () => Promise<void>;
  didTimeout: () => boolean;
};

function createPromptApiState(
  credentialStoreRoot: string | undefined,
  acpPool: AcpProcessPool,
): PromptApiState {
  return {
    currentModel: DEFAULT_PROMPT_API_MODEL,
    credentialStore: new PromptCredentialStore(credentialStoreRoot),
    loginJobs: new Map(),
    settings: {
      rotationEnabled: true,
      retryEnabled: true,
      retryCount: 3,
      timeoutMs: 0,
      mcpEnabled: false,
      extensionsEnabled: false,
      skillsEnabled: false,
      proxyUrl: '',
      acpIdleTimeoutMs: 300000,
      maxWorkers: 2,
      failoverWorkers: 1,
    },
    acpPool,
    rotationIndex: 0,
    credentialCooldowns: new Map(),
  };
}

function pruneExpiredLoginJobs(state: PromptApiState): void {
  const now = Date.now();
  for (const [id, job] of state.loginJobs) {
    const age = now - new Date(job.startedAt).getTime();
    if (age > LOGIN_JOB_TTL_MS) {
      state.loginJobs.delete(id);
    }
  }
}

function getPromptApiModelOption(
  modelId: string,
): PromptApiModelOption | undefined {
  return PROMPT_API_MODEL_OPTIONS.find((model) => model.id === modelId);
}

function getPromptApiCurrentModelPayload(modelId: string) {
  const knownModel = getPromptApiModelOption(modelId);

  return {
    id: modelId,
    label: knownModel?.label ?? modelId,
    resolvedId: modelId,
    kind: knownModel?.kind ?? 'custom',
    isPreview: knownModel?.isPreview ?? false,
    known: knownModel !== undefined,
  };
}

function getPromptApiCredentialPayload(
  credential: PromptApiCredentialRecord,
  currentCredentialId?: string,
) {
  return {
    id: credential.id,
    label: credential.label,
    ...(credential.email ? { email: credential.email } : {}),
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    ...(credential.lastLoginAt ? { lastLoginAt: credential.lastLoginAt } : {}),
    isCurrent: credential.id === currentCredentialId,
  };
}

function getPromptApiModelsPayload(state: PromptApiState) {
  return {
    currentModel: getPromptApiCurrentModelPayload(state.currentModel),
    sessionPolicy: 'per-request',
    models: PROMPT_API_MODEL_OPTIONS,
    aliases: PROMPT_API_MODEL_ALIASES,
  };
}

async function getPromptApiCredentialsPayload(state: PromptApiState) {
  const currentCredentialId =
    await state.credentialStore.getCurrentCredentialId();
  const credentials = await state.credentialStore.listCredentials();

  return {
    currentCredentialId: currentCredentialId ?? null,
    sessionPolicy: 'per-request',
    credentials: credentials.map((credential) =>
      getPromptApiCredentialPayload(credential, currentCredentialId),
    ),
  };
}

function getPromptCredentialOauthPath(credentialHomeDir: string): string {
  return path.join(
    credentialHomeDir,
    GEMINI_DIR_NAME,
    OAUTH_CREDENTIAL_FILE_NAME,
  );
}

function getPromptQuotaSummary(buckets: BucketInfo[] | undefined) {
  const normalizedBuckets = (buckets ?? []).map((bucket) => {
    const remaining =
      typeof bucket.remainingAmount === 'string'
        ? Number.parseInt(bucket.remainingAmount, 10)
        : undefined;
    const limit =
      remaining !== undefined &&
      Number.isFinite(remaining) &&
      typeof bucket.remainingFraction === 'number' &&
      bucket.remainingFraction > 0
        ? Math.round(remaining / bucket.remainingFraction)
        : undefined;

    return {
      modelId: bucket.modelId ?? null,
      tokenType: bucket.tokenType ?? null,
      remaining:
        remaining !== undefined && !Number.isNaN(remaining) ? remaining : null,
      limit:
        limit !== undefined && Number.isFinite(limit) && limit > 0
          ? limit
          : null,
      remainingFraction: bucket.remainingFraction ?? null,
      usedFraction:
        typeof bucket.remainingFraction === 'number'
          ? Math.max(0, 1 - bucket.remainingFraction)
          : null,
      resetTime: bucket.resetTime ?? null,
    };
  });

  const numericRemainingBuckets = normalizedBuckets.filter(
    (
      bucket,
    ): bucket is (typeof normalizedBuckets)[number] & { remaining: number } =>
      typeof bucket.remaining === 'number',
  );
  const numericLimitBuckets = normalizedBuckets.filter(
    (
      bucket,
    ): bucket is (typeof normalizedBuckets)[number] & { limit: number } =>
      typeof bucket.limit === 'number',
  );
  const fractionBuckets = normalizedBuckets.filter(
    (
      bucket,
    ): bucket is (typeof normalizedBuckets)[number] & {
      remainingFraction: number;
    } => typeof bucket.remainingFraction === 'number',
  );
  const models = Array.from(
    new Map(
      normalizedBuckets
        .filter(
          (
            bucket,
          ): bucket is (typeof normalizedBuckets)[number] & {
            modelId: string;
          } => typeof bucket.modelId === 'string' && bucket.modelId.length > 0,
        )
        .map((bucket) => [
          bucket.modelId,
          {
            id: bucket.modelId,
            label: getDisplayString(bucket.modelId),
          },
        ]),
    ).values(),
  );
  const totalRemaining = numericRemainingBuckets.reduce(
    (sum, bucket) => sum + bucket.remaining,
    0,
  );
  const totalLimit = numericLimitBuckets.reduce(
    (sum, bucket) => sum + bucket.limit,
    0,
  );
  const resetTimes = Array.from(
    new Set(
      normalizedBuckets
        .map((bucket) => bucket.resetTime)
        .filter((resetTime): resetTime is string => !!resetTime),
    ),
  );
  const minRemainingFraction =
    fractionBuckets.length > 0
      ? Math.min(...fractionBuckets.map((bucket) => bucket.remainingFraction))
      : null;
  const maxRemainingFraction =
    fractionBuckets.length > 0
      ? Math.max(...fractionBuckets.map((bucket) => bucket.remainingFraction))
      : null;

  return {
    buckets: normalizedBuckets,
    models,
    totals: {
      remaining: numericRemainingBuckets.length > 0 ? totalRemaining : null,
      limit:
        numericLimitBuckets.length > 0 && totalLimit > 0 ? totalLimit : null,
      minRemainingFraction,
      minRemainingFractionPercent:
        minRemainingFraction !== null
          ? Math.round(minRemainingFraction * 100)
          : null,
      maxRemainingFraction,
      maxRemainingFractionPercent:
        maxRemainingFraction !== null
          ? Math.round(maxRemainingFraction * 100)
          : null,
      allModelsFull:
        fractionBuckets.length > 0 &&
        fractionBuckets.every((bucket) => bucket.remainingFraction >= 0.999),
      bucketCount: normalizedBuckets.length,
      modelCount: models.length,
      resetTime:
        resetTimes.length === 1 ? resetTimes[0] : (resetTimes[0] ?? null),
    },
  };
}

async function getPromptApiCredentialQuotaPayload(
  state: PromptApiState,
  credentialId: string,
) {
  const currentCredentialId =
    await state.credentialStore.getCurrentCredentialId();
  const credential = await state.credentialStore.getCredential(credentialId);
  if (!credential) {
    throw new BadRequestError(`Credential not found: ${credentialId}`);
  }

  const credentialPayload = getPromptApiCredentialPayload(
    credential,
    currentCredentialId,
  );
  const credentialHomeDir = state.credentialStore.getCredentialHomeDir(
    credential.id,
  );
  const oauthPath = getPromptCredentialOauthPath(credentialHomeDir);

  if (!existsSync(oauthPath)) {
    return {
      credential: credentialPayload,
      status: 'not_logged_in' as PromptApiCredentialQuotaStatus,
      sessionPolicy: 'per-request',
    };
  }

  try {
    const rawOauth = readFileSync(oauthPath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const credentials = JSON.parse(rawOauth) as Credentials;
    const client = createPromptCredentialOAuthClient(state.settings.proxyUrl);
    client.setCredentials(credentials);

    const userData = await setupUser(client);
    const codeAssistServer = new CodeAssistServer(
      client,
      userData.projectId,
      {},
      '',
      userData.userTier,
      userData.userTierName,
      userData.paidTier,
    );
    const quota = await codeAssistServer.retrieveUserQuota({
      project: userData.projectId,
    });
    const quotaSummary = getPromptQuotaSummary(quota.buckets);

    return {
      credential: credentialPayload,
      status: 'ok' as PromptApiCredentialQuotaStatus,
      projectId: userData.projectId,
      userTier: userData.userTier,
      ...(userData.userTierName ? { userTierName: userData.userTierName } : {}),
      creditBalance: getG1CreditBalance(userData.paidTier) ?? null,
      quota,
      quotaSummary,
      sessionPolicy: 'per-request',
    };
  } catch (error) {
    return {
      credential: credentialPayload,
      status: 'error' as PromptApiCredentialQuotaStatus,
      error: error instanceof Error ? error.message : String(error),
      sessionPolicy: 'per-request',
    };
  }
}

async function getPromptApiQuotasPayload(state: PromptApiState) {
  const currentCredentialId =
    await state.credentialStore.getCurrentCredentialId();
  const credentials = await state.credentialStore.listCredentials();
  const quotas = await Promise.all(
    credentials.map((credential) =>
      getPromptApiCredentialQuotaPayload(state, credential.id),
    ),
  );

  return {
    currentCredentialId: currentCredentialId ?? null,
    sessionPolicy: 'per-request',
    quotas,
  };
}

function normalizeRequestedModel(
  model: unknown,
  state: PromptApiState,
): string {
  if (model === undefined) {
    return state.currentModel;
  }

  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new BadRequestError(
      '"model" must be a non-empty string when provided.',
    );
  }

  return model;
}

async function getEffectiveSourceGeminiCliHome(
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
): Promise<string> {
  // Rotation mode: cycle through all credentials
  if (state.settings.rotationEnabled) {
    const credentials = await state.credentialStore.listCredentials();
    if (credentials.length > 0) {
      const idx = state.rotationIndex % credentials.length;
      state.rotationIndex = idx + 1;
      const credential = credentials[idx];
      logger.info(
        `[Prompt API] Rotation: using credential "${credential.label}" (${credential.id})`,
      );
      return state.credentialStore.getCredentialHomeDir(credential.id);
    }
  }

  const currentCredentialId =
    await state.credentialStore.getCurrentCredentialId();
  if (!currentCredentialId) {
    return deps.sourceGeminiCliHome;
  }

  const credential =
    await state.credentialStore.getCredential(currentCredentialId);
  if (!credential) {
    return deps.sourceGeminiCliHome;
  }

  return state.credentialStore.getCredentialHomeDir(credential.id);
}

function normalizeCredentialLoginBody(body: unknown): {
  credentialId?: string;
  label?: string;
} {
  if (body === undefined || body === null) {
    return {};
  }

  if (!isObject(body)) {
    throw new BadRequestError('Request body must be a JSON object.');
  }

  const typedBody = body as PromptCredentialLoginRequestBody;
  if (
    typedBody.credentialId !== undefined &&
    (typeof typedBody.credentialId !== 'string' ||
      typedBody.credentialId.trim().length === 0)
  ) {
    throw new BadRequestError(
      '"credentialId" must be a non-empty string when provided.',
    );
  }

  if (
    typedBody.label !== undefined &&
    (typeof typedBody.label !== 'string' || typedBody.label.trim().length === 0)
  ) {
    throw new BadRequestError(
      '"label" must be a non-empty string when provided.',
    );
  }

  return {
    credentialId: typedBody.credentialId?.trim(),
    label: typedBody.label?.trim(),
  };
}

function normalizeCredentialLoginCompleteBody(body: unknown): {
  callbackUrl: string;
} {
  if (!isObject(body)) {
    throw new BadRequestError('Request body must be a JSON object.');
  }

  const typedBody = body as PromptCredentialLoginCompleteRequestBody;
  if (
    typeof typedBody.callbackUrl !== 'string' ||
    typedBody.callbackUrl.trim().length === 0
  ) {
    throw new BadRequestError(
      'A non-empty string "callbackUrl" field is required.',
    );
  }

  return {
    callbackUrl: typedBody.callbackUrl.trim(),
  };
}

async function startPromptInvocation(
  requestBody: NormalizedPromptRequest,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
): Promise<PromptInvocation> {
  if (!existsSync(deps.cliEntryPath)) {
    throw new Error(
      `Gemini CLI entrypoint not found at ${deps.cliEntryPath}. Run "npm run build --workspace @google/gemini-cli" or "npm run bundle" first.`,
    );
  }

  const sourceGeminiCliHome = await getEffectiveSourceGeminiCliHome(
    deps,
    state,
  );
  const promptOverride = await createPromptOverride(
    requestBody.systemPrompt,
    sourceGeminiCliHome,
  );
  const args = [
    '--no-warnings=DEP0040',
    deps.cliEntryPath,
    '--prompt',
    '',
    '--output-format',
    'stream-json',
  ];

  args.push('--model', normalizeRequestedModel(requestBody.model, state));

  logger.info(`[Prompt API] Prompt length: ${requestBody.prompt.length} chars`);

  let child: ChildProcessWithoutNullStreams | undefined;
  let didTimeout = false;
  let timeout: NodeJS.Timeout | undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    child = deps.spawnProcess(process.execPath, args, {
      cwd: promptOverride.cwd,
      env: buildIsolatedChildEnv(
        promptOverride.homeDir,
        promptOverride.filePath,
        state.settings,
      ),
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as unknown as ChildProcessWithoutNullStreams;

    // Feed prompt via stdin to avoid ENAMETOOLONG on long conversations.
    // CLI reads stdin when !process.stdin.isTTY and prepends it to --prompt.
    child.stdin.write(requestBody.prompt);
    child.stdin.end();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    timeout = setTimeout(
      () => {
        didTimeout = true;
        child?.kill();
      },
      state.settings.timeoutMs > 0 ? state.settings.timeoutMs : deps.timeoutMs,
    );

    return {
      child,
      cleanup: async () => {
        if (timeout) {
          clearTimeout(timeout);
        }
        await promptOverride.cleanup();
      },
      didTimeout: () => didTimeout,
    };
  } catch (error) {
    if (timeout) {
      clearTimeout(timeout);
    }
    await promptOverride.cleanup();
    throw error;
  }
}

function createPromptCredentialOAuthClient(proxyUrl?: string): OAuth2Client {
  return new OAuth2Client({
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
    ...(proxyUrl
      ? {
          transporterOptions: {
            proxy: proxyUrl,
          },
        }
      : {}),
  });
}

function createPromptCredentialRedirectUri(): string {
  const port = 40000 + Math.floor(Math.random() * 10000);
  return `http://127.0.0.1:${port}/oauth2callback`;
}

async function startPromptApiCredentialLogin(
  state: PromptApiState,
  body: unknown,
): Promise<{
  credential: PromptApiCredentialRecord;
  loginJob: PromptCredentialLoginJob;
}> {
  const { credentialId, label } = normalizeCredentialLoginBody(body);
  const existingCredential = credentialId
    ? await state.credentialStore.getCredential(credentialId)
    : undefined;
  const credential =
    existingCredential ??
    (await state.credentialStore.createCredential(label, credentialId));

  await mkdir(state.credentialStore.getCredentialHomeDir(credential.id), {
    recursive: true,
  });

  const loginJob: PromptCredentialLoginJob = {
    id: randomUUID(),
    status: 'awaiting_callback',
    credentialId: credential.id,
    startedAt: new Date().toISOString(),
    redirectUri: createPromptCredentialRedirectUri(),
    state: randomUUID().replaceAll('-', ''),
    authUrl: '',
  };

  const client = createPromptCredentialOAuthClient(state.settings.proxyUrl);
  loginJob.authUrl = client.generateAuthUrl({
    redirect_uri: loginJob.redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPE,
    state: loginJob.state,
  });
  state.loginJobs.set(loginJob.id, loginJob);

  return {
    credential,
    loginJob,
  };
}

async function fetchPromptCredentialEmail(
  client: OAuth2Client,
): Promise<string | undefined> {
  const { token } = await client.getAccessToken();
  if (!token) {
    return undefined;
  }

  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const userInfo = (await response.json()) as { email?: unknown };
  return typeof userInfo.email === 'string' ? userInfo.email : undefined;
}

async function completePromptApiCredentialLogin(
  state: PromptApiState,
  loginId: string,
  body: unknown,
): Promise<{
  credential: PromptApiCredentialRecord;
  loginJob: PromptCredentialLoginJob;
}> {
  const loginJob = state.loginJobs.get(loginId);
  if (!loginJob) {
    throw new BadRequestError(`Login job not found: ${loginId}`);
  }
  if (loginJob.status !== 'awaiting_callback') {
    throw new BadRequestError(
      `Login job ${loginId} is already ${loginJob.status}.`,
    );
  }

  const { callbackUrl } = normalizeCredentialLoginCompleteBody(body);
  let parsedCallbackUrl: URL;
  try {
    parsedCallbackUrl = new URL(callbackUrl);
  } catch {
    throw new BadRequestError('"callbackUrl" must be a valid URL.');
  }

  const redirectUrl = new URL(loginJob.redirectUri);
  if (parsedCallbackUrl.origin !== redirectUrl.origin) {
    throw new BadRequestError(
      'The callback URL origin does not match the login redirect URI.',
    );
  }
  if (parsedCallbackUrl.pathname !== redirectUrl.pathname) {
    throw new BadRequestError(
      'The callback URL path does not match the login redirect URI.',
    );
  }

  const errorCode = parsedCallbackUrl.searchParams.get('error');
  if (errorCode) {
    const failedJob = {
      ...loginJob,
      status: 'failed' as const,
      finishedAt: new Date().toISOString(),
      error:
        parsedCallbackUrl.searchParams.get('error_description') ?? errorCode,
    };
    state.loginJobs.set(loginId, failedJob);
    throw new BadRequestError(
      `Google OAuth returned an error: ${failedJob.error}`,
    );
  }

  if (parsedCallbackUrl.searchParams.get('state') !== loginJob.state) {
    throw new BadRequestError(
      'The callback URL state does not match the login request.',
    );
  }

  const code = parsedCallbackUrl.searchParams.get('code');
  if (!code) {
    throw new BadRequestError(
      'The callback URL must include an authorization code.',
    );
  }

  const client = createPromptCredentialOAuthClient(state.settings.proxyUrl);
  let tokens: Credentials;
  try {
    const tokenResponse = await client.getToken({
      code,
      redirect_uri: loginJob.redirectUri,
    });
    tokens = tokenResponse.tokens;
    client.setCredentials(tokens);
  } catch (error) {
    const failedJob = {
      ...loginJob,
      status: 'failed' as const,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    state.loginJobs.set(loginId, failedJob);
    throw new Error(failedJob.error);
  }

  const credentialHomeDir = state.credentialStore.getCredentialHomeDir(
    loginJob.credentialId,
  );
  const geminiDir = path.join(credentialHomeDir, GEMINI_DIR_NAME);
  await mkdir(geminiDir, { recursive: true });
  await writeFile(
    path.join(geminiDir, OAUTH_CREDENTIAL_FILE_NAME),
    JSON.stringify(tokens, null, 2),
    'utf8',
  );

  const email = await fetchPromptCredentialEmail(client);
  if (email) {
    await writeFile(
      path.join(geminiDir, GOOGLE_ACCOUNTS_FILE_NAME),
      JSON.stringify({ active: email, old: [] }, null, 2),
      'utf8',
    );
  }

  const loggedInCredential = await state.credentialStore.markCredentialLoggedIn(
    loginJob.credentialId,
  );
  await state.credentialStore.setCurrentCredential(loggedInCredential.id);

  const succeededJob: PromptCredentialLoginJob = {
    ...loginJob,
    status: 'succeeded',
    finishedAt: new Date().toISOString(),
  };
  state.loginJobs.set(loginId, succeededJob);

  return {
    credential: loggedInCredential,
    loginJob: succeededJob,
  };
}

function getPromptApiCredentialLoginPayload(
  loginJob: PromptCredentialLoginJob,
) {
  return {
    loginId: loginJob.id,
    status: loginJob.status,
    credentialId: loginJob.credentialId,
    startedAt: loginJob.startedAt,
    authUrl: loginJob.authUrl,
    redirectUri: loginJob.redirectUri,
    ...(loginJob.finishedAt ? { finishedAt: loginJob.finishedAt } : {}),
    ...(loginJob.error ? { error: loginJob.error } : {}),
  };
}

function parseStreamEvent(line: string): StreamJsonEvent | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return JSON.parse(line) as StreamJsonEvent;
  } catch {
    return undefined;
  }
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode) => resolve(exitCode));
  });
}

async function consumeOutputLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        onLine(line);
      }
    });

    stream.once('end', () => {
      const trailingLine = buffer.trim();
      if (trailingLine.length > 0) {
        onLine(trailingLine);
      }
      resolve();
    });

    stream.once('error', reject);
  });
}

function logPromptApiError(error: unknown) {
  logger.error(
    '[Prompt API] Request failed',
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
}

/* ── Adapter-based handlers (Gemini / OpenAI format) ── */

async function runSingleJsonInvocation(
  normalized: NormalizedPromptRequest,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
): Promise<{
  assistantText: string;
  exitCode: number | null;
  didTimeout: boolean;
}> {
  const invocation = await startPromptInvocation(normalized, deps, state);
  const { child } = invocation;

  let _stderrOutput = '';
  let assistantText = '';

  child.stderr.on('data', (chunk: string) => {
    _stderrOutput += chunk;
  });

  const stdoutDone = consumeOutputLines(child.stdout, (line) => {
    if (line.trim().length === 0) return;
    const event = parseStreamEvent(line);
    if (
      event &&
      event.type === 'message' &&
      event.role === 'assistant' &&
      typeof event.content === 'string'
    ) {
      assistantText += event.content;
    }
  });

  try {
    const [exitCode] = await Promise.all([waitForChildExit(child), stdoutDone]);
    if (exitCode !== 0 && _stderrOutput.trim().length > 0) {
      logger.error(
        `[Prompt API] CLI stderr (exit ${String(exitCode)}): ${_stderrOutput.trim()}`,
      );
    }
    return { assistantText, exitCode, didTimeout: invocation.didTimeout() };
  } finally {
    await invocation.cleanup();
  }
}

/* ── ACP-mode request handler ── */

async function getEffectiveCredentialIdAndHome(
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
): Promise<{ credentialId: string; homeDir: string }> {
  pruneCredentialCooldowns(state);

  // Rotation mode: cycle through all credentials, skipping cooled-down ones
  if (state.settings.rotationEnabled) {
    const credentials = await state.credentialStore.listCredentials();
    if (credentials.length > 0) {
      // Try up to credentials.length times to find a healthy one
      for (let i = 0; i < credentials.length; i++) {
        const idx = state.rotationIndex % credentials.length;
        state.rotationIndex = idx + 1;
        const credential = credentials[idx];
        if (state.credentialCooldowns.has(credential.id)) {
          logger.info(
            `[Prompt API] Rotation: skipping cooled-down credential "${credential.label}" (${credential.id})`,
          );
          continue;
        }
        logger.info(
          `[Prompt API] Rotation: using credential "${credential.label}" (${credential.id})`,
        );
        const homeDir = state.credentialStore.getCredentialHomeDir(
          credential.id,
        );
        return { credentialId: credential.id, homeDir };
      }
      // All credentials cooled down, use the next one anyway (best effort)
      const idx = state.rotationIndex % credentials.length;
      state.rotationIndex = idx + 1;
      const credential = credentials[idx];
      logger.warn(
        `[Prompt API] All credentials cooled down, using "${credential.label}" anyway`,
      );
      const homeDir = state.credentialStore.getCredentialHomeDir(credential.id);
      return { credentialId: credential.id, homeDir };
    }
  }

  const currentCredentialId =
    await state.credentialStore.getCurrentCredentialId();
  if (!currentCredentialId) {
    return { credentialId: 'default', homeDir: deps.sourceGeminiCliHome };
  }

  const credential =
    await state.credentialStore.getCredential(currentCredentialId);
  if (!credential) {
    return { credentialId: 'default', homeDir: deps.sourceGeminiCliHome };
  }

  const homeDir =
    state.credentialStore.getCredentialHomeDir(currentCredentialId);
  return { credentialId: currentCredentialId, homeDir };
}

async function getAcpWorkerAndSession(
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
) {
  const { credentialId, homeDir: credentialHomeDir } =
    await getEffectiveCredentialIdAndHome(deps, state);

  const worker = await state.acpPool.getOrCreate(
    credentialId,
    credentialHomeDir,
    {
      idleTimeoutMs: state.settings.acpIdleTimeoutMs,
      mcpEnabled: state.settings.mcpEnabled,
      extensionsEnabled: state.settings.extensionsEnabled,
      skillsEnabled: state.settings.skillsEnabled,
      proxyUrl: state.settings.proxyUrl,
      maxWorkers: state.settings.maxWorkers,
      failoverWorkers: state.settings.failoverWorkers,
    },
  );

  // Create a fresh session per request to avoid server-side context accumulation.
  // SillyTavern and OpenAI-compatible clients send full history each request,
  // so reusing a session would cause duplicate context and token waste.
  const sessionId = await worker.createSession();
  return { worker, sessionId, credentialId };
}

function promptToContentBlocks(
  prompt: string,
  systemPrompt?: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (systemPrompt) {
    blocks.push({
      type: 'text',
      text: `[System Instruction]\n${systemPrompt}\n[End System Instruction]`,
    });
  }
  blocks.push({ type: 'text', text: prompt });
  return blocks;
}

function pruneCredentialCooldowns(state: PromptApiState): void {
  const now = Date.now();
  for (const [id, ts] of state.credentialCooldowns) {
    if (now - ts > CREDENTIAL_COOLDOWN_MS) {
      state.credentialCooldowns.delete(id);
    }
  }
}

/**
 * Checks if an error is likely a credential/quota issue (429, auth error)
 * that could be resolved by switching to a different credential.
 */
function isCredentialFailoverError(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource exhausted') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('permission denied') ||
    msg.includes('forbidden')
  );
}

/**
 * Try to get a worker+session from a different credential than the ones already tried.
 */
async function getAcpWorkerAndSessionExcluding(
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
  excludeCredentialIds: Set<string>,
): Promise<{
  worker: Awaited<ReturnType<typeof getAcpWorkerAndSession>>['worker'];
  sessionId: string;
  credentialId: string;
} | null> {
  pruneCredentialCooldowns(state);
  const credentials = await state.credentialStore.listCredentials();
  for (const cred of credentials) {
    if (excludeCredentialIds.has(cred.id)) continue;
    if (state.credentialCooldowns.has(cred.id)) continue;
    const homeDir = state.credentialStore.getCredentialHomeDir(cred.id);
    try {
      const worker = await state.acpPool.getOrCreate(cred.id, homeDir, {
        idleTimeoutMs: state.settings.acpIdleTimeoutMs,
        mcpEnabled: state.settings.mcpEnabled,
        extensionsEnabled: state.settings.extensionsEnabled,
        skillsEnabled: state.settings.skillsEnabled,
        proxyUrl: state.settings.proxyUrl,
        maxWorkers: state.settings.maxWorkers,
        failoverWorkers: state.settings.failoverWorkers,
      });
      const sessionId = await worker.createSession();
      return { worker, sessionId, credentialId: cred.id };
    } catch {
      continue;
    }
  }
  return null;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const obj = err as Record<string, unknown>;
    if (typeof obj['message'] === 'string') return obj['message'];
    try {
      return JSON.stringify(err);
    } catch {
      return '[unknown error]';
    }
  }
  return String(err);
}

async function handleAcpJsonRequest(
  req: Request,
  res: Response,
  adapter: FormatAdapter,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
) {
  const requestId = `req-${randomUUID()}`;
  const parsed = adapter.parseRequest(req.body);
  const model = normalizeRequestedModel(parsed.model, state);
  const contentBlocks = promptToContentBlocks(
    parsed.prompt,
    parsed.systemPrompt,
  );

  const maxAttempts = state.settings.retryEnabled
    ? Math.max(1, state.settings.retryCount + 1)
    : 1;
  const triedCredentials = new Set<string>();
  let lastError = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let worker: Awaited<ReturnType<typeof getAcpWorkerAndSession>>['worker'];
    let sessionId: string;

    try {
      if (attempt === 0) {
        const result = await getAcpWorkerAndSession(deps, state);
        worker = result.worker;
        sessionId = result.sessionId;
        triedCredentials.add(result.credentialId);
      } else {
        // Failover: try a different credential
        const alt = await getAcpWorkerAndSessionExcluding(
          deps,
          state,
          triedCredentials,
        );
        if (!alt) {
          logger.warn(
            `[ACP] No more credentials available for failover (attempt ${attempt + 1})`,
          );
          break;
        }
        worker = alt.worker;
        sessionId = alt.sessionId;
        triedCredentials.add(alt.credentialId);
        logger.info(
          `[ACP] Failover attempt ${attempt + 1}: switching to credential ${alt.credentialId}`,
        );
      }
    } catch (err) {
      lastError = extractErrorMessage(err);
      logger.error(`[ACP] Failed to get worker/session: ${lastError}`);
      continue;
    }

    if (parsed.model) {
      try {
        await worker.setSessionModel(sessionId, model);
      } catch (err) {
        logger.warn(
          `[ACP] Failed to set model to ${model}: ${extractErrorMessage(err)}`,
        );
      }
    }

    try {
      let assistantText = '';
      await worker.prompt(
        sessionId,
        contentBlocks,
        (update: SessionNotification) => {
          if (
            update.update.sessionUpdate === 'agent_message_chunk' &&
            update.update.content.type === 'text'
          ) {
            assistantText += update.update.content.text;
          }
        },
      );

      return res
        .status(200)
        .json(adapter.buildJsonResponse(assistantText, model, requestId));
    } catch (err) {
      lastError = extractErrorMessage(err);
      logger.error(
        `[ACP] Prompt error (attempt ${attempt + 1}/${maxAttempts}): ${lastError}`,
      );

      // Mark credential as unhealthy and failover on credential/quota errors
      if (isCredentialFailoverError(err)) {
        state.credentialCooldowns.set(worker.credentialId, Date.now());
        logger.info(
          `[ACP] Credential ${worker.credentialId} cooled down for ${CREDENTIAL_COOLDOWN_MS / 1000}s`,
        );
      }
      if (!isCredentialFailoverError(err) || attempt + 1 >= maxAttempts) {
        return res
          .status(500)
          .json(adapter.buildJsonError(lastError, 500, model, requestId));
      }
    } finally {
      if (worker && sessionId) {
        worker.destroySession(sessionId);
      }
    }
  }

  return res
    .status(500)
    .json(
      adapter.buildJsonError(
        lastError || 'All credentials exhausted.',
        500,
        model,
        requestId,
      ),
    );
}

async function handleAcpStreamingRequest(
  req: Request,
  res: Response,
  adapter: FormatAdapter,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
) {
  const requestId = `req-${randomUUID()}`;
  const parsed = adapter.parseRequest(req.body);
  const model = normalizeRequestedModel(parsed.model, state);
  const contentBlocks = promptToContentBlocks(
    parsed.prompt,
    parsed.systemPrompt,
  );

  const maxAttempts = state.settings.retryEnabled
    ? Math.max(1, state.settings.retryCount + 1)
    : 1;
  const triedCredentials = new Set<string>();
  let lastError = '';
  let headersSent = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let worker: Awaited<ReturnType<typeof getAcpWorkerAndSession>>['worker'];
    let sessionId: string;

    try {
      if (attempt === 0) {
        const result = await getAcpWorkerAndSession(deps, state);
        worker = result.worker;
        sessionId = result.sessionId;
        triedCredentials.add(result.credentialId);
      } else {
        const alt = await getAcpWorkerAndSessionExcluding(
          deps,
          state,
          triedCredentials,
        );
        if (!alt) {
          logger.warn(
            `[ACP] No more credentials available for failover (stream, attempt ${attempt + 1})`,
          );
          break;
        }
        worker = alt.worker;
        sessionId = alt.sessionId;
        triedCredentials.add(alt.credentialId);
        logger.info(
          `[ACP] Stream failover attempt ${attempt + 1}: switching to credential ${alt.credentialId}`,
        );
      }
    } catch (err) {
      lastError = extractErrorMessage(err);
      logger.error(`[ACP] Failed to get worker/session (stream): ${lastError}`);
      continue;
    }

    if (parsed.model) {
      try {
        await worker.setSessionModel(sessionId, model);
      } catch (err) {
        logger.warn(
          `[ACP] Failed to set model to ${model}: ${extractErrorMessage(err)}`,
        );
      }
    }

    // Start streaming headers (only on first successful attempt)
    if (!headersSent) {
      res.setHeader('Content-Type', adapter.streamContentType);
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      headersSent = true;
    }

    let isFirst = true;
    let cancelled = false;

    const abortHandler = () => {
      cancelled = true;
      worker.cancelPrompt(sessionId).catch(() => {});
    };
    req.on('aborted', abortHandler);
    res.on('close', abortHandler);

    try {
      await worker.prompt(
        sessionId,
        contentBlocks,
        (update: SessionNotification) => {
          if (cancelled) return;
          if (
            update.update.sessionUpdate === 'agent_message_chunk' &&
            update.update.content.type === 'text'
          ) {
            res.write(
              adapter.formatStreamChunk(
                update.update.content.text,
                model,
                requestId,
                isFirst,
              ),
            );
            isFirst = false;
          }
        },
      );

      if (!cancelled) {
        res.write(adapter.formatStreamEnd(model, requestId));
      }
      // Success — clean up and return
      req.off('aborted', abortHandler);
      res.off('close', abortHandler);
      worker.destroySession(sessionId);
      res.end();
      return;
    } catch (err) {
      req.off('aborted', abortHandler);
      res.off('close', abortHandler);
      worker.destroySession(sessionId);

      lastError = extractErrorMessage(err);
      logger.error(
        `[ACP] Prompt error (stream, attempt ${attempt + 1}/${maxAttempts}): ${lastError}`,
      );

      // Mark credential as unhealthy on failover-eligible errors
      if (isCredentialFailoverError(err)) {
        state.credentialCooldowns.set(worker.credentialId, Date.now());
        logger.info(
          `[ACP] Credential ${worker.credentialId} cooled down for ${CREDENTIAL_COOLDOWN_MS / 1000}s`,
        );
      }

      // Can only failover if no chunks were sent yet
      if (!isFirst || cancelled || !isCredentialFailoverError(err)) {
        if (!cancelled) {
          res.write(adapter.formatStreamError(lastError, model, requestId));
        }
        res.end();
        return;
      }
      // isFirst=true means no chunks sent, safe to retry with next credential
    }
  }

  // All attempts exhausted
  if (!headersSent) {
    res.setHeader('Content-Type', adapter.streamContentType);
    res.flushHeaders();
  }
  res.write(
    adapter.formatStreamError(
      lastError || 'All credentials exhausted.',
      model,
      requestId,
    ),
  );
  res.end();
}

async function handleAdaptedJsonRequest(
  req: Request,
  res: Response,
  adapter: FormatAdapter,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
) {
  return handleAcpJsonRequest(req, res, adapter, deps, state);
  // Legacy spawn fallback kept below for reference but no longer reachable
  const requestId = `req-${randomUUID()}`;
  const parsed = adapter.parseRequest(req.body);
  const model = normalizeRequestedModel(parsed.model, state);
  const normalized: NormalizedPromptRequest = {
    prompt: parsed.prompt,
    systemPrompt: parsed.systemPrompt,
    model,
  };

  const maxAttempts = state.settings.retryEnabled
    ? Math.max(1, state.settings.retryCount + 1)
    : 1;
  let lastError = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      logger.info(
        `[Prompt API] Retry attempt ${attempt}/${state.settings.retryCount}`,
      );
    }

    const result = await runSingleJsonInvocation(normalized, deps, state);

    if (result.exitCode === 0) {
      return res
        .status(200)
        .json(
          adapter.buildJsonResponse(result.assistantText, model, requestId),
        );
    }

    lastError = result.didTimeout
      ? `Request timed out after ${state.settings.timeoutMs > 0 ? state.settings.timeoutMs : deps.timeoutMs}ms.`
      : `CLI exited with status ${String(result.exitCode)}.`;

    // Don't retry on timeout
    if (result.didTimeout) break;
  }

  return res
    .status(500)
    .json(adapter.buildJsonError(lastError, 500, model, requestId));
}

async function handleAdaptedStreamingRequest(
  req: Request,
  res: Response,
  adapter: FormatAdapter,
  deps: Required<PromptApiDependencies>,
  state: PromptApiState,
) {
  return handleAcpStreamingRequest(req, res, adapter, deps, state);
  // Legacy spawn fallback kept below for reference but no longer reachable
  const requestId = `req-${randomUUID()}`;
  const parsed = adapter.parseRequest(req.body);
  const model = normalizeRequestedModel(parsed.model, state);
  const normalized: NormalizedPromptRequest = {
    prompt: parsed.prompt,
    systemPrompt: parsed.systemPrompt,
    model,
  };

  const invocation = await startPromptInvocation(normalized, deps, state);
  const { child } = invocation;

  res.setHeader('Content-Type', adapter.streamContentType);
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let responseClosed = false;
  let _stderrOutput = '';
  let isFirst = true;

  const abortChild = () => {
    if (!responseClosed && !child.killed) {
      child.kill();
    }
  };

  req.on('aborted', abortChild);
  res.on('close', abortChild);

  child.stderr.on('data', (chunk: string) => {
    _stderrOutput += chunk;
  });

  const stdoutDone = consumeOutputLines(child.stdout, (line) => {
    if (line.trim().length === 0) return;
    const event = parseStreamEvent(line);
    if (
      event &&
      event.type === 'message' &&
      event.role === 'assistant' &&
      typeof event.content === 'string'
    ) {
      res.write(
        adapter.formatStreamChunk(event.content, model, requestId, isFirst),
      );
      isFirst = false;
    }
  });

  try {
    const [exitCode] = await Promise.all([waitForChildExit(child), stdoutDone]);

    if (exitCode !== 0) {
      const message = invocation.didTimeout()
        ? `Request timed out after ${state.settings.timeoutMs > 0 ? state.settings.timeoutMs : deps.timeoutMs}ms.`
        : `CLI exited with status ${String(exitCode)}.`;
      res.write(adapter.formatStreamError(message, model, requestId));
    } else {
      res.write(adapter.formatStreamEnd(model, requestId));
    }
  } finally {
    responseClosed = true;
    req.off('aborted', abortChild);
    res.off('close', abortChild);
    await invocation.cleanup();
    res.end();
  }
}

export function createPromptApiRouter(
  dependencies: PromptApiDependencies = {},
): express.Router {
  const workspaceRoot = dependencies.workspaceRoot ?? defaultWorkspaceRoot;
  const cliEntryPath = getCliEntryPath(
    workspaceRoot,
    dependencies.cliEntryPath,
  );
  const deps: Required<PromptApiDependencies> = {
    spawnProcess: dependencies.spawnProcess ?? spawn,
    workspaceRoot,
    cliEntryPath,
    timeoutMs: getTimeoutMs(dependencies.timeoutMs),
    sourceGeminiCliHome:
      dependencies.sourceGeminiCliHome ?? getSourceGeminiCliHome(),
    credentialStoreRoot:
      dependencies.credentialStoreRoot ??
      path.join(getSourceGeminiCliHome(), GEMINI_DIR_NAME, 'prompt-api'),
  };
  const acpPool = new AcpProcessPool({
    cliEntryPath: deps.cliEntryPath,
    spawnProcess: deps.spawnProcess,
  });
  const state = createPromptApiState(deps.credentialStoreRoot, acpPool);

  // Pre-warm primary + failover workers in the background
  void (async () => {
    try {
      const credentials = await state.credentialStore.listCredentials();
      if (credentials.length === 0) {
        logger.info('[ACP] No credentials found, skipping startup warm-up');
        return;
      }

      const poolSettings = {
        idleTimeoutMs: state.settings.acpIdleTimeoutMs,
        mcpEnabled: state.settings.mcpEnabled,
        extensionsEnabled: state.settings.extensionsEnabled,
        skillsEnabled: state.settings.skillsEnabled,
        proxyUrl: state.settings.proxyUrl,
        maxWorkers: state.settings.maxWorkers,
        failoverWorkers: state.settings.failoverWorkers,
      };

      // Warm up primary worker
      const { credentialId, homeDir } = await getEffectiveCredentialIdAndHome(
        deps,
        state,
      );
      await state.acpPool.warmUp(credentialId, homeDir, poolSettings);

      // Warm up failover workers with other credentials
      const failoverCount = state.settings.failoverWorkers;
      if (failoverCount > 0) {
        let warmed = 0;
        for (const cred of credentials) {
          if (warmed >= failoverCount) break;
          if (cred.id === credentialId) continue;
          const credHomeDir = state.credentialStore.getCredentialHomeDir(
            cred.id,
          );
          try {
            await state.acpPool.warmUp(cred.id, credHomeDir, poolSettings);
            warmed++;
            logger.info(
              `[ACP] Failover worker ${warmed}/${failoverCount} warmed: "${cred.label}"`,
            );
          } catch (err) {
            logger.warn(
              `[ACP] Failover warm-up failed for ${cred.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      logger.warn(
        `[ACP] Startup warm-up failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();

  // Eagerly resolve the token so it prints at startup, not on first request.
  getPromptApiToken();

  const router = express.Router();

  // Auth middleware — gates /v1/* routes (except public ones like /v1/auth/*)
  router.use(promptApiAuthMiddleware);

  // Auth endpoints (public — exempt from auth middleware)
  router.get('/v1/auth/check', (_req, res) => {
    const auth = _req.headers['authorization'];
    const currentToken = getPromptApiToken();
    if (auth && auth.startsWith('Bearer ') && auth.slice(7) === currentToken) {
      return res.status(200).json({ ok: true });
    }
    return res.status(401).json({ ok: false });
  });

  router.post('/v1/auth/login', (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const body = req.body as { token?: unknown };
    const currentToken = getPromptApiToken();
    if (typeof body.token === 'string' && body.token === currentToken) {
      return res.status(200).json({ ok: true });
    }
    return res.status(401).json({ ok: false, error: 'Invalid token.' });
  });

  // Prune expired login jobs on each request to prevent memory leak
  router.use((_req, _res, next) => {
    pruneExpiredLoginJobs(state);
    next();
  });

  router.get(PROMPT_API_CONSOLE_ROUTE, (_req, res) => {
    res.status(200).type('html').send(getPromptApiConsoleHtml());
  });

  router.get(PROMPT_API_HEALTH_ROUTE, (_req, res) => {
    res.status(200).json({
      ok: true,
      cliBuilt: existsSync(deps.cliEntryPath),
      timeoutMs: deps.timeoutMs,
      isolatedContext: true,
      sessionPolicy: 'per-request',
    });
  });

  // ── Settings ──
  router.get('/v1/settings', (_req, res) => {
    res
      .status(200)
      .json({ settings: state.settings, defaultTimeoutMs: deps.timeoutMs });
  });

  router.put('/v1/settings', (req, res) => {
    try {
      if (!isObject(req.body)) {
        throw new BadRequestError('Request body must be a JSON object.');
      }
      const b = req.body;
      if (b['rotationEnabled'] !== undefined) {
        state.settings.rotationEnabled = Boolean(b['rotationEnabled']);
      }
      if (b['retryEnabled'] !== undefined) {
        state.settings.retryEnabled = Boolean(b['retryEnabled']);
      }
      if (b['retryCount'] !== undefined) {
        const n = Number(b['retryCount']);
        if (!Number.isFinite(n) || n < 1 || n > 10) {
          throw new BadRequestError('"retryCount" must be between 1 and 10.');
        }
        state.settings.retryCount = Math.floor(n);
      }
      if (b['timeoutMs'] !== undefined) {
        const n = Number(b['timeoutMs']);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestError(
            '"timeoutMs" must be a non-negative number.',
          );
        }
        state.settings.timeoutMs = Math.floor(n);
      }
      // Track whether ACP-affecting settings changed
      let acpWorkerSettingsChanged = false;

      if (b['mcpEnabled'] !== undefined) {
        const newVal = Boolean(b['mcpEnabled']);
        if (state.settings.mcpEnabled !== newVal)
          acpWorkerSettingsChanged = true;
        state.settings.mcpEnabled = newVal;
      }
      if (b['extensionsEnabled'] !== undefined) {
        const newVal = Boolean(b['extensionsEnabled']);
        if (state.settings.extensionsEnabled !== newVal)
          acpWorkerSettingsChanged = true;
        state.settings.extensionsEnabled = newVal;
      }
      if (b['skillsEnabled'] !== undefined) {
        const newVal = Boolean(b['skillsEnabled']);
        if (state.settings.skillsEnabled !== newVal)
          acpWorkerSettingsChanged = true;
        state.settings.skillsEnabled = newVal;
      }
      if (b['proxyUrl'] !== undefined) {
        const url = String(b['proxyUrl']).trim();
        if (url && !/^(https?|socks[45]?):\/\//i.test(url)) {
          throw new BadRequestError(
            '"proxyUrl" must be a valid HTTP/SOCKS proxy URL (e.g. http://127.0.0.1:7890).',
          );
        }
        if (state.settings.proxyUrl !== url) acpWorkerSettingsChanged = true;
        state.settings.proxyUrl = url;
      }

      // Restart ACP workers if relevant settings changed
      if (acpWorkerSettingsChanged && state.acpPool.size > 0) {
        logger.info(
          '[Prompt API] ACP-affecting settings changed, restarting workers',
        );
        void state.acpPool.destroyAll();
      }
      if (b['acpIdleTimeoutMs'] !== undefined) {
        const n = Number(b['acpIdleTimeoutMs']);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestError(
            '"acpIdleTimeoutMs" must be a non-negative number.',
          );
        }
        state.settings.acpIdleTimeoutMs = Math.floor(n);
      }
      if (b['maxWorkers'] !== undefined) {
        const n = Number(b['maxWorkers']);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestError(
            '"maxWorkers" must be a non-negative number (0 = unlimited).',
          );
        }
        state.settings.maxWorkers = Math.floor(n);
      }
      if (b['failoverWorkers'] !== undefined) {
        const n = Number(b['failoverWorkers']);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestError(
            '"failoverWorkers" must be a non-negative number.',
          );
        }
        state.settings.failoverWorkers = Math.floor(n);
      }
      return res
        .status(200)
        .json({ settings: state.settings, defaultTimeoutMs: deps.timeoutMs });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ── ACP Management ──
  router.get('/v1/acp/status', (_req, res) => res.status(200).json({
      enabled: true,
      ...state.acpPool.getStatus(),
    }));

  router.get('/v1/acp/sessions', (_req, res) => res.status(200).json({
      sessions: state.acpPool.getAllSessions(),
    }));

  router.post('/v1/acp/sessions', async (req, res) => {
    try {
      const credentialHomeDir = await getEffectiveSourceGeminiCliHome(
        deps,
        state,
      );
      const currentCredentialId =
        await state.credentialStore.getCurrentCredentialId();
      const credentialId = currentCredentialId ?? 'default';

      const worker = await state.acpPool.getOrCreate(
        credentialId,
        credentialHomeDir,
        {
          idleTimeoutMs: state.settings.acpIdleTimeoutMs,
          mcpEnabled: state.settings.mcpEnabled,
          extensionsEnabled: state.settings.extensionsEnabled,
          skillsEnabled: state.settings.skillsEnabled,
          proxyUrl: state.settings.proxyUrl,
          maxWorkers: state.settings.maxWorkers,
          failoverWorkers: state.settings.failoverWorkers,
        },
      );
      const sessionId = await worker.createSession();
      return res.status(200).json({ sessionId, credentialId });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete('/v1/acp/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params as Record<string, string>;
    const worker = state.acpPool.findWorkerBySession(sessionId);
    if (!worker) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    worker.destroySession(sessionId);
    return res.status(200).json({ ok: true });
  });

  router.delete('/v1/acp/workers', async (_req, res) => {
    await state.acpPool.destroyAll();
    return res.status(200).json({ ok: true });
  });

  router.get(PROMPT_API_MODELS_ROUTE, (_req, res) => {
    res.status(200).json(getPromptApiModelsPayload(state));
  });

  router.get(PROMPT_API_CURRENT_MODEL_ROUTE, (_req, res) => {
    res.status(200).json({
      currentModel: getPromptApiCurrentModelPayload(state.currentModel),
      sessionPolicy: 'per-request',
    });
  });

  router.get(PROMPT_API_CREDENTIALS_ROUTE, async (_req, res) => {
    try {
      return res.status(200).json(await getPromptApiCredentialsPayload(state));
    } catch (error) {
      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.get(PROMPT_API_CURRENT_CREDENTIAL_ROUTE, async (_req, res) => {
    try {
      const currentCredentialId =
        await state.credentialStore.getCurrentCredentialId();
      const credential = await state.credentialStore.getCurrentCredential();
      return res.status(200).json({
        currentCredential: credential
          ? getPromptApiCredentialPayload(credential, currentCredentialId)
          : null,
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.delete(PROMPT_API_CREDENTIALS_ROUTE, async (_req, res) => {
    try {
      await state.credentialStore.deleteAllCredentials();
      return res.status(200).json({
        currentCredentialId: null,
        credentials: [],
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.delete(PROMPT_API_CREDENTIAL_ROUTE, async (req, res) => {
    try {
      const credential = await state.credentialStore.getCredential(
        req.params.credentialId,
      );
      if (!credential) {
        return res.status(404).json({
          error: `Credential not found: ${req.params.credentialId}`,
        });
      }

      await state.credentialStore.deleteCredential(req.params.credentialId);
      return res.status(200).json({
        deletedCredentialId: req.params.credentialId,
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.put(PROMPT_API_CURRENT_CREDENTIAL_ROUTE, async (req, res) => {
    try {
      if (!isObject(req.body)) {
        throw new BadRequestError('Request body must be a JSON object.');
      }
      const credentialId = req.body['credentialId'];
      if (
        typeof credentialId !== 'string' ||
        credentialId.trim().length === 0
      ) {
        throw new BadRequestError(
          'A non-empty string "credentialId" field is required.',
        );
      }

      const credential = await state.credentialStore.getCredential(
        credentialId.trim(),
      );
      if (!credential) {
        return res.status(404).json({
          error: `Credential not found: ${credentialId}`,
        });
      }

      await state.credentialStore.setCurrentCredential(credential.id);
      return res.status(200).json({
        currentCredential: getPromptApiCredentialPayload(
          credential,
          credential.id,
        ),
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }

      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.post(PROMPT_API_CREDENTIAL_LOGIN_ROUTE, async (req, res) => {
    try {
      const { credential, loginJob } = await startPromptApiCredentialLogin(
        state,
        req.body,
      );
      const currentCredentialId =
        await state.credentialStore.getCurrentCredentialId();
      return res.status(202).json({
        credential: getPromptApiCredentialPayload(
          credential,
          currentCredentialId,
        ),
        login: getPromptApiCredentialLoginPayload(loginJob),
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }

      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.post(PROMPT_API_CREDENTIAL_LOGIN_COMPLETE_ROUTE, async (req, res) => {
    try {
      const { credential, loginJob } = await completePromptApiCredentialLogin(
        state,
        req.params.loginId,
        req.body,
      );
      const currentCredentialId =
        await state.credentialStore.getCurrentCredentialId();
      return res.status(200).json({
        credential: getPromptApiCredentialPayload(
          credential,
          currentCredentialId,
        ),
        login: getPromptApiCredentialLoginPayload(loginJob),
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }

      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.get(PROMPT_API_CREDENTIAL_LOGIN_STATUS_ROUTE, (req, res) => {
    const loginId = req.params.loginId;
    const loginJob = state.loginJobs.get(loginId);
    if (!loginJob) {
      return res.status(404).json({ error: `Login job not found: ${loginId}` });
    }

    return res.status(200).json({
      login: getPromptApiCredentialLoginPayload(loginJob),
      sessionPolicy: 'per-request',
    });
  });

  router.get(PROMPT_API_QUOTAS_ROUTE, async (_req, res) => {
    try {
      return res.status(200).json(await getPromptApiQuotasPayload(state));
    } catch (error) {
      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.get(PROMPT_API_QUOTA_ROUTE, async (req, res) => {
    try {
      return res
        .status(200)
        .json(
          await getPromptApiCredentialQuotaPayload(
            state,
            req.params.credentialId,
          ),
        );
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(404).json({ error: error.message });
      }

      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  router.put(PROMPT_API_CURRENT_MODEL_ROUTE, (req, res) => {
    try {
      if (!isObject(req.body)) {
        throw new BadRequestError('Request body must be a JSON object.');
      }
      if (!Object.hasOwn(req.body, 'model')) {
        throw new BadRequestError(
          'A non-empty string "model" field is required.',
        );
      }

      state.currentModel = normalizeRequestedModel(req.body['model'], state);
      return res.status(200).json({
        currentModel: getPromptApiCurrentModelPayload(state.currentModel),
        sessionPolicy: 'per-request',
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }

      logPromptApiError(error);
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Unknown prompt API error',
      });
    }
  });

  // ── Gemini native format routes ──
  router.post(PROMPT_API_GEMINI_GENERATE_ROUTE, async (req, res) => {
    try {
      return await handleAdaptedJsonRequest(
        req,
        res,
        geminiAdapter,
        deps,
        state,
      );
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res
          .status(400)
          .json(
            geminiAdapter.buildJsonError(
              error.message,
              400,
              state.currentModel,
              '',
            ),
          );
      }
      logPromptApiError(error);
      return res
        .status(500)
        .json(
          geminiAdapter.buildJsonError(
            error instanceof Error ? error.message : 'Unknown error',
            500,
            state.currentModel,
            '',
          ),
        );
    }
  });

  router.post(PROMPT_API_GEMINI_STREAM_ROUTE, async (req, res) => {
    try {
      return await handleAdaptedStreamingRequest(
        req,
        res,
        geminiAdapter,
        deps,
        state,
      );
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.setHeader('Content-Type', geminiAdapter.streamContentType);
        return res
          .status(400)
          .end(
            geminiAdapter.formatStreamError(
              error.message,
              state.currentModel,
              '',
            ),
          );
      }
      logPromptApiError(error);
      res.setHeader('Content-Type', geminiAdapter.streamContentType);
      return res
        .status(500)
        .end(
          geminiAdapter.formatStreamError(
            error instanceof Error ? error.message : 'Unknown error',
            state.currentModel,
            '',
          ),
        );
    }
  });

  // ── OpenAI compatible format route ──
  router.post(PROMPT_API_OPENAI_COMPLETIONS_ROUTE, async (req, res) => {
    try {
      if (openaiAdapter.wantsStream(req.body)) {
        return await handleAdaptedStreamingRequest(
          req,
          res,
          openaiAdapter,
          deps,
          state,
        );
      }
      return await handleAdaptedJsonRequest(
        req,
        res,
        openaiAdapter,
        deps,
        state,
      );
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res
          .status(400)
          .json(
            openaiAdapter.buildJsonError(
              error.message,
              400,
              state.currentModel,
              '',
            ),
          );
      }
      logPromptApiError(error);
      return res
        .status(500)
        .json(
          openaiAdapter.buildJsonError(
            extractErrorMessage(error),
            500,
            state.currentModel,
            '',
          ),
        );
    }
  });

  // ── Google AI Studio style routes (SillyTavern compatibility) ──
  // SillyTavern appends /v1beta/models/{model}:action to the reverse proxy URL.
  // Depending on whether the user sets the proxy to http://host:port or
  // http://host:port/v1, the actual path can be:
  //   /v1beta/models/{model}:generateContent
  //   /v1/v1beta/models/{model}:generateContent
  //   /v1/models/{model}:generateContent   (kept for direct curl usage)
  // We also serve GET .../models for the model-list preflight SillyTavern does.

  const googleAiStudioGenerateHandler = async (req: Request, res: Response) => {
    try {
      const params = req.params as Record<string, string>;
      const model = params['model'];
      const action = params['action'];

      // Inject the model from path into the request body for the adapter
      if (typeof req.body === 'object' && req.body !== null) {
        if (!req.body.model && !req.body.generationConfig?.model) {
          req.body.model = model;
        }
      }

      if (action === 'generateContent') {
        return await handleAdaptedJsonRequest(
          req,
          res,
          geminiAdapter,
          deps,
          state,
        );
      } else if (action === 'streamGenerateContent') {
        return await handleAdaptedStreamingRequest(
          req,
          res,
          geminiAdapter,
          deps,
          state,
        );
      } else {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res
          .status(400)
          .json(
            geminiAdapter.buildJsonError(
              error.message,
              400,
              state.currentModel,
              '',
            ),
          );
      }
      logPromptApiError(error);
      return res
        .status(500)
        .json(
          geminiAdapter.buildJsonError(
            error instanceof Error ? error.message : 'Unknown error',
            500,
            state.currentModel,
            '',
          ),
        );
    }
  };

  // Google AI Studio style model list (SillyTavern preflight)
  const googleAiStudioModelsHandler = (_req: Request, res: Response) => {
    const modelOptions = getPromptApiModelsPayload(state);
    // Return in Google AI Studio format
    res.status(200).json({
      models: (modelOptions.models ?? []).map((m: PromptApiModelOption) => ({
        name: `models/${m.id}`,
        displayName: m.label,
        supportedGenerationMethods: [
          'generateContent',
          'streamGenerateContent',
        ],
      })),
    });
  };

  // Register generate handler on all path variants
  for (const prefix of ['/v1/models', '/v1beta/models', '/v1/v1beta/models']) {
    router.post(`${prefix}/:model\\::action`, googleAiStudioGenerateHandler);
  }
  // Google AI Studio model list — only on /v1beta paths (SillyTavern preflight).
  // /v1/models is already registered above with the management console format.
  router.get('/v1beta/models', googleAiStudioModelsHandler);
  router.get('/v1/v1beta/models', googleAiStudioModelsHandler);

  // ── Token management ──
  router.put('/v1/auth/token', (req, res) => {
    try {
      if (!isObject(req.body)) {
        throw new BadRequestError('Request body must be a JSON object.');
      }
      const newToken = req.body['token'];
      if (typeof newToken !== 'string' || newToken.trim().length === 0) {
        throw new BadRequestError(
          'A non-empty string "token" field is required.',
        );
      }
      setPromptApiToken(newToken.trim());
      return res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof BadRequestError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.get('/v1/auth/open-api', (_req, res) => {
    res.status(200).json({ openApiEnabled: isOpenApiEnabled() });
  });

  router.put('/v1/auth/open-api', (req, res) => {
    if (!isObject(req.body)) {
      return res
        .status(400)
        .json({ error: 'Request body must be a JSON object.' });
    }
    setOpenApiEnabled(Boolean(req.body['enabled']));
    return res.status(200).json({ openApiEnabled: isOpenApiEnabled() });
  });

  return router;
}
