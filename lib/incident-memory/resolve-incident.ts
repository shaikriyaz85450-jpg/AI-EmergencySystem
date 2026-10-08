import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitLifecycleNotification } from "@/lib/notifications/notification-service";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

export interface MarkResolutionPendingInput {
  incidentId: string;
  evidenceNote: string;
  informationOrigin?: InformationOrigin;
  reportId?: string | null;
}

export interface ConfirmResolutionInput {
  incidentId: string;
  confirmedBy: "operator" | "responder_confirmed";
  resolutionNotes: string;
  reportId?: string | null;
}

export interface ResolutionActionResult {
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord;
}

/**
 * Part 10A — Citizen or unverified resolution claim (e.g., "Everyone is safe now."):
 * - Sets `resolution_pending = true`
 * - NEVER sets `status = 'Resolved'` automatically!
 * - Records a `resolution_pending` timeline entry.
 */
export async function markIncidentResolutionPending(
  input: MarkResolutionPendingInput
): Promise<ResolutionActionResult> {
  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for resolution pending: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  if (incident.status === "Resolved") {
    throw new Error(
      `Incident ${incident.incident_code} is already Resolved.`
    );
  }

  const note = input.evidenceNote.trim();
  if (!note) {
    throw new Error(
      "Resolution pending requires an evidence note or report summary."
    );
  }

  const origin: InformationOrigin = input.informationOrigin ?? "ai_extracted";
  const summary = `Resolution pending on ${incident.incident_code} (status remains ${incident.status} awaiting responder/operator verification): "${note}"`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      resolution_pending: true,
      resolution_notes: note,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to set resolution_pending on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "resolution_pending",
    previousStatus: incident.status,
    newStatus: incident.status,
    informationOrigin: origin,
    summary,
    details: {
      resolution_pending: true,
      status_unchanged: incident.status,
      evidence_note: note,
      report_id: input.reportId ?? null,
    },
  });

  await emitLifecycleNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    notificationType: "resolution_pending",
    title: `${incident.incident_code} — Resolution Pending Verification`,
    message: summary,
  });

  return {
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}

/**
 * Part 10B — Explicit Operator or Responder Confirmed Resolution:
 * - Requires `confirmedBy` in `('operator', 'responder_confirmed')`.
 * - Rejects `ai_extracted` from ever resolving an incident.
 * - Sets `status = 'Resolved'`, `resolution_pending = false`, `resolved_by`, `resolved_at`, `resolution_notes`.
 * - Records a `resolution_confirmed` timeline entry.
 */
export async function confirmIncidentResolution(
  input: ConfirmResolutionInput
): Promise<ResolutionActionResult> {
  if (
    input.confirmedBy !== "operator" &&
    input.confirmedBy !== "responder_confirmed"
  ) {
    throw new Error(
      "AI cannot resolve an incident. Final resolution requires explicit 'operator' or 'responder_confirmed' confirmation."
    );
  }

  const notes = input.resolutionNotes.trim();
  if (!notes) {
    throw new Error(
      "Resolution notes are required when confirming incident resolution."
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
      `Incident not found for resolution confirmation: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousStatus = incident.status;
  const nowIso = new Date().toISOString();

  const actorLabel =
    input.confirmedBy === "responder_confirmed"
      ? "Responder Confirmed"
      : "Operator";
  const summary = `Incident ${incident.incident_code} resolved by ${actorLabel}: ${notes}`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      status: "Resolved",
      resolution_pending: false,
      resolution_notes: notes,
      resolved_by: input.confirmedBy,
      resolved_at: nowIso,
      latest_update_summary: summary,
      updated_at: nowIso,
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to resolve incident ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "resolution_confirmed",
    previousStatus,
    newStatus: "Resolved",
    informationOrigin: input.confirmedBy,
    summary,
    details: {
      previous_status: previousStatus,
      new_status: "Resolved",
      resolved_by: input.confirmedBy,
      resolved_at: nowIso,
      resolution_notes: notes,
      report_id: input.reportId ?? null,
    },
  });

  await emitLifecycleNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    notificationType: "incident_resolved",
    title: `${incident.incident_code} — Incident Resolved (${actorLabel})`,
    message: summary,
  });

  return {
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
