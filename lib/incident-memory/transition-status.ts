import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitLifecycleNotification } from "@/lib/notifications/notification-service";
import type {
  IncidentRecord,
  IncidentStatus,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

const ALLOWED_NON_RESOLVED_STATUSES: readonly IncidentStatus[] = [
  "Active",
  "Escalated",
  "Rescue in Progress",
];

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  Active: ["Escalated", "Rescue in Progress"],
  Escalated: ["Rescue in Progress", "Active"],
  "Rescue in Progress": ["Escalated", "Active"],
  Resolved: [], // Resolved -> Active must use reopenIncident()
};

export interface TransitionStatusInput {
  incidentId: string;
  newStatus: IncidentStatus;
  informationOrigin?: InformationOrigin;
  reason?: string | null;
  reportId?: string | null;
}

export interface TransitionStatusResult {
  updated: boolean;
  previousStatus: IncidentStatus;
  newStatus: IncidentStatus;
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord | null;
}

/**
 * Controlled operational status transitions (Parts 6, 7, 8, 9):
 * - Allowed operational transitions here:
 *   Active -> Escalated | Rescue in Progress
 *   Escalated -> Rescue in Progress | Active
 *   Rescue in Progress -> Escalated | Active
 * - Transitioning to 'Resolved' must go through `resolveIncident()` (Part 10) to enforce
 *   responder/operator verification and resolution_notes.
 * - Transitioning from 'Resolved' to 'Active' must go through `reopenIncident()` (Part 11).
 */
export async function transitionIncidentStatus(
  input: TransitionStatusInput
): Promise<TransitionStatusResult> {
  if (input.newStatus === "Resolved") {
    throw new Error(
      "Use the verified resolution workflow (/api/incidents/[id]/resolve) to transition an incident to Resolved."
    );
  }

  if (!ALLOWED_NON_RESOLVED_STATUSES.includes(input.newStatus)) {
    throw new Error(
      `Invalid status "${input.newStatus}". Allowed values: Active, Escalated, Rescue in Progress, Resolved.`
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for status transition: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousStatus = incident.status;

  if (previousStatus === input.newStatus) {
    return {
      updated: false,
      previousStatus,
      newStatus: previousStatus,
      incident,
      timelineEntry: null,
    };
  }

  if (previousStatus === "Resolved") {
    throw new Error(
      `Incident ${incident.incident_code} is currently Resolved. Use the Reopen workflow (/api/incidents/[id]/reopen) to reopen it to Active.`
    );
  }

  const allowedTargets = VALID_TRANSITIONS[previousStatus] ?? [];
  if (!allowedTargets.includes(input.newStatus)) {
    throw new Error(
      `Invalid status transition from "${previousStatus}" to "${input.newStatus}".`
    );
  }

  const origin: InformationOrigin = input.informationOrigin ?? "operator";
  const cleanedReason = input.reason?.trim() || null;

  const summary = `Incident status changed from ${previousStatus} to ${
    input.newStatus
  }${cleanedReason ? `: ${cleanedReason}` : "."}`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      status: input.newStatus,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to transition status on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "status_change",
    previousStatus,
    newStatus: input.newStatus,
    informationOrigin: origin,
    summary,
    details: {
      previous_status: previousStatus,
      new_status: input.newStatus,
      reason: cleanedReason,
      report_id: input.reportId ?? null,
    },
  });

  const notificationType =
    input.newStatus === "Escalated"
      ? "incident_escalated"
      : input.newStatus === "Rescue in Progress"
      ? "rescue_in_progress"
      : "status_update";

  await emitLifecycleNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    notificationType,
    title: `${incident.incident_code} — Status: ${input.newStatus}`,
    message: summary,
  });

  return {
    updated: true,
    previousStatus,
    newStatus: input.newStatus,
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
