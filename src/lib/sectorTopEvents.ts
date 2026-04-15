import { calculateImpactScore, type EventItem } from "@/data/mockEvents";

export type SectorTopEvents = Record<string, EventItem[]>;

const FALLBACK_SECTOR = "Other";

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getEventSectors(event: EventItem): string[] {
  const sectors = safeArray(event.sectors);
  return sectors.length > 0 ? sectors : [FALLBACK_SECTOR];
}

function scoreEvent(event: EventItem): number {
  return calculateImpactScore(event);
}

export function buildSectorTopEvents(events: EventItem[], topN = 3): SectorTopEvents {
  const grouped = new Map<string, EventItem[]>();

  for (const event of events) {
    for (const sector of getEventSectors(event)) {
      const bucket = grouped.get(sector);
      if (bucket) {
        bucket.push(event);
      } else {
        grouped.set(sector, [event]);
      }
    }
  }

  const result: SectorTopEvents = {};
  for (const [sector, items] of grouped) {
    result[sector] = items
      .slice()
      .sort((a, b) => {
        const scoreDelta = scoreEvent(b) - scoreEvent(a);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      })
      .slice(0, Math.max(1, topN));
  }

  return result;
}
