/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from '@google/gemini-cli-core';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const GEMINI_DIR_NAME = '.gemini';

type PromptCredentialStoreState = {
  currentCredentialId?: string;
};

export type PromptApiCredentialRecord = {
  id: string;
  label: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

const SAFE_CREDENTIAL_ID_RE = /^[a-zA-Z0-9_-]+$/;

function assertSafeCredentialId(credentialId: string): void {
  if (!SAFE_CREDENTIAL_ID_RE.test(credentialId)) {
    throw new Error(
      `Invalid credential ID: "${credentialId}". Only alphanumeric characters, hyphens, and underscores are allowed.`,
    );
  }
}

export class PromptCredentialStore {
  constructor(
    private readonly rootDir: string = getDefaultPromptCredentialStoreRoot(),
  ) {}

  async listCredentials(): Promise<PromptApiCredentialRecord[]> {
    const credentialsDir = this.getCredentialsDir();
    if (!existsSync(credentialsDir)) {
      return [];
    }

    const entries = await readdir(credentialsDir, { withFileTypes: true });
    const credentials = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => this.readCredential(entry.name)),
    );

    return credentials
      .filter(
        (credential): credential is PromptApiCredentialRecord =>
          credential !== undefined,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCredential(
    credentialId: string,
  ): Promise<PromptApiCredentialRecord | undefined> {
    return this.readCredential(credentialId);
  }

  async getCurrentCredentialId(): Promise<string | undefined> {
    const state = await this.readState();
    return state.currentCredentialId;
  }

  async setCurrentCredential(credentialId: string): Promise<void> {
    const state = await this.readState();
    state.currentCredentialId = credentialId;
    await this.writeState(state);
  }

  async clearCurrentCredential(): Promise<void> {
    await this.writeState({});
  }

  async getCurrentCredential(): Promise<PromptApiCredentialRecord | undefined> {
    const credentialId = await this.getCurrentCredentialId();
    if (!credentialId) {
      return undefined;
    }
    return this.getCredential(credentialId);
  }

  async createCredential(
    label?: string,
    credentialId?: string,
  ): Promise<PromptApiCredentialRecord> {
    const id = credentialId ?? randomUUID();
    const now = new Date().toISOString();
    const record: PromptApiCredentialRecord = {
      id,
      label: label?.trim() || `Credential ${id.slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
    };

    await mkdir(this.getCredentialDir(id), { recursive: true });
    await writeFile(
      this.getCredentialMetadataPath(id),
      JSON.stringify(record, null, 2),
      'utf8',
    );
    return record;
  }

  async markCredentialLoggedIn(
    credentialId: string,
  ): Promise<PromptApiCredentialRecord> {
    const existing = await this.getCredential(credentialId);
    if (!existing) {
      throw new Error(`Credential not found: ${credentialId}`);
    }

    const now = new Date().toISOString();
    const email = await this.readCredentialEmail(credentialId);
    const updated: PromptApiCredentialRecord = {
      ...existing,
      ...(email ? { email } : {}),
      updatedAt: now,
      lastLoginAt: now,
    };

    await writeFile(
      this.getCredentialMetadataPath(credentialId),
      JSON.stringify(updated, null, 2),
      'utf8',
    );
    return updated;
  }

  getCredentialHomeDir(credentialId: string): string {
    return path.join(this.getCredentialDir(credentialId), 'home');
  }

  async deleteCredential(credentialId: string): Promise<void> {
    const currentCredentialId = await this.getCurrentCredentialId();
    await rm(this.getCredentialDir(credentialId), {
      recursive: true,
      force: true,
    });
    if (currentCredentialId === credentialId) {
      await this.clearCurrentCredential();
    }
  }

  async deleteAllCredentials(): Promise<void> {
    await rm(this.getCredentialsDir(), { recursive: true, force: true });
    await this.clearCurrentCredential();
  }

  private async readCredential(
    credentialId: string,
  ): Promise<PromptApiCredentialRecord | undefined> {
    const metadataPath = this.getCredentialMetadataPath(credentialId);
    if (!existsSync(metadataPath)) {
      return undefined;
    }

    const raw = await readFile(metadataPath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return JSON.parse(raw) as PromptApiCredentialRecord;
  }

  private async readState(): Promise<PromptCredentialStoreState> {
    const statePath = this.getStatePath();
    if (!existsSync(statePath)) {
      return {};
    }

    const raw = await readFile(statePath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return JSON.parse(raw) as PromptCredentialStoreState;
  }

  private async writeState(state: PromptCredentialStoreState): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      this.getStatePath(),
      JSON.stringify(state, null, 2),
      'utf8',
    );
  }

  private async readCredentialEmail(
    credentialId: string,
  ): Promise<string | undefined> {
    const accountsPath = path.join(
      this.getCredentialHomeDir(credentialId),
      GEMINI_DIR_NAME,
      'google_accounts.json',
    );
    if (!existsSync(accountsPath)) {
      return undefined;
    }

    const raw = await readFile(accountsPath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = JSON.parse(raw) as { active?: string | null };
    return parsed.active ?? undefined;
  }

  private getCredentialsDir(): string {
    return path.join(this.rootDir, 'credentials');
  }

  private getCredentialDir(credentialId: string): string {
    assertSafeCredentialId(credentialId);
    return path.join(this.getCredentialsDir(), credentialId);
  }

  private getCredentialMetadataPath(credentialId: string): string {
    return path.join(this.getCredentialDir(credentialId), 'metadata.json');
  }

  private getStatePath(): string {
    return path.join(this.rootDir, 'state.json');
  }
}

function getDefaultPromptCredentialStoreRoot(): string {
  return path.join(homedir(), GEMINI_DIR_NAME, 'prompt-api');
}
