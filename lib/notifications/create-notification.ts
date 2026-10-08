import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IncidentRecord, NotificationRecord } from "@/types/database";
import {
  type CreateNotificationInput,
  type CreateNotificationResult,
  isValidNotificationChannel,
  resolveDbNotificationType,
} from "./notification-types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class NotificationValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "NotificationValidationError";
    this.statusCode = statusCode;
  }
}

export async function verifyIncidentExists(
  incidentIdOrCode: string,
): Promise<IncidentRecord> {
  const trimmed = (incidentIdOrCode ?? "").trim();
  if (!trimmed) {
    throw new NotificationValidationError("incidentId is required.", 400);
  }

  const supabase = createSupabaseServerClient();
  const isUuid = UUID_REGEX.test(trimmed);

  const query = supabase.from("incidents").select("*");
  const { data, error } = isUuid
    ? await query.eq("id", trimmed).maybeSingle()
    : await query.eq("incident_code", trimmed).maybeSingle();

  if (error) {
    throw new NotificationValidationError(
      `Database error verifying incident: ${error.message}`,
      500,
    );
  }

  if (!data) {
    throw new NotificationValidationError(
      `Incident "${trimmed}" was not found in public.incidents.`,
      404,
    );
  }

  return data as IncidentRecord;
}

/**
 * Validates and inserts a notification into `public.notifications`.
 * Never modifies incident status or triggers resolution.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const incident = await verifyIncidentExists(input.incidentId);

  const channel = input.channel ?? "in_app";
  if (!isValidNotificationChannel(channel)) {
    throw new NotificationValidationError(
      `Invalid notification channel "${String(input.channel)}". Allowed channels: in_app, whatsapp, sms.`,
      400,
    );
  }

  let dbNotificationType: ReturnType<typeof resolveDbNotificationType>;
  try {
    dbNotificationType = resolveDbNotificationType(input.notificationType);
  } catch (err) {
    throw new NotificationValidationError(
      err instanceof Error ? err.message : "Invalid notificationType.",
      400,
    );
  }

  const title = (input.title ?? "").trim();
  const message = (input.message ?? "").trim();

  if (!title) {
    throw new NotificationValidationError(
      "Notification title must not be empty.",
      400,
    );
  }

  if (!message) {
    throw new NotificationValidationError(
      "Notification message must not be empty.",
      400,
    );
  }

  const followUpCallsAvoided =
    input.followUpCallsAvoided !== undefined ? input.followUpCallsAvoided : 0;

  if (
    typeof followUpCallsAvoided !== "number" ||
    !Number.isInteger(followUpCallsAvoided) ||
    followUpCallsAvoided < 0
  ) {
    throw new NotificationValidationError(
      "followUpCallsAvoided must be a non-negative integer.",
      400,
    );
  }

  let reportId: string | null = null;
  if (input.reportId) {
    const trimmedReportId = input.reportId.trim();
    if (!UUID_REGEX.test(trimmedReportId)) {
      throw new NotificationValidationError(
        `Invalid reportId UUID "${trimmedReportId}".`,
        400,
      );
    }
    reportId = trimmedReportId;
  }

  const recipient = input.recipient ? input.recipient.trim() : null;
  const supabase = createSupabaseServerClient();

  // Idempotency protection:
  // 1) If recording follow_up_calls_avoided > 0, prevent duplicate counting for the same
  //    incident + report_id (or same incident + recipient + title/message when report_id is null).
  if (!input.allowDuplicate && followUpCallsAvoided > 0) {
    let existingQuery = supabase
      .from("notifications")
      .select("*")
      .eq("incident_id", incident.id)
      .gt("follow_up_calls_avoided", 0);

    if (reportId) {
      existingQuery = existingQuery.eq("report_id", reportId);
    } else if (recipient) {
      existingQuery = existingQuery
        .eq("recipient", recipient)
        .eq("message", message);
    } else {
      existingQuery = existingQuery.eq("title", title).eq("message", message);
    }

    const { data: existingRows } = await existingQuery
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      return {
        notification: existingRows[0] as NotificationRecord,
        deduplicated: true,
      };
    }
  }

  // 2) For standard notifications, avoid duplicate identical notification creation within 30 seconds
  if (!input.allowDuplicate && followUpCallsAvoided === 0) {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from("notifications")
      .select("*")
      .eq("incident_id", incident.id)
      .eq("channel", channel)
      .eq("notification_type", dbNotificationType)
      .eq("title", title)
      .eq("message", message)
      .gte("created_at", thirtySecondsAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentDuplicate && recentDuplicate.length > 0) {
      return {
        notification: recentDuplicate[0] as NotificationRecord,
        deduplicated: true,
      };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("notifications")
    .insert({
      incident_id: incident.id,
      report_id: reportId,
      channel,
      notification_type: dbNotificationType,
      recipient,
      title,
      message,
      follow_up_calls_avoided: followUpCallsAvoided,
      is_read: false,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new NotificationValidationError(
      `Failed to insert notification: ${insertError?.message ?? "Unknown error"}`,
      500,
    );
  }

  return {
    notification: inserted as NotificationRecord,
    deduplicated: false,
  };
}
