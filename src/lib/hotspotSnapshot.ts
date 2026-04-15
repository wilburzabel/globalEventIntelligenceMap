import { calculateImpactScore, type EventItem } from "@/data/mockEvents";

const HOTSPOT_SNAPSHOT_STORAGE_KEY = "newmap.hotspotSnapshot.latestPair.v1";
const SNAPSHOT_LIMIT = 8;

export type HotspotSnapshotItem = {
  id: string;
  rank: number;
  finalImpactScore: number;
};

export type HotspotSnapshot = {
  timestamp: string;
  hotspots: HotspotSnapshotItem[];
};

type HotspotSnapshotStore = {
  previous: HotspotSnapshot | null;
  latest: HotspotSnapshot | null;
};

export type HotspotChange = {
  rankChange: number;
  scoreChange: number;
  isNew: boolean;
  isDropped: boolean;
};

export type HotspotComparison = {
  changesById: Record<string, HotspotChange>;
  droppedIds: string[];
};

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readStore(): HotspotSnapshotStore {
  if (typeof window === "undefined") {
    return { previous: null, latest: null };
  }

  const raw = localStorage.getItem(HOTSPOT_SNAPSHOT_STORAGE_KEY);
  if (!raw) {
    return { previous: null, latest: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HotspotSnapshotStore>;
    return {
      previous: parsed.previous ?? null,
      latest: parsed.latest ?? null,
    };
  } catch {
    return { previous: null, latest: null };
  }
}

function writeStore(store: HotspotSnapshotStore) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(HOTSPOT_SNAPSHOT_STORAGE_KEY, JSON.stringify(store));
}

function rankHotspots(events: EventItem[]): EventItem[] {
  const featured = events.filter((event) =>
    safeArray(event.modeTags).includes("global_featured")
  );
  const pool =
    featured.length > 0
      ? featured
      : events.filter((event) => safeArray(event.modeTags).includes("global"));

  return pool
    .slice()
    .sort((a, b) => {
      const scoreDelta = calculateImpactScore(b) - calculateImpactScore(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, SNAPSHOT_LIMIT);
}

export function buildHotspotSnapshot(events: EventItem[]): HotspotSnapshot {
  const ranked = rankHotspots(events);
  return {
    timestamp: new Date().toISOString(),
    hotspots: ranked.map((event, index) => ({
      id: event.id,
      rank: index + 1,
      finalImpactScore: Number(calculateImpactScore(event).toFixed(2)),
    })),
  };
}

export function getLatestHotspotSnapshot(): HotspotSnapshot | null {
  return readStore().latest;
}

export function saveHotspotSnapshot(snapshot: HotspotSnapshot) {
  const store = readStore();
  writeStore({
    previous: store.latest,
    latest: snapshot,
  });
}

export function compareSnapshots(
  previous: HotspotSnapshot | null,
  current: HotspotSnapshot
): HotspotComparison {
  const changesById: Record<string, HotspotChange> = {};

  if (!previous) {
    for (const item of current.hotspots) {
      changesById[item.id] = {
        rankChange: 0,
        scoreChange: 0,
        isNew: false,
        isDropped: false,
      };
    }
    return { changesById, droppedIds: [] };
  }

  const prevById = new Map(previous.hotspots.map((item) => [item.id, item] as const));
  const currentIds = new Set(current.hotspots.map((item) => item.id));

  for (const item of current.hotspots) {
    const prev = prevById.get(item.id);
    if (!prev) {
      changesById[item.id] = {
        rankChange: 0,
        scoreChange: 0,
        isNew: true,
        isDropped: false,
      };
      continue;
    }

    changesById[item.id] = {
      rankChange: prev.rank - item.rank,
      scoreChange: Number((item.finalImpactScore - prev.finalImpactScore).toFixed(2)),
      isNew: false,
      isDropped: false,
    };
  }

  const droppedIds = previous.hotspots
    .filter((item) => !currentIds.has(item.id))
    .map((item) => item.id);

  return {
    changesById,
    droppedIds,
  };
}

export function getRankChangeLabel(change: HotspotChange | null | undefined): string {
  if (!change) {
    return "—";
  }
  if (change.isNew) {
    return "NEW";
  }
  if (change.rankChange > 0) {
    return `↑ +${change.rankChange}`;
  }
  if (change.rankChange < 0) {
    return `↓ ${change.rankChange}`;
  }
  return "—";
}
