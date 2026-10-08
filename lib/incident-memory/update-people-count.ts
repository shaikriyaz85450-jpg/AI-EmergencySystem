import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

const ORIGIN_TRUST_RANK: Record<InformationOrigin, number> = {
  ai_extracted: 1,
  responder_confirmed: 2,
  operator: 3,
};

export interface UpdatePeopleCountInput {
  incidentId: string;
  explicitCount: number | null;
  description?: string | null;
  informationOrigin?: InformationOrigin;
  isUnverifiedRumor?: boolean;
  reportId?: string | null;
  reason?: string | null;
}

export interface UpdatePeopleCountResult {
  updated: boolean;
  previousCount: number | null;
  newCount: number | null;
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord | null;
}

/**
 * Updates an incident's people_affected_count strictly from explicit evidence.
 *
 * CRITICAL RULES (Part 2):
 * 1. NEVER SUM PEOPLE COUNTS (e.g., 20 followed by 30 becomes 30, NEVER 50).
 * 2. If `isUnverifiedRumor` is true, reject overwriting a verified count automatically.
 * 3. If `explicitCount` is null (e.g. "Several people need assistance"), do NOT convert to a number
 *    and do NOT overwrite an existing verified count.
 * 4. Respects information_origin trust hierarchy (`operator` >= `responder_confirmed` >= `ai_extracted`).
 * 5. Records `previous_count`, `new_count`, `report_id`, and `reason` in `public.incident_updates`.
 */
export async function updateIncidentPeopleCount(
  input: UpdatePeopleCountInput
): Promise<UpdatePeopleCountResult> {
  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for people count update: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousCount = incident.people_affected_count;
  const origin: InformationOrigin = input.informationOrigin ?? "operator";

  // Rule: Unverified rumor must never overwrite a verified people count
  if (input.isUnverifiedRumor) {
    return {
      updated: false,
      previousCount,
      newCount: previousCount,
      incident,
      timelineEntry: null,
    };
  }

  // Validate explicit count if provided
  if (
    input.explicitCount !== null &&
    (!Number.isInteger(input.explicitCount) || input.explicitCount < 0)
  ) {
    throw new Error(
      "people_affected_count must be a non-negative integer or null."
    );
  }

  // Rule: If no explicit number is provided (e.g., "Several people need assistance"),
  // do NOT overwrite an existing explicit numeric count!
  if (input.explicitCount === null) {
    if (previousCount !== null) {
      return {
        updated: false,
        previousCount,
        newCount: previousCount,
        incident,
        timelineEntry: null,
      };
    }

    // If previous count was also null, we can update the descriptive text if provided
    if (
      input.description &&
      input.description.trim() !== (incident.people_affected_description ?? "")
    ) {
      const desc = input.description.trim();
      const summary = `People affected description updated on ${incident.incident_code}: "${desc}" (count remains unknown).`;
      const { data: updatedIncData, error: updErr } = await supabase
        .from("incidents")
        .update({
          people_affected_description: desc,
          latest_update_summary: summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", incident.id)
        .select("*")
        .single();

      if (updErr || !updatedIncData) {
        throw new Error(
          `Failed to update people description: ${updErr?.message}`
        );
      }

      const timelineEntry = await appendIncidentTimelineEntry({
        incidentId: incident.id,
        reportId: input.reportId ?? null,
        updateType: "people_count_update",
        previousStatus: incident.status,
        newStatus: incident.status,
        informationOrigin: origin,
        summary,
        details: {
          previous_count: previousCount,
          new_count: null,
          people_affected_description: desc,
          report_id: input.reportId ?? null,
          reason: input.reason ?? "Descriptive non-numeric report update",
        },
      });

      return {
        updated: true,
        previousCount,
        newCount: null,
        incident: updatedIncData as IncidentRecord,
        timelineEntry,
      };
    }

    return {
      updated: false,
      previousCount,
      newCount: previousCount,
      incident,
      timelineEntry: null,
    };
  }

  // Check trust hierarchy: lower-trust source cannot overwrite higher-trust count
  const incomingTrust = ORIGIN_TRUST_RANK[origin] ?? 1;
  const existingTrust = ORIGIN_TRUST_RANK[incident.people_count_origin] ?? 1;

  if (previousCount !== null && incomingTrust < existingTrust) {
    return {
      updated: false,
      previousCount,
      newCount: previousCount,
      incident,
      timelineEntry: null,
    };
  }

  // Idempotent no-op if explicit count has not changed
  if (previousCount === input.explicitCount) {
    return {
      updated: false,
      previousCount,
      newCount: previousCount,
      incident,
      timelineEntry: null,
    };
  }

  // NEVER SUM: Replace with latest explicit count at this or higher trust level
  const newCount = input.explicitCount;
  const newMin =
    incomingTrust > existingTrust || incident.people_affected_min === null
      ? newCount
      : Math.min(incident.people_affected_min, newCount);
  const newMax =
    incomingTrust > existingTrust || incident.people_affected_max === null
      ? newCount
      : Math.max(incident.people_affected_max, newCount);

  const newDescription =
    input.description?.trim() || `${newCount} people affected`;

  const summary =
    previousCount === null
      ? `People affected count set to ${newCount} on ${incident.incident_code}${
          input.reason ? ` (${input.reason})` : ""
        }.`
      : `People affected count updated from ${previousCount} to ${newCount} on ${
          incident.incident_code
        } (replaced latest explicit count; never summed)${
          input.reason ? ` — ${input.reason}` : ""
        }.`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      people_affected_count: newCount,
      people_affected_min: newMin,
      people_affected_max: newMax,
      people_affected_description: newDescription,
      people_count_origin: origin,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to update people_affected_count on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "people_count_update",
    previousStatus: incident.status,
    newStatus: incident.status,
    informationOrigin: origin,
    summary,
    details: {
      previous_count: previousCount,
      new_count: newCount,
      report_id: input.reportId ?? null,
      reason:
        input.reason ??
        "Explicit people count updated (latest explicit count replaces previous count)",
      source: origin,
    },
  });

  return {
    updated: true,
    previousCount,
    newCount,
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
