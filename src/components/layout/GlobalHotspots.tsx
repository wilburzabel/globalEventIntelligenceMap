import { calculateImpactScore, sortEventsByImpact, type EventItem } from "@/data/mockEvents";
import {
  getRankChangeLabel,
  type HotspotChange,
} from "@/lib/hotspotSnapshot";

const HOTSPOT_COUNT = 4;

const HOTSPOT_SENTIMENT_STYLES = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-200 text-slate-700",
  negative: "bg-rose-100 text-rose-700",
} as const;

type GlobalHotspotsProps = {
  events: EventItem[];
  eventsStatus: "loading" | "success" | "error";
  eventsError: string | null;
  hotspotChanges: Record<string, HotspotChange>;
};

export default function GlobalHotspots({
  events,
  eventsStatus,
  eventsError,
  hotspotChanges,
}: GlobalHotspotsProps) {
  const safeArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  const safeText = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value : fallback;
  const safeSentiment = (value: unknown) =>
    value === "positive" || value === "negative" || value === "neutral"
      ? value
      : "neutral";
  const normalizeRankingExplanation = (event: EventItem) => {
    if (
      event.rankingExplanation?.summary &&
      Array.isArray(event.rankingExplanation.reasons) &&
      event.rankingExplanation.reasons.length > 0
    ) {
      return event.rankingExplanation;
    }

    const reasons = [
      "该事件进入全球热点池并在当前窗口内保持较高综合影响。",
      safeArray(event.modeTags).includes("market")
        ? "事件具备市场相关性，可能影响资产定价。"
        : "事件具备一定跨区域传播和关注价值。",
      `当前影响分约为 ${calculateImpactScore(event).toFixed(1)}。`,
    ];

    return {
      summary: "该事件因综合影响与关注度进入全球热点。",
      reasons,
      scoreBreakdown: undefined,
    };
  };

  let hotspotError: string | null = null;
  let hotspots: EventItem[] = [];
  try {
    const allEvents = Array.isArray(events) ? events : [];
    const featured = allEvents.filter((event) =>
      safeArray(event.modeTags).includes("global_featured")
    );
    const candidatePool =
      featured.length > 0
        ? featured
        : allEvents.filter((event) => safeArray(event.modeTags).includes("global"));
    hotspots = sortEventsByImpact(candidatePool).slice(0, HOTSPOT_COUNT);
  } catch {
    hotspotError = "热点数据加载失败。";
  }

  return (
    <section className="shrink-0 rounded-2xl border border-slate-300/80 bg-white/85 p-4 shadow-sm backdrop-blur md:p-5 md:max-h-[220px]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">全球热点</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Top {HOTSPOT_COUNT}
        </span>
      </header>

      <div className="max-h-[140px] overflow-y-auto rounded-xl border border-slate-300 bg-slate-50 p-2 md:max-h-[130px]">
        <ul className="space-y-1.5">
          {eventsStatus === "loading" ? (
            <li className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
              热点加载中...
            </li>
          ) : null}
          {eventsStatus === "error" ? (
            <li className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
              {eventsError ?? "热点加载失败。"}
            </li>
          ) : null}
          {hotspotError ? (
            <li className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
              {hotspotError}
            </li>
          ) : null}
          {eventsStatus === "success" && !hotspotError && hotspots.length === 0 ? (
            <li className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-500">
              暂无全球热点事件。
            </li>
          ) : null}
          {eventsStatus === "success" &&
            !hotspotError &&
            hotspots.map((event) => (
              <li
                key={event.id}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-xs font-medium text-slate-800">
                    {safeText(event.title, "未命名事件")}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${HOTSPOT_SENTIMENT_STYLES[safeSentiment(event.sentiment)]}`}
                    >
                      {safeSentiment(event.sentiment)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {getRankChangeLabel(hotspotChanges[event.id])}
                    </span>
                  </div>
                </div>
                <p className="line-clamp-1 text-[11px] text-slate-500">
                  {safeText(event.country, "未知")} · {safeText(event.updatedAt, "--")}
                </p>
                <details className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  <summary className="cursor-pointer text-[11px] font-medium text-slate-700">
                    为什么重要
                  </summary>
                  {(() => {
                    const rankingExplanation = normalizeRankingExplanation(event);
                    return (
                      <div className="mt-1">
                        <p className="text-[11px] text-slate-600">
                          {rankingExplanation.summary}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
                          {rankingExplanation.reasons.map((reason, index) => (
                            <li key={`${event.id}-reason-${index}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </details>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
