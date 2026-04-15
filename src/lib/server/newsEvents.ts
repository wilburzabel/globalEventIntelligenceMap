import {
  MOCK_EVENTS,
  calculateImpactScore,
  explainImpactScore,
  type EventItem,
} from "@/data/mockEvents";
import { normalizeCountryName } from "@/lib/country";
import { buildRankingExplanation } from "@/lib/scoring/rankingExplanation";
import { applyQualityFilter } from "@/lib/server/qualityFilter";

export type NewsProvider = "newsapi_org" | "newsdata_io" | "thenewsapi";

type RawNewsArticle = {
  title?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  url?: string;
  sourceName?: string;
  countryHint?: string;
};

type NewsResult = {
  events: EventItem[];
  source: "news" | "mock-fallback";
  provider: NewsProvider;
  cacheHit: boolean;
  lastUpdated: string;
  isFallback: boolean;
  reason?: string;
};

type EventsCacheRecord = {
  events: EventItem[];
  source: "news" | "mock-fallback";
  provider: NewsProvider;
  isFallback: boolean;
  reason?: string;
  updatedAtMs: number;
  expiresAtMs: number;
};

const DEFAULT_NEWS_API_LANG = "en";
const DEFAULT_NEWS_API_MAX = 80;
const DEFAULT_NEWS_API_LOCALE = "us";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

let eventsCache: EventsCacheRecord | null = null;

const COUNTRY_RULES: Array<{ country: string; keywords: string[] }> = [
  { country: "United States", keywords: ["us", "u.s.", "america", "united states"] },
  { country: "China", keywords: ["china", "beijing", "shanghai"] },
  { country: "Japan", keywords: ["japan", "tokyo"] },
  { country: "Germany", keywords: ["germany", "berlin"] },
  { country: "France", keywords: ["france", "paris"] },
  { country: "India", keywords: ["india", "delhi", "mumbai"] },
  { country: "United Kingdom", keywords: ["uk", "britain", "london"] },
  { country: "Singapore", keywords: ["singapore"] },
];

const SECTOR_RULES: Array<{ sector: string; keywords: string[] }> = [
  { sector: "Energy", keywords: ["oil", "gas", "energy", "power"] },
  { sector: "Finance", keywords: ["bank", "rate", "inflation", "market", "stocks"] },
  { sector: "Technology", keywords: ["ai", "chip", "semiconductor", "tech"] },
  { sector: "Shipping", keywords: ["port", "shipping", "cargo", "freight"] },
  { sector: "Manufacturing", keywords: ["factory", "manufacturing", "industrial"] },
];

function logDev(label: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  if (payload === undefined) {
    console.debug(`[news-events] ${label}`);
    return;
  }
  console.debug(`[news-events] ${label}`, payload);
}

function sanitizeUrlForLog(url: URL): string {
  const masked = new URL(url.toString());
  ["apiKey", "apikey", "api_token", "token"].forEach((key) => {
    if (masked.searchParams.has(key)) {
      masked.searchParams.set(key, "***");
    }
  });
  return masked.toString();
}

function parseProvider(value: string | undefined): NewsProvider {
  if (value === "newsdata_io" || value === "thenewsapi" || value === "newsapi_org") {
    return value;
  }
  return "newsapi_org";
}

function getCacheTtlMs(): number {
  const raw = process.env.EVENTS_CACHE_TTL_MS?.trim();
  if (!raw) {
    return DEFAULT_CACHE_TTL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_MS;
  }
  return parsed;
}

function isCacheExpired(record: EventsCacheRecord): boolean {
  return Date.now() >= record.expiresAtMs;
}

function getCachedEvents(): EventsCacheRecord | null {
  if (!eventsCache) {
    return null;
  }
  if (isCacheExpired(eventsCache)) {
    return null;
  }
  return eventsCache;
}

function setCachedEvents(input: {
  events: EventItem[];
  source: "news" | "mock-fallback";
  provider: NewsProvider;
  isFallback: boolean;
  reason?: string;
}) {
  const now = Date.now();
  const ttlMs = getCacheTtlMs();
  eventsCache = {
    events: input.events,
    source: input.source,
    provider: input.provider,
    isFallback: input.isFallback,
    reason: input.reason,
    updatedAtMs: now,
    expiresAtMs: now + ttlMs,
  };
}

function firstNonEmpty(values: Array<string | undefined>, fallback: string): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function textOf(article: RawNewsArticle): string {
  return `${article.title ?? ""} ${article.description ?? ""} ${article.content ?? ""}`.toLowerCase();
}

function normalizeCountryHint(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
    }
  }
  return undefined;
}

function detectCountry(article: RawNewsArticle): string {
  if (article.countryHint) {
    return article.countryHint;
  }
  const text = textOf(article);
  for (const rule of COUNTRY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.country;
    }
  }
  return "Global";
}

function detectSectors(article: RawNewsArticle): string[] {
  const text = textOf(article);
  const matches = SECTOR_RULES.filter((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword))
  ).map((rule) => rule.sector);
  return matches.length > 0 ? matches : ["General"];
}

function inferModeTags(article: RawNewsArticle, sectors: string[]): string[] {
  const text = textOf(article);
  const tags = new Set<string>(["global", "country"]);
  const isMarketLike =
    sectors.some((sector) => ["Energy", "Finance", "Shipping"].includes(sector)) ||
    ["market", "stocks", "trade", "economy", "tariff"].some((word) =>
      text.includes(word)
    );
  if (isMarketLike) {
    tags.add("market");
  }
  return Array.from(tags);
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function inferImpactScores(article: RawNewsArticle): Pick<
  EventItem,
  "marketImpact" | "geopoliticalImpact" | "attentionScore"
> {
  const text = textOf(article);
  let market = 5;
  let geo = 5;
  let attention = 5;

  if (["surge", "selloff", "crash", "tariff", "sanction"].some((w) => text.includes(w))) {
    market += 2;
  }
  if (["war", "conflict", "border", "election", "sanction"].some((w) => text.includes(w))) {
    geo += 2;
  }
  if (["breaking", "urgent", "major", "record"].some((w) => text.includes(w))) {
    attention += 2;
  }

  return {
    marketImpact: clampScore(market),
    geopoliticalImpact: clampScore(geo),
    attentionScore: clampScore(attention),
  };
}

function buildId(article: RawNewsArticle, index: number): string {
  const base = `${article.url ?? article.title ?? "news"}-${index}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `news-${hash.toString(36)}`;
}

function normalizeNewsToEvents(articles: RawNewsArticle[]): EventItem[] {
  return articles
    .filter((article) => article && (article.title || article.description))
    .map((article, index) => {
      const country = detectCountry(article);
      const normalizedCountry = normalizeCountryName(country);
      const sectors = detectSectors(article);
      const modeTags = inferModeTags(article, sectors);
      const impacts = inferImpactScores(article);
      const title = firstNonEmpty([article.title], "Untitled Event");
      const summary = firstNonEmpty(
        [article.description, article.content],
        "No summary provided."
      );
      const updatedAt = firstNonEmpty(
        [article.publishedAt],
        new Date().toISOString()
      );

      return {
        id: buildId(article, index),
        title,
        summary,
        source: firstNonEmpty([article.sourceName], "Unknown Source"),
        country: normalizedCountry.canonicalCountryName,
        countryCode: normalizedCountry.countryCode,
        canonicalCountryName: normalizedCountry.canonicalCountryName,
        relatedCountries:
          normalizedCountry.countryCode === "GLOBAL"
            ? []
            : [normalizedCountry.canonicalCountryName],
        impactedCountries:
          normalizedCountry.countryCode === "GLOBAL"
            ? []
            : [normalizedCountry.canonicalCountryName],
        sentiment: "neutral",
        sectors,
        modeTags,
        marketImpact: impacts.marketImpact,
        geopoliticalImpact: impacts.geopoliticalImpact,
        attentionScore: impacts.attentionScore,
        updatedAt,
      };
    });
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "for",
  "of",
  "and",
  "in",
  "on",
  "at",
  "with",
  "by",
  "from",
  "after",
  "over",
  "as",
  "is",
  "are",
  "be",
  "new",
  "latest",
  "update",
]);

function normalizeHeadline(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function getEventKeywordSignature(event: EventItem): string[] {
  return normalizeHeadline(event.title).slice(0, 8);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function getEventTimestamp(event: EventItem): number {
  const ms = Date.parse(event.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function shouldTreatAsDuplicate(base: EventItem, candidate: EventItem): boolean {
  if (base.country !== candidate.country) {
    return false;
  }

  const baseTs = getEventTimestamp(base);
  const candidateTs = getEventTimestamp(candidate);
  const timeDelta = Math.abs(baseTs - candidateTs);
  const withinTimeWindow = timeDelta <= 6 * 60 * 60 * 1000;
  if (!withinTimeWindow) {
    return false;
  }

  const baseSig = getEventKeywordSignature(base);
  const candSig = getEventKeywordSignature(candidate);
  const titleSimilarity = jaccardSimilarity(baseSig, candSig);
  const sectorOverlap =
    candidate.sectors.some((sector) => base.sectors.includes(sector)) &&
    candidate.sectors.length > 0 &&
    base.sectors.length > 0;

  return titleSimilarity >= 0.72 || (titleSimilarity >= 0.5 && sectorOverlap);
}

function dedupeEvents(events: EventItem[]): { events: EventItem[]; duplicates: number } {
  const sorted = events
    .slice()
    .sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a));
  const result: EventItem[] = [];
  let duplicates = 0;

  for (const event of sorted) {
    const matched = result.find((existing) => shouldTreatAsDuplicate(existing, event));
    if (matched) {
      duplicates += 1;
      continue;
    }
    result.push(event);
  }

  return { events: result, duplicates };
}

const HIGH_PRIORITY_KEYWORDS = [
  "war",
  "conflict",
  "ceasefire",
  "central bank",
  "interest rate",
  "tariff",
  "energy",
  "supply chain",
  "sanction",
  "regulation",
  "election",
  "shipping",
  "commodity",
  "oil",
  "gas",
  "chip",
  "semiconductor",
  "trade",
];

function isHighPriorityTheme(event: EventItem): boolean {
  const text = `${event.title} ${event.summary}`.toLowerCase();
  return HIGH_PRIORITY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getInvolvedCountryCount(event: EventItem): number {
  return new Set([
    event.country,
    ...(Array.isArray(event.relatedCountries) ? event.relatedCountries : []),
    ...(Array.isArray(event.impactedCountries) ? event.impactedCountries : []),
  ]).size;
}

function getFreshnessBoost(event: EventItem): number {
  const ts = Date.parse(event.updatedAt);
  if (!Number.isFinite(ts)) {
    return 0;
  }
  const ageMs = Date.now() - ts;
  if (ageMs <= 6 * 60 * 60 * 1000) {
    return 2;
  }
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return 1;
  }
  return 0;
}

function selectGlobalCandidates(events: EventItem[]): EventItem[] {
  return events.filter((event) => {
    const tags = Array.isArray(event.modeTags) ? event.modeTags : [];
    if (tags.includes("low_priority")) {
      return false;
    }
    const impact = calculateImpactScore(event);
    const highPriority = isHighPriorityTheme(event);
    const marketLike = tags.includes("market");
    const isGlobalTagged = tags.includes("global");
    return isGlobalTagged || highPriority || marketLike || impact >= 5.5;
  });
}

function scoreGlobalImportance(event: EventItem): number {
  const explanation = explainImpactScore(event);
  const countryBreadthBonus = Math.min(1.2, getInvolvedCountryCount(event) * 0.2);
  const priorityBonus = isHighPriorityTheme(event) ? 0.8 : 0;
  const freshnessBonus = getFreshnessBoost(event) * 0.35;
  return explanation.finalImpactScore + countryBreadthBonus + priorityBonus + freshnessBonus;
}

function rankImportantGlobalEvents(candidates: EventItem[]): Array<{ event: EventItem; score: number }> {
  return candidates
    .map((event) => ({ event, score: scoreGlobalImportance(event) }))
    .filter(({ event, score }) => {
      const impact = calculateImpactScore(event);
      const weakAndNoSignal =
        impact < 5.6 &&
        !isHighPriorityTheme(event) &&
        !(event.modeTags ?? []).includes("market") &&
        getInvolvedCountryCount(event) <= 1;
      if (weakAndNoSignal) {
        return false;
      }
      return score >= 6.8;
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return Date.parse(b.event.updatedAt) - Date.parse(a.event.updatedAt);
    })
    .slice(0, 12);
}

function applyGlobalFeaturedTags(events: EventItem[]): {
  events: EventItem[];
  globalCandidatesCount: number;
  globalFeaturedCount: number;
  filteredLowPriorityCount: number;
} {
  const candidates = selectGlobalCandidates(events);
  const featuredRanked = rankImportantGlobalEvents(candidates);
  const featured = featuredRanked.map((item) => item.event);
  const featuredIds = new Set(featured.map((event) => event.id));
  const rankedMap = new Map(
    featuredRanked.map((item, index) => [
      item.event.id,
      { rank: index + 1, rankingScore: item.score },
    ])
  );
  const nextEvents = events.map((event) => {
    if (!featuredIds.has(event.id)) {
      return event;
    }
    const tags = new Set(event.modeTags ?? []);
    tags.add("global");
    tags.add("global_featured");
    const ranked = rankedMap.get(event.id);
    const rankingExplanation = buildRankingExplanation(event, {
      rank: ranked?.rank,
      rankingScore: ranked?.rankingScore,
      isGlobalCandidate: true,
      isGlobalFeatured: true,
    });
    return { ...event, modeTags: Array.from(tags), rankingExplanation };
  });

  if (process.env.NODE_ENV === "development" && featuredRanked.length > 0) {
    logDev(
      "global ranking explanation top",
      featuredRanked.slice(0, 5).map((item, index) => ({
        id: item.event.id,
        title: item.event.title,
        rank: index + 1,
        score: Number(item.score.toFixed(2)),
        rankingExplanation: buildRankingExplanation(item.event, {
          rank: index + 1,
          rankingScore: item.score,
          isGlobalCandidate: true,
          isGlobalFeatured: true,
        }),
      }))
    );
  }

  return {
    events: nextEvents,
    globalCandidatesCount: candidates.length,
    globalFeaturedCount: featured.length,
    filteredLowPriorityCount: Math.max(0, candidates.length - featured.length),
  };
}

async function fetchFromNewsApiOrg(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEWS_API_KEY is not configured");
  }

  const baseUrl = process.env.NEWSAPI_ORG_BASE_URL?.trim() || "https://newsapi.org/v2/top-headlines";
  const url = new URL(baseUrl);
  if (!url.searchParams.has("language")) {
    url.searchParams.set("language", process.env.NEWS_API_LANG?.trim() || DEFAULT_NEWS_API_LANG);
  }
  if (!url.searchParams.has("pageSize")) {
    url.searchParams.set("pageSize", process.env.NEWS_API_MAX?.trim() || String(DEFAULT_NEWS_API_MAX));
  }
  url.searchParams.set("apiKey", apiKey);
  logDev("provider request", { provider: "newsapi_org", url: sanitizeUrlForLog(url) });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`newsapi_org request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.articles)) {
    return [];
  }

  return payload.articles.map((article) => ({
    title: typeof article.title === "string" ? article.title : undefined,
    description: typeof article.description === "string" ? article.description : undefined,
    content: typeof article.content === "string" ? article.content : undefined,
    publishedAt: typeof article.publishedAt === "string" ? article.publishedAt : undefined,
    url: typeof article.url === "string" ? article.url : undefined,
    sourceName:
      article.source && typeof article.source === "object" && typeof (article.source as { name?: unknown }).name === "string"
        ? ((article.source as { name?: unknown }).name as string)
        : undefined,
  }));
}

async function fetchFromNewsdataIo(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.NEWSDATA_IO_API_KEY?.trim() || process.env.NEWS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEWSDATA_IO_API_KEY is not configured");
  }

  const baseUrl = process.env.NEWSDATA_IO_BASE_URL?.trim() || "https://newsdata.io/api/1/news";
  const url = new URL(baseUrl);
  if (!url.searchParams.has("language")) {
    url.searchParams.set("language", process.env.NEWS_API_LANG?.trim() || DEFAULT_NEWS_API_LANG);
  }
  if (!url.searchParams.has("size")) {
    url.searchParams.set("size", process.env.NEWS_API_MAX?.trim() || String(DEFAULT_NEWS_API_MAX));
  }
  url.searchParams.set("apikey", apiKey);
  logDev("provider request", { provider: "newsdata_io", url: sanitizeUrlForLog(url) });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`newsdata_io request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.map((item) => ({
    title: typeof item.title === "string" ? item.title : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    content: typeof item.content === "string" ? item.content : undefined,
    publishedAt: typeof item.pubDate === "string" ? item.pubDate : undefined,
    url: typeof item.link === "string" ? item.link : undefined,
    sourceName: typeof item.source_id === "string" ? item.source_id : undefined,
    countryHint: normalizeCountryHint(item.country),
  }));
}

async function fetchFromTheNewsApi(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.THENEWSAPI_API_KEY?.trim() || process.env.NEWS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("THENEWSAPI_API_KEY is not configured");
  }

  const baseUrl = process.env.THENEWSAPI_BASE_URL?.trim() || "https://api.thenewsapi.com/v1/news/top";
  const url = new URL(baseUrl);
  if (!url.searchParams.has("locale")) {
    url.searchParams.set("locale", process.env.NEWS_API_LOCALE?.trim() || DEFAULT_NEWS_API_LOCALE);
  }
  if (!url.searchParams.has("limit")) {
    url.searchParams.set("limit", process.env.NEWS_API_MAX?.trim() || String(DEFAULT_NEWS_API_MAX));
  }
  url.searchParams.set("api_token", apiKey);
  logDev("provider request", { provider: "thenewsapi", url: sanitizeUrlForLog(url) });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`thenewsapi request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.map((item) => ({
    title: typeof item.title === "string" ? item.title : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    content:
      typeof item.snippet === "string"
        ? item.snippet
        : typeof item.description === "string"
          ? item.description
          : undefined,
    publishedAt: typeof item.published_at === "string" ? item.published_at : undefined,
    url: typeof item.url === "string" ? item.url : undefined,
    sourceName: typeof item.source === "string" ? item.source : undefined,
  }));
}

async function fetchRawNewsByProvider(provider: NewsProvider): Promise<RawNewsArticle[]> {
  if (provider === "newsdata_io") {
    return fetchFromNewsdataIo();
  }
  if (provider === "thenewsapi") {
    return fetchFromTheNewsApi();
  }
  return fetchFromNewsApiOrg();
}

export async function getEventsFromNewsOrMock(): Promise<NewsResult> {
  const provider = parseProvider(process.env.NEWS_PROVIDER?.trim());
  logDev("selected provider", { provider });
  try {
    const rawNews = await fetchRawNewsByProvider(provider);
    const normalized = normalizeNewsToEvents(rawNews);
    if (normalized.length === 0) {
      logDev("fallback triggered", {
        provider,
        reason: "empty-news",
      });
      return {
        events: applyGlobalFeaturedTags(MOCK_EVENTS).events,
        source: "mock-fallback",
        provider,
        cacheHit: false,
        lastUpdated: new Date().toISOString(),
        isFallback: true,
        reason: "empty-news",
      };
    }

    return { events: normalized, source: "news", provider, cacheHit: false, lastUpdated: new Date().toISOString(), isFallback: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown-error";
    logDev("provider failed", { provider, reason });
    logDev("fallback triggered", { provider, reason });
    return {
      events: applyGlobalFeaturedTags(MOCK_EVENTS).events,
      source: "mock-fallback",
      provider,
      cacheHit: false,
      lastUpdated: new Date().toISOString(),
      isFallback: true,
      reason,
    };
  }
}

export async function getEventsWithCache(options?: {
  forceRefresh?: boolean;
}): Promise<NewsResult> {
  const forceRefresh = options?.forceRefresh ?? false;
  const provider = parseProvider(process.env.NEWS_PROVIDER?.trim());
  logDev("selected provider", { provider });
  logDev("cache decision", { forceRefresh });

  if (!forceRefresh) {
    const cached = getCachedEvents();
    if (cached) {
      logDev("cache hit", {
        provider: cached.provider,
        source: cached.source,
        isFallback: cached.isFallback,
      });
      return {
        events: cached.events,
        source: cached.source,
        provider: cached.provider,
        cacheHit: true,
        lastUpdated: new Date(cached.updatedAtMs).toISOString(),
        isFallback: cached.isFallback,
        reason: cached.reason,
      };
    }
    logDev("cache miss");
  }

  try {
    const rawNews = await fetchRawNewsByProvider(provider);
    const normalized = normalizeNewsToEvents(rawNews);
    const deduped = dedupeEvents(normalized);
    const qualityFiltered = applyQualityFilter(deduped.events);
    const globalTiered = applyGlobalFeaturedTags(qualityFiltered.events);
    logDev("dedupe stats", {
      rawCount: rawNews.length,
      normalizedCount: normalized.length,
      dedupedCount: deduped.events.length,
      duplicateCount: deduped.duplicates,
    });
    logDev("quality filter stats", {
      rawCount: rawNews.length,
      dedupedCount: deduped.events.length,
      filteredCount: qualityFiltered.events.length,
      droppedCount: qualityFiltered.stats.droppedCount,
      lowPriorityCount: qualityFiltered.stats.lowPriorityCount,
      droppedByReason: qualityFiltered.stats.droppedByReason,
    });
    logDev("global tier stats", {
      rawCount: rawNews.length,
      normalizedCount: normalized.length,
      dedupedCount: deduped.events.length,
      qualityFilteredCount: qualityFiltered.events.length,
      displayCount: globalTiered.events.length,
      globalCandidatesCount: globalTiered.globalCandidatesCount,
      globalFeaturedCount: globalTiered.globalFeaturedCount,
      filteredLowPriorityCount: globalTiered.filteredLowPriorityCount,
    });
    if (process.env.NODE_ENV === "development") {
      const topSamples = globalTiered.events
        .slice()
        .sort((a, b) => scoreGlobalImportance(b) - scoreGlobalImportance(a))
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          title: event.title,
          country: event.country,
          score: scoreGlobalImportance(event),
          ...explainImpactScore(event),
        }));
      logDev("global ranking explain top5", topSamples);
    }

    if (globalTiered.events.length === 0) {
      logDev("fallback triggered", {
        provider,
        reason: "empty-news",
      });
      const staleCache = eventsCache;
      if (staleCache?.events?.length) {
        logDev("using stale cache after empty-news fallback", {
          provider: staleCache.provider,
        });
        return {
          events: staleCache.events,
          source: staleCache.source,
          provider: staleCache.provider,
          cacheHit: true,
          lastUpdated: new Date(staleCache.updatedAtMs).toISOString(),
          isFallback: staleCache.isFallback,
          reason: "empty-news-stale-cache",
        };
      }
      const now = new Date().toISOString();
      const fallbackEvents = applyGlobalFeaturedTags(MOCK_EVENTS).events;
      setCachedEvents({
        events: fallbackEvents,
        source: "mock-fallback",
        provider,
        isFallback: true,
        reason: "empty-news",
      });
      return {
        events: fallbackEvents,
        source: "mock-fallback",
        provider,
        cacheHit: false,
        lastUpdated: now,
        isFallback: true,
        reason: "empty-news",
      };
    }

    const now = new Date().toISOString();
    setCachedEvents({
      events: globalTiered.events,
      source: "news",
      provider,
      isFallback: false,
    });
    return {
      events: globalTiered.events,
      source: "news",
      provider,
      cacheHit: false,
      lastUpdated: now,
      isFallback: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown-error";
    logDev("provider failed", { provider, reason });
    logDev("fallback triggered", { provider, reason });
    const staleCache = eventsCache;
    if (staleCache?.events?.length) {
      logDev("using stale cache after provider failure", {
        provider: staleCache.provider,
        reason,
      });
      return {
        events: staleCache.events,
        source: staleCache.source,
        provider: staleCache.provider,
        cacheHit: true,
        lastUpdated: new Date(staleCache.updatedAtMs).toISOString(),
        isFallback: staleCache.isFallback,
        reason: `stale-cache:${reason}`,
      };
    }

    const now = new Date().toISOString();
    setCachedEvents({
      events: applyGlobalFeaturedTags(MOCK_EVENTS).events,
      source: "mock-fallback",
      provider,
      isFallback: true,
      reason,
    });
    return {
      events: applyGlobalFeaturedTags(MOCK_EVENTS).events,
      source: "mock-fallback",
      provider,
      cacheHit: false,
      lastUpdated: now,
      isFallback: true,
      reason,
    };
  }
}
