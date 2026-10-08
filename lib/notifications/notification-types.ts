import type {
  NotificationChannel,
  NotificationRecord,
  NotificationType,
} from "@/types/database";

export type { NotificationChannel, NotificationRecord, NotificationType };

/**
 * Logical notification event types accepted by callers/API requests.
 * These are mapped cleanly onto the 8 database-constrained NotificationType values
 * in `public.notifications.notification_type`.
 */
export type LogicalNotificationType =
  | NotificationType
  | "incident_created"
  | "rescue_started"
  | "evidence_update"
  | "mock_whatsapp"
  | "mock_sms"
  | "follow_up_call_avoided";

export const VALID_DB_NOTIFICATION_TYPES: readonly NotificationType[] = [
  "new_incident",
  "incident_escalated",
  "rescue_in_progress",
  "resolution_pending",
  "incident_resolved",
  "incident_reopened",
  "possible_match",
  "status_update",
] as const;

export const VALID_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "in_app",
  "whatsapp",
  "sms",
] as const;

export interface EnrichedNotificationRecord extends NotificationRecord {
  incident_code: string;
  incident_title: string;
  incident_status: string;
  incident_urgency: string;
  simulated: boolean;
  display_type_label: string;
}

export interface CreateNotificationInput {
  incidentId: string;
  reportId?: string | null;
  channel?: NotificationChannel;
  notificationType: LogicalNotificationType | string;
  recipient?: string | null;
  title: string;
  message: string;
  followUpCallsAvoided?: number;
  allowDuplicate?: boolean;
}

export interface CreateNotificationResult {
  notification: NotificationRecord;
  deduplicated: boolean;
}

export interface MockChannelNotificationInput {
  incidentId: string;
  reportId?: string | null;
  recipient?: string | null;
  customMessage?: string | null;
}

export interface MockChannelNotificationResponse {
  success: true;
  channel: "whatsapp" | "sms";
  simulated: true;
  notificationId: string;
  notification: EnrichedNotificationRecord;
}

/**
 * Maps any logical or caller-supplied notification type into one of the 8 valid
 * `public.notifications.notification_type` values enforced by PostgreSQL CHECK constraint.
 */
export function resolveDbNotificationType(
  rawType: string | null | undefined,
): NotificationType {
  const normalized = (rawType ?? "").trim().toLowerCase();

  switch (normalized) {
    case "new_incident":
    case "incident_created":
      return "new_incident";
    case "incident_escalated":
      return "incident_escalated";
    case "rescue_in_progress":
    case "rescue_started":
      return "rescue_in_progress";
    case "resolution_pending":
      return "resolution_pending";
    case "incident_resolved":
      return "incident_resolved";
    case "incident_reopened":
      return "incident_reopened";
    case "possible_match":
      return "possible_match";
    case "status_update":
    case "evidence_update":
    case "mock_whatsapp":
    case "mock_sms":
    case "follow_up_call_avoided":
      return "status_update";
    default:
      throw new Error(
        `Invalid notification_type "${rawType}". Supported types: ${VALID_DB_NOTIFICATION_TYPES.join(", ")}`,
      );
  }
}

export function isValidNotificationChannel(
  channel: unknown,
): channel is NotificationChannel {
  return (
    typeof channel === "string" &&
    (VALID_NOTIFICATION_CHANNELS as readonly string[]).includes(channel)
  );
}

export function getDisplayNotificationTypeLabel(
  row: Pick<
    NotificationRecord,
    "notification_type" | "channel" | "recipient" | "follow_up_calls_avoided"
  >,
): string {
  if (row.channel === "whatsapp") {
    return "MOCK WHATSAPP";
  }
  if (row.channel === "sms") {
    return "MOCK SMS";
  }
  if (
    row.follow_up_calls_avoided > 0 ||
    row.recipient === "OPERATOR_FOLLOW_UP_AVOIDED"
  ) {
    return "FOLLOW-UP AVOIDED";
  }
  switch (row.notification_type) {
    case "new_incident":
      return "NEW INCIDENT";
    case "incident_escalated":
      return "INCIDENT ESCALATED";
    case "rescue_in_progress":
      return "RESCUE IN PROGRESS";
    case "resolution_pending":
      return "RESOLUTION PENDING";
    case "incident_resolved":
      return "INCIDENT RESOLVED";
    case "incident_reopened":
      return "INCIDENT REOPENED";
    case "possible_match":
      return "POSSIBLE MATCH";
    case "status_update":
      return row.recipient === "EVIDENCE_UPDATE"
        ? "EVIDENCE UPDATE"
        : "STATUS UPDATE";
    default:
      return String(row.notification_type).toUpperCase();
  }
}
