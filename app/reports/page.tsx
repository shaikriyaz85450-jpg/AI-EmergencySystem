"use client";

import React from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ReportsTable } from "@/components/dashboard/ReportsTable";

export default function ReportsPage() {
  return (
    <DashboardShell>
      {({ searchQuery }) => (
        <div className="flex flex-col gap-space-md">
          <div>
            <h1 className="font-heading text-lg font-bold text-on-surface tracking-tight">
              Incoming Reports &amp; AI Classification Log
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Phase 4 Live Pipeline — Incoming text reports classified, extracted, and stored in Supabase public.reports
            </p>
          </div>
          <ReportsTable globalSearchQuery={searchQuery} />
        </div>
      )}
    </DashboardShell>
  );
}
