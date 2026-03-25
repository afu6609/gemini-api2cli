# gemini-api2cli

`gemini-api2cli` 是一个构建在 Gemini CLI 之上的 Web API 桥接层。它保留 Gemini
CLI 作为底层执行引擎，在此之上增加了浏览器管理台、Token 鉴权、托管 Google 凭证切换、额度查询，以及多种请求/响应格式适配能力。

当前仓库仍然是基于 Gemini CLI 的 fork / 改造版本，所以部分内部包名依然保留
`gemini-cli` 或 `a2a-server`。但从对外能力来看，这一层已经可以视为
`gemini-api2cli`。

## 项目能力

- 提供浏览器管理台 `/manage`
- 将 Gemini CLI 封装为 HTTP API 服务
- 支持多个 Google OAuth 凭证的托管与切换
- 支持额度查询与登录状态轮询
- 提供 Token 鉴权与可选的开放模式
- 同时支持 Gemini 风格与 OpenAI 兼容风格接口

## 主要接口

### Web 管理台

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

### 凭证

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

## 请求与响应格式

`gemini-api2cli` 当前支持三类对外格式：

1. 项目内部 Prompt API 风格
   - 管理台和部分内部路由使用
   - 是围绕 Gemini CLI 定制的一层 JSON 包装

2. Gemini 风格
   - 接收 `contents`、`systemInstruction` 这类 Gemini 风格请求
   - 返回 Gemini 风格 JSON 或 SSE 流

3. OpenAI 兼容风格
   - 接收 `chat.completions` 风格的 `messages`
   - 返回 OpenAI 风格 JSON 或 SSE 流

不管外层格式如何，底层执行仍然是 Gemini CLI。

## 鉴权模型

API 层有自己独立的 Token 鉴权中间件。

- 默认环境变量：`GEMINI_PROMPT_API_TOKEN`
- 如果没有配置，当前默认回退为 `root`
- 同时支持浏览器访问时使用 `?token=...`
- 还可以开启开放模式，对部分 API 选择性绕过鉴权

这里的 API Token 鉴权，与 Google 凭证登录是两套机制。

## 托管凭证登录流程

Google 账号登录采用两段式流程：

1. 调用 `POST /v1/credentials/login`
   - 创建一个登录任务
   - 返回 `loginId`、`authUrl`、`redirectUri`

2. 在浏览器完成授权后，把 localhost 回调 URL 提交到：
   - `POST /v1/credentials/login/:loginId/complete`

登录状态可以通过下面的接口轮询：

- `GET /v1/credentials/login/:loginId`

登录完成后，后续聊天请求会自动使用当前激活凭证，不需要每次显式传
`credentialId`。

## 额度行为

额度查询接口为 `/v1/quotas` 和 `/v1/quotas/:credentialId`。

对于某些 Google 账号套餐，上游返回的可能是基于比例的 bucket 信息，而不是明确的数值上限。遇到这种情况时，`gemini-api2cli`
会保留“剩余比例”这类真实信号，而不是错误地渲染成 `0`。

## Web 管理台

`/manage` 管理页主要用于：

- 检查 Token 鉴权
- 发起并完成 Google 凭证登录
- 切换当前凭证
- 查询额度
- 选择默认模型
- 查看接口说明和示例

## 本地启动

启动 API 服务：

```bash
npm run start:a2a-server
```

默认访问地址：

```text
http://localhost:41242/manage
```

## 仓库说明

- 当前主要实现位于 `packages/a2a-server/src/http`
- Gemini / OpenAI 格式适配位于 `packages/a2a-server/src/http/adapters`
- 运行时依然依赖 Gemini CLI 的登录态与执行链路

## 许可说明

这个仓库当前采用混合许可模型。

- 原始 Gemini CLI 代码，以及继承自上游或基于上游派生的文件，仍然保持 Apache
  License 2.0
- 这个 fork 中新增的 `gemini-api2cli` 特定文件，标记为 `CNC-1.0`

当前按文件划分的适用范围见 [LICENSING.md](./LICENSING.md)。

许可文本：

- 上游 Apache-2.0： [LICENSE](./LICENSE)
- `gemini-api2cli` 的 CNC-1.0： [LICENSE-CNC-1.0.txt](./LICENSE-CNC-1.0.txt)

需要注意的是，这种混合许可说明并不会撤销或替换上游 Gemini
CLI 代码原本适用的 Apache-2.0 权利。
