import { NextRequest, NextResponse } from "next/server";
import { NotificationValidationError } from "@/lib/notifications/create-notification";
import { markNotificationRead } from "@/lib/notifications/notification-service";

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const updated = await markNotificationRead(id);

    return NextResponse.json(
      {
        success: true,
        notificationId: updated.id,
        is_read: updated.is_read,
        notification: updated,
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
      err instanceof Error
        ? err.message
        : "Failed to mark notification as read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}
