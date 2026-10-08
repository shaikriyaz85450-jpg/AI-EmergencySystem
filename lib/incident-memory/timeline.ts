import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentStatus,
  IncidentUpdateRecord,
  IncidentUpdateType,
  InformationOrigin,
} from "@/types/database";

export interface CreateTimelineEntryInput {
  incidentId: string;
  reportId?: string | null;
  updateType: IncidentUpdateType;
  previousStatus?: IncidentStatus | null;
  newStatus?: IncidentStatus | null;
  informationOrigin?: InformationOrigin;
  summary: string;
  details?: Record<string, unknown> | null;
}

/**
 * Writes an append-only timeline entry to `public.incident_updates`.
 * Historical timeline records are never modified or deleted.
 */
export async function appendIncidentTimelineEntry(
  input: CreateTimelineEntryInput
): Promise<IncidentUpdateRecord> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("incident_updates")
    .insert({
      incident_id: input.incidentId,
      report_id: input.reportId ?? null,
      update_type: input.updateType,
      previous_status: input.previousStatus ?? null,
      new_status: input.newStatus ?? null,
      information_origin: input.informationOrigin ?? "operator",
      summary: input.summary,
      details: input.details ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to append incident timeline entry: ${
        error?.message ?? "Unknown error"
      }`
    );
  }

  return data as IncidentUpdateRecord;
}
