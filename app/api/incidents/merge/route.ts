import { NextRequest, NextResponse } from "next/server";
import { mergeIncidents } from "@/lib/incident-operations/merge-incidents";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sourceIncidentId =
      typeof body.sourceIncidentId === "string"
        ? body.sourceIncidentId.trim()
        : "";
    const targetIncidentId =
      typeof body.targetIncidentId === "string"
        ? body.targetIncidentId.trim()
        : "";

    if (!sourceIncidentId || !targetIncidentId) {
      return NextResponse.json(
        {
          error:
            "Both 'sourceIncidentId' and 'targetIncidentId' are required.",
        },
        { status: 400 }
      );
    }

    const result = await mergeIncidents({
      sourceIncidentId,
      targetIncidentId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to merge incidents.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
