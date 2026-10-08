import { createNotification, verifyIncidentExists } from "./create-notification";
import {
  type EnrichedNotificationRecord,
  getDisplayNotificationTypeLabel,
  type MockChannelNotificationInput,
  type MockChannelNotificationResponse,
} from "./notification-types";

export async function sendMockWhatsAppNotification(
  input: MockChannelNotificationInput,
): Promise<MockChannelNotificationResponse> {
  const incident = await verifyIncidentExists(input.incidentId);
  const locationLabel =
    incident.canonical_landmark ?? incident.location_text ?? incident.area ?? "affected area";

  const title = `[MOCK WHATSAPP] Emergency Alert — ${incident.incident_code}`;
  const defaultMessage = `Emergency Alert: ${incident.incident_type} reported near ${locationLabel}. Status: ${incident.status} (${incident.urgency} urgency). Please avoid the affected area and follow responder instructions.`;
  const message =
    input.customMessage && input.customMessage.trim().length > 0
      ? input.customMessage.trim()
      : defaultMessage;

  const { notification } = await createNotification({
    incidentId: incident.id,
    reportId: input.reportId ?? null,
    channel: "whatsapp",
    notificationType: "mock_whatsapp",
    recipient: input.recipient?.trim() || "SIMULATED_MOCK_WHATSAPP (+91-SIMULATED)",
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
    channel: "whatsapp",
    simulated: true,
    notificationId: notification.id,
    notification: enriched,
  };
}
