export type EventViewMode = "global" | "country";

export type EventSentiment = "positive" | "neutral" | "negative";

export type EventItem = {
  id: string;
  title: string;
  summary: string;
  source?: string;
  country: string;
  countryCode?: string;
  canonicalCountryName?: string;
  relatedCountries: string[];
  impactedCountries: string[];
  sentiment: EventSentiment;
  sectors: string[];
  modeTags: string[];
  marketImpact: number;
  geopoliticalImpact: number;
  attentionScore: number;
  updatedAt: string;
  explanation?: {
    summary: string;
    drivers: string[];
  };
  impactChain?: {
    summary: string;
    steps: string[];
  };
  impactPath?: {
    nodes: Array<{
      type: "country" | "global" | "sector";
      label: string;
    }>;
  };
  rankingExplanation?: {
    summary: string;
    reasons: string[];
    scoreBreakdown?: {
      candidateScore: number;
      impactScore: number;
      rankingScore: number;
      involvedCountryCount: number;
      isGlobalCandidate: boolean;
      isMarketEvent: boolean;
      highPriorityThemeCount: number;
      keyCountryTouched: boolean;
      aiImpactDelta: number;
      rank: number | null;
    };
  };
};

function clampScore(value: unknown, fallback = 5): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, num));
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

const HIGH_PRIORITY_THEME_KEYWORDS = [
  "war",
  "conflict",
  "ceasefire",
  "central bank",
  "interest rate",
  "tariff",
  "sanction",
  "energy",
  "shipping",
  "supply chain",
  "technology regulation",
  "election",
  "commodity",
  "oil",
  "gas",
  "semiconductor",
  "chip",
  "trade restriction",
];

const MARKET_RELEVANCE_KEYWORDS = [
  "market",
  "stocks",
  "equity",
  "bond",
  "yield",
  "inflation",
  "interest rate",
  "fx",
  "currency",
  "commodity",
  "oil",
  "gas",
  "gold",
  "shipping rate",
];

export function calculateBaseScore(event: EventItem): number {
  const marketImpact = clampScore(event.marketImpact);
  const geopoliticalImpact = clampScore(event.geopoliticalImpact);
  const attentionScore = clampScore(event.attentionScore);
  return marketImpact * 0.5 + geopoliticalImpact * 0.3 + attentionScore * 0.2;
}

export function getScopeMultiplier(event: EventItem): number {
  const country = safeString(event.country).toLowerCase();
  if (country === "global") {
    return 1.22;
  }

  const relatedCount = safeStringArray(event.relatedCountries).length;
  const impactedCount = safeStringArray(event.impactedCountries).length;
  const involved = new Set<string>([
    safeString(event.country),
    ...safeStringArray(event.relatedCountries),
    ...safeStringArray(event.impactedCountries),
  ]).size;

  if (involved >= 5) {
    return 1.2;
  }
  if (involved >= 3) {
    return 1.12;
  }
  if (relatedCount + impactedCount <= 1) {
    return 0.92;
  }
  return 1;
}

export function getThemePriorityMultiplier(event: EventItem): number {
  const text = `${safeString(event.title)} ${safeString(event.summary)} ${safeStringArray(
    event.sectors
  ).join(" ")}`.toLowerCase();
  const hitCount = HIGH_PRIORITY_THEME_KEYWORDS.filter((k) =>
    text.includes(k)
  ).length;
  if (hitCount >= 3) {
    return 1.25;
  }
  if (hitCount >= 1) {
    return 1.12;
  }
  return 0.97;
}

export function getMarketRelevanceMultiplier(event: EventItem): number {
  const tags = safeStringArray(event.modeTags).map((v) => v.toLowerCase());
  const text = `${safeString(event.title)} ${safeString(event.summary)} ${safeStringArray(
    event.sectors
  ).join(" ")}`.toLowerCase();
  const keywordHits = MARKET_RELEVANCE_KEYWORDS.filter((k) =>
    text.includes(k)
  ).length;

  if (tags.includes("market") && keywordHits >= 2) {
    return 1.16;
  }
  if (tags.includes("market") || keywordHits >= 1) {
    return 1.08;
  }
  return 0.96;
}

export function getFreshnessMultiplier(event: EventItem): number {
  const ts = Date.parse(safeString(event.updatedAt));
  if (!Number.isFinite(ts)) {
    return 0.93;
  }
  const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
  if (ageHours <= 6) {
    return 1.12;
  }
  if (ageHours <= 24) {
    return 1.04;
  }
  if (ageHours <= 72) {
    return 0.98;
  }
  return 0.9;
}

export function calculateFinalImpactScore(event: EventItem): number {
  const baseScore = calculateBaseScore(event);
  const multiplier =
    getScopeMultiplier(event) *
    getThemePriorityMultiplier(event) *
    getMarketRelevanceMultiplier(event) *
    getFreshnessMultiplier(event);
  const result = baseScore * multiplier;
  if (!Number.isFinite(result)) {
    return baseScore;
  }
  return result;
}

export function explainImpactScore(event: EventItem) {
  const baseScore = calculateBaseScore(event);
  const scopeMultiplier = getScopeMultiplier(event);
  const themeMultiplier = getThemePriorityMultiplier(event);
  const marketMultiplier = getMarketRelevanceMultiplier(event);
  const freshnessMultiplier = getFreshnessMultiplier(event);
  const finalImpactScore = calculateFinalImpactScore(event);

  return {
    baseScore,
    scopeMultiplier,
    themeMultiplier,
    marketMultiplier,
    freshnessMultiplier,
    finalImpactScore,
  };
}

export function calculateImpactScore(event: EventItem): number {
  return calculateFinalImpactScore(event);
}

export function sortEventsByImpact(events: EventItem[]): EventItem[] {
  return events.slice().sort((a, b) => {
    const scoreDelta = calculateImpactScore(b) - calculateImpactScore(a);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export const MOCK_EVENTS: EventItem[] = [
  {
    id: "evt-us-1",
    title: "美国港口吞吐恢复",
    summary: "西海岸港口拥堵缓解，物流时效回升。",
    country: "United States",
    relatedCountries: ["Mexico", "Canada"],
    impactedCountries: ["United States", "Mexico", "Canada"],
    sentiment: "positive",
    sectors: ["Logistics", "Retail"],
    modeTags: ["global", "country", "market"],
    marketImpact: 8,
    geopoliticalImpact: 4,
    attentionScore: 7,
    updatedAt: "2026-04-13 09:00",
  },
  {
    id: "evt-cn-1",
    title: "华东制造产线检修",
    summary: "部分关键零部件产线短时检修，出货节奏波动。",
    country: "China",
    relatedCountries: ["Japan", "South Korea"],
    impactedCountries: ["China", "Japan", "South Korea"],
    sentiment: "neutral",
    sectors: ["Manufacturing", "Electronics"],
    modeTags: ["global", "country"],
    marketImpact: 7,
    geopoliticalImpact: 6,
    attentionScore: 6,
    updatedAt: "2026-04-13 09:12",
  },
  {
    id: "evt-jp-1",
    title: "日本航空货运延误",
    summary: "极端天气导致部分国际航班取消与延误。",
    country: "Japan",
    relatedCountries: ["China", "United States"],
    impactedCountries: ["Japan", "China", "United States"],
    sentiment: "negative",
    sectors: ["Aviation", "E-commerce"],
    modeTags: ["global", "country", "market"],
    marketImpact: 6,
    geopoliticalImpact: 7,
    attentionScore: 8,
    updatedAt: "2026-04-13 09:24",
  },
  {
    id: "evt-de-1",
    title: "德国汽车出口回升",
    summary: "新能源车型出口订单增长超预期。",
    country: "Germany",
    relatedCountries: ["France", "Poland"],
    impactedCountries: ["Germany", "France", "Poland"],
    sentiment: "positive",
    sectors: ["Automotive", "Energy"],
    modeTags: ["global", "country", "market"],
    marketImpact: 9,
    geopoliticalImpact: 5,
    attentionScore: 6,
    updatedAt: "2026-04-13 09:30",
  },
  {
    id: "evt-fr-1",
    title: "法国铁路罢工预警",
    summary: "区域铁路调度不稳定，货运转运压力上升。",
    country: "France",
    relatedCountries: ["Germany", "Spain"],
    impactedCountries: ["France", "Germany", "Spain"],
    sentiment: "negative",
    sectors: ["Transport", "Food"],
    modeTags: ["global", "country"],
    marketImpact: 6,
    geopoliticalImpact: 8,
    attentionScore: 7,
    updatedAt: "2026-04-13 09:45",
  },
  {
    id: "evt-br-1",
    title: "巴西农产品出口走强",
    summary: "大豆与玉米出口价格上涨，港口发运提速。",
    country: "Brazil",
    relatedCountries: ["Argentina", "China"],
    impactedCountries: ["Brazil", "Argentina", "China"],
    sentiment: "positive",
    sectors: ["Agriculture", "Shipping"],
    modeTags: ["global", "country", "market"],
    marketImpact: 8,
    geopoliticalImpact: 4,
    attentionScore: 6,
    updatedAt: "2026-04-13 09:56",
  },
  {
    id: "evt-in-1",
    title: "印度电力需求攀升",
    summary: "高温推动工业与居民用电需求同步增长。",
    country: "India",
    relatedCountries: ["United Arab Emirates", "Singapore"],
    impactedCountries: ["India", "United Arab Emirates"],
    sentiment: "neutral",
    sectors: ["Utilities", "Manufacturing"],
    modeTags: ["global", "country"],
    marketImpact: 5,
    geopoliticalImpact: 6,
    attentionScore: 7,
    updatedAt: "2026-04-13 10:08",
  },
  {
    id: "evt-au-1",
    title: "澳大利亚矿运受阻",
    summary: "港口天气恶化导致铁矿装船效率下降。",
    country: "Australia",
    relatedCountries: ["China", "Japan"],
    impactedCountries: ["Australia", "China", "Japan"],
    sentiment: "negative",
    sectors: ["Mining", "Shipping"],
    modeTags: ["global", "country", "market"],
    marketImpact: 9,
    geopoliticalImpact: 6,
    attentionScore: 8,
    updatedAt: "2026-04-13 10:16",
  },
  {
    id: "evt-za-1",
    title: "南非航运保险成本上调",
    summary: "区域风险上升，保费短期走高。",
    country: "South Africa",
    relatedCountries: ["United Kingdom", "India"],
    impactedCountries: ["South Africa", "United Kingdom", "India"],
    sentiment: "negative",
    sectors: ["Insurance", "Shipping"],
    modeTags: ["global", "country"],
    marketImpact: 7,
    geopoliticalImpact: 8,
    attentionScore: 7,
    updatedAt: "2026-04-13 10:28",
  },
  {
    id: "evt-ca-1",
    title: "加拿大能源出口稳定",
    summary: "天然气出口合同执行率维持高位。",
    country: "Canada",
    relatedCountries: ["United States", "United Kingdom"],
    impactedCountries: ["Canada", "United States", "United Kingdom"],
    sentiment: "positive",
    sectors: ["Energy", "Utilities"],
    modeTags: ["global", "country", "market"],
    marketImpact: 8,
    geopoliticalImpact: 5,
    attentionScore: 6,
    updatedAt: "2026-04-13 10:34",
  },
  {
    id: "evt-mx-1",
    title: "墨西哥边境卡车通关波动",
    summary: "高峰期排队时间延长，交付存在不确定性。",
    country: "Mexico",
    relatedCountries: ["United States"],
    impactedCountries: ["Mexico", "United States"],
    sentiment: "neutral",
    sectors: ["Logistics", "Automotive"],
    modeTags: ["global", "country"],
    marketImpact: 6,
    geopoliticalImpact: 5,
    attentionScore: 6,
    updatedAt: "2026-04-13 10:41",
  },
  {
    id: "evt-sg-1",
    title: "新加坡转运指数改善",
    summary: "区域转运时效改善，积压箱量下降。",
    country: "Singapore",
    relatedCountries: ["Malaysia", "Indonesia"],
    impactedCountries: ["Singapore", "Malaysia", "Indonesia"],
    sentiment: "positive",
    sectors: ["Shipping", "Trade"],
    modeTags: ["global", "country", "market"],
    marketImpact: 7,
    geopoliticalImpact: 4,
    attentionScore: 5,
    updatedAt: "2026-04-13 10:52",
  },
];
