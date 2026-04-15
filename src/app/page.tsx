"use client";

import AiConfigPanel from "@/components/layout/AiConfigPanel";
import EventPanel from "@/components/layout/EventPanel";
import GlobalHotspots from "@/components/layout/GlobalHotspots";
import MapArea from "@/components/layout/MapArea";
import {
  AUTO_BATCH_ANALYZE_LIMIT,
  type AutoBatchProgressPayload,
  batchAnalyzeTopEvents,
} from "@/lib/batchAnalyzeEvents";
import {
  buildHotspotSnapshot,
  compareSnapshots,
  getLatestHotspotSnapshot,
  saveHotspotSnapshot,
  type HotspotChange,
} from "@/lib/hotspotSnapshot";
import { normalizeCountryName } from "@/lib/country";
import { buildSectorTopEvents } from "@/lib/sectorTopEvents";
import { useEvents } from "@/hooks/useEvents";
import { calculateImpactScore } from "@/types/eventAnalysis";
import { useEffect, useMemo, useRef, useState } from "react";

type EventFilterMode = "general" | "market";
const AUTO_BATCH_ANALYZE_STORAGE_KEY = "newmap.autoBatchAnalyzeOnRefresh";
const AUTO_BATCH_ANALYZE_LIMIT_STORAGE_KEY = "newmap.autoBatchAnalyzeLimit";
const AUTO_BATCH_ANALYZE_MIN_LIMIT = 1;
const AUTO_BATCH_ANALYZE_MAX_LIMIT = 20;

type AutoBatchRunSummary = {
  totalEvents: number;
  highPriorityCandidateCount: number;
  plannedAnalyzeCount: number;
  successCount: number;
  failedCount: number;
  skippedByBudgetCount: number;
  skippedNonPriorityCount: number;
} | null;

type AutoBatchProgressState = {
  status: "idle" | "running" | "completed";
  totalCount: number;
  completedCount: number;
  currentEventId: string | null;
  successfulEventIds: string[];
  failedEventIds: string[];
};

function normalizeBatchLimit(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(
    AUTO_BATCH_ANALYZE_MAX_LIMIT,
    Math.max(AUTO_BATCH_ANALYZE_MIN_LIMIT, parsed)
  );
}

export default function Home() {
  const {
    events,
    status: eventsStatus,
    error: eventsError,
    refresh: refreshEvents,
    isRefreshing,
    replaceEvents,
    updateEventById,
  } = useEvents();
  const [autoBatchAnalyzeOnRefresh, setAutoBatchAnalyzeOnRefresh] =
    useState(false);
  const [autoBatchConfigReady, setAutoBatchConfigReady] = useState(false);
  const [autoBatchAnalyzeLimit, setAutoBatchAnalyzeLimit] = useState(
    AUTO_BATCH_ANALYZE_LIMIT
  );
  const [lastAutoBatchSummary, setLastAutoBatchSummary] =
    useState<AutoBatchRunSummary>(null);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [autoBatchProgress, setAutoBatchProgress] = useState<AutoBatchProgressState>({
    status: "idle",
    totalCount: 0,
    completedCount: 0,
    currentEventId: null,
    successfulEventIds: [],
    failedEventIds: [],
  });
  const refreshRequestIdRef = useRef(0);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [selectedCountryName, setSelectedCountryName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"global" | "country">("global");
  const [eventMode, setEventMode] = useState<EventFilterMode>("general");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [activeEventSourceCountryCode, setActiveEventSourceCountryCode] = useState<string | null>(
    null
  );
  const [activeEventImpactedCountryCodes, setActiveEventImpactedCountryCodes] = useState<
    string[]
  >([]);
  const [hotspotChanges, setHotspotChanges] = useState<Record<string, HotspotChange>>(
    {}
  );
  const sectorTopEvents = useMemo(() => buildSectorTopEvents(events, 3), [events]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    const sectorCounts = Object.entries(sectorTopEvents).map(([sector, items]) => ({
      sector,
      count: items.length,
      top3: items.map((event) => event.id),
    }));
    console.debug("[sector-top-events] counts", {
      totalEvents: events.length,
      sectors: sectorCounts,
    });
  }, [events.length, sectorTopEvents]);

  useEffect(() => {
    const stored = localStorage.getItem(AUTO_BATCH_ANALYZE_STORAGE_KEY) === "1";
    const storedLimit = normalizeBatchLimit(
      localStorage.getItem(AUTO_BATCH_ANALYZE_LIMIT_STORAGE_KEY),
      AUTO_BATCH_ANALYZE_LIMIT
    );
    setAutoBatchAnalyzeOnRefresh(stored);
    setAutoBatchAnalyzeLimit(storedLimit);
    setAutoBatchConfigReady(true);

    if (process.env.NODE_ENV === "development") {
      console.debug("[auto-batch] ssr-initial", false);
      console.debug("[auto-batch] client-read", stored);
      console.debug("[auto-batch] client-read-limit", storedLimit);
      console.debug("[auto-batch] mounted-final", stored);
    }
  }, []);

  useEffect(() => {
    if (autoBatchProgress.status !== "completed") {
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoBatchProgress((prev) =>
        prev.status === "completed"
          ? { ...prev, status: "idle", currentEventId: null }
          : prev
      );
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoBatchProgress.status]);

  const handleCountrySelect = (
    country:
      | {
          countryCode: string;
          canonicalCountryName: string;
          rawName: string;
        }
      | null
  ) => {
    setSelectedCountryCode(country?.countryCode ?? null);
    setSelectedCountryName(country?.canonicalCountryName ?? null);
    setViewMode(country ? "country" : "global");
  };

  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  const handleBackToGlobal = () => {
    setSelectedCountryCode(null);
    setSelectedCountryName(null);
    setViewMode("global");
    setClearSelectionTrigger((value) => value + 1);
  };

  const handleEventHoverCountriesChange = (
    payload: {
      eventId: string;
      sourceCountry: string;
      impactedCountries: string[];
    } | null
  ) => {
    if (!payload) {
      setActiveEventSourceCountryCode(null);
      setActiveEventImpactedCountryCodes([]);
      return;
    }

    const normalizedSource = normalizeCountryName(payload.sourceCountry);
    const normalizedImpacted = Array.from(
      new Set(
        payload.impactedCountries
          .map((country) => normalizeCountryName(country).countryCode)
          .filter((code) => code && code !== "UNKNOWN" && code !== "GLOBAL")
      )
    );

    setActiveEventSourceCountryCode(
      normalizedSource.countryCode && normalizedSource.countryCode !== "UNKNOWN"
        ? normalizedSource.countryCode
        : null
    );
    setActiveEventImpactedCountryCodes(normalizedImpacted);

    if (process.env.NODE_ENV === "development") {
      console.debug("[event-hover-map-link] normalized", {
        eventId: payload.eventId,
        sourceRaw: payload.sourceCountry,
        sourceNormalized: normalizedSource,
        impactedRaw: payload.impactedCountries,
        impactedNormalized: normalizedImpacted,
      });
    }
  };

  const handleRefreshEvents = async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const refreshedEvents = await refreshEvents();
    if (!refreshedEvents || refreshRequestIdRef.current !== requestId) {
      return;
    }

    let finalEvents = refreshedEvents;
    replaceEvents(refreshedEvents);
    if (autoBatchAnalyzeOnRefresh) {
      setIsBatchAnalyzing(true);
      setAutoBatchProgress({
        status: "running",
        totalCount: 0,
        completedCount: 0,
        currentEventId: null,
        successfulEventIds: [],
        failedEventIds: [],
      });
      try {
        if (process.env.NODE_ENV === "development") {
          console.debug("[auto-batch] triggered", {
            requestId,
            refreshedCount: refreshedEvents.length,
            limit: autoBatchAnalyzeLimit,
          });
        }
        const batch = await batchAnalyzeTopEvents(
          refreshedEvents,
          autoBatchAnalyzeLimit,
          {
            onProgress: (progress: AutoBatchProgressPayload) => {
              if (refreshRequestIdRef.current !== requestId) {
                return;
              }
              if (progress.updatedEvents) {
                replaceEvents(progress.updatedEvents);
              }
              setAutoBatchProgress({
                status: progress.phase === "done" ? "completed" : "running",
                totalCount: progress.totalCount,
                completedCount: progress.completedCount,
                currentEventId: progress.phase === "done" ? null : progress.currentEventId,
                successfulEventIds: progress.successfulEventIds,
                failedEventIds: progress.failedEventIds,
              });
              if (process.env.NODE_ENV === "development") {
                const topHotspots = progress.updatedEvents
                  ? progress.updatedEvents
                      .slice()
                      .sort((a, b) => calculateImpactScore(b) - calculateImpactScore(a))
                      .slice(0, 5)
                      .map((event) => ({
                        id: event.id,
                        impactScore: Number(calculateImpactScore(event).toFixed(2)),
                      }))
                  : [];
                console.debug("[auto-batch] progress", {
                  requestId,
                  phase: progress.phase,
                  completed: progress.completedCount,
                  total: progress.totalCount,
                  currentEventId: progress.currentEventId,
                  success: progress.successfulCount,
                  failed: progress.failedCount,
                  mainEventsCount: progress.updatedEvents?.length ?? events.length,
                  hotspotTopAfterMerge: topHotspots,
                });
              }
            },
          }
        );
        if (refreshRequestIdRef.current !== requestId) {
          return;
        }
        finalEvents = batch.updatedEvents;
        replaceEvents(finalEvents);
        setLastAutoBatchSummary({
          totalEvents: batch.totalEvents,
          highPriorityCandidateCount: batch.highPriorityCandidateCount,
          plannedAnalyzeCount: batch.plannedAnalyzeCount,
          successCount: batch.successCount,
          failedCount: batch.failedCount,
          skippedByBudgetCount: batch.skippedByBudgetCount,
          skippedNonPriorityCount: batch.skippedNonPriorityCount,
        });

        if (process.env.NODE_ENV === "development") {
          const beforeTop = refreshedEvents
            .slice()
            .sort((a, b) => calculateImpactScore(b) - calculateImpactScore(a))
            .slice(0, 3)
            .map((event) => event.id);
          const afterTop = finalEvents
            .slice()
            .sort((a, b) => calculateImpactScore(b) - calculateImpactScore(a))
            .slice(0, 3)
            .map((event) => event.id);

          console.debug("[auto-batch] analyzed ids", {
            requestId,
            totalEvents: batch.totalEvents,
            highPriorityCandidateCount: batch.highPriorityCandidateCount,
            plannedAnalyzeCount: batch.plannedAnalyzeCount,
            skippedByBudgetCount: batch.skippedByBudgetCount,
            skippedNonPriorityCount: batch.skippedNonPriorityCount,
            successCount: batch.successCount,
            failedCount: batch.failedCount,
            analyzed: batch.analyzedEventIds,
            successful: batch.successfulEventIds,
            failed: batch.failedEventIds,
          });
          for (const eventId of batch.analyzedEventIds) {
            console.debug("[auto-batch] writeback", {
              requestId,
              eventId,
              wroteToMainState: batch.successfulEventIds.includes(eventId),
            });
          }
          console.debug("[auto-batch] hotspot reorder", {
            requestId,
            beforeTop,
            afterTop,
          });
        }
      } finally {
        if (refreshRequestIdRef.current === requestId) {
          setIsBatchAnalyzing(false);
        }
      }
    } else {
      setLastAutoBatchSummary(null);
      setAutoBatchProgress({
        status: "idle",
        totalCount: 0,
        completedCount: 0,
        currentEventId: null,
        successfulEventIds: [],
        failedEventIds: [],
      });
    }

    if (refreshRequestIdRef.current !== requestId) {
      return;
    }

    const previousSnapshot = getLatestHotspotSnapshot();
    const currentSnapshot = buildHotspotSnapshot(finalEvents);
    const comparison = compareSnapshots(previousSnapshot, currentSnapshot);
    saveHotspotSnapshot(currentSnapshot);
    setHotspotChanges(comparison.changesById);
    if (process.env.NODE_ENV === "development") {
      console.debug("[hotspot-snapshot] saved", {
        timestamp: currentSnapshot.timestamp,
        previousTimestamp: previousSnapshot?.timestamp ?? null,
        hotspotCount: currentSnapshot.hotspots.length,
        droppedIds: comparison.droppedIds,
        changes: comparison.changesById,
      });
    }

    if (viewMode === "country" && selectedCountryCode) {
      const hasCountryEvents = finalEvents.some(
        (event) => event.countryCode === selectedCountryCode
      );
      if (!hasCountryEvents) {
        setSelectedCountryCode(null);
        setSelectedCountryName(null);
        setViewMode("global");
        setClearSelectionTrigger((value) => value + 1);
      }
    }
  };

  return (
    <main className="h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top,_#f8fafc,_#e2e8f0)] p-4 md:p-6">
      <section className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-4 overflow-hidden md:h-[calc(100vh-3rem)] md:flex-row">
        <div className="order-2 flex min-h-[420px] w-full flex-[7] md:order-1">
          <MapArea
            selectedCountryCode={selectedCountryCode}
            selectedCountryName={selectedCountryName}
            activeSourceCountryCode={activeEventSourceCountryCode}
            activeImpactedCountryCodes={activeEventImpactedCountryCodes}
            onCountrySelect={handleCountrySelect}
            clearSelectionTrigger={clearSelectionTrigger}
          />
        </div>

        <aside className="order-1 flex min-h-0 w-full flex-[3] flex-col gap-4 overflow-hidden md:order-2">
          <GlobalHotspots
            events={events}
            eventsStatus={eventsStatus}
            eventsError={eventsError}
            hotspotChanges={hotspotChanges}
          />
          <AiConfigPanel />
          <EventPanel
            events={events}
            sectorTopEvents={sectorTopEvents}
            onUpdateEventById={updateEventById}
            eventsStatus={eventsStatus}
            eventsError={eventsError}
            onRefreshEvents={handleRefreshEvents}
            isRefreshingEvents={isRefreshing || isBatchAnalyzing}
            autoBatchAnalyzeOnRefresh={autoBatchAnalyzeOnRefresh}
            autoBatchConfigReady={autoBatchConfigReady}
            onToggleAutoBatchAnalyze={(enabled) => {
              setAutoBatchAnalyzeOnRefresh(enabled);
              if (!enabled) {
                setAutoBatchProgress({
                  status: "idle",
                  totalCount: 0,
                  completedCount: 0,
                  currentEventId: null,
                  successfulEventIds: [],
                  failedEventIds: [],
                });
              }
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  AUTO_BATCH_ANALYZE_STORAGE_KEY,
                  enabled ? "1" : "0"
                );
              }
            }}
            autoBatchAnalyzeLimit={autoBatchAnalyzeLimit}
            onAutoBatchAnalyzeLimitChange={(nextLimit) => {
              const normalizedLimit = normalizeBatchLimit(
                nextLimit,
                AUTO_BATCH_ANALYZE_LIMIT
              );
              setAutoBatchAnalyzeLimit(normalizedLimit);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  AUTO_BATCH_ANALYZE_LIMIT_STORAGE_KEY,
                  String(normalizedLimit)
                );
              }
            }}
            lastAutoBatchSummary={lastAutoBatchSummary}
            autoBatchProgress={autoBatchProgress}
            selectedCountryCode={selectedCountryCode}
            selectedCountryName={selectedCountryName}
            viewMode={viewMode}
            eventMode={eventMode}
            onEventModeChange={setEventMode}
            sectorFilter={sectorFilter}
            onSectorFilterChange={setSectorFilter}
            onBackToGlobal={handleBackToGlobal}
            onEventHoverChange={handleEventHoverCountriesChange}
          />
        </aside>
      </section>
    </main>
  );
}
