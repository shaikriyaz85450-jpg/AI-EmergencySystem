"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  CANONICAL_LANDMARKS_GEO,
  MapPanel,
} from "@/components/dashboard/MapPanel";
import {
  PreviewActionModal,
  type PreviewModalState,
} from "@/components/dashboard/PreviewActionModal";

export default function MapPage() {
  const [modalState, setModalState] = useState<PreviewModalState>(null);

  return (
    <DashboardShell>
      {() => (
        <>
          <MapPanel
            heightClass="h-[540px]"
            onSelectIncident={(incident) =>
              setModalState({ type: "incident_view", incident })
            }
          />

          <div className="bg-white rounded-lg p-space-md border border-[#e2e8f0] shadow-xs">
            <span className="font-headline-sm text-headline-sm text-[#0f172a] block mb-space-sm">
              Canonical Project Landmarks (6) — Real Geographic Coordinates
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm">
              {CANONICAL_LANDMARKS_GEO.map((lm) => (
                <div
                  className="p-space-sm rounded-md bg-[#f8fafc] border border-[#e2e8f0] flex items-start gap-2.5"
                  key={lm.canonicalName}
                >
                  <span className="material-symbols-outlined text-[#2563eb] text-[18px] mt-0.5">
                    place
                  </span>
                  <div className="flex flex-col">
                    <span className="font-code-md text-code-md text-[#0f172a] font-semibold">
                      {lm.canonicalName}
                    </span>
                    <span className="font-body-sm text-[11px] text-[#475569]">
                      Area: {lm.area}
                    </span>
                    <span className="font-code-md text-[10.5px] text-[#64748b]">
                      {lm.latitude.toFixed(4)}° N, {lm.longitude.toFixed(4)}° E
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PreviewActionModal
            modalState={modalState}
            onClose={() => setModalState(null)}
          />
        </>
      )}
    </DashboardShell>
  );
}
