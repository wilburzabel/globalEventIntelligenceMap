"use client";

import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { normalizeCountryName } from "@/lib/country";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { feature } from "topojson-client";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const MAP_WIDTH = 960;
const MAP_HEIGHT = 520;

type CountryFeature = Feature<Geometry, { name?: string; NAME?: string }>;

type CountriesTopology = {
  type: "Topology";
  arcs?: unknown;
  objects: {
    countries: unknown;
  };
};

type CountryProperties = {
  name?: string;
  NAME?: string;
};

type TooltipState = {
  countryName: string;
  x: number;
  y: number;
};

type WorldMapProps = {
  activeSourceCountryCode?: string | null;
  activeImpactedCountryCodes?: string[];
  onCountrySelect?: (
    country:
      | {
          countryCode: string;
          canonicalCountryName: string;
          rawName: string;
        }
      | null
  ) => void;
};

export default function WorldMap({
  onCountrySelect,
  activeSourceCountryCode,
  activeImpactedCountryCodes = [],
}: WorldMapProps) {
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | number | null>(
    null
  );
  const [selectedCountryId, setSelectedCountryId] = useState<string | number | null>(
    null
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const impactedCodeSet = useMemo(
    () => new Set(activeImpactedCountryCodes),
    [activeImpactedCountryCodes]
  );

  useEffect(() => {
    let isMounted = true;

    const loadCountries = async () => {
      const response = await fetch(GEO_URL);
      const topology = (await response.json()) as CountriesTopology;
      const countryFeatures = feature(
        topology as never,
        topology.objects.countries as never
      ) as unknown as FeatureCollection<Geometry, CountryProperties>;

      if (isMounted) {
        setCountries(countryFeatures.features as CountryFeature[]);
      }
    };

    void loadCountries();

    return () => {
      isMounted = false;
    };
  }, []);

  const pathGenerator = useMemo(() => {
    const projection = geoEqualEarth().fitSize(
      [MAP_WIDTH, MAP_HEIGHT],
      { type: "FeatureCollection", features: countries }
    );

    return geoPath(projection);
  }, [countries]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    const highlightedCount = countries.filter((country) => {
      const countryName =
        country.properties?.name ?? country.properties?.NAME ?? "Unknown country";
      const normalized = normalizeCountryName(countryName);
      return (
        normalized.countryCode === activeSourceCountryCode ||
        impactedCodeSet.has(normalized.countryCode)
      );
    }).length;
    console.debug("[WorldMap] event-linked highlight", {
      sourceCountryCode: activeSourceCountryCode ?? null,
      impactedCountryCodes: Array.from(impactedCodeSet),
      highlightedCount,
    });
  }, [activeSourceCountryCode, impactedCodeSet, countries]);

  return (
    <div className="h-full w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="World map"
      >
        <g>
          {countries.map((country, index) => {
            const countryName =
              country.properties?.name ??
              country.properties?.NAME ??
              "Unknown country";
            const countryId = country.id ?? index;
            const pathData = pathGenerator(country) ?? "";
            const isHovered = hoveredCountryId === countryId;
            const isSelected = selectedCountryId === countryId;
            const normalizedCountry = normalizeCountryName(countryName);
            const countryCode = normalizedCountry.countryCode;
            const isEventSource =
              Boolean(activeSourceCountryCode) && countryCode === activeSourceCountryCode;
            const isEventImpacted = impactedCodeSet.has(countryCode) && !isEventSource;
            const fillColor = isSelected
              ? "#0284c7"
              : isEventSource
                ? "#f59e0b"
                : isEventImpacted
                  ? "#fde68a"
                  : isHovered
                    ? "#38bdf8"
                    : "#cbd5e1";
            const strokeColor = isSelected
              ? "#0369a1"
              : isEventSource
                ? "#b45309"
                : isEventImpacted
                  ? "#d97706"
                  : isHovered
                    ? "#0284c7"
                    : "#94a3b8";
            const strokeWidth = isSelected ? 0.9 : isEventSource ? 0.85 : isEventImpacted ? 0.65 : 0.4;

            return (
              <path
                key={String(countryId)}
                d={pathData}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                className="transition-colors duration-150"
                style={{ cursor: "pointer" }}
                onMouseEnter={(event: MouseEvent<SVGPathElement>) => {
                  setHoveredCountryId(countryId);
                  setTooltip({
                    countryName,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onMouseMove={(event: MouseEvent<SVGPathElement>) => {
                  setTooltip({
                    countryName,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredCountryId(null);
                  setTooltip(null);
                }}
                onClick={() => {
                  if (selectedCountryId === countryId) {
                    setSelectedCountryId(null);
                    onCountrySelect?.(null);
                    return;
                  }

                  if (process.env.NODE_ENV === "development") {
                    console.debug("[WorldMap] country click normalize", {
                      rawName: countryName,
                      normalized: normalizedCountry,
                    });
                  }
                  setSelectedCountryId(countryId);
                  onCountrySelect?.(normalizedCountry);
                }}
              />
            );
          })}
        </g>
      </svg>

      {tooltip ? (
        <div
          className="pointer-events-none fixed z-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          {tooltip.countryName}
        </div>
      ) : null}
    </div>
  );
}
