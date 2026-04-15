import type { EventItem } from "@/data/mockEvents";

export type SectorWeightEntry = {
  id: string;
  label: string;
  multiplier: number;
  keywords: string[];
};

export const SECTOR_WEIGHT_TABLE: SectorWeightEntry[] = [
  {
    id: "energy",
    label: "能源",
    multiplier: 1.18,
    keywords: ["energy", "oil", "gas", "lng", "utilities", "power", "electricity"],
  },
  {
    id: "financials",
    label: "金融",
    multiplier: 1.15,
    keywords: ["financial", "bank", "banking", "credit", "insurance", "liquidity"],
  },
  {
    id: "materials",
    label: "原材料",
    multiplier: 1.14,
    keywords: ["materials", "commodity", "metals", "mining", "steel", "copper", "lithium"],
  },
  {
    id: "logistics",
    label: "物流",
    multiplier: 1.12,
    keywords: ["logistics", "shipping", "freight", "port", "transport", "aviation", "rail"],
  },
  {
    id: "industrials",
    label: "工业",
    multiplier: 1.09,
    keywords: ["industrial", "manufacturing", "machinery", "construction", "factory"],
  },
  {
    id: "technology",
    label: "科技",
    multiplier: 1.1,
    keywords: ["technology", "tech", "software", "semiconductor", "chip", "ai", "electronics"],
  },
  {
    id: "utilities",
    label: "公用事业",
    multiplier: 1.06,
    keywords: ["utility", "grid", "electricity", "water", "gas distribution"],
  },
  {
    id: "consumer",
    label: "消费",
    multiplier: 1.02,
    keywords: ["consumer", "retail", "e-commerce", "travel", "food", "apparel"],
  },
  {
    id: "real-estate",
    label: "地产",
    multiplier: 0.97,
    keywords: ["real estate", "property", "housing", "reits", "mortgage"],
  },
  {
    id: "healthcare",
    label: "医药",
    multiplier: 0.98,
    keywords: ["healthcare", "pharma", "biotech", "medical", "hospital"],
  },
  {
    id: "other",
    label: "其他",
    multiplier: 1,
    keywords: [],
  },
];

export type SectorWeightMatch = {
  sector: SectorWeightEntry;
  matchedKeywords: string[];
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toSearchText(event: EventItem): string {
  return [
    safeText(event.title),
    safeText(event.summary),
    safeArray(event.sectors).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export function resolveSectorWeight(event: EventItem): SectorWeightMatch {
  const text = toSearchText(event);

  const ranked = SECTOR_WEIGHT_TABLE.filter((entry) => entry.id !== "other")
    .map((entry) => {
      const matchedKeywords = entry.keywords.filter((keyword) =>
        text.includes(keyword.toLowerCase())
      );
      return { sector: entry, matchedKeywords };
    })
    .filter((entry) => entry.matchedKeywords.length > 0)
    .sort((a, b) => {
      const matchDelta = b.matchedKeywords.length - a.matchedKeywords.length;
      if (matchDelta !== 0) {
        return matchDelta;
      }
      return b.sector.multiplier - a.sector.multiplier;
    });

  if (ranked.length > 0) {
    return ranked[0];
  }

  const fallback = SECTOR_WEIGHT_TABLE.find((entry) => entry.id === "other");
  if (!fallback) {
    return {
      sector: { id: "other", label: "其他", multiplier: 1, keywords: [] },
      matchedKeywords: [],
    };
  }

  return { sector: fallback, matchedKeywords: [] };
}

export function getSectorWeightMultiplier(event: EventItem): number {
  return resolveSectorWeight(event).sector.multiplier;
}
