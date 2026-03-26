[English README](./README.en.md)

# gemini-api2cli

`gemini-api2cli` 是一个构建在 Gemini CLI 之上的 Web API 桥接层。它保留 Gemini
CLI 作为底层执行引擎，在此之上增加了浏览器管理台、Token 鉴权、托管 Google 凭证切换、额度查询、请求设置（轮询 / 重试 / 超时），以及 Gemini 风格和 OpenAI 兼容风格的请求 / 响应格式适配。

当前仓库仍然是基于 Gemini CLI 的 fork / 改造版本，所以部分内部包名依然保留
`gemini-cli` 或 `a2a-server`。

## 项目能力

- 提供浏览器管理台 `/manage`（支持中文 / 英文切换）
- 将 Gemini CLI 封装为 HTTP API 服务
- 支持多个 Google OAuth 凭证的托管与切换
- 支持凭证轮询（Round-Robin）与错误重试
- 支持额度查询与登录状态轮询
- 提供 Token 鉴权（同时覆盖 Web 和 API 请求头），支持可选的开放 API 模式
- 同时支持 Gemini 风格与 OpenAI 兼容风格接口

## 快速开始

### 前置条件

- Node.js >= 20
- npm >= 10

### 本地启动

```bash
npm install
npm run start:a2a-server
```

启动后访问管理台：

```
http://localhost:41242/manage
```

首次访问需要输入 Token，默认值为 `root`（可通过环境变量修改）。

### 环境变量

| 变量名                    | 说明                 | 默认值  |
| ------------------------- | -------------------- | ------- |
| `GEMINI_PROMPT_API_TOKEN` | API / Web 鉴权 Token | `root`  |
| `CODER_AGENT_PORT`        | 服务监听端口         | `41242` |

### Docker 快速部署

```bash
docker build -t gemini-api2cli .
docker run -d -p 41242:41242 \
  -e GEMINI_PROMPT_API_TOKEN=your_token \
  gemini-api2cli
```

如果没有 Dockerfile，可以手动构建镜像：

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install && npm run build --workspace @google/gemini-cli-core && npm run build --workspace @google/gemini-cli-a2a-server
EXPOSE 41242
ENV CODER_AGENT_PORT=41242
CMD ["npm", "run", "start", "--workspace", "@google/gemini-cli-a2a-server"]
```

## 接口列表

### Web 管理台

| 方法 | 路径      | 说明           |
| ---- | --------- | -------------- |
| GET  | `/manage` | 浏览器管理页面 |

### 鉴权

| 方法 | 路径                | 说明                        |
| ---- | ------------------- | --------------------------- |
| GET  | `/v1/auth/check`    | 检查 Token 是否有效         |
| POST | `/v1/auth/login`    | 用 Token 登录（用于管理台） |
| PUT  | `/v1/auth/token`    | 修改运行时 Token            |
| GET  | `/v1/auth/open-api` | 查询开放 API 模式状态       |
| PUT  | `/v1/auth/open-api` | 开启/关闭开放 API 模式      |

### 设置

| 方法 | 路径           | 说明                           |
| ---- | -------------- | ------------------------------ |
| GET  | `/v1/settings` | 获取当前设置（含默认超时时间） |
| PUT  | `/v1/settings` | 修改轮询 / 重试 / 超时设置     |

### 模型

| 方法 | 路径                 | 说明             |
| ---- | -------------------- | ---------------- |
| GET  | `/v1/models`         | 获取可用模型列表 |
| GET  | `/v1/models/current` | 获取当前默认模型 |
| PUT  | `/v1/models/current` | 设置默认模型     |

### 凭证管理

| 方法   | 路径                                      | 说明                 |
| ------ | ----------------------------------------- | -------------------- |
| GET    | `/v1/credentials`                         | 列出所有凭证         |
| DELETE | `/v1/credentials`                         | 删除所有凭证         |
| DELETE | `/v1/credentials/:credentialId`           | 删除指定凭证         |
| GET    | `/v1/credentials/current`                 | 获取当前活跃凭证     |
| PUT    | `/v1/credentials/current`                 | 切换活跃凭证         |
| POST   | `/v1/credentials/login`                   | 发起 Google 账号登录 |
| GET    | `/v1/credentials/login/:loginId`          | 查询登录状态         |
| POST   | `/v1/credentials/login/:loginId/complete` | 完成登录回调         |

### 额度

| 方法 | 路径                       | 说明             |
| ---- | -------------------------- | ---------------- |
| GET  | `/v1/quotas`               | 查询所有凭证额度 |
| GET  | `/v1/quotas/:credentialId` | 查询指定凭证额度 |

### Gemini 风格接口

| 方法 | 路径                               | 说明         |
| ---- | ---------------------------------- | ------------ |
| POST | `/v1/gemini/generateContent`       | 非流式生成   |
| POST | `/v1/gemini/streamGenerateContent` | SSE 流式生成 |

### OpenAI 兼容接口

| 方法 | 路径                          | 说明                                    |
| ---- | ----------------------------- | --------------------------------------- |
| POST | `/v1/openai/chat/completions` | Chat Completions（支持 `stream: true`） |

### Google AI Studio 兼容接口（SillyTavern 等第三方客户端）

以下路径同时支持 `/v1/models/`、`/v1beta/models/`、`/v1/v1beta/models/`
三种前缀：

| 方法 | 路径                                           | 说明                       |
| ---- | ---------------------------------------------- | -------------------------- |
| GET  | `/v1beta/models`                               | 模型列表（AI Studio 格式） |
| POST | `/v1beta/models/{model}:generateContent`       | 非流式生成（路径传模型）   |
| POST | `/v1beta/models/{model}:streamGenerateContent` | SSE 流式生成（路径传模型） |

## 使用示例

以下示例假设服务运行在 `localhost:41242`，Token 为 `root`。

### OpenAI 兼容格式（推荐）

**非流式请求：**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"你好"}]}'
```

**流式请求：**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"你好"}],"stream":true}'
```

**带 system prompt：**

```bash
curl -X POST http://localhost:41242/v1/openai/chat/completions \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-pro","messages":[{"role":"system","content":"你是一个翻译助手"},{"role":"user","content":"Hello world"}]}'
```

**响应示例（非流式）：**

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
        "content": "你好！有什么可以帮助你的吗？"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

### Gemini 风格格式

**非流式：**

```bash
curl -X POST http://localhost:41242/v1/gemini/generateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"你好"}]}],"generationConfig":{"model":"gemini-2.5-pro"}}'
```

**流式：**

```bash
curl -X POST http://localhost:41242/v1/gemini/streamGenerateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"你好"}]}]}'
```

**带 systemInstruction：**

```bash
curl -X POST http://localhost:41242/v1/gemini/generateContent \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}],"systemInstruction":{"parts":[{"text":"用中文回答"}]}}'
```

**响应示例（非流式）：**

```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "你好！" }], "role": "model" },
      "finishReason": "STOP"
    }
  ],
  "modelVersion": "gemini-2.5-pro"
}
```

### PowerShell 示例

```powershell
# OpenAI 格式
Invoke-RestMethod -Method Post -Uri "http://localhost:41242/v1/openai/chat/completions" -Headers @{Authorization="Bearer root";"Content-Type"="application/json"} -Body '{"model":"gemini-2.5-pro","messages":[{"role":"user","content":"Hello"}]}'

# Gemini 格式
Invoke-RestMethod -Method Post -Uri "http://localhost:41242/v1/gemini/generateContent" -Headers @{Authorization="Bearer root";"Content-Type"="application/json"} -Body '{"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}'
```

## 如何指定模型

在每个请求中可以通过以下方式指定使用的模型：

| 格式        | 字段位置                                | 示例                                                       |
| ----------- | --------------------------------------- | ---------------------------------------------------------- |
| OpenAI 兼容 | 顶层 `model` 字段                       | `{"model": "gemini-2.5-flash", ...}`                       |
| Gemini 风格 | `generationConfig.model` 或顶层 `model` | `{"generationConfig": {"model": "gemini-2.5-flash"}, ...}` |

如果请求中未指定模型，则使用服务端当前默认模型。可以通过以下方式管理默认模型：

```bash
# 查看当前默认模型
curl http://localhost:41242/v1/models/current -H "Authorization: Bearer root"

# 修改默认模型
curl -X PUT http://localhost:41242/v1/models/current \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash"}'

# 查看所有可用模型
curl http://localhost:41242/v1/models -H "Authorization: Bearer root"
```

## 鉴权模型

API 层有自己独立的 Token 鉴权中间件，**同时覆盖 Web 管理页面和 API 请求头**。

- 默认 Token 为 `root`，可通过环境变量 `GEMINI_PROMPT_API_TOKEN` 自定义
- 请求时通过 `Authorization: Bearer <token>` 传递
- 也支持 `x-goog-api-key: <token>` 请求头（兼容 SillyTavern 等第三方客户端）
- 也支持 `?key=<token>` 查询参数（Google AI Studio 风格）
- 浏览器访问也支持 `?token=<token>` 参数
- 可以在管理台或通过 API 开启**开放 API 模式**，绕过 API 接口鉴权（管理页面仍需 Token）

Token 鉴权与 Google 凭证登录是两套独立机制：

- **Token**：控制谁可以访问这个 API 服务
- **Google 凭证**：控制用哪个 Google 账号调用 Gemini

## 请求设置

通过 `/v1/settings` 或管理台可以配置：

| 设置项            | 说明                                      | 默认值                         |
| ----------------- | ----------------------------------------- | ------------------------------ |
| `rotationEnabled` | 凭证轮询（Round-Robin），所有凭证轮流使用 | `false`                        |
| `retryEnabled`    | 错误时自动重试（超时不重试）              | `false`                        |
| `retryCount`      | 重试次数（1-10）                          | `3`                            |
| `timeoutMs`       | 请求超时时间（毫秒），0 表示使用默认值    | `0`（默认 600000ms / 10 分钟） |

```bash
# 查看当前设置
curl http://localhost:41242/v1/settings -H "Authorization: Bearer root"

# 开启轮询和重试
curl -X PUT http://localhost:41242/v1/settings \
  -H "Authorization: Bearer root" \
  -H "Content-Type: application/json" \
  -d '{"rotationEnabled":true,"retryEnabled":true,"retryCount":3,"timeoutMs":120000}'
```

## 托管凭证登录流程

Google 账号登录采用两段式流程：

1. 调用 `POST /v1/credentials/login` 创建登录任务，返回
   `loginId`、`authUrl`、`redirectUri`
2. 在浏览器中打开 `authUrl` 完成 Google 授权
3. 把 localhost 回调 URL 提交到 `POST /v1/credentials/login/:loginId/complete`

登录状态可通过 `GET /v1/credentials/login/:loginId` 轮询。

登录完成后，后续聊天请求会自动使用当前激活凭证。也可以在管理台中直接完成这一流程。

## 额度行为

额度查询接口为 `/v1/quotas` 和 `/v1/quotas/:credentialId`。

对于某些 Google 账号套餐，上游返回的可能是基于比例的 bucket 信息，而不是明确的数值上限。遇到这种情况时，`gemini-api2cli`
会保留"剩余比例"这类真实信号，而不是错误地渲染成 `0`。

## Web 管理台

`/manage` 管理页（支持中文 / 英文切换）主要用于：

- Token 鉴权登录
- 修改运行时 Token / 开启开放 API 模式
- 发起并完成 Google 凭证登录
- 切换当前凭证
- 针对指定凭证发送测试消息
- 查询额度
- 选择默认模型
- 配置轮询、重试、超时

## SillyTavern（酒馆）接入

本项目兼容 SillyTavern 的 MakerSuite / Gemini 反向代理模式。

### 配置方法

1. 在 SillyTavern 中选择 **API 类型**：`MakerSuite` (Google AI Studio)
2. **反向代理地址**设为：`http://localhost:41242`（不要带 `/v1` 后缀）
3. **代理密码**填写你的 Token（默认 `root`）
4. 模型名可自由填写，如 `gemini-3-pro-preview`

SillyTavern 会自动在反代地址后拼接
`/v1beta/models/{model}:generateContent`，服务端会正确路由并从路径中提取模型名。鉴权通过
`x-goog-api-key` 请求头自动兼容。

> 如果你的反代地址带了 `/v1`（即 `http://localhost:41242/v1`），请求路径会变为
> `/v1/v1beta/models/...`，服务端同样支持。

## 仓库说明

- 主要实现：`packages/a2a-server/src/http/promptApi.ts`
- 鉴权中间件：`packages/a2a-server/src/http/promptApiAuth.ts`
- 管理台页面：`packages/a2a-server/src/http/promptApiConsole.ts`
- 凭证存储：`packages/a2a-server/src/http/promptCredentialStore.ts`
- 格式适配器：`packages/a2a-server/src/http/adapters/`
- 运行时依然依赖 Gemini CLI 的登录态与执行链路

## 许可说明

这个仓库当前采用混合许可模型。

- 原始 Gemini CLI 代码，以及继承自上游或基于上游派生的文件，仍然保持 Apache
  License 2.0
- 这个 fork 中新增的 `gemini-api2cli` 特定文件，标记为 `CNC-1.0`

当前按文件划分的适用范围见 [LICENSING.md](./LICENSING.md)。

许可文本：

- 上游 Apache-2.0：[LICENSE](./LICENSE)
- `gemini-api2cli` 的 CNC-1.0：[LICENSE-CNC-1.0.txt](./LICENSE-CNC-1.0.txt)

需要注意的是，这种混合许可说明并不会撤销或替换上游 Gemini
CLI 代码原本适用的 Apache-2.0 权利。
