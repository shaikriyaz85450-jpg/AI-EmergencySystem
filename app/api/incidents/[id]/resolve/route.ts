import { NextRequest, NextResponse } from "next/server";
import {
  confirmIncidentResolution,
  markIncidentResolutionPending,
} from "@/lib/incident-memory/resolve-incident";
import type { InformationOrigin } from "@/types/database";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: incidentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const mode =
      body.mode === "pending" || body.resolutionPending === true
        ? "pending"
        : "confirm";

    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : null;

    if (mode === "pending") {
      const evidenceNote =
        typeof body.evidenceNote === "string"
          ? body.evidenceNote.trim()
          : typeof body.resolutionNotes === "string"
          ? body.resolutionNotes.trim()
          : "";

      const informationOrigin: InformationOrigin =
        body.informationOrigin === "responder_confirmed" ||
        body.informationOrigin === "operator"
          ? body.informationOrigin
          : "ai_extracted";

      const result = await markIncidentResolutionPending({
        incidentId,
        evidenceNote,
        informationOrigin,
        reportId,
      });

      return NextResponse.json(
        {
          success: true,
          mode: "pending",
          ...result,
        },
        { status: 200 }
      );
    }

    // Mode === "confirm": Final Resolved status requires explicit operator or responder_confirmed
    const confirmedByRaw =
      typeof body.confirmedBy === "string"
        ? body.confirmedBy.trim()
        : typeof body.informationOrigin === "string"
        ? body.informationOrigin.trim()
        : "operator";

    if (
      confirmedByRaw !== "operator" &&
      confirmedByRaw !== "responder_confirmed"
    ) {
      return NextResponse.json(
        {
          error:
            "AI cannot resolve an incident. Final resolution requires explicit 'operator' or 'responder_confirmed' confirmation.",
        },
        { status: 400 }
      );
    }

    const resolutionNotes =
      typeof body.resolutionNotes === "string"
        ? body.resolutionNotes.trim()
        : "";

    const result = await confirmIncidentResolution({
      incidentId,
      confirmedBy: confirmedByRaw,
      resolutionNotes,
      reportId,
    });

    return NextResponse.json(
      {
        success: true,
        mode: "confirmed",
        ...result,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process resolution.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
