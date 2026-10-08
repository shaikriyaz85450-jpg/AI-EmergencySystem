"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IncidentUpdates } from "@/components/dashboard/IncidentUpdates";

export default function UpdatesPage() {
  return (
    <DashboardShell>
      {() => <IncidentUpdates showStatusTransitions />}
    </DashboardShell>
  );
}
