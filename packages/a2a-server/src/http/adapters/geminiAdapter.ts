/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import type {
  FormatAdapter,
  NormalizedPromptRequest,
  GeminiPart,
  GeminiContent,
  GeminiRequestBody,
} from './types.js';

class BadRequestError extends Error {}

function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(
      (p): p is GeminiPart =>
        typeof p === 'object' && p !== null && typeof (p as GeminiPart).text === 'string',
    )
    .map((p) => p.text)
    .join('');
}

function isGeminiContent(v: unknown): v is GeminiContent {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as GeminiContent).parts)
  );
}

/**
 * Adapter for Google Generative AI (Gemini) API format.
 *
 * Request:
 * ```json
 * {
 *   "contents": [{ "role": "user", "parts": [{ "text": "Hello" }] }],
 *   "systemInstruction": { "parts": [{ "text": "Be helpful" }] },
 *   "generationConfig": { "model": "gemini-2.5-pro" }
 * }
 * ```
 */
export class GeminiAdapter implements FormatAdapter {
  readonly streamContentType = 'text/event-stream; charset=utf-8';

  parseRequest(body: unknown): NormalizedPromptRequest {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestError('Request body must be a JSON object.');
    }

    const b = body as GeminiRequestBody;

    // Extract contents
    if (!Array.isArray(b.contents) || b.contents.length === 0) {
      throw new BadRequestError(
        '"contents" must be a non-empty array of content objects.',
      );
    }

    const contents = b.contents.filter(isGeminiContent);
    if (contents.length === 0) {
      throw new BadRequestError(
        'Each item in "contents" must have a "parts" array.',
      );
    }

    // Build prompt: if multi-turn, concatenate history then last user message
    let prompt: string;
    if (contents.length === 1) {
      prompt = extractText(contents[0].parts);
    } else {
      const history = contents.slice(0, -1);
      const last = contents[contents.length - 1];
      const historyText = history
        .map((c) => {
          const role = c.role === 'model' ? 'Assistant' : 'User';
          return `${role}: ${extractText(c.parts)}`;
        })
        .join('\n');
      prompt = `${historyText}\nUser: ${extractText(last.parts)}`;
    }

    if (prompt.trim().length === 0) {
      throw new BadRequestError('Contents must contain non-empty text.');
    }

    // System instruction
    let systemPrompt: string | undefined;
    if (b.systemInstruction !== undefined) {
      if (isGeminiContent(b.systemInstruction)) {
        systemPrompt = extractText(b.systemInstruction.parts) || undefined;
      } else {
        throw new BadRequestError(
          '"systemInstruction" must have a "parts" array.',
        );
      }
    }

    // Model — from generationConfig.model or top-level model
    let model: string | undefined;
    if (
      typeof b.generationConfig === 'object' &&
      b.generationConfig !== null &&
      typeof (b.generationConfig as Record<string, unknown>)['model'] === 'string'
    ) {
      model = (b.generationConfig as Record<string, unknown>)['model'] as string;
    } else if (typeof b.model === 'string' && b.model.trim().length > 0) {
      model = b.model;
    }

    return { prompt, systemPrompt, model };
  }

  wantsStream(): boolean {
    return false; // Determined by route, not body
  }

  buildJsonResponse(
    assistantText: string,
    model: string,
    _requestId: string,
  ): unknown {
    return {
      candidates: [
        {
          content: {
            parts: [{ text: assistantText }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      modelVersion: model,
    };
  }

  buildJsonError(
    message: string,
    status: number,
    _model: string,
    _requestId: string,
  ): unknown {
    return {
      error: {
        code: status,
        message,
        status: status === 400 ? 'INVALID_ARGUMENT' : 'INTERNAL',
      },
    };
  }

  formatStreamChunk(
    content: string,
    model: string,
    _requestId: string,
    _isFirst: boolean,
  ): string {
    const chunk = {
      candidates: [
        {
          content: {
            parts: [{ text: content }],
            role: 'model',
          },
        },
      ],
      modelVersion: model,
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  formatStreamEnd(model: string, _requestId: string): string {
    const chunk = {
      candidates: [
        {
          content: { parts: [{ text: '' }], role: 'model' },
          finishReason: 'STOP',
        },
      ],
      modelVersion: model,
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  formatStreamError(
    message: string,
    _model: string,
    _requestId: string,
  ): string {
    const chunk = {
      error: { code: 500, message, status: 'INTERNAL' },
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }
}

export const geminiAdapter = new GeminiAdapter();
