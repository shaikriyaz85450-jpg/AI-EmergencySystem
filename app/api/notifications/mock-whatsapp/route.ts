import { NextRequest, NextResponse } from "next/server";
import { NotificationValidationError } from "@/lib/notifications/create-notification";
import { sendMockWhatsAppNotification } from "@/lib/notifications/mock-whatsapp";

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
        { error: "incidentId is required for Mock WhatsApp notification." },
        { status: 400 },
      );
    }

    const reportId =
      typeof body.reportId === "string"
        ? body.reportId.trim()
        : typeof body.report_id === "string"
        ? body.report_id.trim()
        : null;

    const recipient =
      typeof body.recipient === "string" ? body.recipient.trim() : null;

    const customMessage =
      typeof body.message === "string"
        ? body.message.trim()
        : typeof body.customMessage === "string"
        ? body.customMessage.trim()
        : null;

    const result = await sendMockWhatsAppNotification({
      incidentId,
      reportId,
      recipient,
      customMessage,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof NotificationValidationError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    const message =
      err instanceof Error
        ? err.message
        : "Failed to create Mock WhatsApp notification.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
