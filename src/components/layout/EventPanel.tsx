import {
  type EventItem,
  type EventSentiment,
  type EventViewMode,
} from "@/data/mockEvents";
import { analyzeEvent } from "@/lib/analyzeEvent";
import { buildImpactPath } from "@/lib/impactPath";
import type { SectorTopEvents } from "@/lib/sectorTopEvents";
import {
  calculateImpactScore,
  type EventExplanation,
  type EventImpactChain,
} from "@/types/eventAnalysis";
import { useEffect, useState } from "react";

const SENTIMENT_STYLES: Record<EventSentiment, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-200 text-slate-700",
  negative: "bg-rose-100 text-rose-700",
};

const TAG_BASE_CLASS =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700";

type EventFilterMode = "general" | "market";
type ImpactFilterMode = "all" | "high";
type AiAnalyzedFilterMode = "all" | "analyzed";
type AnalysisStatus = "idle" | "loading" | "success" | "error";
type AutoBatchRunSummary = {
  totalEvents: number;
  highPriorityCandidateCount: number;
  plannedAnalyzeCount: number;
  successCount: number;
  failedCount: number;
  skippedByBudgetCount: number;
  skippedNonPriorityCount: number;
} | null;
type AutoBatchProgress = {
  status: "idle" | "running" | "completed";
  totalCount: number;
  completedCount: number;
  currentEventId: string | null;
  successfulEventIds: string[];
  failedEventIds: string[];
};

type EventPanelProps = {
  events: EventItem[];
  sectorTopEvents: SectorTopEvents;
  onUpdateEventById: (
    eventId: string,
    updater: (current: EventItem) => EventItem
  ) => void;
  eventsStatus: "loading" | "success" | "error";
  eventsError: string | null;
  onRefreshEvents: () => Promise<void>;
  isRefreshingEvents: boolean;
  autoBatchAnalyzeOnRefresh: boolean;
  autoBatchConfigReady: boolean;
  onToggleAutoBatchAnalyze: (enabled: boolean) => void;
  autoBatchAnalyzeLimit: number;
  onAutoBatchAnalyzeLimitChange: (limit: number) => void;
  lastAutoBatchSummary: AutoBatchRunSummary;
  autoBatchProgress: AutoBatchProgress;
  selectedCountryCode: string | null;
  selectedCountryName: string | null;
  viewMode: EventViewMode;
  eventMode: EventFilterMode;
  onEventModeChange: (mode: EventFilterMode) => void;
  sectorFilter: string;
  onSectorFilterChange: (sector: string) => void;
  onBackToGlobal: () => void;
  onEventHoverChange: (payload: {
    eventId: string;
    sourceCountry: string;
    impactedCountries: string[];
  } | null) => void;
};

export default function EventPanel({
  events,
  sectorTopEvents,
  onUpdateEventById,
  eventsStatus,
  eventsError,
  onRefreshEvents,
  isRefreshingEvents,
  autoBatchAnalyzeOnRefresh,
  autoBatchConfigReady,
  onToggleAutoBatchAnalyze,
  autoBatchAnalyzeLimit,
  onAutoBatchAnalyzeLimitChange,
  lastAutoBatchSummary,
  autoBatchProgress,
  selectedCountryCode,
  selectedCountryName,
  viewMode,
  eventMode,
  onEventModeChange,
  sectorFilter,
  onSectorFilterChange,
  onBackToGlobal,
  onEventHoverChange,
}: EventPanelProps) {
  const AUTO_BATCH_LIMIT_OPTIONS = [3, 5, 8, 12];
  const HIGH_IMPACT_THRESHOLD = 7;
  const safeArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  };
  const clampScore = (value: unknown, fallback: number): number => {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }

    return Math.min(10, Math.max(1, num));
  };
  const safeText = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value : fallback;
  const formatRelativeTime = (value: unknown): string => {
    const raw = safeText(value, "");
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) {
      return "--";
    }
    const diffMs = Date.now() - ts;
    if (diffMs < 0) {
      return "just now";
    }
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  const normalizeExplanation = (
    value: EventExplanation | undefined,
    event: EventItem
  ): EventExplanation => {
    if (value && value.summary.trim() && value.drivers.length > 0) {
      return value;
    }
    const sectors = safeArray(event.sectors).slice(0, 3);
    const countries = safeArray(event.impactedCountries).slice(0, 3);
    return {
      summary: `该事件对${sectors.length > 0 ? sectors.join("、") : "相关板块"}存在潜在影响，需结合后续信息持续观察。`,
      drivers: [
        sectors.length > 0
          ? `板块暴露：${sectors.join("、")}。`
          : "板块信号有限，需结合后续标签补充判断。",
        countries.length > 0
          ? `影响国家/地区：${countries.join("、")}。`
          : `主要涉及国家：${safeText(event.country, "未知")}。`,
      ],
    };
  };
  const normalizeImpactChain = (
    value: EventImpactChain | undefined,
    event: EventItem
  ): EventImpactChain => {
    if (value && value.summary.trim() && value.steps.length > 0) {
      return value;
    }
    const source = safeText(event.country, "源头国家");
    const impacted = safeArray(event.impactedCountries).slice(0, 3);
    const sectors = safeArray(event.sectors).slice(0, 3);
    return {
      summary: "该事件从源头国家出发，经过跨境预期与行业链条向外扩散。",
      steps: [
        `源头冲击：事件首先在 ${source} 形成初始影响。`,
        impacted.length > 0
          ? `跨国传导：影响逐步扩散至 ${impacted.join("、")}。`
          : "跨国传导：影响通过市场预期向外围地区扩散。",
        sectors.length > 0
          ? `行业落点：主要作用于 ${sectors.join("、")}。`
          : "行业落点：当前主要受影响行业仍需后续确认。",
      ],
    };
  };

  const safeViewMode: EventViewMode =
    viewMode === "country" && selectedCountryCode ? "country" : "global";
  const allEvents: EventItem[] = Array.isArray(events) ? events : [];
  const [impactFilter, setImpactFilter] = useState<ImpactFilterMode>("all");
  const [aiAnalyzedFilter, setAiAnalyzedFilter] =
    useState<AiAnalyzedFilterMode>("all");
  const sectorOptions = [
    "All",
    ...Array.from(new Set(allEvents.flatMap((event) => safeArray(event.sectors)))),
  ];
  let panelError: string | null = null;
  let scopedByView: EventItem[] = [];
  let modeFilteredEvents: EventItem[] = [];
  let sectorFilteredEvents: EventItem[] = [];
  let impactFilteredEvents: EventItem[] = [];
  let analyzedFilteredEvents: EventItem[] = [];
  let eventList: EventItem[] = [];
  try {
    scopedByView =
      safeViewMode === "country"
        ? allEvents.filter(
            (event) => safeText(event.countryCode, "") === selectedCountryCode
          )
        : allEvents;
    modeFilteredEvents =
      eventMode === "market"
        ? scopedByView.filter((event) => safeArray(event.modeTags).includes("market"))
        : scopedByView;
    sectorFilteredEvents =
      sectorFilter === "All"
        ? modeFilteredEvents
        : modeFilteredEvents.filter((event) =>
            safeArray(event.sectors).includes(sectorFilter)
          );
    impactFilteredEvents =
      impactFilter === "high"
        ? sectorFilteredEvents.filter(
            (event) =>
              calculateImpactScore({
                marketImpact: clampScore(event.marketImpact, 5),
                geopoliticalImpact: clampScore(event.geopoliticalImpact, 5),
                attentionScore: clampScore(event.attentionScore, 5),
              }) >= HIGH_IMPACT_THRESHOLD
          )
        : sectorFilteredEvents;
    analyzedFilteredEvents =
      aiAnalyzedFilter === "analyzed"
        ? impactFilteredEvents.filter(
            (event) =>
              Boolean(event.explanation?.summary) ||
              Boolean(event.impactChain?.summary)
          )
        : impactFilteredEvents;
    eventList = analyzedFilteredEvents;
  } catch {
    panelError = "事件数据处理异常，请稍后重试。";
  }
  const emptyMessage =
    allEvents.length === 0
      ? "当前暂无事件数据。"
      : safeViewMode === "country" && scopedByView.length === 0
        ? "该国家暂无事件，已回退为空结果展示。"
        : modeFilteredEvents.length === 0
          ? "当前模式下暂无事件。"
          : sectorFilteredEvents.length === 0
            ? "当前板块筛选下暂无事件。"
            : impactFilteredEvents.length === 0
              ? "当前影响分筛选下暂无事件。"
              : "当前 AI 筛选下暂无事件。";
  const panelTitle =
    safeViewMode === "country"
      ? `${safeText(selectedCountryName, "Unknown Country")} 事件`
      : "全球事件";
  const sectorRepresentativeGroups = Object.entries(sectorTopEvents).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const [analysisStatus, setAnalysisStatus] = useState<
    Record<string, AnalysisStatus>
  >({});
  const [analysisError, setAnalysisError] = useState<Record<string, string>>({});
  const isPanelLoading = Object.values(analysisStatus).some(
    (status) => status === "loading"
  );
  const autoBatchAnalyzedIds = new Set(autoBatchProgress.successfulEventIds);
  const autoBatchFailedIds = new Set(autoBatchProgress.failedEventIds);
  const autoBatchStatusText =
    autoBatchProgress.status === "running"
      ? "running"
      : autoBatchProgress.status === "completed"
        ? "completed"
        : "idle";
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || safeViewMode !== "country") {
      return;
    }
    console.debug("[EventPanel] country match", {
      selectedCountryCode,
      selectedCountryName,
      matchedCount: scopedByView.length,
    });
  }, [safeViewMode, selectedCountryCode, selectedCountryName, scopedByView.length]);

  const handleAnalyzeEvent = async (event: EventItem) => {
    if (analysisStatus[event.id] === "loading") {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[EventPanel] request start", { eventId: event.id });
    }

    setAnalysisStatus((prev) => ({ ...prev, [event.id]: "loading" }));
    setAnalysisError((prev) => {
      const next = { ...prev };
      delete next[event.id];
      return next;
    });

    try {
      const input = `${event.title}\n${event.summary}`;
      const result = await analyzeEvent(input);
      onUpdateEventById(event.id, (current) => {
        const nextEvent: EventItem = {
          ...current,
          sentiment: result.hasAiSentiment ? result.sentiment : current.sentiment,
          sectors: result.sectors.length > 0 ? result.sectors : current.sectors,
          relatedCountries:
            result.relatedCountries.length > 0
              ? result.relatedCountries
              : current.relatedCountries,
          impactedCountries:
            result.impactedCountries.length > 0
              ? result.impactedCountries
              : current.impactedCountries,
          marketImpact: result.hasAiScores ? clampScore(result.marketImpact, 5) : current.marketImpact,
          geopoliticalImpact: result.hasAiScores
            ? clampScore(result.geopoliticalImpact, 5)
            : current.geopoliticalImpact,
          attentionScore: result.hasAiScores
            ? clampScore(result.attentionScore, 5)
            : current.attentionScore,
          explanation: normalizeExplanation(result.explanation, current),
          impactChain: normalizeImpactChain(result.impactChain, current),
        };
        nextEvent.impactPath = buildImpactPath(nextEvent).impactPath;

        if (process.env.NODE_ENV === "development") {
          console.debug("[EventPanel] writeback to main events", {
            eventId: event.id,
            from: {
              sentiment: current.sentiment,
              sectors: current.sectors,
              relatedCountries: current.relatedCountries,
              impactedCountries: current.impactedCountries,
              marketImpact: current.marketImpact,
              geopoliticalImpact: current.geopoliticalImpact,
              attentionScore: current.attentionScore,
            },
            to: {
              sentiment: nextEvent.sentiment,
              sectors: nextEvent.sectors,
              relatedCountries: nextEvent.relatedCountries,
              impactedCountries: nextEvent.impactedCountries,
              marketImpact: nextEvent.marketImpact,
              geopoliticalImpact: nextEvent.geopoliticalImpact,
              attentionScore: nextEvent.attentionScore,
            },
          });
        }

        return nextEvent;
      });
      setAnalysisStatus((prev) => ({ ...prev, [event.id]: "success" }));
    } catch {
      setAnalysisStatus((prev) => ({ ...prev, [event.id]: "error" }));
      setAnalysisError((prev) => ({ ...prev, [event.id]: "分析失败，请稍后重试" }));
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300/80 bg-white/85 p-4 shadow-sm backdrop-blur md:p-5">
      <header className="mb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{panelTitle}</h2>
          <div className="flex items-center gap-2">
            {safeViewMode === "country" ? (
              <button
                type="button"
                onClick={onBackToGlobal}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                返回全球
              </button>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                右侧约 30%
              </span>
            )}
            <button
              type="button"
              onClick={() => void onRefreshEvents()}
              disabled={isRefreshingEvents || eventsStatus === "loading"}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshingEvents ? "刷新中..." : "刷新事件"}
            </button>
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          当前视图: {safeViewMode === "global" ? "Global View" : "Country View"}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEventModeChange("general")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              eventMode === "general"
                ? "border-sky-300 bg-sky-100 text-sky-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => onEventModeChange("market")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              eventMode === "market"
                ? "border-sky-300 bg-sky-100 text-sky-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Market
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={impactFilter}
            onChange={(event) => setImpactFilter(event.target.value as ImpactFilterMode)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-300 focus:outline-none"
          >
            <option value="all">影响分: 全部</option>
            <option value="high">影响分: 高影响</option>
          </select>
          <select
            value={aiAnalyzedFilter}
            onChange={(event) =>
              setAiAnalyzedFilter(event.target.value as AiAnalyzedFilterMode)
            }
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-300 focus:outline-none"
          >
            <option value="all">AI: 全部</option>
            <option value="analyzed">AI: 仅已分析</option>
          </select>
        </div>
        <label className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span>刷新后自动批量 AI 重估分</span>
          <div className="flex items-center gap-2">
            <select
              value={String(autoBatchAnalyzeLimit)}
              onChange={(event) =>
                onAutoBatchAnalyzeLimitChange(Number(event.target.value))
              }
              disabled={!autoBatchConfigReady}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {AUTO_BATCH_LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  前{limit}条
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onToggleAutoBatchAnalyze(!autoBatchAnalyzeOnRefresh)}
              disabled={!autoBatchConfigReady}
              className={`rounded-full border px-3 py-0.5 text-[11px] font-medium ${
                autoBatchAnalyzeOnRefresh
                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                  : "border-slate-300 bg-white text-slate-700"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {!autoBatchConfigReady
                ? "同步中..."
                : autoBatchAnalyzeOnRefresh
                  ? "已开启"
                  : "已关闭"}
            </button>
          </div>
        </label>
        <p className="mt-1 text-[8px] text-slate-500">
          自动分析仅覆盖高优先级候选事件，不会默认分析全部事件。
          {autoBatchAnalyzeOnRefresh ? ` 当前上限: 前 ${autoBatchAnalyzeLimit} 条。` : ""}
        </p>
        {autoBatchAnalyzeOnRefresh ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span>
                自动分析状态:{" "}
                <span className="font-medium">{autoBatchStatusText}</span>
              </span>
              <span>
                进度: {autoBatchProgress.completedCount}/{autoBatchProgress.totalCount}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {autoBatchProgress.status === "running"
                ? "AI 正在分析事件..."
                : autoBatchProgress.status === "completed"
                  ? "分析完成"
                  : "等待下一次刷新触发"}
              {autoBatchProgress.status === "running" &&
              autoBatchProgress.currentEventId
                ? ` 当前: ${autoBatchProgress.currentEventId}`
                : ""}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">自动分析已关闭</p>
        )}
        {lastAutoBatchSummary ? (
          <p className="mt-1 text-[8px] text-slate-500">
            上轮自动分析: 总 {lastAutoBatchSummary.totalEvents} 条, 高优先级{" "}
            {lastAutoBatchSummary.highPriorityCandidateCount} 条, 计划{" "}
            {lastAutoBatchSummary.plannedAnalyzeCount} 条, 成功{" "}
            {lastAutoBatchSummary.successCount} 条, 失败{" "}
            {lastAutoBatchSummary.failedCount} 条, 预算跳过{" "}
            {lastAutoBatchSummary.skippedByBudgetCount} 条, 非高优先级跳过{" "}
            {lastAutoBatchSummary.skippedNonPriorityCount} 条。
          </p>
        ) : null}
        <div className="mt-2">
          <select
            value={sectorFilter}
            onChange={(event) => onSectorFilterChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-300 focus:outline-none"
          >
            {sectorOptions.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </div>
        <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            按板块查看重要事件
          </summary>
          <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {sectorRepresentativeGroups.length === 0 ? (
              <p className="text-[11px] text-slate-500">暂无板块代表事件。</p>
            ) : (
              sectorRepresentativeGroups.map(([sector, items]) => (
                <div
                  key={`sector-top-${sector}`}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5"
                >
                  <p className="text-[11px] font-semibold text-slate-700">
                    {sector} · Top {Math.min(3, items.length)}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((item) => (
                      <li
                        key={`${sector}-${item.id}`}
                        className="line-clamp-1 text-[11px] text-slate-600"
                      >
                        {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </details>
        {isPanelLoading ? (
          <p className="mt-2 text-xs text-slate-500">AI 分析进行中...</p>
        ) : null}
        {isRefreshingEvents ? (
          <p className="mt-2 text-xs text-slate-500">事件刷新/批量分析进行中...</p>
        ) : null}
        {eventsStatus !== "loading" && eventsError ? (
          <p className="mt-2 text-xs text-rose-600">
            事件刷新失败，已保留当前数据。
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-300 bg-slate-50 p-3">
        <ul className="space-y-2">
          {eventsStatus === "loading" ? (
            <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
              事件加载中...
            </li>
          ) : null}
          {eventsStatus === "error" ? (
            <li className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {eventsError ?? "事件加载失败，请稍后重试。"}
            </li>
          ) : null}
          {panelError ? (
            <li className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {panelError}
            </li>
          ) : null}
          {eventsStatus === "success" && !panelError && eventList.length === 0 ? (
            <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
              {emptyMessage}
            </li>
          ) : null}
          {eventsStatus === "success" &&
            !panelError &&
            eventList.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              onMouseEnter={() =>
                onEventHoverChange({
                  eventId: event.id,
                  sourceCountry: safeText(event.country, "Global"),
                  impactedCountries: safeArray(event.impactedCountries),
                })
              }
              onMouseLeave={() => onEventHoverChange(null)}
            >
              {(() => {
                const status = analysisStatus[event.id] ?? "idle";
                const isAutoAnalyzed = autoBatchAnalyzedIds.has(event.id);
                const isAutoAnalyzingCurrent =
                  autoBatchProgress.status === "running" &&
                  autoBatchProgress.currentEventId === event.id;
                const isAutoAnalyzeFailed = autoBatchFailedIds.has(event.id);
                const baseSentiment =
                  event.sentiment === "positive" ||
                  event.sentiment === "negative" ||
                  event.sentiment === "neutral"
                    ? event.sentiment
                    : "neutral";
                const sentiment = baseSentiment;
                const sectors = safeArray(event.sectors);
                const relatedCountries = safeArray(event.relatedCountries);
                const impactedCountries = safeArray(event.impactedCountries);
                const impactScore = calculateImpactScore({
                  marketImpact: clampScore(event.marketImpact, 5),
                  geopoliticalImpact: clampScore(event.geopoliticalImpact, 5),
                  attentionScore: clampScore(event.attentionScore, 5),
                });
                const explanation = normalizeExplanation(event.explanation, event);
                const impactChain = normalizeImpactChain(event.impactChain, event);
                const effectiveEventForPath: EventItem = {
                  ...event,
                  sectors,
                  impactedCountries,
                };
                const impactPath =
                  event.impactPath ?? buildImpactPath(effectiveEventForPath).impactPath;

                return (
                  <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-800">
                  {safeText(event.title, "未命名事件")}
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleAnalyzeEvent(event)}
                    disabled={status === "loading"}
                    className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading"
                      ? "分析中..."
                      : status === "success" || isAutoAnalyzed || Boolean(event.explanation?.summary)
                        ? "已分析"
                      : status === "error"
                        ? "分析失败"
                        : "AI分析"}
                  </button>
                  {isAutoAnalyzingCurrent ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      AI…
                    </span>
                  ) : null}
                  {isAutoAnalyzed ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      AI ✓
                    </span>
                  ) : null}
                  {!isAutoAnalyzed && isAutoAnalyzeFailed ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                      AI ×
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SENTIMENT_STYLES[sentiment]}`}
                  >
                    {sentiment.toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600">{safeText(event.summary, "暂无摘要")}</p>
              {analysisStatus[event.id] === "error" ? (
                <p className="mt-1 text-xs text-rose-600">
                  {analysisError[event.id] ?? "分析失败，请稍后重试"}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                来源: {safeText(event.source, "Unknown Source")} | 发布时间:{" "}
                {formatRelativeTime(event.updatedAt)} | 国家: {safeText(event.country, "未知")}{" "}
                | 影响分:{" "}
                {impactScore.toFixed(1)}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={TAG_BASE_CLASS}>
                  关联国家: {relatedCountries.length > 0 ? relatedCountries.join(", ") : "无"}
                </span>
                <span className={TAG_BASE_CLASS}>
                  影响国家: {impactedCountries.length > 0 ? impactedCountries.join(", ") : "无"}
                </span>
                <span className={TAG_BASE_CLASS}>
                  板块: {sectors.length > 0 ? sectors.join(", ") : "无"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {impactPath.nodes.map((node, index) => (
                  <div key={`${event.id}-path-${index}-${node.label}`} className="inline-flex items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        node.type === "country"
                          ? "border border-sky-200 bg-sky-50 text-sky-700"
                          : node.type === "global"
                            ? "border border-violet-200 bg-violet-50 text-violet-700"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {node.label}
                    </span>
                    {index < impactPath.nodes.length - 1 ? (
                      <span className="text-[10px] text-slate-400">→</span>
                    ) : null}
                  </div>
                ))}
              </div>
              <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">
                  查看解释
                </summary>
                <p className="mt-1 text-xs text-slate-600">{explanation.summary}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                  {explanation.drivers.map((driver, index) => (
                    <li key={`${event.id}-driver-${index}`}>{driver}</li>
                  ))}
                </ul>
              </details>
              <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">
                  查看影响链
                </summary>
                <p className="mt-1 text-xs text-slate-600">{impactChain.summary}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                  {impactChain.steps.map((step, index) => (
                    <li key={`${event.id}-impact-step-${index}`}>{step}</li>
                  ))}
                </ol>
              </details>
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
