import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IncidentRecord, NotificationRecord } from "@/types/database";
import {
  createNotification,
  NotificationValidationError,
  verifyIncidentExists,
} from "./create-notification";
import {
  type EnrichedNotificationRecord,
  getDisplayNotificationTypeLabel,
  type LogicalNotificationType,
  type NotificationChannel,
} from "./notification-types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListNotificationsResult {
  notifications: EnrichedNotificationRecord[];
  unreadCount: number;
  totalFollowUpCallsAvoided: number;
  totalCount: number;
}

export interface RecordFollowUpCallAvoidedInput {
  incidentId: string;
  reportId?: string | null;
  count?: number;
  reason?: string | null;
}

export interface RecordFollowUpCallAvoidedResult {
  notification: EnrichedNotificationRecord;
  deduplicated: boolean;
  totalFollowUpCallsAvoided: number;
}

function enrichNotificationRow(
  row: NotificationRecord,
  incidentMap: Map<string, IncidentRecord>,
): EnrichedNotificationRecord {
  const inc = incidentMap.get(row.incident_id);
  const simulated = row.channel === "whatsapp" || row.channel === "sms";

  return {
    ...row,
    incident_code: inc?.incident_code ?? "INC-UNKNOWN",
    incident_title: inc?.title ?? "Incident Record",
    incident_status: inc?.status ?? "Active",
    incident_urgency: inc?.urgency ?? "High",
    simulated,
    display_type_label: getDisplayNotificationTypeLabel(row),
  };
}

/**
 * Lists all notifications from `public.notifications` ordered newest first,
 * enriched with incident metadata, unread count, and total follow-up calls avoided.
 */
export async function listNotifications(options?: {
  incidentId?: string;
  channel?: NotificationChannel;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<ListNotificationsResult> {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.incidentId) {
    const incident = await verifyIncidentExists(options.incidentId);
    query = query.eq("incident_id", incident.id);
  }

  if (options?.channel) {
    query = query.eq("channel", options.channel);
  }

  if (options?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const [{ data: rows, error }, { data: allRows, error: allError }, { data: incidents }] =
    await Promise.all([
      query,
      supabase
        .from("notifications")
        .select("id, is_read, follow_up_calls_avoided"),
      supabase.from("incidents").select("*"),
    ]);

  if (error) {
    throw new NotificationValidationError(
      `Failed to fetch notifications: ${error.message}`,
      500,
    );
  }

  if (allError) {
    throw new NotificationValidationError(
      `Failed to compute notification metrics: ${allError.message}`,
      500,
    );
  }

  const incidentMap = new Map<string, IncidentRecord>();
  for (const inc of (incidents ?? []) as IncidentRecord[]) {
    incidentMap.set(inc.id, inc);
  }

  const notificationRows = (rows ?? []) as NotificationRecord[];
  const enriched = notificationRows.map((r) =>
    enrichNotificationRow(r, incidentMap),
  );

  let unreadCount = 0;
  let totalFollowUpCallsAvoided = 0;
  const globalRows = (allRows ?? []) as Array<{
    id: string;
    is_read: boolean;
    follow_up_calls_avoided: number;
  }>;

  for (const r of globalRows) {
    if (!r.is_read) {
      unreadCount += 1;
    }
    totalFollowUpCallsAvoided += Number(r.follow_up_calls_avoided ?? 0);
  }

  return {
    notifications: enriched,
    unreadCount,
    totalFollowUpCallsAvoided,
    totalCount: globalRows.length,
  };
}

/**
 * Marks a single notification as read (`is_read = true`) idempotently.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<EnrichedNotificationRecord> {
  const trimmed = (notificationId ?? "").trim();
  if (!UUID_REGEX.test(trimmed)) {
    throw new NotificationValidationError(
      `Invalid notification ID "${trimmed}". Expected a valid UUID.`,
      400,
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", trimmed)
    .maybeSingle();

  if (fetchError) {
    throw new NotificationValidationError(
      `Failed to look up notification: ${fetchError.message}`,
      500,
    );
  }

  if (!existing) {
    throw new NotificationValidationError(
      `Notification "${trimmed}" was not found.`,
      404,
    );
  }

  let updatedRow = existing as NotificationRecord;
  if (!updatedRow.is_read) {
    const { data: updated, error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", trimmed)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new NotificationValidationError(
        `Failed to mark notification as read: ${updateError?.message ?? "Unknown error"}`,
        500,
      );
    }
    updatedRow = updated as NotificationRecord;
  }

  const { data: incident } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", updatedRow.incident_id)
    .maybeSingle();

  const incidentMap = new Map<string, IncidentRecord>();
  if (incident) {
    incidentMap.set((incident as IncidentRecord).id, incident as IncidentRecord);
  }

  return enrichNotificationRow(updatedRow, incidentMap);
}

/**
 * Records an avoided follow-up call on an incident idempotently.
 * Repeated clicks with the same incident + reason (or same reportId) return the
 * existing row with `deduplicated: true` instead of inflating the counter.
 */
export async function recordFollowUpCallAvoided(
  input: RecordFollowUpCallAvoidedInput,
): Promise<RecordFollowUpCallAvoidedResult> {
  const incident = await verifyIncidentExists(input.incidentId);
  const count = input.count !== undefined ? input.count : 1;

  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    throw new NotificationValidationError(
      "Follow-up calls avoided count must be a positive integer.",
      400,
    );
  }

  const defaultReason = `Correlated multi-report context on ${incident.incident_code} (${incident.related_report_count} linked reports near ${incident.canonical_landmark ?? incident.location_text}) answered responder questions without requiring a manual follow-up phone call.`;
  const message =
    input.reason && input.reason.trim().length > 0
      ? input.reason.trim()
      : defaultReason;

  const title = `Follow-up Call Avoided — ${incident.incident_code}`;

  const { notification, deduplicated } = await createNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    channel: "in_app",
    notificationType: "follow_up_call_avoided",
    recipient: "OPERATOR_FOLLOW_UP_AVOIDED",
    title,
    message,
    followUpCallsAvoided: count,
    allowDuplicate: false,
  });

  const supabase = createSupabaseServerClient();
  const { data: allRows } = await supabase
    .from("notifications")
    .select("follow_up_calls_avoided");

  const totalFollowUpCallsAvoided = ((allRows ?? []) as Array<{
    follow_up_calls_avoided: number;
  }>).reduce((sum, r) => sum + Number(r.follow_up_calls_avoided ?? 0), 0);

  const incidentMap = new Map<string, IncidentRecord>([[incident.id, incident]]);

  return {
    notification: enrichNotificationRow(notification, incidentMap),
    deduplicated,
    totalFollowUpCallsAvoided,
  };
}

/**
 * Returns aggregate notification metrics for dashboard StatCards and badges.
 */
export async function getNotificationSummaryMetrics(): Promise<{
  totalNotifications: number;
  unreadNotifications: number;
  followUpCallsAvoided: number;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("is_read, follow_up_calls_avoided");

  if (error || !data) {
    return {
      totalNotifications: 0,
      unreadNotifications: 0,
      followUpCallsAvoided: 0,
    };
  }

  let unreadNotifications = 0;
  let followUpCallsAvoided = 0;

  for (const row of data as Array<{
    is_read: boolean;
    follow_up_calls_avoided: number;
  }>) {
    if (!row.is_read) {
      unreadNotifications += 1;
    }
    followUpCallsAvoided += Number(row.follow_up_calls_avoided ?? 0);
  }

  return {
    totalNotifications: data.length,
    unreadNotifications,
    followUpCallsAvoided,
  };
}

/**
 * Non-throwing helper to emit an in-app operational notification when a meaningful
 * incident lifecycle event occurs (e.g. escalation, rescue in progress, resolution pending,
 * confirmed resolution, reopen, or new incident creation).
 */
export async function emitLifecycleNotification(params: {
  incidentId: string;
  reportId?: string | null;
  notificationType: LogicalNotificationType;
  title: string;
  message: string;
  recipient?: string | null;
  followUpCallsAvoided?: number;
}): Promise<NotificationRecord | null> {
  try {
    const { notification } = await createNotification({
      incidentId: params.incidentId,
      reportId: params.reportId ?? null,
      channel: "in_app",
      notificationType: params.notificationType,
      recipient: params.recipient ?? "OPERATIONS_DISPATCH",
      title: params.title,
      message: params.message,
      followUpCallsAvoided: params.followUpCallsAvoided ?? 0,
      allowDuplicate: false,
    });
    return notification;
  } catch (err) {
    console.warn(
      "[notifications] Non-fatal error emitting lifecycle notification:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
