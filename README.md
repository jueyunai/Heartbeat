# Heartbeat

Heartbeat 是一个轻量的模型端点巡检面板，适合快速检查多个大模型 API 端点的可用性、响应耗时、错误状态，以及上游实际返回的可用模型列表。

当前项目基于 Next.js App Router 构建，界面聚焦“手动触发、即时反馈”，不做持续轮询，也不做历史存储。

## 当前功能

- 支持按端点手动检测
- 支持一键检测全部端点
- 支持单个端点下多个模型并行检测
- 支持展示每个模型的检测结果、耗时、重试次数和最后检测时间
- 支持展示端点状态标签，例如“可用 / 不可用”
- 支持拉取并展示上游返回的可用模型列表
- 支持将“已配模型”和“上游可用模型”展开查看并点击复制
- 支持按模型类型对端点分组查看：Claude / GPT / 国产模型
- 支持 OpenAI Compatible、OpenAI Responses、Anthropic Compatible 三类协议
- 内置超时、限流、鉴权失败、服务异常等状态识别
- 对部分错误信息做了脱敏和 HTML 拦截页识别，便于排查网关或 Cloudflare 拦截问题

## 页面说明

首页主要包含两部分：

### 1. 顶部概览区

展示当前巡检汇总信息：

- 检测端点数
- 成功模型数
- 失败模型数
- 平均耗时
- 重试次数

并提供“检测全部”按钮。

### 2. 端点列表区

每个端点卡片会展示：

- 端点名称
- 协议类型
- 端点状态标签
- 已配模型摘要
- 上游可用模型摘要
- 单独检测按钮
- 每个模型的检测状态、耗时、结果说明、检测时间、重试次数

当模型数量较多时，可以展开浮层查看完整列表，并直接点击复制模型名。

## 配置方式

项目优先读取 `config/targets.json`；如果该文件中存在有效配置，则不会再回退到环境变量模式。

### 方式一：`config/targets.json`

配置文件路径：`config/targets.json`

支持的顶层结构：

```json
{
  "defaults": {
    "timeoutMs": 8000,
    "enabled": true,
    "maxRetries": 3,
    "degradedThresholdMs": 4000,
    "checkPrompt": "你是谁"
  },
  "targets": [
    {
      "id": "openai-1",
      "name": "示例端点",
      "providerType": "openai-compatible",
      "baseUrl": "https://example.com/v1",
      "models": ["gpt-4.1"],
      "status": "可用",
      "apiKey": "YOUR_API_KEY"
    }
  ]
}
```

字段说明：

- `id`：端点唯一标识
- `name`：端点显示名称
- `providerType`：协议类型，可选值：
  - `openai-compatible`
  - `openai-responses`
  - `anthropic-compatible`
- `baseUrl`：接口基础地址
- `models`：当前端点配置的模型列表
- `status`：前端展示用状态标签，可选
- `apiKey`：端点密钥
- `timeoutMs`：超时时间，毫秒
- `enabled`：是否启用
- `maxRetries`：失败后最大重试次数
- `degradedThresholdMs`：超过该耗时后会标记为“偏慢”
- `checkPrompt`：巡检请求使用的提示词

### 方式二：环境变量

当 `config/targets.json` 不存在或没有有效目标时，项目会回退到环境变量配置。

支持两种环境变量格式：

#### 1. 多端点编号格式

```bash
OPENAI_1_NAME=OpenAI 通道 1
OPENAI_1_BASE_URL=https://example.com/v1
OPENAI_1_MODELS=gpt-4.1,gpt-4.1-mini
OPENAI_1_API_KEY=xxx
OPENAI_1_TIMEOUT_MS=8000
OPENAI_1_MAX_RETRIES=2
OPENAI_1_DEGRADED_THRESHOLD_MS=4000
OPENAI_1_CHECK_PROMPT=ping
```

Anthropic 端点同理：

```bash
ANTHROPIC_1_NAME=Anthropic 通道 1
ANTHROPIC_1_BASE_URL=https://api.anthropic.com
ANTHROPIC_1_MODELS=claude-3-5-haiku-latest
ANTHROPIC_1_API_KEY=xxx
```

#### 2. 单端点兼容格式

```bash
OPENAI_NAME=OpenAI 通道
OPENAI_BASE_URL=https://example.com/v1
OPENAI_MODELS=gpt-4.1
OPENAI_API_KEY=xxx
```

## 接口说明

### `GET /api/check`

返回当前可用端点列表。

### `POST /api/check`

发起检测请求。

请求体：

```json
{ "mode": "all" }
```

或：

```json
{ "mode": "one", "targetId": "openai-1" }
```

### `GET /api/models`

拉取模型列表。

- 不传 `targetId`：获取全部端点的模型列表
- 传 `targetId`：获取指定端点的模型列表

例如：

```bash
/api/models?targetId=openai-1
```

## 检测逻辑

不同协议的检测方式如下：

- `openai-compatible`：请求 `/chat/completions`
- `openai-responses`：请求 `/responses`
- `anthropic-compatible`：请求 `/v1/messages`

模型列表拉取方式如下：

- OpenAI 系协议：请求 `/models`
- Anthropic 兼容协议：请求 `/v1/models`

系统会根据返回结果自动归类为以下状态：

- `healthy`：正常
- `degraded`：偏慢
- `unauthorized`：鉴权失败
- `rate_limited`：限流
- `timeout`：超时
- `error`：异常

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认访问：

```bash
http://localhost:3000
```

## 校验命令

```bash
npm run lint
npm run build
```

如果你当前终端环境被注入了额外的 Next.js 私有环境变量，构建可能异常。已知说明见：

- [docs/build-notes.md](docs/build-notes.md)

必要时可使用干净环境执行：

```bash
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run lint
env -u TURBOPACK -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN npm run build
```

## 目录结构

```text
src/
  app/
    api/
      check/route.ts
      models/route.ts
    layout.tsx
    page.tsx
  lib/
    checker.ts
config/
  targets.json
docs/
  build-notes.md
```

## 安全建议

当前项目支持从 JSON 直接读取 `apiKey`，便于本地快速调试；但如果要长期使用或提交到仓库，建议：

- 优先改用环境变量保存密钥
- 不要提交真实密钥到 Git
- 对外分享配置时使用占位符替代真实值

## 后续可扩展方向

如果后面继续增强，这个项目比较适合往下面几个方向扩展：

- 定时自动巡检
- 历史记录与趋势图
- 告警通知
- 配置管理后台
- 失败原因聚合分析
- 端点健康度排序
