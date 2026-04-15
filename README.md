# Global Event Intelligence Map

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

## Screenshots (Portfolio)
Put images under `docs/screenshots/` and update paths below:

- Dashboard (Global View)
  - `docs/screenshots/dashboard-global.png`
- Event Panel (Filters + AI)
  - `docs/screenshots/event-panel.png`
- Global Hotspots + Why Important
  - `docs/screenshots/global-hotspots.png`
- Impact Chain / Impact Path
  - `docs/screenshots/impact-chain.png`

Example markdown:

```md
![Dashboard Global](docs/screenshots/dashboard-global.png)
![Event Panel](docs/screenshots/event-panel.png)
```

## Security Notes
- Do not hardcode API keys in source code.
- Do not commit `.env.local`.
