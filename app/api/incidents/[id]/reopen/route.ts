import { NextRequest, NextResponse } from "next/server";
import { reopenResolvedIncident } from "@/lib/incident-memory/reopen-incident";
import type { InformationOrigin } from "@/types/database";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: incidentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    const informationOrigin: InformationOrigin =
      body.informationOrigin === "responder_confirmed" ||
      body.informationOrigin === "ai_extracted"
        ? body.informationOrigin
        : "operator";

    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : null;

    const result = await reopenResolvedIncident({
      incidentId,
      reason,
      informationOrigin,
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
      err instanceof Error ? err.message : "Failed to reopen incident.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
