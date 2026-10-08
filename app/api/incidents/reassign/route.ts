import { NextRequest, NextResponse } from "next/server";
import { reassignReportToIncident } from "@/lib/incident-operations/reassign-report";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : "";
    const targetIncidentId =
      typeof body.targetIncidentId === "string"
        ? body.targetIncidentId.trim()
        : "";

    if (!reportId || !targetIncidentId) {
      return NextResponse.json(
        {
          error: "Both 'reportId' and 'targetIncidentId' are required.",
        },
        { status: 400 }
      );
    }

    const result = await reassignReportToIncident({
      reportId,
      targetIncidentId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reassign report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
