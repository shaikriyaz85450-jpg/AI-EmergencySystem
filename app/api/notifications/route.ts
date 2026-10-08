import { NextRequest, NextResponse } from "next/server";
import {
  createNotification,
  NotificationValidationError,
  verifyIncidentExists,
} from "@/lib/notifications/create-notification";
import {
  listNotifications,
  recordFollowUpCallAvoided,
} from "@/lib/notifications/notification-service";
import {
  getDisplayNotificationTypeLabel,
  isValidNotificationChannel,
  type NotificationChannel,
} from "@/lib/notifications/notification-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const incidentId = searchParams.get("incidentId")?.trim() || undefined;
    const channelParam = searchParams.get("channel")?.trim() || undefined;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    let channel: NotificationChannel | undefined;
    if (channelParam) {
      if (!isValidNotificationChannel(channelParam)) {
        return NextResponse.json(
          {
            error: `Invalid channel filter "${channelParam}". Allowed: in_app, whatsapp, sms.`,
          },
          { status: 400 },
        );
      }
      channel = channelParam;
    }

    const result = await listNotifications({
      incidentId,
      channel,
      unreadOnly,
    });

    return NextResponse.json(
      {
        success: true,
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        followUpCallsAvoided: result.totalFollowUpCallsAvoided,
        totalCount: result.totalCount,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof NotificationValidationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to load notifications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const incidentId =
      typeof body.incidentId === "string"
        ? body.incidentId.trim()
        : typeof body.incident_id === "string"
        ? body.incident_id.trim()
        : "";

    if (!incidentId) {
      return NextResponse.json(
        { error: "incidentId is required." },
        { status: 400 },
      );
    }

    const rawNotificationType =
      typeof body.notificationType === "string"
        ? body.notificationType.trim()
        : typeof body.notification_type === "string"
        ? body.notification_type.trim()
        : "status_update";

    const rawFollowUpCount =
      typeof body.followUpCallsAvoided === "number"
        ? body.followUpCallsAvoided
        : typeof body.follow_up_calls_avoided === "number"
        ? body.follow_up_calls_avoided
        : 0;

    const reportId =
      typeof body.reportId === "string"
        ? body.reportId.trim()
        : typeof body.report_id === "string"
        ? body.report_id.trim()
        : null;

    // Dedicated idempotent path for follow-up call avoided tracking
    if (
      rawNotificationType === "follow_up_call_avoided" ||
      body.action === "follow_up_call_avoided" ||
      (rawFollowUpCount > 0 && !body.title)
    ) {
      const countToRecord = rawFollowUpCount > 0 ? rawFollowUpCount : 1;
      const reason =
        typeof body.reason === "string"
          ? body.reason.trim()
          : typeof body.message === "string"
          ? body.message.trim()
          : null;

      const recorded = await recordFollowUpCallAvoided({
        incidentId,
        reportId,
        count: countToRecord,
        reason,
      });

      return NextResponse.json(
        {
          success: true,
          notificationId: recorded.notification.id,
          notification: recorded.notification,
          deduplicated: recorded.deduplicated,
          followUpCallsAvoided: recorded.totalFollowUpCallsAvoided,
        },
        { status: recorded.deduplicated ? 200 : 201 },
      );
    }

    const incident = await verifyIncidentExists(incidentId);

    const channelRaw =
      typeof body.channel === "string" ? body.channel.trim() : "in_app";
    if (!isValidNotificationChannel(channelRaw)) {
      return NextResponse.json(
        {
          error: `Invalid channel "${channelRaw}". Allowed values: in_app, whatsapp, sms.`,
        },
        { status: 400 },
      );
    }

    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : `${incident.incident_code} — Operational Notification`;

    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "Notification message must not be empty." },
        { status: 400 },
      );
    }

    const recipient =
      typeof body.recipient === "string" && body.recipient.trim().length > 0
        ? body.recipient.trim()
        : rawNotificationType === "evidence_update"
        ? "EVIDENCE_UPDATE"
        : "OPERATIONS_DISPATCH";

    const { notification, deduplicated } = await createNotification({
      incidentId: incident.id,
      reportId,
      channel: channelRaw,
      notificationType: rawNotificationType,
      recipient,
      title,
      message,
      followUpCallsAvoided: rawFollowUpCount,
      allowDuplicate: Boolean(body.allowDuplicate),
    });

    const enriched = {
      ...notification,
      incident_code: incident.incident_code,
      incident_title: incident.title,
      incident_status: incident.status,
      incident_urgency: incident.urgency,
      simulated: channelRaw === "whatsapp" || channelRaw === "sms",
      display_type_label: getDisplayNotificationTypeLabel(notification),
    };

    return NextResponse.json(
      {
        success: true,
        notificationId: notification.id,
        notification: enriched,
        deduplicated,
      },
      { status: deduplicated ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof NotificationValidationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to create notification.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
