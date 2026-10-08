import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
  UrgencyLevel,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

const VALID_URGENCY_LEVELS: readonly UrgencyLevel[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export interface UpdateUrgencyInput {
  incidentId: string;
  newUrgency: UrgencyLevel;
  informationOrigin?: InformationOrigin;
  allowOperatorDowngrade?: boolean;
  reason?: string | null;
  reportId?: string | null;
}

export interface UpdateUrgencyResult {
  updated: boolean;
  previousUrgency: UrgencyLevel;
  newUrgency: UrgencyLevel;
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord | null;
}

/**
 * Controlled urgency updates (Part 5):
 * - Valid values: Critical, High, Medium, Low.
 * - Never silently downgrades urgency because a newer citizen report is less severe.
 * - Downgrading urgency requires explicit operator/responder action (`allowOperatorDowngrade = true` AND non-empty `reason`).
 * - Records `previous_urgency`, `new_urgency`, `reason`, and `report_id` in `public.incident_updates`.
 */
export async function updateIncidentUrgency(
  input: UpdateUrgencyInput
): Promise<UpdateUrgencyResult> {
  if (!VALID_URGENCY_LEVELS.includes(input.newUrgency)) {
    throw new Error(
      `Invalid urgency "${input.newUrgency}". Allowed values: Critical, High, Medium, Low.`
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
      `Incident not found for urgency update: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousUrgency = incident.urgency;
  const origin: InformationOrigin = input.informationOrigin ?? "operator";

  if (previousUrgency === input.newUrgency) {
    return {
      updated: false,
      previousUrgency,
      newUrgency: previousUrgency,
      incident,
      timelineEntry: null,
    };
  }

  const isDowngrade =
    URGENCY_RANK[input.newUrgency] < URGENCY_RANK[previousUrgency];

  if (isDowngrade) {
    if (origin === "ai_extracted" || !input.allowOperatorDowngrade) {
      throw new Error(
        `Cannot automatically downgrade urgency from ${previousUrgency} to ${input.newUrgency}. Urgency reduction requires explicit operator/responder confirmation and reason.`
      );
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error(
        `Downgrading urgency from ${previousUrgency} to ${input.newUrgency} requires an explicit reason.`
      );
    }
  }

  const cleanedReason = input.reason?.trim() || null;
  const summary = `Incident ${incident.incident_code} urgency changed from ${previousUrgency} to ${input.newUrgency}${
    cleanedReason ? `: ${cleanedReason}` : "."
  }`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      urgency: input.newUrgency,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to update urgency on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "urgency_change",
    previousStatus: incident.status,
    newStatus: incident.status,
    informationOrigin: origin,
    summary,
    details: {
      previous_urgency: previousUrgency,
      new_urgency: input.newUrgency,
      reason: cleanedReason,
      report_id: input.reportId ?? null,
      source: origin,
    },
  });

  return {
    updated: true,
    previousUrgency,
    newUrgency: input.newUrgency,
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
