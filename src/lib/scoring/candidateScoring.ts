import type { EventItem } from "@/data/mockEvents";
import {
  getThemePriorityScore,
  matchPriorityThemes,
} from "@/lib/scoring/themePriorityDictionary";
import {
  getSectorWeightMultiplier,
  resolveSectorWeight,
} from "@/lib/scoring/sectorWeightTable";

const KEY_COUNTRY_CODES = new Set(["US", "CN", "EU", "JP"]);
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

export type CandidateScoreBreakdown = {
  baseCandidateScore: number;
  themePriorityScore: number;
  geoKeyCountryScore: number;
  marketRelevanceScore: number;
  freshnessScore: number;
  sectorWeightMultiplier: number;
  preSectorScore: number;
  finalCandidateScore: number;
  countryBreadth: number;
  keyCountryTouched: boolean;
  matchedThemes: ReturnType<typeof matchPriorityThemes>;
  sector: ReturnType<typeof resolveSectorWeight>["sector"];
  matchedSectorKeywords: string[];
};

function clampScore(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, num));
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countryKeyFromName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (
    normalized === "us" ||
    normalized === "usa" ||
    normalized.includes("united states")
  ) {
    return "US";
  }
  if (normalized.includes("china")) {
    return "CN";
  }
  if (normalized.includes("japan")) {
    return "JP";
  }
  if (
    normalized === "eu" ||
    normalized.includes("european union") ||
    normalized.includes("euro area")
  ) {
    return "EU";
  }
  return "";
}

function getCountryKey(event: EventItem): string {
  const code = safeText(event.countryCode).trim().toUpperCase();
  if (code) {
    if (code === "USA") {
      return "US";
    }
    return code;
  }
  return countryKeyFromName(safeText(event.country));
}

function getFreshnessHours(event: EventItem): number {
  const ts = Date.parse(safeText(event.updatedAt));
  if (!Number.isFinite(ts)) {
    return 9999;
  }
  return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
}

function getBaseCandidateScore(event: EventItem): number {
  const marketImpact = clampScore(event.marketImpact, 5);
  const geopoliticalImpact = clampScore(event.geopoliticalImpact, 5);
  const attentionScore = clampScore(event.attentionScore, 5);
  return marketImpact * 0.45 + geopoliticalImpact * 0.35 + attentionScore * 0.2;
}

function getGeoKeyCountryScore(event: EventItem): {
  score: number;
  countryBreadth: number;
  keyCountryTouched: boolean;
} {
  const countryBreadth = new Set<string>([
    safeText(event.country),
    ...safeArray(event.relatedCountries),
    ...safeArray(event.impactedCountries),
  ]).size;

  const keyCountryTouched =
    KEY_COUNTRY_CODES.has(getCountryKey(event)) ||
    safeArray(event.relatedCountries).some((country) =>
      KEY_COUNTRY_CODES.has(countryKeyFromName(country))
    ) ||
    safeArray(event.impactedCountries).some((country) =>
      KEY_COUNTRY_CODES.has(countryKeyFromName(country))
    );

  const breadthScore =
    countryBreadth >= 5
      ? 1.8
      : countryBreadth >= 3
        ? 1.2
        : countryBreadth >= 2
          ? 0.6
          : 0.2;

  const keyCountryScore = keyCountryTouched ? 1.5 : 0;

  return {
    score: breadthScore + keyCountryScore,
    countryBreadth,
    keyCountryTouched,
  };
}

function getMarketRelevanceScore(event: EventItem): number {
  const tags = safeArray(event.modeTags).map((tag) => tag.toLowerCase());
  const text = `${safeText(event.title)} ${safeText(event.summary)} ${safeArray(
    event.sectors
  ).join(" ")}`.toLowerCase();
  const keywordHits = MARKET_RELEVANCE_KEYWORDS.filter((keyword) =>
    text.includes(keyword)
  ).length;

  const tagBonus = tags.includes("market") ? 1.4 : 0;
  const keywordBonus = Math.min(keywordHits * 0.45, 1.8);

  return tagBonus + keywordBonus;
}

function getFreshnessScore(event: EventItem): number {
  const freshnessHours = getFreshnessHours(event);
  if (freshnessHours <= 6) {
    return 1.8;
  }
  if (freshnessHours <= 24) {
    return 1.2;
  }
  if (freshnessHours <= 72) {
    return 0.6;
  }
  return 0.2;
}

export function explainCandidateScore(event: EventItem): CandidateScoreBreakdown {
  const baseCandidateScore = getBaseCandidateScore(event);
  const matchedThemes = matchPriorityThemes(event);
  const themePriorityScore = getThemePriorityScore(event);
  const geo = getGeoKeyCountryScore(event);
  const marketRelevanceScore = getMarketRelevanceScore(event);
  const freshnessScore = getFreshnessScore(event);
  const sectorMatch = resolveSectorWeight(event);
  const sectorWeightMultiplier = getSectorWeightMultiplier(event);

  const preSectorScore =
    baseCandidateScore +
    themePriorityScore +
    geo.score +
    marketRelevanceScore +
    freshnessScore;
  const finalCandidateScore = preSectorScore * sectorWeightMultiplier;

  return {
    baseCandidateScore,
    themePriorityScore,
    geoKeyCountryScore: geo.score,
    marketRelevanceScore,
    freshnessScore,
    sectorWeightMultiplier,
    preSectorScore,
    finalCandidateScore,
    countryBreadth: geo.countryBreadth,
    keyCountryTouched: geo.keyCountryTouched,
    matchedThemes,
    sector: sectorMatch.sector,
    matchedSectorKeywords: sectorMatch.matchedKeywords,
  };
}

export function calculateCandidateScore(event: EventItem): number {
  return explainCandidateScore(event).finalCandidateScore;
}

export { getThemePriorityScore, getSectorWeightMultiplier, matchPriorityThemes };
