/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

import type {
  FormatAdapter,
  NormalizedPromptRequest,
  OpenAIRequestBody,
} from './types.js';

class BadRequestError extends Error {}

type MessageEntry = { role: string; content: string };

function isMessageEntry(v: unknown): v is MessageEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    typeof (v as Record<string, unknown>).role === 'string' &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    typeof (v as Record<string, unknown>).content === 'string'
  );
}

/**
 * Adapter for OpenAI Chat Completions API format.
 *
 * Request:
 * ```json
 * {
 *   "model": "gemini-2.5-pro",
 *   "messages": [
 *     { "role": "system", "content": "Be helpful" },
 *     { "role": "user", "content": "Hello" }
 *   ],
 *   "stream": false
 * }
 * ```
 */
export class OpenAIAdapter implements FormatAdapter {
  readonly streamContentType = 'text/event-stream; charset=utf-8';

  parseRequest(body: unknown): NormalizedPromptRequest {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestError('Request body must be a JSON object.');
    }

    const b = body as OpenAIRequestBody;

    if (!Array.isArray(b.messages) || b.messages.length === 0) {
      throw new BadRequestError('"messages" must be a non-empty array.');
    }

    const messages: MessageEntry[] = b.messages.filter(isMessageEntry);
    if (messages.length === 0) {
      throw new BadRequestError(
        'Each message must have "role" and "content" string fields.',
      );
    }

    // Extract system prompt
    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt =
      systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n')
        : undefined;

    // Extract conversation (non-system)
    const conversation = messages.filter((m) => m.role !== 'system');
    if (conversation.length === 0) {
      throw new BadRequestError(
        'Messages must contain at least one non-system message.',
      );
    }

    // Build prompt: if single user message, use directly; if multi-turn, format as conversation
    let prompt: string;
    if (conversation.length === 1) {
      prompt = conversation[0].content;
    } else {
      prompt = conversation
        .map((m) => {
          const label = m.role === 'assistant' ? 'Assistant' : 'User';
          return `${label}: ${m.content}`;
        })
        .join('\n');
    }

    if (prompt.trim().length === 0) {
      throw new BadRequestError('Messages must contain non-empty content.');
    }

    // Model
    let model: string | undefined;
    if (typeof b.model === 'string' && b.model.trim().length > 0) {
      model = b.model;
    }

    return { prompt, systemPrompt, model };
  }

  wantsStream(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) return false;
    return (body as OpenAIRequestBody).stream === true;
  }

  buildJsonResponse(
    assistantText: string,
    model: string,
    requestId: string,
  ): unknown {
    return {
      id: requestId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: assistantText },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  buildJsonError(
    message: string,
    _status: number,
    _model: string,
    _requestId: string,
  ): unknown {
    return {
      error: {
        message,
        type: 'server_error',
        code: null,
      },
    };
  }

  formatStreamChunk(
    content: string,
    model: string,
    requestId: string,
    isFirst: boolean,
  ): string {
    const delta: Partial<{ role: string; content: string }> = { content };
    if (isFirst) {
      delta.role = 'assistant';
    }
    const chunk = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: null,
        },
      ],
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  formatStreamEnd(model: string, requestId: string): string {
    const chunk = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    };
    return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
  }

  formatStreamError(message: string, model: string, requestId: string): string {
    const chunk = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: { content: `\n[Error: ${message}]` },
          finish_reason: 'stop',
        },
      ],
    };
    return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
  }
}

export const openaiAdapter = new OpenAIAdapter();
