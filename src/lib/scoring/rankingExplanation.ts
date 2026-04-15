import {
  calculateImpactScore,
  type EventItem,
} from "@/data/mockEvents";
import { explainCandidateScore } from "@/lib/scoring/candidateScoring";

export type RankingExplanation = {
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

export type RankingExplanationBuildOptions = {
  rank?: number;
  rankingScore?: number;
  isGlobalCandidate?: boolean;
  isGlobalFeatured?: boolean;
  aiImpactDelta?: number;
};

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function getInvolvedCountryCount(event: EventItem): number {
  return new Set([
    event.country,
    ...safeArray(event.relatedCountries),
    ...safeArray(event.impactedCountries),
  ]).size;
}

export function buildRankingExplanation(
  event: EventItem,
  options?: RankingExplanationBuildOptions
): RankingExplanation {
  const candidate = explainCandidateScore(event);
  const impactScore = calculateImpactScore(event);
  const tags = new Set(safeArray(event.modeTags));
  const isMarketEvent = tags.has("market") || candidate.marketRelevanceScore > 1.2;
  const isGlobalCandidate =
    options?.isGlobalCandidate ?? (tags.has("global") || tags.has("global_featured"));
  const isGlobalFeatured = options?.isGlobalFeatured ?? tags.has("global_featured");
  const involvedCountryCount = getInvolvedCountryCount(event);
  const rankingScore = options?.rankingScore ?? (candidate.finalCandidateScore + impactScore);
  const aiImpactDelta = options?.aiImpactDelta ?? 0;

  const reasons: string[] = [];

  if (isGlobalCandidate) {
    reasons.push("事件满足全球候选条件，具备跨区域或市场层面的可传播性。");
  }

  if (candidate.matchedThemes.length > 0) {
    const topThemes = candidate.matchedThemes
      .slice(0, 2)
      .map((theme) => theme.label)
      .join("、");
    reasons.push(`命中高优先级主题（${topThemes}），提升了候选优先级。`);
  } else {
    reasons.push("虽未明显命中高优先级主题，但基础影响分与相关性仍支撑其进入排序。");
  }

  reasons.push(
    `候选分由主题、地缘、市场与时效共同驱动（candidateScore ${round2(
      candidate.finalCandidateScore
    )}）。`
  );

  reasons.push(`事件综合影响分为 ${round2(impactScore)}。`);

  if (isMarketEvent) {
    reasons.push("事件具备市场相关性信号，对资产定价更敏感。");
  }

  if (involvedCountryCount >= 2) {
    reasons.push(`涉及 ${involvedCountryCount} 个国家/地区，跨国传导风险更强。`);
  }

  if (candidate.keyCountryTouched) {
    reasons.push("覆盖关键国家（如 US/CN/EU/JP），全球关注度更高。");
  }

  if (aiImpactDelta > 0.2) {
    reasons.push(`AI 分析后影响分上修 ${round2(aiImpactDelta)}，推动排序靠前。`);
  }

  if (isGlobalFeatured) {
    reasons.push("在全球候选中综合得分靠前，进入 globalFeatured 热点池。");
  }

  const rank = typeof options?.rank === "number" ? options.rank : null;
  const summary =
    rank && rank > 0
      ? `该事件因多维信号共振进入全球热点，并位列第 ${rank} 位。`
      : "该事件因多维信号共振进入全球热点候选。";

  return {
    summary,
    reasons: Array.from(new Set(reasons)).slice(0, 6),
    scoreBreakdown: {
      candidateScore: round2(candidate.finalCandidateScore),
      impactScore: round2(impactScore),
      rankingScore: round2(rankingScore),
      involvedCountryCount,
      isGlobalCandidate,
      isMarketEvent,
      highPriorityThemeCount: candidate.matchedThemes.length,
      keyCountryTouched: candidate.keyCountryTouched,
      aiImpactDelta: round2(aiImpactDelta),
      rank,
    },
  };
}
