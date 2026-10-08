"use client";

import { useEffect, useState } from "react";
import { PREVIEW_PIPELINE_SUMMARY } from "@/lib/preview/dashboard-data";

interface WorkflowPipelineProps {
  onCorrelatePendingClick?: () => void;
  onExportLogClick?: () => void;
  onNewIncidentClick?: () => void;
}

export function WorkflowPipeline({
  onCorrelatePendingClick,
  onExportLogClick,
  onNewIncidentClick,
}: WorkflowPipelineProps) {
  const [liveSummary, setLiveSummary] = useState<{
    totalReports: number;
    correlatedIncidents: number;
  }>({
    totalReports: PREVIEW_PIPELINE_SUMMARY.totalReports,
    correlatedIncidents: PREVIEW_PIPELINE_SUMMARY.correlatedIncidents,
  });

  useEffect(() => {
    let active = true;
    const fetchPipelineStats = () => {
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active || !data.stats) return;
          setLiveSummary({
            totalReports: Number(
              data.stats.totalReports ?? PREVIEW_PIPELINE_SUMMARY.totalReports
            ),
            correlatedIncidents: Number(
              data.stats.activeIncidents ??
                PREVIEW_PIPELINE_SUMMARY.correlatedIncidents
            ),
          });
        })
        .catch(() => {
          // Keep preview fallback
        });
    };

    fetchPipelineStats();
    window.addEventListener("incidents-updated", fetchPipelineStats);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchPipelineStats);
    };
  }, []);

  return (
    <div className="w-full bg-white rounded-lg p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md shadow-xs border border-[#e2e8f0]">
      <div className="flex items-center gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb] shrink-0">
          <span className="material-symbols-outlined text-[24px]">
            account_tree
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-code-md text-[#0f172a]">
            <span className="px-2 py-0.5 rounded bg-[#f8fafc] border border-[#e2e8f0] text-[#334155]">
              Incoming Reports
            </span>
            <span className="material-symbols-outlined text-[#64748b] text-[13px]">
              arrow_forward
            </span>
            <span className="px-2 py-0.5 rounded bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb]">
              AI Extraction
            </span>
            <span className="material-symbols-outlined text-[#64748b] text-[13px]">
              arrow_forward
            </span>
            <span className="px-2 py-0.5 rounded bg-[#f0f9ff] border border-[#bae6fd] text-[#0284c7]">
              Location Resolution
            </span>
            <span className="material-symbols-outlined text-[#64748b] text-[13px]">
              arrow_forward
            </span>
            <span className="px-2 py-0.5 rounded bg-[#fffbeb] border border-[#fde68a] text-[#b45309]">
              Incident Correlation
            </span>
            <span className="material-symbols-outlined text-[#64748b] text-[13px]">
              arrow_forward
            </span>
            <span className="px-2 py-0.5 rounded bg-[#eff6ff] border border-[#bfdbfe] text-[#1d4ed8] font-semibold">
              Correlated Incidents
            </span>
            <span className="material-symbols-outlined text-[#64748b] text-[13px]">
              arrow_forward
            </span>
            <span className="px-2 py-0.5 rounded bg-[#2563eb] text-white font-semibold">
              Operator Action
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm text-[#64748b]">
            <span className="font-body-sm text-body-sm text-[#475569]">
              {liveSummary.totalReports} multi-channel reports{" "}
              <span className="text-[#2563eb] font-semibold">
                → {liveSummary.correlatedIncidents} correlated incidents
              </span>
            </span>
            <span>•</span>
            <span className="font-code-md text-code-md text-[#15803d] font-semibold">
              Live Supabase Pipeline Active
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-xs self-stretch md:self-auto shrink-0">
        <button
          className="px-space-sm py-1.5 rounded-md bg-white hover:bg-[#f8fafc] text-[#334155] font-headline-sm text-headline-sm flex items-center gap-1 transition-colors border border-[#cbd5e1] cursor-pointer"
          onClick={onCorrelatePendingClick}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px] text-[#64748b]">
            tune
          </span>
          <span>Correlate Pending (0)</span>
        </button>

        <button
          className="px-space-sm py-1.5 rounded-md bg-white hover:bg-[#f8fafc] text-[#334155] font-headline-sm text-headline-sm flex items-center gap-1 transition-colors border border-[#cbd5e1] cursor-pointer"
          onClick={onExportLogClick}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px] text-[#64748b]">
            ios_share
          </span>
          <span>Export Log</span>
        </button>

        <button
          className="px-space-md py-1.5 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] font-headline-sm text-headline-sm flex items-center gap-1 transition-colors cursor-pointer"
          onClick={onNewIncidentClick}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>New Incident</span>
        </button>
      </div>
    </div>
  );
}
