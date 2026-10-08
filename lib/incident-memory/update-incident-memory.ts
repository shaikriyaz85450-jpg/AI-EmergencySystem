import type {
  IncidentRecord,
  IncidentUpdateRecord,
  InformationOrigin,
  UrgencyLevel,
} from "@/types/database";
import {
  updateIncidentPeopleCount,
  type UpdatePeopleCountResult,
} from "./update-people-count";
import {
  updateIncidentResources,
  type UpdateResourcesResult,
} from "./update-resources";
import {
  updateIncidentUrgency,
  type UpdateUrgencyResult,
} from "./update-urgency";
import {
  updateIncidentVulnerablePeople,
  type UpdateVulnerablePeopleResult,
} from "./update-vulnerable-people";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface UpdateIncidentMemoryInput {
  incidentId: string;
  explicitPeopleCount?: number | null;
  peopleDescription?: string | null;
  isUnverifiedRumor?: boolean;
  vulnerableGroupsToAdd?: string[];
  resourcesToAdd?: string[];
  newUrgency?: UrgencyLevel;
  allowOperatorUrgencyDowngrade?: boolean;
  informationOrigin?: InformationOrigin;
  reportId?: string | null;
  reason?: string | null;
}

export interface UpdateIncidentMemoryResult {
  incident: IncidentRecord;
  timelineEntries: IncidentUpdateRecord[];
  changes: {
    peopleCount?: UpdatePeopleCountResult;
    vulnerablePeople?: UpdateVulnerablePeopleResult;
    resources?: UpdateResourcesResult;
    urgency?: UpdateUrgencyResult;
  };
}

/**
 * Centralized Incident Memory orchestrator (Part 12):
 * Applies any combination of explicit people count updates, vulnerable people additions,
 * resource additions, and controlled urgency updates, recording distinct append-only
 * timeline entries for each meaningful change.
 */
export async function updateIncidentMemory(
  input: UpdateIncidentMemoryInput
): Promise<UpdateIncidentMemoryResult> {
  const timelineEntries: IncidentUpdateRecord[] = [];
  const changes: UpdateIncidentMemoryResult["changes"] = {};
  let latestIncident: IncidentRecord | null = null;

  // 1. People Count Update
  if (
    input.explicitPeopleCount !== undefined ||
    input.peopleDescription !== undefined
  ) {
    const countRes = await updateIncidentPeopleCount({
      incidentId: input.incidentId,
      explicitCount: input.explicitPeopleCount ?? null,
      description: input.peopleDescription ?? null,
      informationOrigin: input.informationOrigin,
      isUnverifiedRumor: input.isUnverifiedRumor,
      reportId: input.reportId,
      reason: input.reason,
    });
    changes.peopleCount = countRes;
    latestIncident = countRes.incident;
    if (countRes.timelineEntry) {
      timelineEntries.push(countRes.timelineEntry);
    }
  }

  // 2. Vulnerable People Update
  if (
    Array.isArray(input.vulnerableGroupsToAdd) &&
    input.vulnerableGroupsToAdd.length > 0
  ) {
    const vulnRes = await updateIncidentVulnerablePeople({
      incidentId: input.incidentId,
      groupsToAdd: input.vulnerableGroupsToAdd,
      informationOrigin: input.informationOrigin,
      reportId: input.reportId,
      reason: input.reason,
    });
    changes.vulnerablePeople = vulnRes;
    latestIncident = vulnRes.incident;
    if (vulnRes.timelineEntry) {
      timelineEntries.push(vulnRes.timelineEntry);
    }
  }

  // 3. Resources Needed Update
  if (
    Array.isArray(input.resourcesToAdd) &&
    input.resourcesToAdd.length > 0
  ) {
    const resUpdate = await updateIncidentResources({
      incidentId: input.incidentId,
      resourcesToAdd: input.resourcesToAdd,
      informationOrigin: input.informationOrigin,
      reportId: input.reportId,
      reason: input.reason,
    });
    changes.resources = resUpdate;
    latestIncident = resUpdate.incident;
    if (resUpdate.timelineEntry) {
      timelineEntries.push(resUpdate.timelineEntry);
    }
  }

  // 4. Urgency Update
  if (input.newUrgency !== undefined) {
    const urgRes = await updateIncidentUrgency({
      incidentId: input.incidentId,
      newUrgency: input.newUrgency,
      informationOrigin: input.informationOrigin,
      allowOperatorDowngrade: input.allowOperatorUrgencyDowngrade,
      reportId: input.reportId,
      reason: input.reason,
    });
    changes.urgency = urgRes;
    latestIncident = urgRes.incident;
    if (urgRes.timelineEntry) {
      timelineEntries.push(urgRes.timelineEntry);
    }
  }

  if (!latestIncident) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .eq("id", input.incidentId)
      .single();
    if (error || !data) {
      throw new Error(`Incident not found: ${input.incidentId}`);
    }
    latestIncident = data as IncidentRecord;
  }

  return {
    incident: latestIncident,
    timelineEntries,
    changes,
  };
}
