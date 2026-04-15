import type { EventItem } from "@/data/mockEvents";
import {
  getMacroKeywordScore,
  type MatchedMacroTheme,
} from "@/lib/server/macroKeywordDictionary";
import { getLowSignalPenalty } from "@/lib/server/lowSignalKeywordDictionary";
import {
  CROSS_BORDER_KEYWORDS,
  QUALITY_HARD_DROP_THRESHOLD,
  QUALITY_RELEVANT_CATEGORY_KEYWORDS,
  QUALITY_RELEVANT_SECTORS,
  QUALITY_SCORE_THRESHOLD,
} from "@/lib/server/qualityFilterConfig";

export type QualityDropReason = "entertainment" | "clickbait" | "low_relevance";

export type QualityBreakdown = {
  qualityScore: number;
  macroHitCount: number;
  macroKeywordScore: number;
  matchedMacroThemes: MatchedMacroTheme[];
  relevantCategoryHitCount: number;
  hasExplicitCountry: boolean;
  hasCrossBorderSignal: boolean;
  lowSignalPenalty: number;
  entertainmentHitCount: number;
  clickbaitHitCount: number;
  lowRelevanceHitCount: number;
  reason: QualityDropReason | null;
  lowPriority: boolean;
};

export type QualityFilterStats = {
  inputCount: number;
  keptCount: number;
  droppedCount: number;
  lowPriorityCount: number;
  droppedByReason: Record<QualityDropReason, number>;
};

export type QualityFilterResult = {
  events: EventItem[];
  stats: QualityFilterStats;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function countHits(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => {
    if (text.includes(keyword.toLowerCase())) {
      return count + 1;
    }
    return count;
  }, 0);
}

function normalizeModeTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

function titleSummaryText(event: EventItem): string {
  return `${safeText(event.title)} ${safeText(event.summary)}`.toLowerCase();
}

function fullEventText(event: EventItem): string {
  return `${safeText(event.title)} ${safeText(event.summary)} ${safeArray(event.sectors).join(" ")} ${safeArray(
    event.modeTags
  ).join(" ")}`.toLowerCase();
}

function hasExplicitCountry(event: EventItem): boolean {
  const country = safeText(event.country).trim();
  const countryCode = safeText(event.countryCode).trim().toUpperCase();
  if (countryCode && countryCode !== "GLOBAL") {
    return true;
  }
  if (!country) {
    return false;
  }
  return country.toLowerCase() !== "global";
}

function hasCrossBorderSignal(event: EventItem, text: string): boolean {
  const involvedCount = new Set<string>([
    safeText(event.country),
    ...safeArray(event.relatedCountries),
    ...safeArray(event.impactedCountries),
  ]).size;

  if (involvedCount >= 2) {
    return true;
  }

  return countHits(text, CROSS_BORDER_KEYWORDS) > 0;
}

export function calculateQualityScore(event: EventItem): number {
  const breakdown = explainQualityScore(event);
  return breakdown.qualityScore;
}

export function explainQualityScore(event: EventItem): QualityBreakdown {
  const summaryText = titleSummaryText(event);
  const text = fullEventText(event);
  if (!text.trim()) {
    return {
      qualityScore: 5,
      macroHitCount: 0,
      macroKeywordScore: 0,
      matchedMacroThemes: [],
      relevantCategoryHitCount: 0,
      hasExplicitCountry: false,
      hasCrossBorderSignal: false,
      lowSignalPenalty: 0,
      entertainmentHitCount: 0,
      clickbaitHitCount: 0,
      lowRelevanceHitCount: 0,
      reason: null,
      lowPriority: false,
    };
  }

  const macro = getMacroKeywordScore(summaryText);
  const macroHitCount = macro.matchedThemes.reduce(
    (count, theme) => count + theme.matchedKeywords.length,
    0
  );
  const relevantCategoryHitCount = countHits(text, QUALITY_RELEVANT_CATEGORY_KEYWORDS);
  const explicitCountry = hasExplicitCountry(event);
  const crossBorder = hasCrossBorderSignal(event, text);
  const lowSignal = getLowSignalPenalty(summaryText);

  const sectorRelevance = safeArray(event.sectors).some((sector) =>
    QUALITY_RELEVANT_SECTORS.has(sector)
  )
    ? 1.2
    : 0;

  const categoryScore = Math.min(2.6, relevantCategoryHitCount * 0.65) + sectorRelevance;
  const countryScore = explicitCountry ? 1.0 : 0.4;
  const crossBorderScore = crossBorder ? 1.2 : 0.4;

  const raw =
    1.8 +
    macro.score +
    categoryScore +
    countryScore +
    crossBorderScore -
    lowSignal.totalPenalty;

  const qualityScore = Number(Math.min(10, Math.max(0, raw)).toFixed(2));

  const entertainmentHitCount = lowSignal.hitCounts.entertainment;
  const clickbaitHitCount = lowSignal.hitCounts.clickbait;
  const lowRelevanceHitCount = lowSignal.hitCounts.low_relevance;

  let reason: QualityDropReason | null = null;
  if (clickbaitHitCount > 0 && macro.score < 0.6 && relevantCategoryHitCount === 0) {
    reason = "clickbait";
  } else if (entertainmentHitCount > 0 && macro.score < 0.6) {
    reason = "entertainment";
  } else if (qualityScore < QUALITY_HARD_DROP_THRESHOLD) {
    reason = "low_relevance";
  }

  const lowPriority = reason === null && qualityScore < QUALITY_SCORE_THRESHOLD;

  return {
    qualityScore,
    macroHitCount,
    macroKeywordScore: Number(macro.score.toFixed(2)),
    matchedMacroThemes: macro.matchedThemes,
    relevantCategoryHitCount,
    hasExplicitCountry: explicitCountry,
    hasCrossBorderSignal: crossBorder,
    lowSignalPenalty: lowSignal.totalPenalty,
    entertainmentHitCount,
    clickbaitHitCount,
    lowRelevanceHitCount,
    reason,
    lowPriority,
  };
}

export function isLowQualityEvent(event: EventItem): boolean {
  return explainQualityScore(event).reason !== null;
}

export function applyQualityFilter(events: EventItem[]): QualityFilterResult {
  const droppedByReason: Record<QualityDropReason, number> = {
    entertainment: 0,
    clickbait: 0,
    low_relevance: 0,
  };

  let lowPriorityCount = 0;
  const nextEvents: EventItem[] = [];

  for (const event of events) {
    const breakdown = explainQualityScore(event);

    if (process.env.NODE_ENV === "development") {
      if (breakdown.matchedMacroThemes.length > 0 || breakdown.lowSignalPenalty > 0) {
        console.debug("[news-events] quality keyword match", {
          eventId: event.id,
          title: event.title,
          macroThemes: breakdown.matchedMacroThemes.map((theme) => ({
            label: theme.label,
            keywords: theme.matchedKeywords,
            score: Number(theme.themeScore.toFixed(2)),
          })),
          macroKeywordScore: breakdown.macroKeywordScore,
          lowSignalPenalty: breakdown.lowSignalPenalty,
          qualityScore: breakdown.qualityScore,
        });
      }
    }

    const shouldMarkLowPriority = Boolean(breakdown.reason) || breakdown.lowPriority;
    if (breakdown.reason) {
      droppedByReason[breakdown.reason] += 1;
    }

    if (shouldMarkLowPriority) {
      lowPriorityCount += 1;
      const nextTags = new Set(normalizeModeTags(safeArray(event.modeTags)));
      nextTags.add("low_priority");
      nextTags.delete("global");
      nextTags.delete("global_featured");
      nextEvents.push({
        ...event,
        modeTags: Array.from(nextTags),
      });
      continue;
    }

    nextEvents.push(event);
  }

  return {
    events: nextEvents,
    stats: {
      inputCount: events.length,
      keptCount: nextEvents.length,
      droppedCount: 0,
      lowPriorityCount,
      droppedByReason,
    },
  };
}
