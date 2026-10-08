"use client";

import type { PreviewIncident } from "@/lib/preview/dashboard-data";

interface IncidentCardProps {
  incident: PreviewIncident;
  onOpenIncidentView?: (incident: PreviewIncident) => void;
  onUpdateStatus?: (incident: PreviewIncident) => void;
  onViewCorrelatedReports?: (incident: PreviewIncident) => void;
}

export function IncidentCard({
  incident,
  onOpenIncidentView,
  onUpdateStatus,
  onViewCorrelatedReports,
}: IncidentCardProps) {
  const isCritical = incident.urgency === "Critical";
  const isResolved = incident.status === "Resolved";

  const cardBorderHoverClass = isCritical
    ? "hover:border-[#fecaca]"
    : incident.urgency === "High"
      ? "hover:border-[#fed7aa]"
      : "hover:border-[#bfdbfe]";

  const urgencyBadge = () => {
    switch (incident.urgency) {
      case "Critical":
        return (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] font-badge-label text-badge-label uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626] animate-ping" />
            <span>Critical</span>
          </div>
        );
      case "High":
        return (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fff7ed] border border-[#fed7aa] text-[#ea580c] font-badge-label text-badge-label uppercase">
            <span>High</span>
          </div>
        );
      case "Medium":
        return (
          <span className="px-2 py-0.5 rounded bg-[#fffbeb] border border-[#fde68a] text-[#d97706] font-badge-label text-badge-label uppercase">
            Medium
          </span>
        );
      case "Low":
        return (
          <span className="px-2 py-0.5 rounded bg-[#f0f9ff] border border-[#bae6fd] text-[#0284c7] font-badge-label text-badge-label uppercase">
            Low
          </span>
        );
    }
  };

  const statusBadge = () => {
    switch (incident.status) {
      case "Active":
        return (
          <span className="px-2 py-0.5 rounded bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb] font-label-caps text-label-caps uppercase">
            Active
          </span>
        );
      case "Escalated":
        return (
          <span className="px-2 py-0.5 rounded bg-[#fff7ed] border border-[#fed7aa] text-[#c2410c] font-label-caps text-label-caps uppercase">
            Escalated
          </span>
        );
      case "Rescue in Progress":
        return (
          <span className="px-2 py-0.5 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] font-label-caps text-label-caps uppercase">
            Rescue in Progress
          </span>
        );
      case "Resolved":
        return (
          <span className="px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] font-label-caps text-label-caps uppercase">
            Resolved
          </span>
        );
    }
  };

  const originBadgeClass =
    incident.informationOrigin === "Responder Confirmed"
      ? "px-2 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] font-code-md text-[11px]"
      : "px-2 py-0.5 rounded bg-[#f1f5f9] border border-[#e2e8f0] text-[#475569] font-code-md text-[11px]";

  const locationIconColorClass = isCritical
    ? "text-[#dc2626]"
    : incident.urgency === "High"
      ? "text-[#ea580c]"
      : "text-[#2563eb]";

  const peopleAffectedColorClass = isCritical
    ? "text-[#dc2626]"
    : incident.urgency === "High"
      ? "text-[#ea580c]"
      : "text-[#0f172a]";

  const updateIcon = isResolved ? "check_circle" : "info";
  const updateIconColorClass = isResolved
    ? "text-[#15803d]"
    : incident.status === "Rescue in Progress"
      ? "text-[#dc2626]"
      : incident.status === "Escalated"
        ? "text-[#ea580c]"
        : "text-[#2563eb]";

  const updateAgoColorClass = isResolved
    ? "text-[#15803d] font-medium"
    : isCritical
      ? "text-[#dc2626] font-medium"
      : "text-[#64748b]";

  return (
    <div
      className={`bg-white rounded-lg shadow-xs overflow-hidden transition-all border border-[#e2e8f0] ${cardBorderHoverClass}`}
    >
      {/* Top Docked Bar */}
      <div className="px-space-md py-space-xs bg-[#f8fafc] flex flex-wrap items-center justify-between gap-space-xs border-b border-[#e2e8f0]">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="font-code-lg text-code-lg text-[#2563eb] font-bold tracking-wide">
            {incident.incidentCode}
          </span>
          <span className="px-2 py-0.5 rounded bg-[#f1f5f9] border border-[#e2e8f0] text-[#334155] font-label-caps text-label-caps uppercase">
            {incident.incidentType}
          </span>
          {urgencyBadge()}
          {statusBadge()}
          {incident.resolutionPending && (
            <span className="px-2 py-0.5 rounded bg-[#fffbeb] border border-[#fde68a] text-[#b45309] font-label-caps text-label-caps uppercase">
              Resolution Pending
            </span>
          )}
          <span className={originBadgeClass}>{incident.informationOrigin}</span>
        </div>

        <div className="flex items-center gap-2 font-code-md text-code-md text-[#64748b]">
          <span>
            Confidence:{" "}
            <strong className="text-[#0f172a] font-semibold">
              {incident.confidence}
            </strong>
          </span>
          <span>•</span>
          <span>
            Location Match:{" "}
            <strong className="text-[#2563eb] font-semibold">
              {incident.locationMatch}
            </strong>
          </span>
        </div>
      </div>

      <div className="p-space-md flex flex-col gap-space-md">
        {/* Canonical Landmark & Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`material-symbols-outlined ${locationIconColorClass} text-[20px]`}
            >
              location_on
            </span>
            <span className="font-headline-sm text-headline-sm text-[#0f172a]">
              {incident.location}
            </span>
            <span className="font-code-md text-code-md px-2 py-0.5 rounded bg-[#f1f5f9] border border-[#e2e8f0] text-[#475569]">
              Area: {incident.area}
            </span>
          </div>
          <span className="font-code-md text-code-md text-[#64748b]">
            {incident.reportedAtLabel}
          </span>
        </div>

        {/* Incident Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-xs bg-[#f8fafc] p-space-sm rounded-md border border-[#e2e8f0]">
          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-label-caps text-[#64748b] uppercase">
              Related Reports
            </span>
            <div className="flex items-center gap-2">
              <span className="font-code-lg text-code-lg text-[#2563eb] font-bold">
                {incident.relatedReportsCount} Reports
              </span>
              {incident.relatedChannelsSummary && (
                <span className="font-body-sm text-[11px] text-[#64748b]">
                  {incident.relatedChannelsSummary}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-label-caps text-[#64748b] uppercase">
              People Affected
            </span>
            <span
              className={`font-body-md text-body-md ${peopleAffectedColorClass} font-semibold`}
            >
              {incident.peopleAffected}
            </span>
            <span className="font-code-md text-[10px] text-[#475569]">
              {incident.vulnerableLabelPrefix}: {incident.vulnerablePeople}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-label-caps text-[#64748b] uppercase">
              Resources Needed
            </span>
            <span className="font-body-sm text-body-sm text-[#0f172a] font-medium truncate">
              {incident.resourcesNeeded}
            </span>
            {incident.resourcesSubtext && (
              <span className="font-code-md text-[10px] text-[#64748b]">
                {incident.resourcesSubtext}
              </span>
            )}
          </div>
        </div>

        {/* Latest Update Summary Box */}
        <div className="bg-[#f8fafc] p-space-sm rounded-md flex items-start gap-space-sm border border-[#e2e8f0]">
          <span
            className={`material-symbols-outlined ${updateIconColorClass} text-[18px] shrink-0 mt-0.5`}
          >
            {updateIcon}
          </span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-[#475569] uppercase">
                Latest Update Summary
              </span>
              <span
                className={`font-code-md text-code-md ${updateAgoColorClass}`}
              >
                {incident.latestUpdateAgo}
              </span>
            </div>
            <p className="font-body-md text-body-md text-[#0f172a] leading-snug">
              {incident.latestUpdateSummary}
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-space-xs pt-space-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={
                isCritical
                  ? "h-8 px-space-md rounded-md bg-[#2563eb] text-white font-headline-sm text-headline-sm hover:bg-[#1d4ed8] transition-colors flex items-center gap-1 cursor-pointer"
                  : "h-8 px-space-md rounded-md bg-white hover:bg-[#f8fafc] text-[#0f172a] font-headline-sm text-headline-sm transition-colors flex items-center gap-1 border border-[#cbd5e1] cursor-pointer"
              }
              onClick={() => onOpenIncidentView?.(incident)}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                visibility
              </span>
              <span>Incident View &amp; Operator Controls</span>
            </button>

            <button
              className="h-8 px-space-md rounded-md bg-white hover:bg-[#f8fafc] text-[#334155] font-headline-sm text-headline-sm transition-colors flex items-center gap-1 border border-[#cbd5e1] cursor-pointer"
              onClick={() => onUpdateStatus?.(incident)}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isResolved ? "restart_alt" : "edit_note"}
              </span>
              <span>
                {isResolved ? "Reopen / Lifecycle" : "Status & Memory"}
              </span>
            </button>
          </div>

          <button
            className="h-8 px-space-sm rounded-md bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb] font-headline-sm text-headline-sm hover:bg-[#dbeafe] transition-colors flex items-center gap-1 cursor-pointer"
            onClick={() => onViewCorrelatedReports?.(incident)}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
            <span>
              View Correlated Reports ({incident.relatedReportsCount})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
