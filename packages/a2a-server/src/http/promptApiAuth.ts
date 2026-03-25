/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

const ENV_TOKEN_KEY = 'GEMINI_PROMPT_API_TOKEN';

let resolvedToken: string | undefined;
let openApiEnabled = false;

export function getPromptApiToken(): string {
  if (resolvedToken) {
    return resolvedToken;
  }

  const envToken = process.env[ENV_TOKEN_KEY]?.trim();
  if (envToken && envToken.length > 0) {
    resolvedToken = envToken;
    logger.info(
      '[Prompt API Auth] Using token from environment variable ' +
        ENV_TOKEN_KEY,
    );
  } else {
    resolvedToken = 'root';
    logger.info(
      '[Prompt API Auth] No token configured. Using default token: root',
    );
    logger.info(
      '[Prompt API Auth] Set ' +
        ENV_TOKEN_KEY +
        ' environment variable to use a custom token.',
    );
  }

  return resolvedToken;
}

export function setPromptApiToken(newToken: string): void {
  resolvedToken = newToken;
  logger.info('[Prompt API Auth] Token updated at runtime.');
}

export function isOpenApiEnabled(): boolean {
  return openApiEnabled;
}

export function setOpenApiEnabled(enabled: boolean): void {
  openApiEnabled = enabled;
  logger.info(
    `[Prompt API Auth] API auth bypass ${enabled ? 'enabled' : 'disabled'}.`,
  );
}

/**
 * Routes that are exempt from auth — the console page itself handles login
 * client-side and the auth check endpoint needs to be reachable.
 */
const PUBLIC_PATHS = new Set(['/manage', '/v1/auth/check', '/v1/auth/login']);

/** API paths that can be bypassed when openApi is enabled */
const API_PATH_PREFIXES = [
  '/v1/gemini/',
  '/v1/openai/',
  '/v1/models',
  '/v1/health',
  '/v1/settings',
];

export function promptApiAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Only gate /v1/* and /manage paths
  if (!req.path.startsWith('/v1/') && req.path !== '/manage') {
    next();
    return;
  }

  // Public paths are always accessible
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  // When open API is enabled, skip auth for API endpoints (not manage/auth/credentials)
  if (openApiEnabled && API_PATH_PREFIXES.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const token = getPromptApiToken();
  const authHeader = req.headers['authorization'];

  if (authHeader) {
    // Bearer <token>
    if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === token) {
      next();
      return;
    }
  }

  // Also accept ?token= query parameter (for simple browser access)
  if (req.query['token'] === token) {
    next();
    return;
  }

  res.status(401).json({
    error:
      'Unauthorized. Provide a valid token via Authorization: Bearer <token> header.',
  });
}
