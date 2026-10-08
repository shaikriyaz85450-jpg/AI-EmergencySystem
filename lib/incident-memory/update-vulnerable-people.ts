import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

export interface UpdateVulnerablePeopleInput {
  incidentId: string;
  groupsToAdd: string[];
  informationOrigin?: InformationOrigin;
  reportId?: string | null;
  reason?: string | null;
}

export interface UpdateVulnerablePeopleResult {
  updated: boolean;
  previousGroups: string[];
  addedGroups: string[];
  newGroups: string[];
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord | null;
}

/**
 * Adds explicitly reported vulnerable groups to `incident.vulnerable_people` without
 * overwriting existing groups or creating case-insensitive duplicates.
 */
export async function updateIncidentVulnerablePeople(
  input: UpdateVulnerablePeopleInput
): Promise<UpdateVulnerablePeopleResult> {
  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for vulnerable people update: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousGroups = [...(incident.vulnerable_people ?? [])];
  const existingLowerSet = new Set(
    previousGroups.map((g) => g.trim().toLowerCase())
  );

  const addedGroups: string[] = [];
  for (const rawGroup of input.groupsToAdd ?? []) {
    const cleaned = rawGroup.trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (!existingLowerSet.has(lower)) {
      existingLowerSet.add(lower);
      addedGroups.push(cleaned);
    }
  }

  if (addedGroups.length === 0) {
    return {
      updated: false,
      previousGroups,
      addedGroups: [],
      newGroups: previousGroups,
      incident,
      timelineEntry: null,
    };
  }

  const newGroups = [...previousGroups, ...addedGroups];
  const origin: InformationOrigin = input.informationOrigin ?? "operator";

  const summary = `Vulnerable groups updated on ${
    incident.incident_code
  }: added ${addedGroups.join(", ")} (total: ${newGroups.join(", ")}).`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      vulnerable_people: newGroups,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to update vulnerable_people on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "vulnerable_people_update",
    previousStatus: incident.status,
    newStatus: incident.status,
    informationOrigin: origin,
    summary,
    details: {
      previous_vulnerable_people: previousGroups,
      added_vulnerable_people: addedGroups,
      new_vulnerable_people: newGroups,
      report_id: input.reportId ?? null,
      reason: input.reason ?? "Explicitly reported vulnerable groups added",
    },
  });

  return {
    updated: true,
    previousGroups,
    addedGroups,
    newGroups,
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
