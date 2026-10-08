import { createNotification, verifyIncidentExists } from "./create-notification";
import {
  type EnrichedNotificationRecord,
  getDisplayNotificationTypeLabel,
  type MockChannelNotificationInput,
  type MockChannelNotificationResponse,
} from "./notification-types";

export async function sendMockSmsNotification(
  input: MockChannelNotificationInput,
): Promise<MockChannelNotificationResponse> {
  const incident = await verifyIncidentExists(input.incidentId);
  const locationLabel =
    incident.canonical_landmark ?? incident.location_text ?? incident.area ?? "affected area";

  const title = `[MOCK SMS] Emergency Dispatch — ${incident.incident_code}`;
  const defaultMessage = `Emergency Alert: ${incident.incident_type} reported near ${locationLabel}. Urgency: ${incident.urgency}. Please avoid the affected area.`;
  const message =
    input.customMessage && input.customMessage.trim().length > 0
      ? input.customMessage.trim()
      : defaultMessage;

  const { notification } = await createNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    channel: "sms",
    notificationType: "mock_sms",
    recipient: input.recipient?.trim() || "SIMULATED_MOCK_SMS (+91-SIMULATED)",
    title,
    message,
    followUpCallsAvoided: 0,
    allowDuplicate: true,
  });

  const enriched: EnrichedNotificationRecord = {
    ...notification,
    incident_code: incident.incident_code,
    incident_title: incident.title,
    incident_status: incident.status,
    incident_urgency: incident.urgency,
    simulated: true,
    display_type_label: getDisplayNotificationTypeLabel(notification),
  };

  return {
    success: true,
    channel: "sms",
    simulated: true,
    notificationId: notification.id,
    notification: enriched,
  };
}
