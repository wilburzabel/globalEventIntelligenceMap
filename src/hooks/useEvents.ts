"use client";

import type { EventItem } from "@/data/mockEvents";
import { normalizeCountryName } from "@/lib/country";
import { fetchEvents } from "@/lib/eventsClient";
import { useCallback, useEffect, useState } from "react";

export type EventsLoadStatus = "loading" | "success" | "error";

const safeText = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const safeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};
const safeScore = (value: unknown, fallback = 5): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, Math.round(num)));
};
const safeSentiment = (
  value: unknown
): "positive" | "neutral" | "negative" =>
  value === "positive" || value === "neutral" || value === "negative"
    ? value
    : "neutral";

export function useEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [status, setStatus] = useState<EventsLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const normalizeEventsCountries = useCallback((input: EventItem[]): EventItem[] => {
    return input.map((event, index) => {
      const normalized = normalizeCountryName(
        event.countryCode || event.canonicalCountryName || event.country
      );
      return {
        ...event,
        id: safeText(event.id, `evt-fallback-${index}`),
        title: safeText(event.title, "Untitled Event"),
        summary: safeText(event.summary, "No summary provided."),
        countryCode: normalized.countryCode,
        canonicalCountryName: normalized.canonicalCountryName,
        country: normalized.canonicalCountryName,
        relatedCountries: safeStringArray(event.relatedCountries),
        impactedCountries: safeStringArray(event.impactedCountries),
        sectors: safeStringArray(event.sectors),
        modeTags: safeStringArray(event.modeTags),
        sentiment: safeSentiment(event.sentiment),
        marketImpact: safeScore(event.marketImpact),
        geopoliticalImpact: safeScore(event.geopoliticalImpact),
        attentionScore: safeScore(event.attentionScore),
        updatedAt: safeText(event.updatedAt, new Date().toISOString()),
      };
    });
  }, []);

  const loadEvents = useCallback(
    async (options?: { keepExistingData?: boolean; forceRefresh?: boolean }) => {
      const keepExistingData = options?.keepExistingData ?? false;
      const forceRefresh = options?.forceRefresh ?? false;

      if (keepExistingData) {
        setIsRefreshing(true);
      } else {
        setStatus("loading");
      }
      setError(null);

      try {
        const payload = await fetchEvents({ forceRefresh });
        const nextEvents = normalizeEventsCountries(
          Array.isArray(payload.events) ? payload.events : []
        );
        setEvents(nextEvents);
        setStatus("success");
        return nextEvents;
      } catch (err) {
        const message = err instanceof Error ? err.message : "事件加载失败";
        setError(message);
        setStatus((prev) =>
          keepExistingData && prev === "success" ? "success" : "error"
        );
        return null;
      } finally {
        if (keepExistingData) {
          setIsRefreshing(false);
        }
      }
    },
    [normalizeEventsCountries]
  );

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const refresh = useCallback(async () => {
    return loadEvents({ keepExistingData: true, forceRefresh: true });
  }, [loadEvents]);

  const replaceEvents = useCallback((nextEvents: EventItem[]) => {
    setEvents(normalizeEventsCountries(Array.isArray(nextEvents) ? nextEvents : []));
    setStatus("success");
  }, [normalizeEventsCountries]);

  const updateEventById = useCallback(
    (eventId: string, updater: (current: EventItem) => EventItem) => {
      setEvents((prev) =>
        normalizeEventsCountries(
          prev.map((event) => (event.id === eventId ? updater(event) : event))
        )
      );
      setStatus("success");
    },
    [normalizeEventsCountries]
  );

  return {
    events,
    status,
    error,
    refresh,
    isRefreshing,
    replaceEvents,
    updateEventById,
  };
}
