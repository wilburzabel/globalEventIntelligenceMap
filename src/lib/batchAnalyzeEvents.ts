import { calculateImpactScore, type EventItem } from "@/data/mockEvents";
import { analyzeEvent } from "@/lib/analyzeEvent";
import { buildImpactPath } from "@/lib/impactPath";
import {
  calculateCandidateScore,
  explainCandidateScore,
} from "@/lib/scoring/candidateScoring";
import { buildRankingExplanation } from "@/lib/scoring/rankingExplanation";

const DEFAULT_BATCH_LIMIT = 5;

export type AutoBatchProgressPayload = {
  phase: "start" | "item" | "done";
  totalCount: number;
  completedCount: number;
  currentEventId: string | null;
  successfulCount: number;
  failedCount: number;
  analyzedEventIds: string[];
  successfulEventIds: string[];
  failedEventIds: string[];
  updatedEvents?: EventItem[];
};

type BatchAnalyzeOptions = {
  onProgress?: (payload: AutoBatchProgressPayload) => void;
};

function clampScore(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, Math.round(num)));
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

type ScoredCandidate = {
  event: EventItem;
  score: number;
  tags: string[];
  countryBreadth: number;
  highPriorityTheme: boolean;
  breakdown: ReturnType<typeof explainCandidateScore>;
};

function rankBatchCandidates(events: EventItem[]): ScoredCandidate[] {
  const scored = events.map((event): ScoredCandidate => {
    const breakdown = explainCandidateScore(event);
    const tags = safeArray(event.modeTags).map((tag) => tag.toLowerCase());
    return {
      event,
      score: breakdown.finalCandidateScore,
      tags,
      countryBreadth: breakdown.countryBreadth,
      highPriorityTheme: breakdown.matchedThemes.length > 0,
      breakdown,
    };
  });

  return scored
    .filter(({ event, score, tags, countryBreadth, highPriorityTheme }) => {
      if (tags.includes("low_priority")) {
        return false;
      }
      const isGlobalCandidate = tags.includes("global_featured") || tags.includes("global");
      return (
        isGlobalCandidate ||
        safeText(event.country) === "Global" ||
        tags.includes("market") ||
        highPriorityTheme ||
        countryBreadth >= 3 ||
        score >= 9
      );
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return safeText(b.event.updatedAt).localeCompare(safeText(a.event.updatedAt));
    })
}

export async function batchAnalyzeTopEvents(
  events: EventItem[],
  limit = DEFAULT_BATCH_LIMIT,
  options?: BatchAnalyzeOptions
): Promise<{
  updatedEvents: EventItem[];
  analyzedEventIds: string[];
  successfulEventIds: string[];
  failedEventIds: string[];
  analyzedCount: number;
  successCount: number;
  failedCount: number;
  totalEvents: number;
  highPriorityCandidateCount: number;
  plannedAnalyzeCount: number;
  skippedByBudgetCount: number;
  skippedNonPriorityCount: number;
}> {
  const rankedCandidates = rankBatchCandidates(events);
  const candidates = rankedCandidates.slice(0, limit);
  const totalEvents = events.length;
  const highPriorityCandidateCount = rankedCandidates.length;
  const plannedAnalyzeCount = candidates.length;
  const skippedByBudgetCount = Math.max(0, highPriorityCandidateCount - plannedAnalyzeCount);
  const skippedNonPriorityCount = Math.max(0, totalEvents - highPriorityCandidateCount);
  if (process.env.NODE_ENV === "development") {
    console.debug("[auto-batch] plan", {
      totalEvents,
      highPriorityCandidateCount,
      plannedAnalyzeCount,
      skippedByBudgetCount,
      skippedNonPriorityCount,
    });
    console.debug("[auto-batch] candidate ids", {
      inputCount: totalEvents,
      candidateCount: plannedAnalyzeCount,
      ids: candidates.map((item) => item.event.id),
    });
    console.debug("[auto-batch] candidate preview", {
      ids: candidates.map((item) => ({
        id: item.event.id,
        candidateScore: Number(item.score.toFixed(2)),
      })),
    });
    console.debug("[auto-batch] candidate top rank", {
      top: rankedCandidates.slice(0, Math.min(10, rankedCandidates.length)).map((item) => ({
        id: item.event.id,
        candidateScore: Number(item.score.toFixed(2)),
        themes: item.breakdown.matchedThemes.map((theme) => theme.label),
        sector: item.breakdown.sector.label,
        sectorWeight: item.breakdown.sectorWeightMultiplier,
        scoreParts: {
          baseCandidateScore: Number(item.breakdown.baseCandidateScore.toFixed(2)),
          themePriorityScore: Number(item.breakdown.themePriorityScore.toFixed(2)),
          geoKeyCountryScore: Number(item.breakdown.geoKeyCountryScore.toFixed(2)),
          marketRelevanceScore: Number(item.breakdown.marketRelevanceScore.toFixed(2)),
          freshnessScore: Number(item.breakdown.freshnessScore.toFixed(2)),
          preSectorScore: Number(item.breakdown.preSectorScore.toFixed(2)),
        },
      })),
    });
  }
  if (candidates.length === 0) {
    options?.onProgress?.({
      phase: "start",
      totalCount: 0,
      completedCount: 0,
      currentEventId: null,
      successfulCount: 0,
      failedCount: 0,
      analyzedEventIds: [],
      successfulEventIds: [],
      failedEventIds: [],
    });
    options?.onProgress?.({
      phase: "done",
      totalCount: 0,
      completedCount: 0,
      currentEventId: null,
      successfulCount: 0,
      failedCount: 0,
      analyzedEventIds: [],
      successfulEventIds: [],
      failedEventIds: [],
      updatedEvents: events,
    });
    return {
      updatedEvents: events,
      analyzedEventIds: [],
      successfulEventIds: [],
      failedEventIds: [],
      analyzedCount: 0,
      successCount: 0,
      failedCount: 0,
      totalEvents,
      highPriorityCandidateCount,
      plannedAnalyzeCount,
      skippedByBudgetCount,
      skippedNonPriorityCount,
    };
  }

  const byId = new Map(events.map((event) => [event.id, event] as const));
  let successCount = 0;
  let failedCount = 0;
  const analyzedEventIds = candidates.map((item) => item.event.id);
  const successfulEventIds: string[] = [];
  const failedEventIds: string[] = [];
  let completedCount = 0;

  options?.onProgress?.({
    phase: "start",
    totalCount: candidates.length,
    completedCount,
    currentEventId: candidates[0]?.event.id ?? null,
    successfulCount: successCount,
    failedCount,
    analyzedEventIds,
    successfulEventIds: [...successfulEventIds],
    failedEventIds: [...failedEventIds],
  });

  for (const rankedCandidate of candidates) {
    const candidate = rankedCandidate.event;
    if (process.env.NODE_ENV === "development") {
      console.debug("[auto-batch] candidate score detail", {
        eventId: candidate.id,
        title: candidate.title,
        matchedThemes: rankedCandidate.breakdown.matchedThemes.map((theme) => ({
          label: theme.label,
          weight: theme.priorityWeight,
          keywords: theme.matchedKeywords,
        })),
        sector: rankedCandidate.breakdown.sector.label,
        sectorWeight: rankedCandidate.breakdown.sectorWeightMultiplier,
        scoreParts: {
          baseCandidateScore: Number(rankedCandidate.breakdown.baseCandidateScore.toFixed(2)),
          themePriorityScore: Number(rankedCandidate.breakdown.themePriorityScore.toFixed(2)),
          geoKeyCountryScore: Number(rankedCandidate.breakdown.geoKeyCountryScore.toFixed(2)),
          marketRelevanceScore: Number(rankedCandidate.breakdown.marketRelevanceScore.toFixed(2)),
          freshnessScore: Number(rankedCandidate.breakdown.freshnessScore.toFixed(2)),
          preSectorScore: Number(rankedCandidate.breakdown.preSectorScore.toFixed(2)),
          finalCandidateScore: Number(rankedCandidate.breakdown.finalCandidateScore.toFixed(2)),
        },
      });
    }
    try {
      const beforeImpact = calculateImpactScore(candidate);
      const input = `${candidate.title}\n${candidate.summary}`;
      const ai = await analyzeEvent(input);
      const hasValid =
        ai.hasAiSentiment ||
        ai.hasAiScores ||
        ai.hasAiTags ||
        ai.hasAiExplanation ||
        ai.hasAiImpactChain;
      if (!hasValid) {
        failedCount += 1;
        failedEventIds.push(candidate.id);
        completedCount += 1;
        options?.onProgress?.({
          phase: "item",
          totalCount: candidates.length,
          completedCount,
          currentEventId: candidate.id,
          successfulCount: successCount,
          failedCount,
          analyzedEventIds,
          successfulEventIds: [...successfulEventIds],
          failedEventIds: [...failedEventIds],
          updatedEvents: events.map((event) => byId.get(event.id) ?? event),
        });
        if (process.env.NODE_ENV === "development") {
          console.debug("[auto-batch] skip invalid ai result", {
            eventId: candidate.id,
          });
        }
        continue;
      }

      const current = byId.get(candidate.id);
      if (!current) {
        failedCount += 1;
        failedEventIds.push(candidate.id);
        completedCount += 1;
        options?.onProgress?.({
          phase: "item",
          totalCount: candidates.length,
          completedCount,
          currentEventId: candidate.id,
          successfulCount: successCount,
          failedCount,
          analyzedEventIds,
          successfulEventIds: [...successfulEventIds],
          failedEventIds: [...failedEventIds],
          updatedEvents: events.map((event) => byId.get(event.id) ?? event),
        });
        if (process.env.NODE_ENV === "development") {
          console.debug("[auto-batch] skip missing source event", {
            eventId: candidate.id,
          });
        }
        continue;
      }

      const nextEvent: EventItem = {
        ...current,
        sentiment: ai.hasAiSentiment ? ai.sentiment : current.sentiment,
        sectors: ai.sectors.length > 0 ? ai.sectors : current.sectors,
        relatedCountries:
          ai.relatedCountries.length > 0
            ? ai.relatedCountries
            : current.relatedCountries,
        impactedCountries:
          ai.impactedCountries.length > 0
            ? ai.impactedCountries
            : current.impactedCountries,
        marketImpact: ai.hasAiScores
          ? clampScore(ai.marketImpact, current.marketImpact)
          : current.marketImpact,
        geopoliticalImpact: ai.hasAiScores
          ? clampScore(ai.geopoliticalImpact, current.geopoliticalImpact)
          : current.geopoliticalImpact,
        attentionScore: ai.hasAiScores
          ? clampScore(ai.attentionScore, current.attentionScore)
          : current.attentionScore,
        explanation: ai.explanation,
        impactChain: ai.impactChain,
      };
      const changedFields = {
        sentimentChanged: nextEvent.sentiment !== current.sentiment,
        sectorsChanged: JSON.stringify(nextEvent.sectors) !== JSON.stringify(current.sectors),
        relatedCountriesChanged:
          JSON.stringify(nextEvent.relatedCountries) !== JSON.stringify(current.relatedCountries),
        impactedCountriesChanged:
          JSON.stringify(nextEvent.impactedCountries) !== JSON.stringify(current.impactedCountries),
        marketImpactChanged: nextEvent.marketImpact !== current.marketImpact,
        geopoliticalImpactChanged: nextEvent.geopoliticalImpact !== current.geopoliticalImpact,
        attentionScoreChanged: nextEvent.attentionScore !== current.attentionScore,
        explanationChanged:
          JSON.stringify(nextEvent.explanation) !== JSON.stringify(current.explanation),
        impactChainChanged:
          JSON.stringify(nextEvent.impactChain) !== JSON.stringify(current.impactChain),
      };
      const afterImpact = calculateImpactScore(nextEvent);
      const aiImpactDelta = Number((afterImpact - beforeImpact).toFixed(2));
      nextEvent.rankingExplanation = buildRankingExplanation(nextEvent, {
        isGlobalCandidate: safeArray(nextEvent.modeTags).includes("global"),
        isGlobalFeatured: safeArray(nextEvent.modeTags).includes("global_featured"),
        aiImpactDelta,
      });
      nextEvent.impactPath = buildImpactPath(nextEvent).impactPath;
      byId.set(candidate.id, nextEvent);
      successCount += 1;
      successfulEventIds.push(candidate.id);
      completedCount += 1;
      options?.onProgress?.({
        phase: "item",
        totalCount: candidates.length,
        completedCount,
        currentEventId: candidate.id,
        successfulCount: successCount,
        failedCount,
        analyzedEventIds,
        successfulEventIds: [...successfulEventIds],
        failedEventIds: [...failedEventIds],
        updatedEvents: events.map((event) => byId.get(event.id) ?? event),
      });
      if (process.env.NODE_ENV === "development") {
        const updated = byId.get(candidate.id);
        const updatedInMainState = events.find((event) => event.id === candidate.id);
        console.debug("[auto-batch] analysis success", {
          eventId: candidate.id,
          mainEventsCount: events.length,
          batchCandidateIds: analyzedEventIds,
          candidateScore: Number(calculateCandidateScore(candidate).toFixed(2)),
          beforeImpact: Number(beforeImpact.toFixed(2)),
          afterImpact: updated ? Number(calculateImpactScore(updated).toFixed(2)) : null,
          aiImpactDelta,
          writebackBefore: {
            sentiment: current.sentiment,
            sectors: current.sectors,
            relatedCountries: current.relatedCountries,
            impactedCountries: current.impactedCountries,
            marketImpact: current.marketImpact,
            geopoliticalImpact: current.geopoliticalImpact,
            attentionScore: current.attentionScore,
            explanation: current.explanation,
            impactChain: current.impactChain,
          },
          writebackAfter: {
            sentiment: nextEvent.sentiment,
            sectors: nextEvent.sectors,
            relatedCountries: nextEvent.relatedCountries,
            impactedCountries: nextEvent.impactedCountries,
            marketImpact: nextEvent.marketImpact,
            geopoliticalImpact: nextEvent.geopoliticalImpact,
            attentionScore: nextEvent.attentionScore,
            explanation: nextEvent.explanation,
            impactChain: nextEvent.impactChain,
          },
          changedFields,
          byIdUpdated: Boolean(updated),
          mainStateStillOldBeforeMerge:
            updatedInMainState ? updatedInMainState.sentiment === current.sentiment : null,
          rankingExplanationSignals: updated?.rankingExplanation?.scoreBreakdown ?? null,
        });
      }
    } catch {
      failedCount += 1;
      failedEventIds.push(candidate.id);
      completedCount += 1;
      options?.onProgress?.({
        phase: "item",
        totalCount: candidates.length,
        completedCount,
        currentEventId: candidate.id,
        successfulCount: successCount,
        failedCount,
        analyzedEventIds,
        successfulEventIds: [...successfulEventIds],
        failedEventIds: [...failedEventIds],
        updatedEvents: events.map((event) => byId.get(event.id) ?? event),
      });
      if (process.env.NODE_ENV === "development") {
        console.debug("[auto-batch] analysis failed", {
          eventId: candidate.id,
        });
      }
    }
  }

  return {
    updatedEvents: (() => {
      const updatedEvents = events.map((event) => byId.get(event.id) ?? event);
      options?.onProgress?.({
        phase: "done",
        totalCount: candidates.length,
        completedCount,
        currentEventId: null,
        successfulCount: successCount,
        failedCount,
        analyzedEventIds,
        successfulEventIds: [...successfulEventIds],
        failedEventIds: [...failedEventIds],
        updatedEvents,
      });
      return updatedEvents;
    })(),
    analyzedEventIds,
    successfulEventIds,
    failedEventIds,
    analyzedCount: candidates.length,
    successCount,
    failedCount,
    totalEvents,
    highPriorityCandidateCount,
    plannedAnalyzeCount,
    skippedByBudgetCount,
    skippedNonPriorityCount,
  };
}

export const AUTO_BATCH_ANALYZE_LIMIT = DEFAULT_BATCH_LIMIT;
