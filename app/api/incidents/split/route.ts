import { NextRequest, NextResponse } from "next/server";
import { splitIncidentReports } from "@/lib/incident-operations/split-incident";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const incidentId =
      typeof body.incidentId === "string" ? body.incidentId.trim() : "";
    const reportIds = Array.isArray(body.reportIds)
      ? body.reportIds.filter((id): id is string => typeof id === "string")
      : [];

    if (!incidentId || reportIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Both 'incidentId' and a non-empty 'reportIds' array are required.",
        },
        { status: 400 }
      );
    }

    const result = await splitIncidentReports({
      incidentId,
      reportIds,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to split incident.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
