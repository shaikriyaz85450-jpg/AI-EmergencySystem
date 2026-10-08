"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IncidentList } from "@/components/dashboard/IncidentList";
import { IncidentUpdates } from "@/components/dashboard/IncidentUpdates";
import { MapPanel } from "@/components/dashboard/MapPanel";
import {
  PreviewActionModal,
  type PreviewModalState,
} from "@/components/dashboard/PreviewActionModal";
import { ReportsTable } from "@/components/dashboard/ReportsTable";
import { StatCards } from "@/components/dashboard/StatCards";
import { WorkflowPipeline } from "@/components/dashboard/WorkflowPipeline";

export default function DashboardPage() {
  const [modalState, setModalState] = useState<PreviewModalState>(null);
  const [reportIncidentFilter, setReportIncidentFilter] = useState<
    string | null
  >(null);

  return (
    <DashboardShell>
      {({ searchQuery }) => (
        <>
          {/* 1. CORRELATION PIPELINE ARCHITECTURE BANNER */}
          <WorkflowPipeline
            onCorrelatePendingClick={() =>
              setModalState({ type: "correlate_pending" })
            }
            onExportLogClick={() => setModalState({ type: "export_log" })}
            onNewIncidentClick={() => setModalState({ type: "new_incident" })}
          />

          {/* 2. OPERATIONAL SUMMARY STAT CARDS */}
          <StatCards />

          {/* 3. MAIN WORKSPACE (Balanced Two-Column Desktop Layout: ~58% Incident List / ~42% Map & Updates Panel) */}
          <div
            className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start"
            data-testid="dashboard-two-column-workspace"
          >
            {/* LEFT COLUMN: ACTIVE INCIDENTS (lg:col-span-7 -> ~58.3% width) */}
            <div className="lg:col-span-7 min-w-0 flex flex-col gap-space-sm">
              <IncidentList
                globalSearchQuery={searchQuery}
                onOpenIncidentView={(incident) =>
                  setModalState({ type: "incident_view", incident })
                }
                onUpdateStatus={(incident) =>
                  setModalState({ type: "update_status", incident })
                }
                onViewCorrelatedReports={(incident) =>
                  setModalState({ type: "correlated_reports", incident })
                }
              />
            </div>

            {/* RIGHT COLUMN: INCIDENT LOCATION MAP & RECENT INCIDENT UPDATES (lg:col-span-5 -> ~41.7% width) */}
            <div className="lg:col-span-5 min-w-0 flex flex-col gap-space-sm">
              <MapPanel
                heightClass="h-[440px]"
                onSelectIncident={(incident) =>
                  setModalState({ type: "incident_view", incident })
                }
              />
              <IncidentUpdates />
            </div>
          </div>

          {/* 4. BOTTOM SECTION: RECENT INCOMING REPORTS */}
          <ReportsTable
            filterIncidentCode={reportIncidentFilter}
            globalSearchQuery={searchQuery}
            onClearIncidentFilter={() => setReportIncidentFilter(null)}
            onSelectIncidentCode={(incident) =>
              setModalState({ type: "incident_view", incident })
            }
          />

          <PreviewActionModal
            modalState={modalState}
            onClose={() => setModalState(null)}
          />
        </>
      )}
    </DashboardShell>
  );
}
