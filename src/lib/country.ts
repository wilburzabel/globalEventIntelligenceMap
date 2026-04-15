export type NormalizedCountry = {
  countryCode: string;
  canonicalCountryName: string;
  rawName: string;
};

const COUNTRY_ALIAS_MAP: Record<string, { code: string; canonical: string }> = {
  "united states": { code: "US", canonical: "United States" },
  "united states of america": { code: "US", canonical: "United States" },
  usa: { code: "US", canonical: "United States" },
  us: { code: "US", canonical: "United States" },
  "u s": { code: "US", canonical: "United States" },
  "u s a": { code: "US", canonical: "United States" },
  china: { code: "CN", canonical: "China" },
  "people s republic of china": { code: "CN", canonical: "China" },
  russia: { code: "RU", canonical: "Russia" },
  "russian federation": { code: "RU", canonical: "Russia" },
  "south korea": { code: "KR", canonical: "South Korea" },
  "korea republic of": { code: "KR", canonical: "South Korea" },
  "korea republic": { code: "KR", canonical: "South Korea" },
  "republic of korea": { code: "KR", canonical: "South Korea" },
  czechia: { code: "CZ", canonical: "Czechia" },
  "czech republic": { code: "CZ", canonical: "Czechia" },
  australia: { code: "AU", canonical: "Australia" },
  japan: { code: "JP", canonical: "Japan" },
  germany: { code: "DE", canonical: "Germany" },
  france: { code: "FR", canonical: "France" },
  india: { code: "IN", canonical: "India" },
  singapore: { code: "SG", canonical: "Singapore" },
  canada: { code: "CA", canonical: "Canada" },
  mexico: { code: "MX", canonical: "Mexico" },
  brazil: { code: "BR", canonical: "Brazil" },
  "south africa": { code: "ZA", canonical: "South Africa" },
  "united kingdom": { code: "GB", canonical: "United Kingdom" },
  uk: { code: "GB", canonical: "United Kingdom" },
  britain: { code: "GB", canonical: "United Kingdom" },
  england: { code: "GB", canonical: "United Kingdom" },
  global: { code: "GLOBAL", canonical: "Global" },
};

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCountryName(input: string | null | undefined): NormalizedCountry {
  const rawName = typeof input === "string" ? input.trim() : "";
  const normalized = normalizeKey(rawName);

  if (!normalized) {
    return {
      countryCode: "UNKNOWN",
      canonicalCountryName: "Unknown",
      rawName: rawName || "Unknown",
    };
  }

  const matched = COUNTRY_ALIAS_MAP[normalized];
  if (matched) {
    return {
      countryCode: matched.code,
      canonicalCountryName: matched.canonical,
      rawName,
    };
  }

  return {
    countryCode: normalized.toUpperCase().slice(0, 3),
    canonicalCountryName: rawName,
    rawName,
  };
}
