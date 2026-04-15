import type { EventItem } from "@/data/mockEvents";

export type ImpactPathNodeType = "country" | "global" | "sector";

export type ImpactPathNode = {
  type: ImpactPathNodeType;
  label: string;
};

export type ImpactPath = {
  nodes: ImpactPathNode[];
};

export type BuildImpactPathResult = {
  impactPath: ImpactPath;
  fallbackUsed: boolean;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function buildImpactPath(event: Pick<EventItem, "id" | "country" | "impactedCountries" | "sectors">): BuildImpactPathResult {
  const sourceCountry = safeText(event.country) || "Global";
  const impactedCountries = unique(
    safeArray(event.impactedCountries).filter((country) => country !== sourceCountry)
  ).slice(0, 4);
  const sectors = unique(safeArray(event.sectors)).slice(0, 3);

  const nodes: ImpactPathNode[] = [{ type: "country", label: sourceCountry }];

  for (const country of impactedCountries) {
    nodes.push({ type: "country", label: country });
  }

  const countrySpreadCount = new Set([sourceCountry, ...impactedCountries]).size;
  if (countrySpreadCount >= 3) {
    nodes.push({ type: "global", label: "Global" });
  }

  for (const sector of sectors) {
    nodes.push({ type: "sector", label: sector });
  }

  let fallbackUsed = false;
  if (nodes.length < 2) {
    fallbackUsed = true;
    nodes.push({ type: "global", label: "Global" });
    nodes.push({ type: "sector", label: "Market" });
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[impact-path] build", {
      eventId: safeText(event.id),
      nodes,
      fallbackUsed,
    });
  }

  return {
    impactPath: { nodes },
    fallbackUsed,
  };
}
