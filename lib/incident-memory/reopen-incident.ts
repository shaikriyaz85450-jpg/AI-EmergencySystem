import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitLifecycleNotification } from "@/lib/notifications/notification-service";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

export interface ReopenIncidentInput {
  incidentId: string;
  reason: string;
  informationOrigin?: InformationOrigin;
  reportId?: string | null;
}

export interface ReopenIncidentResult {
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord;
}

/**
 * Part 11 — Reopening a Resolved incident:
 * - Transitions `Resolved -> Active`
 * - Sets `resolution_pending = false`
 * - Preserves previous resolution history (`resolution_notes`, `resolved_at`, `resolved_by`, and all past `incident_updates` entries)
 * - Does NOT create a duplicate incident (continues with the same incident ID and code)
 * - Appends a `reopened` timeline entry.
 */
export async function reopenResolvedIncident(
  input: ReopenIncidentInput
): Promise<ReopenIncidentResult> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("A reason or evidence summary is required to reopen an incident.");
  }

  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for reopen: ${incErr?.message ?? input.incidentId}`
    );
  }

  const incident = incData as IncidentRecord;
  if (incident.status !== "Resolved") {
    throw new Error(
      `Incident ${incident.incident_code} is currently "${incident.status}". Only a "Resolved" incident can be reopened.`
    );
  }

  const origin: InformationOrigin = input.informationOrigin ?? "operator";
  const previousResolutionNotes = incident.resolution_notes;
  const previousResolvedAt = incident.resolved_at;
  const previousResolvedBy = incident.resolved_by;

  const preservedResolutionNotes = previousResolutionNotes
    ? `${previousResolutionNotes} | [Reopened: ${reason}]`
    : `[Reopened: ${reason}]`;

  const summary = `Incident ${incident.incident_code} reopened from Resolved to Active: ${reason}`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      status: "Active",
      resolution_pending: false,
      resolution_notes: preservedResolutionNotes,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to reopen incident ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "reopened",
    previousStatus: "Resolved",
    newStatus: "Active",
    informationOrigin: origin,
    summary,
    details: {
      previous_status: "Resolved",
      new_status: "Active",
      reopen_reason: reason,
      report_id: input.reportId ?? null,
      preserved_previous_resolution: {
        resolved_by: previousResolvedBy,
        resolved_at: previousResolvedAt,
        resolution_notes: previousResolutionNotes,
      },
    },
  });

  await emitLifecycleNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    notificationType: "incident_reopened",
    title: `${incident.incident_code} — Incident Reopened to Active`,
    message: summary,
  });

  return {
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
