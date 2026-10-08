"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type {
  PreviewCanonicalLandmark,
  PreviewIncident,
} from "@/lib/preview/dashboard-data";
import type { IncidentRecord } from "@/types/database";

export interface CanonicalLandmarkGeo {
  canonicalName: PreviewCanonicalLandmark;
  area: string;
  latitude: number;
  longitude: number;
}

export const CANONICAL_LANDMARKS_GEO: readonly CanonicalLandmarkGeo[] = [
  {
    canonicalName: "Velachery MRTS Station",
    area: "Velachery",
    latitude: 12.9756,
    longitude: 80.2185,
  },
  {
    canonicalName: "Taramani MRTS Station",
    area: "Taramani",
    latitude: 12.9863,
    longitude: 80.2432,
  },
  {
    canonicalName: "Guindy Railway Station",
    area: "Guindy",
    latitude: 13.0067,
    longitude: 80.2206,
  },
  {
    canonicalName: "Saidapet Bridge",
    area: "Saidapet",
    latitude: 13.0213,
    longitude: 80.2231,
  },
  {
    canonicalName: "Pallikaranai Marshland Main Road",
    area: "Pallikaranai",
    latitude: 12.9482,
    longitude: 80.2074,
  },
  {
    canonicalName: "Adyar Bus Depot",
    area: "Adyar",
    latitude: 12.9985,
    longitude: 80.2568,
  },
];

const LeafletIncidentMap = dynamic(
  () =>
    import("./LeafletIncidentMap").then((mod) => ({
      default: mod.LeafletIncidentMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#e2e8f0] flex flex-col items-center justify-center gap-2 text-[#475569]">
        <span className="material-symbols-outlined animate-spin text-[#2563eb] text-[24px]">
          progress_activity
        </span>
        <span className="font-code-md text-xs text-[#334155]">
          Loading interactive OpenStreetMap tiles (South Chennai)...
        </span>
      </div>
    ),
  }
);

interface MapPanelProps {
  heightClass?: string;
  incidents?: PreviewIncident[];
  onSelectIncident?: (incident: PreviewIncident) => void;
}

export function MapPanel({
  heightClass = "h-[430px]",
  incidents: propIncidents,
  onSelectIncident,
}: MapPanelProps) {
  const [fetchedIncidents, setFetchedIncidents] = useState<PreviewIncident[]>(
    []
  );
  const [incidentCoords, setIncidentCoords] = useState<
    Record<string, { latitude: number | null; longitude: number | null }>
  >({});
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  useEffect(() => {
    if (propIncidents !== undefined) return;
    let active = true;
    const fetchMapIncidents = () => {
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (Array.isArray(data.display_incidents)) {
            setFetchedIncidents(data.display_incidents);
          }
          if (Array.isArray(data.incidents)) {
            const coordMap: Record<
              string,
              { latitude: number | null; longitude: number | null }
            > = {};
            for (const raw of data.incidents as IncidentRecord[]) {
              coordMap[raw.id] = {
                latitude: raw.latitude ?? null,
                longitude: raw.longitude ?? null,
              };
            }
            setIncidentCoords(coordMap);
          }
        })
        .catch(() => {
          // Keep empty on error
        });
    };

    fetchMapIncidents();
    window.addEventListener("incidents-updated", fetchMapIncidents);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchMapIncidents);
    };
  }, [propIncidents]);

  const incidents = propIncidents ?? fetchedIncidents;

  return (
    <div
      className="bg-white rounded-lg shadow-xs flex flex-col overflow-hidden border border-[#e2e8f0]"
      data-testid="dashboard-map-panel"
    >
      {/* Map Header */}
      <div className="px-space-md py-space-sm bg-[#f8fafc] flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
            <span className="material-symbols-outlined text-[18px]">map</span>
          </div>
          <div>
            <span className="font-headline-sm text-headline-sm text-[#0f172a] block">
              Incident Location Map — Chennai
            </span>
            <span className="font-body-sm text-[11px] text-[#475569] block">
              OpenStreetMap • 6 Landmarks • {incidents.length} Live Correlated
              Incidents
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-white hover:bg-[#f1f5f9] text-[#334155] border border-[#cbd5e1] flex items-center gap-1 cursor-pointer transition-colors"
            onClick={() => setResetTrigger((prev) => prev + 1)}
            title="Recenter map around South Chennai incident sector"
            type="button"
          >
            <span className="material-symbols-outlined text-[14px] text-[#2563eb]">
              my_location
            </span>
            <span>Center Chennai</span>
          </button>
        </div>
      </div>

      {/* Interactive Leaflet + OpenStreetMap Canvas */}
      <div className={`relative w-full ${heightClass} bg-[#e2e8f0]`}>
        <LeafletIncidentMap
          incidentCoords={incidentCoords}
          incidents={incidents}
          onSelectIncident={onSelectIncident}
          resetTrigger={resetTrigger}
        />
      </div>

      {/* Urgency & Landmark Pin Legend */}
      <div className="px-space-md py-space-xs bg-[#f8fafc] flex flex-wrap items-center justify-between gap-space-xs border-t border-[#e2e8f0]">
        <div className="flex flex-wrap items-center gap-space-md font-label-caps text-label-caps">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" />
            <span className="text-[#334155]">Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea580c]" />
            <span className="text-[#334155]">High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" />
            <span className="text-[#334155]">Medium</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
            <span className="text-[#334155]">Low</span>
          </div>
          <div className="flex items-center gap-1.5 pl-1 border-l border-[#cbd5e1]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-white shadow-2xs" />
            <span className="text-[#475569]">Landmark (6)</span>
          </div>
        </div>
        <span className="font-code-md text-[10px] text-[#64748b]">
          Drag to pan • Scroll/+/- to zoom • Click marker for details
        </span>
      </div>
    </div>
  );
}
