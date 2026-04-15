"use client";

import WorldMap from "@/components/WorldMap";

type MapAreaProps = {
  selectedCountryCode: string | null;
  selectedCountryName: string | null;
  activeSourceCountryCode: string | null;
  activeImpactedCountryCodes: string[];
  onCountrySelect: (
    country:
      | {
          countryCode: string;
          canonicalCountryName: string;
          rawName: string;
        }
      | null
  ) => void;
  clearSelectionTrigger: number;
};

export default function MapArea({
  selectedCountryCode,
  selectedCountryName,
  activeSourceCountryCode,
  activeImpactedCountryCodes,
  onCountrySelect,
  clearSelectionTrigger,
}: MapAreaProps) {

  return (
    <section className="flex h-full w-full flex-col rounded-2xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur md:p-5">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">世界地图区域</h1>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {selectedCountryCode ? `已选中: ${selectedCountryName}` : "左侧约 70%"}
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-300 bg-slate-50">
        <WorldMap
          key={clearSelectionTrigger}
          onCountrySelect={onCountrySelect}
          activeSourceCountryCode={activeSourceCountryCode}
          activeImpactedCountryCodes={activeImpactedCountryCodes}
        />
      </div>
    </section>
  );
}
