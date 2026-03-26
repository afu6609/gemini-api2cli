[中文 README](./README.md)

# gemini-api2cli

`gemini-api2cli` is a web-facing API bridge built on top of Gemini CLI. It keeps
Gemini CLI as the execution engine, then adds a browser console, token-based
authentication, managed Google credential switching, quota inspection, request
settings (rotation / retry / timeout), and Gemini-style plus OpenAI-compatible
request/response formats.

This repository is currently a fork/adaptation of Gemini CLI, so some internal
package names still refer to `gemini-cli` or `a2a-server`.

## What It Does

- Exposes a browser console at `/manage` (English / Chinese i18n)
- Wraps Gemini CLI as an HTTP API service
- Supports managed Google OAuth credentials with switchable active account
- Supports credential rotation (round-robin) and error retry
- Provides quota inspection and credential polling
- Adds token auth (covering both Web and API requests), plus optional open-API
  mode
- Supports both Gemini-style and OpenAI-compatible API formats

## Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 10

### Local Setup

```bash
git clone https://github.com/nicekid1/gemini-api2cli.git
cd gemini-api2cli
npm install
npm run start:a2a-server
```

`start:a2a-server` automatically builds `core` → `a2a-server` workspaces in
sequence, then starts the service.

Then open the management console:

```
http://localhost:41242/manage
```

On first visit you will need to enter a token. The default is `root`
(configurable via environment variable).

### Environment Variables

| Variable                  | Description          | Default   |
| ------------------------- | -------------------- | --------- |
| `GEMINI_PROMPT_API_TOKEN` | API / Web auth token | `root`    |
| `CODER_AGENT_PORT`        | Server listen port   | `41242`   |
| `CODER_AGENT_HOST`        | Server bind address  | `0.0.0.0` |

### Docker Deployment

#### 1. Clone and build locally

```bash
git clone https://github.com/nicekid1/gemini-api2cli.git
cd gemini-api2cli
npm install
npm run build --workspace @google/gemini-cli-core
npm run build --workspace @google/gemini-cli
npm run build --workspace @google/gemini-cli-a2a-server
```

> TypeScript compilation is memory-intensive. Build locally first, then package
> the artifacts into a Docker image.

#### 2. Build image and start

```bash
docker build -f Dockerfile.a2a -t gemini-api2cli .
docker run -d -p 41242:41242 \
  -e GEMINI_PROMPT_API_TOKEN=your_token \
  --name gemini-api2cli \
  gemini-api2cli
```

#### Appendix: `Dockerfile.a2a`

The `Dockerfile` in the repository is for the upstream Gemini CLI image and does
not include the API service. Use `Dockerfile.a2a` for the API service. It only
installs runtime dependencies and copies pre-built artifacts (no compilation
inside the container):

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/a2a-server/package.json packages/a2a-server/
RUN npm install --workspace @google/gemini-cli-core --workspace @google/gemini-cli --workspace @google/gemini-cli-a2a-server --ignore-scripts
COPY packages/core/dist/ packages/core/dist/
COPY packages/core/index.ts packages/core/
COPY packages/cli/dist/ packages/cli/dist/
COPY packages/a2a-server/dist/ packages/a2a-server/dist/
EXPOSE 41242
ENV CODER_AGENT_PORT=41242
CMD ["node", "packages/a2a-server/dist/src/http/server.js"]
```

> **Important**: The container has no Google credentials by default. Mount your
> host credential directory:
>
> ```bash
> # Linux / macOS
> docker run ... -v ~/.gemini:/root/.gemini ...
>
> # Windows PowerShell
> docker run ... -v ${env:USERPROFILE}\.gemini:/root/.gemini ...
> ```
>
> This lets the container use your locally logged-in Google credentials.
> Alternatively, log in via the management console at `/manage` after starting.

## Endpoints

### Web Console

| Method | Path      | Description           |
| ------ | --------- | --------------------- |
| GET    | `/manage` | Browser management UI |

### Auth

| Method | Path                | Description                    |
| ------ | ------------------- | ------------------------------ |
| GET    | `/v1/auth/check`    | Check if token is valid        |
| POST   | `/v1/auth/login`    | Login with token (for console) |
| PUT    | `/v1/auth/token`    | Change the runtime token       |
| GET    | `/v1/auth/open-api` | Query open-API mode status     |
| PUT    | `/v1/auth/open-api` | Enable/disable open-API mode   |

### Settings

| Method | Path           | Description                                     |
| ------ | -------------- | ----------------------------------------------- |
| GET    | `/v1/settings` | Get current settings (includes default timeout) |
| PUT    | `/v1/settings` | Update rotation / retry / timeout settings      |

### Models

| Method | Path                 | Description               |
| ------ | -------------------- | ------------------------- |
| GET    | `/v1/models`         | List available models     |
| GET    | `/v1/models/current` | Get current default model |
| PUT    | `/v1/models/current` | Set default model         |

### Credentials

| Method | Path                                      | Description                  |
| ------ | ----------------------------------------- | ---------------------------- |
| GET    | `/v1/credentials`                         | List all credentials         |
| DELETE | `/v1/credentials`                         | Delete all credentials       |
| DELETE | `/v1/credentials/:credentialId`           | Delete a specific credential |
| GET    | `/v1/credentials/current`                 | Get the active credential    |
| PUT    | `/v1/credentials/current`                 | Switch active credential     |
| POST   | `/v1/credentials/login`                   | Start Google account login   |
| GET    | `/v1/credentials/login/:loginId`          | Poll login status            |
| POST   | `/v1/credentials/login/:loginId/complete` | Complete login callback      |

### Quotas

| Method | Path                       | Description                           |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/v1/quotas`               | Query quotas for all credentials      |
| GET    | `/v1/quotas/:credentialId` | Query quota for a specific credential |

### Gemini-Style Endpoints

| Method | Path                               | Description              |
| ------ | ---------------------------------- | ------------------------ |
| POST   | `/v1/gemini/generateContent`       | Non-streaming generation |
| POST   | `/v1/gemini/streamGenerateContent` | SSE streaming generation |

### OpenAI-Compatible Endpoint

| Method | Path                          | Description                                |
| ------ | ----------------------------- | ------------------------------------------ |
| POST   | `/v1/openai/chat/completions` | Chat Completions (supports `stream: true`) |

### Google AI Studio Compatible Endpoints (SillyTavern & other clients)

All paths below also work with `/v1/models/`, `/v1beta/models/`, and
`/v1/v1beta/models/` prefixes:

| Method | Path                                           | Description                        |
| ------ | ---------------------------------------------- | ---------------------------------- |
| GET    | `/v1beta/models`                               | Model list (AI Studio format)      |
| POST   | `/v1beta/models/{model}:generateContent`       | Non-streaming (model name in path) |
| POST   | `/v1beta/models/{model}:streamGenerateContent` | SSE streaming (model name in path) |

## Usage Examples

All examples below assume the service is running at `localhost:41242` with token
`root`.

### OpenAI-Compatible Format (Recommended)

**Non-streaming:**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}]}'
```

**Streaming:**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

**With system prompt:**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"system","content":"You are a translator."},{"role":"user","content":"Hello world"}]}'
```

**Response example (non-streaming):**

```json
{
  "id": "req-xxxxxxxx",
  "object": "chat.completion",
  "created": 1711234567,
  "model": "gemini-2.5-pro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

### Gemini-Style Format

**Non-streaming:**

```bash
curl -X POST http://localhost:41242/v1/gemini/generateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}],"generationConfig":{"model":"gemini-2.5-pro"}}'
```

**Streaming:**

```bash
curl -X POST http://localhost:41242/v1/gemini/streamGenerateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

**With systemInstruction:**

```bash
curl -X POST http://localhost:41242/v1/gemini/generateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}],"systemInstruction":{"parts":[{"text":"Reply in Chinese"}]}}'
```

**Response example (non-streaming):**

```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "Hello!" }], "role": "model" },
      "finishReason": "STOP"
    }
  ],
  "modelVersion": "gemini-2.5-pro"
}
```

### PowerShell Examples

```powershell
# OpenAI format
Invoke-RestMethod -Method Post -Uri "http://localhost:41242/v1/openai/chat/completions" -Headers @{Authorization="Bearer root";"Content-Type"="application/json"} -Body '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}]}'

# Gemini format
Invoke-RestMethod -Method Post -Uri "http://localhost:41242/v1/gemini/generateContent" -Headers @{Authorization="Bearer root";"Content-Type"="application/json"} -Body '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

## Specifying Models

You can specify a model in each request:

| Format            | Field Location                                | Example                                                    |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------- |
| OpenAI-compatible | Top-level `model` field                       | `{"model": "gemini-2.5-flash", ...}`                       |
| Gemini-style      | `generationConfig.model` or top-level `model` | `{"generationConfig": {"model": "gemini-2.5-flash"}, ...}` |

If no model is specified in the request, the server's current default model is
used. Manage the default model with:

```bash
# View current default model
curl http://localhost:41242/v1/models/current -H "Authorization: Bearer root"

# Change default model
curl -X PUT http://localhost:41242/v1/models/current \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash"}'

# List all available models
curl http://localhost:41242/v1/models -H "Authorization: Bearer root"
```

## Authentication Model

The API layer has its own token auth middleware, **covering both the Web console
and API request headers**.

- Default token is `root`, customizable via `GEMINI_PROMPT_API_TOKEN`
  environment variable
- Pass the token via `Authorization: Bearer <token>` header
- Also accepts `x-goog-api-key: <token>` header (SillyTavern and other
  third-party clients)
- Also accepts `?key=<token>` query parameter (Google AI Studio style)
- Browser access also accepts `?token=<token>` query parameter
- **Open-API mode** can be enabled via the console or API to bypass auth for API
  endpoints (the Web console still requires a token)

Token auth and Google credential login are two independent mechanisms:

- **Token**: Controls who can access the API service
- **Google credentials**: Controls which Google account is used to call Gemini

## Request Settings

Configure via `/v1/settings` or the management console:

| Setting           | Description                                              | Default                          |
| ----------------- | -------------------------------------------------------- | -------------------------------- |
| `rotationEnabled` | Credential rotation (round-robin across all credentials) | `false`                          |
| `retryEnabled`    | Auto-retry on error (not on timeout)                     | `false`                          |
| `retryCount`      | Retry count (1-10)                                       | `3`                              |
| `timeoutMs`       | Request timeout in ms, 0 means use default               | `0` (default: 600000ms / 10 min) |

```bash
# View current settings
curl http://localhost:41242/v1/settings -H "Authorization: Bearer root"

# Enable rotation and retry
curl -X PUT http://localhost:41242/v1/settings \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"rotationEnabled":true,"retryEnabled":true,"retryCount":3,"timeoutMs":120000}'
```

## Managed Credential Flow

Google account login uses a two-step flow:

1. Call `POST /v1/credentials/login` to create a login job. Returns `loginId`,
   `authUrl`, and `redirectUri`.
2. Open `authUrl` in a browser and complete Google authorization.
3. Submit the localhost callback URL to
   `POST /v1/credentials/login/:loginId/complete`.

Poll login status with `GET /v1/credentials/login/:loginId`.

After login completes, subsequent chat requests automatically use the currently
active credential. This flow can also be completed entirely through the Web
console.

## Quota Behavior

Quota inspection is exposed through `/v1/quotas` and `/v1/quotas/:credentialId`.

For some Google account plans, the upstream service may return percentage-based
bucket information without a concrete numeric limit. In those cases,
`gemini-api2cli` preserves the ratio-based signal instead of forcing fake `0`
values.

## Web Console

The management UI at `/manage` (supports English / Chinese) provides:

- Token auth login
- Runtime token management / open-API mode toggle
- Google credential login and completion
- Active credential switching
- Per-credential test messaging
- Quota inspection
- Model selection
- Rotation, retry, and timeout configuration

## SillyTavern Integration

This project is compatible with SillyTavern's MakerSuite / Gemini reverse proxy
mode.

### Setup

1. In SillyTavern, select **API type**: `MakerSuite` (Google AI Studio)
2. Set **Reverse Proxy** to: `http://localhost:41242` (without `/v1` suffix)
3. Set **Proxy Password** to your token (default `root`)
4. Enter any model name, e.g. `gemini-3-pro-preview`

SillyTavern automatically appends `/v1beta/models/{model}:generateContent` to
the reverse proxy URL. The server correctly routes these requests and extracts
the model name from the path. Auth is handled via the `x-goog-api-key` header.

> If your reverse proxy URL includes `/v1` (i.e. `http://localhost:41242/v1`),
> the request path becomes `/v1/v1beta/models/...`, which is also supported.

## Repository Notes

- Main implementation: `packages/a2a-server/src/http/promptApi.ts`
- Auth middleware: `packages/a2a-server/src/http/promptApiAuth.ts`
- Console page: `packages/a2a-server/src/http/promptApiConsole.ts`
- Credential store: `packages/a2a-server/src/http/promptCredentialStore.ts`
- Format adapters: `packages/a2a-server/src/http/adapters/`
- The runtime still depends on Gemini CLI login state and execution behavior

## Licensing

This repository uses a mixed licensing model.

- Original Gemini CLI code, and files inherited from or derived from upstream
  Gemini CLI, remain under Apache License 2.0
- `gemini-api2cli`-specific files added in this fork are marked under `CNC-1.0`

For the current file-level scope, see [LICENSING.md](./LICENSING.md).

License texts:

- Upstream Apache-2.0: [LICENSE](./LICENSE)
- `gemini-api2cli` CNC-1.0: [LICENSE-CNC-1.0.txt](./LICENSE-CNC-1.0.txt)

Important: this mixed-license note does not revoke or replace Apache-2.0 rights
that apply to upstream Gemini CLI code.
