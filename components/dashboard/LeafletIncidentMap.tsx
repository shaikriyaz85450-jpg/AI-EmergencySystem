"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import type {
  PreviewCanonicalLandmark,
  PreviewIncident,
  PreviewUrgencyLevel,
} from "@/lib/preview/dashboard-data";

export interface CanonicalLandmarkGeo {
  canonicalName: PreviewCanonicalLandmark;
  area: string;
  latitude: number;
  longitude: number;
}

export const CHENNAI_CENTER: [number, number] = [12.9885, 80.2285];
export const DEFAULT_MAP_ZOOM = 13;

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

export interface IncidentGeoCoordinate {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

interface LeafletIncidentMapProps {
  incidents: PreviewIncident[];
  incidentCoords?: Record<string, { latitude: number | null; longitude: number | null }>;
  onSelectIncident?: (incident: PreviewIncident) => void;
  resetTrigger?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getUrgencyColors(urgency: PreviewUrgencyLevel): {
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
} {
  switch (urgency) {
    case "Critical":
      return {
        bg: "#dc2626",
        border: "#991b1b",
        badgeBg: "#fef2f2",
        badgeText: "#dc2626",
        badgeBorder: "#fecaca",
      };
    case "High":
      return {
        bg: "#ea580c",
        border: "#c2410c",
        badgeBg: "#fff7ed",
        badgeText: "#ea580c",
        badgeBorder: "#fed7aa",
      };
    case "Medium":
      return {
        bg: "#d97706",
        border: "#b45309",
        badgeBg: "#fffbeb",
        badgeText: "#b45309",
        badgeBorder: "#fde68a",
      };
    case "Low":
      return {
        bg: "#0284c7",
        border: "#0369a1",
        badgeBg: "#f0f9ff",
        badgeText: "#0284c7",
        badgeBorder: "#bae6fd",
      };
  }
}

function resolveIncidentCoordinates(
  incident: PreviewIncident,
  rawCoords?: { latitude: number | null; longitude: number | null },
  occurrenceIndex = 0
): [number, number] {
  // 1. Check canonical landmark match first
  const landmarkMatch = CANONICAL_LANDMARKS_GEO.find(
    (lm) =>
      lm.canonicalName.toLowerCase() === incident.location.toLowerCase() ||
      incident.location.toLowerCase().includes(lm.canonicalName.toLowerCase())
  );

  let baseLat: number;
  let baseLng: number;

  if (landmarkMatch) {
    baseLat = landmarkMatch.latitude;
    baseLng = landmarkMatch.longitude;
  } else if (
    rawCoords &&
    typeof rawCoords.latitude === "number" &&
    typeof rawCoords.longitude === "number"
  ) {
    baseLat = rawCoords.latitude;
    baseLng = rawCoords.longitude;
  } else {
    // 2. Fallback to area match among the 6 canonical landmarks
    const areaMatch = CANONICAL_LANDMARKS_GEO.find(
      (lm) =>
        lm.area.toLowerCase() === incident.area.toLowerCase() ||
        incident.location.toLowerCase().includes(lm.area.toLowerCase())
    );
    if (areaMatch) {
      baseLat = areaMatch.latitude;
      baseLng = areaMatch.longitude;
    } else {
      baseLat = CHENNAI_CENTER[0];
      baseLng = CHENNAI_CENTER[1];
    }
  }

  // Apply a subtle ~75m offset from the landmark pin so both the landmark
  // reference marker and the emergency incident marker remain clearly distinct.
  const angle = (occurrenceIndex * 2 * Math.PI) / 5 + Math.PI / 4;
  const radiusOffset = 0.00075 + occurrenceIndex * 0.00035;
  return [
    baseLat + Math.sin(angle) * radiusOffset,
    baseLng + Math.cos(angle) * radiusOffset,
  ];
}

export function LeafletIncidentMap({
  incidents,
  incidentCoords = {},
  onSelectIncident,
  resetTrigger = 0,
}: LeafletIncidentMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectIncident);

  useEffect(() => {
    onSelectRef.current = onSelectIncident;
  }, [onSelectIncident]);

  // Initialize Leaflet map + OpenStreetMap tiles once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: CHENNAI_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true,
      attributionControl: true,
    });

    L.control.zoom({ position: "topleft" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      minZoom: 10,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = markersLayer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Handle Reset View trigger
  useEffect(() => {
    if (!mapRef.current || resetTrigger === 0) return;
    mapRef.current.setView(CHENNAI_CENTER, DEFAULT_MAP_ZOOM, {
      animate: true,
    });
  }, [resetTrigger]);

  // Render the 6 canonical landmarks + live correlated incident markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // 1. Render subtle reference markers for the 6 canonical project landmarks
    for (const lm of CANONICAL_LANDMARKS_GEO) {
      const landmarkIcon = L.divIcon({
        className: "custom-landmark-marker",
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);pointer-events:auto;">
            <div style="background:rgba(255,255,255,0.94);border:1px solid #94a3b8;border-radius:4px;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#334155;white-space:nowrap;box-shadow:0 1px 3px rgba(15,23,42,0.12);margin-bottom:3px;">
              ${escapeHtml(lm.canonicalName)}
            </div>
            <div style="width:10px;height:10px;border-radius:9999px;background:#475569;border:2px solid #ffffff;box-shadow:0 1px 3px rgba(15,23,42,0.25);"></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -14],
      });

      const landmarkMarker = L.marker([lm.latitude, lm.longitude], {
        icon: landmarkIcon,
        zIndexOffset: 100,
        title: `${lm.canonicalName} (${lm.area})`,
      });

      const landmarkPopupHtml = `
        <div style="min-width:190px;font-family:'Inter',sans-serif;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:2px;">
            Canonical Project Landmark
          </div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;">
            ${escapeHtml(lm.canonicalName)}
          </div>
          <div style="font-size:12px;color:#334155;margin-top:3px;">
            Area: <strong>${escapeHtml(lm.area)}</strong>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#64748b;margin-top:4px;">
            ${lm.latitude.toFixed(4)}° N, ${lm.longitude.toFixed(4)}° E
          </div>
        </div>
      `;

      landmarkMarker.bindPopup(landmarkPopupHtml, {
        closeButton: true,
        maxWidth: 260,
      });

      landmarkMarker.addTo(layer);
    }

    // 2. Render live correlated emergency incident markers
    const locationUsageCount = new Map<string, number>();

    for (const incident of incidents) {
      const locKey = `${incident.location.toLowerCase()}__${incident.area.toLowerCase()}`;
      const occIdx = locationUsageCount.get(locKey) ?? 0;
      locationUsageCount.set(locKey, occIdx + 1);

      const coords = resolveIncidentCoordinates(
        incident,
        incidentCoords[incident.id],
        occIdx
      );

      const colors = getUrgencyColors(incident.urgency);
      const isCritical = incident.urgency === "Critical";

      const pulseHtml = isCritical
        ? `<span style="position:absolute;width:28px;height:28px;border-radius:9999px;background:${colors.bg};opacity:0.28;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>`
        : "";

      const incidentIcon = L.divIcon({
        className: "custom-incident-marker",
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;pointer-events:auto;">
            <div style="background:#ffffff;border:1.5px solid ${colors.bg};border-left:4px solid ${colors.bg};border-radius:6px;padding:3px 7px;box-shadow:0 4px 10px rgba(15,23,42,0.18);white-space:nowrap;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#0f172a;">
                ${escapeHtml(incident.incidentCode)}
              </span>
              <span style="background:${colors.badgeBg};color:${colors.badgeText};border:1px solid ${colors.badgeBorder};border-radius:4px;padding:0px 4px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;text-transform:uppercase;">
                ${escapeHtml(incident.urgency)}
              </span>
            </div>
            <div style="position:relative;display:flex;align-items:center;justify-content:center;width:18px;height:18px;">
              ${pulseHtml}
              <span style="position:relative;width:14px;height:14px;border-radius:9999px;background:${colors.bg};border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.35);"></span>
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -34],
      });

      const marker = L.marker(coords, {
        icon: incidentIcon,
        zIndexOffset: isCritical ? 1200 : 1000,
        title: `${incident.incidentCode} — ${incident.incidentType} (${incident.location})`,
      });

      const popupButtonId = `open-inc-btn-${incident.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

      const popupContainer = document.createElement("div");
      popupContainer.style.minWidth = "235px";
      popupContainer.style.fontFamily = "'Inter', sans-serif";
      popupContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#2563eb;">
            ${escapeHtml(incident.incidentCode)}
          </span>
          <span style="background:${colors.badgeBg};color:${colors.badgeText};border:1px solid ${colors.badgeBorder};border-radius:4px;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;text-transform:uppercase;">
            ${escapeHtml(incident.urgency)}
          </span>
        </div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">
          ${escapeHtml(incident.incidentType)}
        </div>
        <div style="font-size:12px;color:#334155;margin-bottom:6px;">
          <strong>${escapeHtml(incident.location)}</strong> (${escapeHtml(incident.area)})
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:8px;">
          <div>Status: <strong style="color:#0f172a;">${escapeHtml(incident.status)}</strong></div>
          <div>Urgency: <strong style="color:${colors.badgeText};">${escapeHtml(incident.urgency)}</strong></div>
          <div>People Affected: <strong style="color:#0f172a;">${escapeHtml(incident.peopleAffected)}</strong></div>
          <div>Related Reports: <strong style="color:#2563eb;">${incident.relatedReportsCount} Reports</strong></div>
        </div>
        <button
          id="${popupButtonId}"
          type="button"
          style="width:100%;padding:6px 10px;border-radius:6px;background:#2563eb;color:#ffffff;font-size:12px;font-weight:600;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"
        >
          <span>Open Incident</span>
        </button>
      `;

      const openBtn = popupContainer.querySelector("button");
      if (openBtn) {
        openBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current?.(incident);
        });
      }

      marker.bindPopup(popupContainer, {
        closeButton: true,
        maxWidth: 290,
      });

      marker.addTo(layer);
    }
  }, [incidents, incidentCoords]);

  return (
    <div
      className="w-full h-full relative"
      data-testid="leaflet-interactive-map"
      ref={containerRef}
    />
  );
}
