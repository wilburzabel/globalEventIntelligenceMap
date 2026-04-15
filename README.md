# Global Event Intelligence Map

## 中文说明（优先）

这是一个用于宏观事件追踪与可视化的 Next.js 项目，主要能力包括：
- 全球/国家双视图事件流
- 自动/手动 AI 分析
- 全球热点排序与原因解释
- 影响链（impactChain）与影响路径（impactPath）展示
- 质量过滤 + 多层 fallback 容错

### 快速开始（中文）

1. 复制环境变量模板：

```bash
cp .env.example .env.local
```

2. 安装并启动：

```bash
npm install
npm run dev
```

3. 生产构建与启动：

```bash
npm run build
npm run start
```

### 部署到 Vercel（中文）

1. 将仓库导入 Vercel。
2. 在 Project Settings -> Environment Variables 中配置与 `.env.example` 同名变量。
3. 使用默认构建命令 `npm run build` 部署。

### 稳定性与容错（中文）

- 新闻 API 失败或返回空：自动回退到 mock 数据。
- `/api/events` 异常：仍返回可用 fallback 结果，不会让页面崩溃。
- 客户端拉取失败：客户端侧继续回退展示。
- AI 分析失败/超时/JSON 解析失败：返回本地结构化 fallback 分析结果。

### 技术栈
- Next.js 16（App Router）
- React 19
- TypeScript
- Tailwind CSS

### 环境变量
本地开发使用 `.env.local`，可直接基于 `.env.example` 复制：

```bash
cp .env.example .env.local
```

必填（至少一个新闻源 key）：
- `NEWS_PROVIDER`（`newsapi_org | newsdata_io | thenewsapi`）
- `NEWS_API_KEY` 或 provider 专用 key
  - `NEWSDATA_IO_API_KEY`
  - `THENEWSAPI_API_KEY`

可选：
- `NEWS_API_LANG`
- `NEWS_API_MAX`
- `NEWS_API_LOCALE`
- `EVENTS_CACHE_TTL_MS`



### 安全说明
- 不要在源码中硬编码 API Key。
- 不要提交 `.env.local`。

## English Appendix

A Next.js app for macro event monitoring with:
- global/country event views
- auto/manual AI analysis
- global hotspot ranking
- impact chain and impact path visualization
- quality filtering and fallback resilience

## Tech Stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS

## Environment Variables
Use `.env.local` for local dev. Use `.env.example` as the template.

```bash
cp .env.example .env.local
```

Required (at least one provider key):
- `NEWS_PROVIDER` (`newsapi_org | newsdata_io | thenewsapi`)
- `NEWS_API_KEY` or provider-specific key
  - `NEWSDATA_IO_API_KEY`
  - `THENEWSAPI_API_KEY`

Optional:
- `NEWS_API_LANG`
- `NEWS_API_MAX`
- `NEWS_API_LOCALE`
- `EVENTS_CACHE_TTL_MS`

## Local Run
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
npm run start
```

## Deploy to Vercel
1. Import this repo into Vercel.
2. Add the same env vars from `.env.example` in Vercel Project Settings.
3. Deploy with default build command (`npm run build`).

## Fallback & Stability (Production)
- News provider failure/empty response: fallback to mock events.
- API route exception: returns `mock-fallback` payload instead of crashing.
- Client fetch failure: fallback payload on client side.
- AI analysis failure/timeout/invalid JSON: returns structured local fallback result.


## Security Notes
- Do not hardcode API keys in source code.
- Do not commit `.env.local`.
