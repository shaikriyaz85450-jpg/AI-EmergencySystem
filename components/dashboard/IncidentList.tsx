"use client";

import { useEffect, useState } from "react";
import {
  PREVIEW_CANONICAL_LANDMARKS,
  type PreviewIncident,
  type PreviewUrgencyLevel,
} from "@/lib/preview/dashboard-data";
import { IncidentCard } from "./IncidentCard";

interface IncidentListProps {
  globalSearchQuery?: string;
  incidents?: PreviewIncident[];
  loading?: boolean;
  onOpenIncidentView?: (incident: PreviewIncident) => void;
  onUpdateStatus?: (incident: PreviewIncident) => void;
  onViewCorrelatedReports?: (incident: PreviewIncident) => void;
}

export function IncidentList({
  globalSearchQuery = "",
  incidents: propIncidents,
  loading: propLoading,
  onOpenIncidentView,
  onUpdateStatus,
  onViewCorrelatedReports,
}: IncidentListProps) {
  const [fetchedIncidents, setFetchedIncidents] = useState<PreviewIncident[]>(
    []
  );
  const [internalLoading, setInternalLoading] = useState<boolean>(
    propIncidents === undefined
  );

  useEffect(() => {
    if (propIncidents !== undefined) {
      return;
    }
    let active = true;
    const fetchIncidents = () => {
      setInternalLoading(true);
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (Array.isArray(data.display_incidents)) {
            setFetchedIncidents(data.display_incidents);
          }
        })
        .catch(() => {
          // Keep empty array if fetch fails
        })
        .finally(() => {
          if (active) setInternalLoading(false);
        });
    };

    fetchIncidents();
    window.addEventListener("incidents-updated", fetchIncidents);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchIncidents);
    };
  }, [propIncidents]);

  const incidents = propIncidents ?? fetchedIncidents;
  const isLoading = propLoading ?? internalLoading;

  const [selectedUrgency, setSelectedUrgency] = useState<
    "All" | PreviewUrgencyLevel
  >("All");
  const [selectedType, setSelectedType] = useState<string>("All Incident Types");
  const [selectedLocation, setSelectedLocation] =
    useState<string>("All Locations");
  const [localSearch, setLocalSearch] = useState<string>("");

  const combinedSearch = `${globalSearchQuery} ${localSearch}`
    .trim()
    .toLowerCase();

  const urgencyCounts = {
    All: incidents.length,
    Critical: incidents.filter((i) => i.urgency === "Critical").length,
    High: incidents.filter((i) => i.urgency === "High").length,
    Medium: incidents.filter((i) => i.urgency === "Medium").length,
    Low: incidents.filter((i) => i.urgency === "Low").length,
  };

  const urgencyTabs: readonly {
    label: string;
    value: "All" | PreviewUrgencyLevel;
  }[] = [
    { label: `All (${urgencyCounts.All})`, value: "All" },
    { label: `Critical (${urgencyCounts.Critical})`, value: "Critical" },
    { label: `High (${urgencyCounts.High})`, value: "High" },
    { label: `Medium (${urgencyCounts.Medium})`, value: "Medium" },
    { label: `Low (${urgencyCounts.Low})`, value: "Low" },
  ];

  const distinctTypes = Array.from(
    new Set(incidents.map((i) => i.incidentType))
  );

  const filteredIncidents = incidents.filter((incident) => {
    if (selectedUrgency !== "All" && incident.urgency !== selectedUrgency) {
      return false;
    }
    if (
      selectedType !== "All Incident Types" &&
      !incident.incidentType.toLowerCase().includes(selectedType.toLowerCase())
    ) {
      return false;
    }
    if (
      selectedLocation !== "All Locations" &&
      incident.location !== selectedLocation
    ) {
      return false;
    }
    if (combinedSearch.length > 0) {
      const searchable = [
        incident.incidentCode,
        incident.incidentType,
        incident.location,
        incident.area,
        incident.status,
        incident.urgency,
        incident.latestUpdateSummary,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(combinedSearch)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-space-sm">
      {/* Section Header & Filter Toolbar */}
      <div className="bg-white rounded-lg p-space-md flex flex-col gap-space-sm shadow-xs border border-[#e2e8f0]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-md text-headline-md text-[#0f172a]">
                Active Incidents
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-[#475569]">
              Correlated emergencies by status and urgency (Live Supabase)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-[#f8fafc] p-1 rounded-md border border-[#e2e8f0]">
            {urgencyTabs.map((tab) => {
              const isSelected = selectedUrgency === tab.value;
              return (
                <button
                  className={
                    isSelected
                      ? "px-2.5 py-1 rounded bg-[#2563eb] text-white font-badge-label text-badge-label cursor-pointer"
                      : "px-2.5 py-1 rounded text-[#475569] hover:text-[#0f172a] hover:bg-white font-badge-label text-badge-label cursor-pointer"
                  }
                  key={tab.value}
                  onClick={() => setSelectedUrgency(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Sub-bar (Incident Type & Location) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs pt-space-xs bg-[#f8fafc] p-space-xs rounded-md border border-[#e2e8f0]">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[#64748b] text-[16px]">
              filter_alt
            </span>
            <select
              aria-label="Filter by incident type"
              className="w-full h-8 pl-7 pr-3 bg-white text-[#0f172a] font-body-sm text-body-sm rounded appearance-none focus:outline-none focus:ring-1 focus:ring-[#2563eb] border border-[#cbd5e1]"
              onChange={(e) => setSelectedType(e.target.value)}
              value={selectedType}
            >
              <option value="All Incident Types">All Incident Types</option>
              {distinctTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[#64748b] text-[16px]">
              place
            </span>
            <select
              aria-label="Filter by canonical landmark"
              className="w-full h-8 pl-7 pr-3 bg-white text-[#0f172a] font-body-sm text-body-sm rounded appearance-none focus:outline-none focus:ring-1 focus:ring-[#2563eb] border border-[#cbd5e1]"
              onChange={(e) => setSelectedLocation(e.target.value)}
              value={selectedLocation}
            >
              <option value="All Locations">All Locations</option>
              {PREVIEW_CANONICAL_LANDMARKS.map((landmark) => (
                <option key={landmark} value={landmark}>
                  {landmark}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[#64748b] text-[16px]">
              search
            </span>
            <input
              aria-label="Search by area or incident ID"
              className="w-full h-8 pl-7 pr-2 bg-white text-[#0f172a] placeholder:text-[#64748b] font-body-sm text-body-sm rounded focus:outline-none focus:ring-1 focus:ring-[#2563eb] border border-[#cbd5e1]"
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by area or ID..."
              type="text"
              value={localSearch}
            />
          </div>
        </div>
      </div>

      {/* Incident Cards */}
      {isLoading ? (
        <div className="bg-white rounded-lg p-space-xl text-center border border-[#e2e8f0] animate-pulse">
          <p className="font-headline-sm text-headline-sm text-[#0f172a]">
            Loading live incidents from Supabase...
          </p>
        </div>
      ) : filteredIncidents.length > 0 ? (
        filteredIncidents.map((incident) => (
          <IncidentCard
            incident={incident}
            key={incident.id}
            onOpenIncidentView={onOpenIncidentView}
            onUpdateStatus={onUpdateStatus}
            onViewCorrelatedReports={onViewCorrelatedReports}
          />
        ))
      ) : (
        <div className="bg-white rounded-lg p-space-xl text-center border border-[#e2e8f0]">
          <p className="font-headline-sm text-headline-sm text-[#0f172a]">
            No matching incidents found
          </p>
          <p className="font-body-sm text-body-sm text-[#64748b] mt-1">
            Adjust urgency, incident type, or landmark filters to display
            incidents.
          </p>
        </div>
      )}
    </div>
  );
}
