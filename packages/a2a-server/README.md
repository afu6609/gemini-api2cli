# a2a-server / gemini-api2cli HTTP 层

这个包目前同时承担两件事：

1. 保留原有的 Gemini CLI A2A server 能力
2. 提供 `gemini-api2cli` 这一层 HTTP API、Web 管理台和协议适配能力

## 当前定位

如果 A2A 所需的直接 Gemini 配置可以正常初始化，这个包会同时提供 A2A 路由和 Prompt
API 路由。

如果 A2A 初始化失败，服务也可以继续以 prompt-api-only 模式启动，此时仍可使用：

- `/manage`
- `/v1/auth/*`
- `/v1/settings`
- `/v1/models*`
- `/v1/credentials*`
- `/v1/quotas*`
- `/v1/gemini/*`
- `/v1/openai/*`

## 目录结构

当前 HTTP 相关核心文件主要包括：

- `src/http/app.ts`
  - Express 入口
  - 挂载 Prompt API
  - 负责与 A2A 启动链路衔接

- `src/http/promptApi.ts`
  - Prompt API 主路由
  - Web 管理台、设置、模型、凭证、额度、Gemini/OpenAI 适配入口

- `src/http/promptApiAuth.ts`
  - Token 鉴权中间件
  - 开放模式开关

- `src/http/promptApiConsole.ts`
  - `/manage` 管理台页面

- `src/http/promptCredentialStore.ts`
  - 托管凭证存储
  - 当前凭证切换
  - 凭证增删与登录状态落盘

- `src/http/adapters/geminiAdapter.ts`
  - Gemini 风格请求/响应适配

- `src/http/adapters/openaiAdapter.ts`
  - OpenAI Chat Completions 兼容适配

## 主要路由

### 管理台

- `GET /manage`

### 鉴权

- `GET /v1/auth/check`
- `POST /v1/auth/login`
- `PUT /v1/auth/token`
- `GET /v1/auth/open-api`
- `PUT /v1/auth/open-api`

### 设置

- `GET /v1/settings`
- `PUT /v1/settings`

### 模型

- `GET /v1/models`
- `GET /v1/models/current`
- `PUT /v1/models/current`

### 托管凭证

- `GET /v1/credentials`
- `DELETE /v1/credentials`
- `DELETE /v1/credentials/:credentialId`
- `GET /v1/credentials/current`
- `PUT /v1/credentials/current`
- `POST /v1/credentials/login`
- `GET /v1/credentials/login/:loginId`
- `POST /v1/credentials/login/:loginId/complete`

### 额度

- `GET /v1/quotas`
- `GET /v1/quotas/:credentialId`

### Gemini 风格接口

- `POST /v1/gemini/generateContent`
- `POST /v1/gemini/streamGenerateContent`

### OpenAI 兼容接口

- `POST /v1/openai/chat/completions`

## 鉴权说明

Prompt API 有自己独立的鉴权层，不复用 A2A 那套简单示例鉴权。

- 默认 Token 环境变量：`GEMINI_PROMPT_API_TOKEN`
- 若未配置，当前会回退到默认值 `root`
- 支持 `Authorization: Bearer <token>`
- 也支持浏览器访问时通过 `?token=...`
- 可通过 `/v1/auth/open-api` 开启部分开放接口

## 请求格式说明

### 内部 Prompt API 风格

这层仍然存在，用于管理台和部分内部路由，底层本质上还是调用 Gemini CLI。

### Gemini 风格

通过 `geminiAdapter` 把请求转换为内部标准格式，再交给 Gemini CLI 执行。

支持：

- 非流式 `generateContent`
- 流式 `streamGenerateContent`

### OpenAI 兼容风格

通过 `openaiAdapter` 接收 `chat.completions` 风格的 `messages`
请求，再映射到内部标准格式。

支持：

- `stream: false`
- `stream: true`

## 托管凭证与轮询

Google 登录采用两段式设计：

1. `POST /v1/credentials/login`
   - 创建登录任务
   - 返回 `loginId`、`authUrl`、`redirectUri`

2. 用户在浏览器完成授权后，将 localhost 回调 URL 提交到：
   - `POST /v1/credentials/login/:loginId/complete`

登录任务状态可通过以下接口轮询：

- `GET /v1/credentials/login/:loginId`

服务端还会在请求经过时清理过期登录任务，避免长期积压在内存里。

## 额度与模型

额度接口基于当前托管凭证读取上游 quota buckets，并返回：

- 原始 bucket 信息
- 汇总后的比例/重置时间
- Google AI 积分信息（如果上游提供）
- 当前套餐/用户层级信息

模型接口则负责维护 Prompt
API 默认模型；当请求未显式指定模型时，会使用当前默认值。

## Web 管理台

`/manage` 页面主要面向人工管理和联调，支持：

- Token 登录
- Google 凭证发起登录与完成登录
- 当前凭证切换
- 凭证删除
- 额度查看
- 模型切换
- Gemini / OpenAI / 管理接口示例查看

## 启动

从仓库根目录启动：

```bash
npm run start:a2a-server
```

默认管理台地址：

```text
http://localhost:41242/manage
```

## 许可范围说明

这个包所在仓库当前采用混合许可模型：

- 原始 Gemini CLI / A2A 相关上游代码仍然保持 Apache-2.0
- `gemini-api2cli` 新增的 HTTP 层文件按 `CNC-1.0` 标注

更完整的文件范围说明见根目录 [LICENSING.md](../../LICENSING.md)。
