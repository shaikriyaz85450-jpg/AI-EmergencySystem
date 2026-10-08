"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IncidentList } from "@/components/dashboard/IncidentList";
import {
  PreviewActionModal,
  type PreviewModalState,
} from "@/components/dashboard/PreviewActionModal";
import { StatCards } from "@/components/dashboard/StatCards";
import { WorkflowPipeline } from "@/components/dashboard/WorkflowPipeline";

export default function IncidentsPage() {
  const [modalState, setModalState] = useState<PreviewModalState>(null);

  return (
    <DashboardShell>
      {({ searchQuery }) => (
        <>
          <WorkflowPipeline
            onCorrelatePendingClick={() =>
              setModalState({ type: "correlate_pending" })
            }
            onExportLogClick={() => setModalState({ type: "export_log" })}
            onNewIncidentClick={() => setModalState({ type: "new_incident" })}
          />
          <StatCards />
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
          <PreviewActionModal
            modalState={modalState}
            onClose={() => setModalState(null)}
          />
        </>
      )}
    </DashboardShell>
  );
}
