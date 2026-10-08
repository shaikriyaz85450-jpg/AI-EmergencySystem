import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
} from "@/types/database";
import { appendIncidentTimelineEntry } from "./timeline";

export interface UpdateResourcesInput {
  incidentId: string;
  resourcesToAdd: string[];
  informationOrigin?: InformationOrigin;
  reportId?: string | null;
  reason?: string | null;
}

export interface UpdateResourcesResult {
  updated: boolean;
  previousResources: string[];
  addedResources: string[];
  newResources: string[];
  incident: IncidentRecord;
  timelineEntry: IncidentUpdateRecord | null;
}

/**
 * Adds explicitly requested/extracted resources to `incident.resources_needed`
 * while preserving existing resources and preventing duplicates.
 */
export async function updateIncidentResources(
  input: UpdateResourcesInput
): Promise<UpdateResourcesResult> {
  const supabase = createSupabaseServerClient();

  const { data: incData, error: incErr } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", input.incidentId)
    .maybeSingle();

  if (incErr || !incData) {
    throw new Error(
      `Incident not found for resources update: ${
        incErr?.message ?? input.incidentId
      }`
    );
  }

  const incident = incData as IncidentRecord;
  const previousResources = [...(incident.resources_needed ?? [])];
  const existingLowerSet = new Set(
    previousResources.map((r) => r.trim().toLowerCase())
  );

  const addedResources: string[] = [];
  for (const rawRes of input.resourcesToAdd ?? []) {
    const cleaned = rawRes.trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (!existingLowerSet.has(lower)) {
      existingLowerSet.add(lower);
      addedResources.push(cleaned);
    }
  }

  if (addedResources.length === 0) {
    return {
      updated: false,
      previousResources,
      addedResources: [],
      newResources: previousResources,
      incident,
      timelineEntry: null,
    };
  }

  const newResources = [...previousResources, ...addedResources];
  const origin: InformationOrigin = input.informationOrigin ?? "operator";

  const summary = `Resources needed updated on ${
    incident.incident_code
  }: added ${addedResources.join(", ")} (total: ${newResources.join(", ")}).`;

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update({
      resources_needed: newResources,
      latest_update_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to update resources_needed on ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  const timelineEntry = await appendIncidentTimelineEntry({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    updateType: "resource_update",
    previousStatus: incident.status,
    newStatus: incident.status,
    informationOrigin: origin,
    summary,
    details: {
      previous_resources: previousResources,
      added_resources: addedResources,
      new_resources: newResources,
      report_id: input.reportId ?? null,
      reason: input.reason ?? "Explicitly requested resources added",
    },
  });

  return {
    updated: true,
    previousResources,
    addedResources,
    newResources,
    incident: updatedData as IncidentRecord,
    timelineEntry,
  };
}
