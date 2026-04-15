import { getEventsWithCache } from "@/lib/server/newsEvents";
import { MOCK_EVENTS } from "@/data/mockEvents";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  try {
    const result = await getEventsWithCache({ forceRefresh });
    return NextResponse.json(
      {
        events: result.events,
        source: result.source,
        provider: result.provider,
        cacheHit: result.cacheHit,
        lastUpdated: result.lastUpdated,
        isFallback: result.isFallback,
        fallbackReason: result.reason ?? null,
        forceRefresh,
        total: result.events.length,
      },
      { status: 200 }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[api/events] hard fallback to mock", {
        forceRefresh,
        reason: error instanceof Error ? error.message : "unknown-error",
      });
    }
    return NextResponse.json(
      {
        events: MOCK_EVENTS,
        source: "mock-fallback",
        provider: "newsapi_org",
        cacheHit: false,
        lastUpdated: new Date().toISOString(),
        isFallback: true,
        fallbackReason: "route-exception",
        forceRefresh,
        total: MOCK_EVENTS.length,
      },
      { status: 200 }
    );
  }
}
