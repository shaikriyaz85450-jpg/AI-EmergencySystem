import { NextResponse } from "next/server";
import { correlateAllPendingReports } from "@/lib/incident-correlation/correlate-report";
import { isIncidentMergedIntoAnother } from "@/lib/incident-operations/validate-operation";
import type {
  PreviewArea,
  PreviewCanonicalLandmark,
  PreviewIncident,
  PreviewIncidentUpdate,
  PreviewLocationMatchLevel,
} from "@/lib/preview/dashboard-data";
import { toInformationOriginLabel } from "@/lib/report-processing/extract-report";
import { toSourceChannelLabel } from "@/lib/report-processing/process-report";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  ReportRecord,
} from "@/types/database";

function formatRelativeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return isoString;
  }
}

function formatReportedAtLabel(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
    return `Reported ${timeStr} IST (${formatRelativeTime(isoString)})`;
  } catch {
    return isoString;
  }
}

function toLocationMatchLevel(
  confidence: number | null
): PreviewLocationMatchLevel {
  if (confidence !== null && confidence >= 0.85) return "High";
  if (confidence !== null && confidence >= 0.55) return "Medium";
  return "Low";
}

export function mapIncidentRecordToDashboard(
  inc: IncidentRecord,
  correlatedReports: ReportRecord[]
): PreviewIncident {
  const channels = Array.from(
    new Set(
      correlatedReports.map((r) => toSourceChannelLabel(r.source_channel))
    )
  );
  const unverifiedCount = correlatedReports.filter(
    (r) => r.is_unverified_evidence || r.classification === "rumor_unverified"
  ).length;

  let relatedChannelsSummary =
    channels.length > 0 ? `(${channels.join(", ")})` : undefined;
  if (unverifiedCount > 0) {
    relatedChannelsSummary = `${
      relatedChannelsSummary ? `${relatedChannelsSummary} • ` : ""
    }${unverifiedCount} unverified supporting`;
  }

  let peopleAffectedDisplay = "Unknown (Not explicitly stated)";
  if (inc.people_affected_count !== null) {
    if (
      inc.people_affected_min !== null &&
      inc.people_affected_max !== null &&
      inc.people_affected_min !== inc.people_affected_max
    ) {
      peopleAffectedDisplay = `${inc.people_affected_count} people (Range: ${inc.people_affected_min}–${inc.people_affected_max})`;
    } else {
      peopleAffectedDisplay = `${inc.people_affected_count} people affected`;
    }
  } else if (inc.people_affected_description) {
    peopleAffectedDisplay = `Unknown count (${inc.people_affected_description})`;
  }

  const vulnerablePeopleDisplay =
    inc.vulnerable_people && inc.vulnerable_people.length > 0
      ? inc.vulnerable_people.join(", ")
      : "None reported";

  const resourcesNeededDisplay =
    inc.resources_needed && inc.resources_needed.length > 0
      ? inc.resources_needed.join(", ")
      : "Assessment pending";

  const confidencePct =
    inc.confidence_score !== null
      ? `${Math.round(Number(inc.confidence_score) * 100)}%`
      : "88%";

  const locationLandmark = (inc.canonical_landmark ??
    inc.location_text ??
    "Velachery MRTS Station") as PreviewCanonicalLandmark;

  const areaName = (inc.area ?? "Velachery") as PreviewArea;

  return {
    id: inc.id,
    incidentCode: inc.incident_code,
    incidentType: inc.incident_type,
    status: inc.status,
    urgency: inc.urgency,
    confidence: confidencePct,
    locationMatch: toLocationMatchLevel(inc.location_confidence),
    location: locationLandmark,
    area: areaName,
    reportedAtLabel: formatReportedAtLabel(inc.created_at),
    relatedReportsCount: inc.related_report_count,
    relatedChannelsSummary,
    peopleAffected: peopleAffectedDisplay,
    vulnerablePeople: vulnerablePeopleDisplay,
    vulnerableLabelPrefix: "Vulnerable People",
    resourcesNeeded: resourcesNeededDisplay,
    resourcesSubtext: inc.uncertainty_notes ?? undefined,
    latestUpdateSummary:
      inc.latest_update_summary ??
      inc.summary ??
      "Incident active and monitored.",
    latestUpdateAgo: formatRelativeTime(inc.updated_at || inc.created_at),
    informationOrigin: toInformationOriginLabel(inc.information_origin),
    resolutionPending: inc.resolution_pending,
    resolutionNotes: inc.resolution_notes,
    resolvedBy: inc.resolved_by,
    resolvedAt: inc.resolved_at,
  };
}

export function mapUpdateRecordToDashboard(
  upd: IncidentUpdateRecord,
  incidentById: Map<string, IncidentRecord>
): PreviewIncidentUpdate {
  const inc = incidentById.get(upd.incident_id);
  const incTypeLower = (inc?.incident_type ?? "").toLowerCase();

  let icon: PreviewIncidentUpdate["icon"] = "bolt";
  let accentTone: PreviewIncidentUpdate["accentTone"] = "primary";

  if (incTypeLower.includes("flood") || incTypeLower.includes("water")) {
    icon = "water_drop";
    accentTone = "error";
  } else if (incTypeLower.includes("fire")) {
    icon = "bolt";
    accentTone = "tertiary";
  } else if (incTypeLower.includes("medical")) {
    icon = "medical_services";
    accentTone = "error";
  } else if (upd.update_type === "unverified_evidence_attached") {
    icon = "traffic";
    accentTone = "neutral";
  }

  return {
    id: upd.id,
    incidentCode: inc?.incident_code ?? "INC-2026-000",
    updateSummary: upd.summary,
    informationOrigin: toInformationOriginLabel(upd.information_origin),
    previousStatus: upd.previous_status,
    newStatus: upd.new_status ?? inc?.status ?? "Active",
    timeAgo: formatRelativeTime(upd.created_at),
    icon,
    accentTone,
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [
      { data: incidentsData, error: incErr },
      { data: reportsData, error: repErr },
      { data: updatesData, error: updErr },
      { data: notificationsData },
    ] = await Promise.all([
      supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("reports")
        .select("*")
        .order("reported_at", { ascending: false }),
      supabase
        .from("incident_updates")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("is_read, follow_up_calls_avoided"),
    ]);

    if (incErr) {
      return NextResponse.json({ error: incErr.message }, { status: 500 });
    }
    if (repErr) {
      return NextResponse.json({ error: repErr.message }, { status: 500 });
    }
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const allIncidents = (incidentsData ?? []) as IncidentRecord[];
    const operationalIncidents = allIncidents.filter(
      (inc) => !isIncidentMergedIntoAnother(inc)
    );
    const reports = (reportsData ?? []) as ReportRecord[];
    const updates = (updatesData ?? []) as IncidentUpdateRecord[];
    const notificationRows = (notificationsData ?? []) as Array<{
      is_read: boolean;
      follow_up_calls_avoided: number;
    }>;

    let followUpCallsAvoided = 0;
    let unreadNotifications = 0;
    for (const n of notificationRows) {
      if (!n.is_read) {
        unreadNotifications += 1;
      }
      followUpCallsAvoided += Number(n.follow_up_calls_avoided ?? 0);
    }

    const incidentById = new Map<string, IncidentRecord>();
    for (const inc of allIncidents) {
      incidentById.set(inc.id, inc);
    }

    const displayIncidents = operationalIncidents.map((inc) => {
      const related = reports.filter((r) => r.incident_id === inc.id);
      return mapIncidentRecordToDashboard(inc, related);
    });

    const displayUpdates = updates.map((u) =>
      mapUpdateRecordToDashboard(u, incidentById)
    );

    const stats = {
      totalReports: reports.length,
      activeIncidents: operationalIncidents.filter((i) => i.status === "Active")
        .length,
      escalatedIncidents: operationalIncidents.filter(
        (i) => i.status === "Escalated"
      ).length,
      rescueInProgress: operationalIncidents.filter(
        (i) => i.status === "Rescue in Progress"
      ).length,
      resolvedIncidents: operationalIncidents.filter(
        (i) => i.status === "Resolved"
      ).length,
      followUpCallsAvoided,
      unreadNotifications,
    };

    return NextResponse.json({
      count: operationalIncidents.length,
      incidents: operationalIncidents,
      display_incidents: displayIncidents,
      incident_updates: updates,
      display_updates: displayUpdates,
      stats,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load incidents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await correlateAllPendingReports();
    const operationalIncidents = result.incidents.filter(
      (inc) => !isIncidentMergedIntoAnother(inc)
    );
    return NextResponse.json({
      success: true,
      outcomes: result.outcomes,
      incident_count: operationalIncidents.length,
      incidents: operationalIncidents,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to correlate reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
