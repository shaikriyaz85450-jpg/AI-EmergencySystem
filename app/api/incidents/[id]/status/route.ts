import { NextRequest, NextResponse } from "next/server";
import { transitionIncidentStatus } from "@/lib/incident-memory/transition-status";
import type { IncidentStatus, InformationOrigin } from "@/types/database";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: incidentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const newStatus =
      typeof body.newStatus === "string"
        ? (body.newStatus.trim() as IncidentStatus)
        : ("" as IncidentStatus);

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : null;

    const informationOrigin: InformationOrigin =
      body.informationOrigin === "responder_confirmed" ||
      body.informationOrigin === "ai_extracted"
        ? body.informationOrigin
        : "operator";

    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : null;

    if (!incidentId || !newStatus) {
      return NextResponse.json(
        { error: "Both incident ID and 'newStatus' are required." },
        { status: 400 }
      );
    }

    const result = await transitionIncidentStatus({
      incidentId,
      newStatus,
      informationOrigin,
      reason,
      reportId,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to transition status.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
