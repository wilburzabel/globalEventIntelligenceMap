import type { EventItem } from "@/data/mockEvents";
import { MOCK_EVENTS } from "@/data/mockEvents";

type EventsApiResponse = {
  events?: EventItem[];
  source?: string;
  provider?: string;
  cacheHit?: boolean;
  lastUpdated?: string;
  isFallback?: boolean;
  fallbackReason?: string | null;
  forceRefresh?: boolean;
};

export async function fetchEvents(options?: {
  signal?: AbortSignal;
  forceRefresh?: boolean;
}): Promise<EventsApiResponse> {
  const query = options?.forceRefresh ? "?refresh=1" : "";
  try {
    const response = await fetch(`/api/events${query}`, {
      method: "GET",
      cache: "no-store",
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.status}`);
    }

    const payload = (await response.json()) as EventsApiResponse;
    return payload;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[events-client] fallback to mock", {
        reason: error instanceof Error ? error.message : "unknown-error",
      });
    }
    return {
      events: MOCK_EVENTS,
      source: "mock-fallback",
      provider: "client-fallback",
      cacheHit: false,
      lastUpdated: new Date().toISOString(),
      isFallback: true,
      fallbackReason: "client-fetch-error",
      forceRefresh: Boolean(options?.forceRefresh),
    };
  }
}
