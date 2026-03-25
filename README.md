# gemini-api2cli

`gemini-api2cli` is a web-facing API bridge built on top of Gemini CLI. It keeps
Gemini CLI as the execution engine, then adds a browser console, token-based
authentication, managed Google credential switching, quota inspection, and
multiple request/response formats on top.

This repository is currently a fork/adaptation of Gemini CLI, so some internal
package names still refer to `gemini-cli` or `a2a-server`. The external product
surface described here is the `gemini-api2cli` layer.

## What It Does

- Exposes a browser console at `/manage`
- Wraps Gemini CLI as an HTTP service
- Supports managed Google OAuth credentials with switchable active account
- Provides quota inspection and credential polling
- Adds token auth plus an optional open-API mode
- Supports both Gemini-style and OpenAI-compatible API formats

## Main Endpoints

### Web Console

- `GET /manage`

### Auth

- `GET /v1/auth/check`
- `POST /v1/auth/login`
- `PUT /v1/auth/token`
- `GET /v1/auth/open-api`
- `PUT /v1/auth/open-api`

### Settings

- `GET /v1/settings`
- `PUT /v1/settings`

### Models

- `GET /v1/models`
- `GET /v1/models/current`
- `PUT /v1/models/current`

### Credentials

- `GET /v1/credentials`
- `DELETE /v1/credentials`
- `DELETE /v1/credentials/:credentialId`
- `GET /v1/credentials/current`
- `PUT /v1/credentials/current`
- `POST /v1/credentials/login`
- `GET /v1/credentials/login/:loginId`
- `POST /v1/credentials/login/:loginId/complete`

### Quotas

- `GET /v1/quotas`
- `GET /v1/quotas/:credentialId`

### Gemini-Style Endpoints

- `POST /v1/gemini/generateContent`
- `POST /v1/gemini/streamGenerateContent`

### OpenAI-Compatible Endpoint

- `POST /v1/openai/chat/completions`

## Request and Response Formats

`gemini-api2cli` now supports three surface styles:

1. Internal prompt API style
   - Used by the management console and some direct routes
   - Wraps Gemini CLI in a project-specific JSON format

2. Gemini-style format
   - Accepts Gemini-like request bodies with `contents` and
     `systemInstruction`
   - Returns Gemini-like JSON or SSE chunks

3. OpenAI-compatible format
   - Accepts `chat.completions` style requests with `messages`
   - Returns OpenAI-like JSON or SSE chunks

Under the hood, all of them still run through Gemini CLI.

## Authentication Model

The API layer has its own token auth middleware.

- Default token env var: `GEMINI_PROMPT_API_TOKEN`
- If not configured, the current fallback token is `root`
- Browser-friendly `?token=` access is also supported
- Open API mode can selectively bypass auth for some routes

Credential login is handled separately from API token auth.

## Managed Credential Flow

Google account login is implemented as a two-step flow:

1. `POST /v1/credentials/login`
   - Creates a login job
   - Returns `loginId`, `authUrl`, and `redirectUri`

2. Complete browser login, then send the localhost callback URL to:
   - `POST /v1/credentials/login/:loginId/complete`

You can poll the current login state with:

- `GET /v1/credentials/login/:loginId`

The currently selected credential is then used automatically for later chat
requests, so callers do not need to send a credential ID on every request.

## Quota Behavior

Quota inspection is exposed through `/v1/quotas` and `/v1/quotas/:credentialId`.

For some Google account plans, the upstream service may return percentage-based
bucket information without a concrete numeric limit. In those cases,
`gemini-api2cli` preserves the ratio-based signal instead of forcing fake `0`
values.

## Web Console

The management UI at `/manage` is designed to help with:

- token auth checks
- Google credential login and completion
- active credential switching
- quota inspection
- model selection
- endpoint discovery and examples

## Development

Start the API server with:

```bash
npm run start:a2a-server
```

Default local address:

```text
http://localhost:41242/manage
```

## Repository Notes

- The current implementation lives mainly under
  `packages/a2a-server/src/http`
- Gemini and OpenAI request translation lives under
  `packages/a2a-server/src/http/adapters`
- The runtime still depends on Gemini CLI login state and execution behavior

## Licensing

This repository uses a mixed licensing model.

- Original Gemini CLI code, and files inherited from or derived from upstream
  Gemini CLI, remain under Apache License 2.0
- `gemini-api2cli`-specific files added in this fork are marked under
  `CNC-1.0`

For the current file-level scope, see [LICENSING.md](./LICENSING.md).

License texts:

- Upstream Apache-2.0: [LICENSE](./LICENSE)
- `gemini-api2cli` CNC-1.0: [LICENSE-CNC-1.0.txt](./LICENSE-CNC-1.0.txt)

Important: this mixed-license note does not revoke or replace Apache-2.0 rights
that apply to upstream Gemini CLI code.
