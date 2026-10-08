import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  formatReportForDisplay,
  processAndStoreReport,
} from "@/lib/report-processing/process-report";
import type { IncidentRecord, ReportRecord } from "@/types/database";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const [
      { data: reportsData, error: repError },
      { data: incidentsData, error: incError },
    ] = await Promise.all([
      supabase
        .from("reports")
        .select("*")
        .order("reported_at", { ascending: false }),
      supabase.from("incidents").select("id, incident_code"),
    ]);

    if (repError) {
      return NextResponse.json(
        { error: repError.message },
        { status: 500 }
      );
    }
    if (incError) {
      return NextResponse.json(
        { error: incError.message },
        { status: 500 }
      );
    }

    const rows = (reportsData ?? []) as ReportRecord[];
    const incidentCodeMap = new Map<string, string>();
    for (const inc of (incidentsData ?? []) as Pick<
      IncidentRecord,
      "id" | "incident_code"
    >[]) {
      incidentCodeMap.set(inc.id, inc.incident_code);
    }

    return NextResponse.json({
      count: rows.length,
      reports: rows,
      display_reports: rows.map((r) =>
        formatReportForDisplay(r, incidentCodeMap)
      ),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sourceChannel =
      typeof body.source_channel === "string" ? body.source_channel : "";
    const rawContent =
      typeof body.raw_content === "string" ? body.raw_content : "";
    const reporterIdentifier =
      typeof body.reporter_identifier === "string"
        ? body.reporter_identifier
        : null;

    if (!sourceChannel.trim() || !rawContent.trim()) {
      return NextResponse.json(
        {
          error:
            "Both 'source_channel' and non-empty 'raw_content' are required.",
        },
        { status: 400 }
      );
    }

    const result = await processAndStoreReport({
      source_channel: sourceChannel,
      raw_content: rawContent,
      reporter_identifier: reporterIdentifier,
    });

    return NextResponse.json(
      {
        success: true,
        processing_mode: result.processing_mode,
        report: result.report,
        extracted: result.display,
      },
      { status: 201 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process report.";
    const isValidationError =
      message.startsWith("Invalid source_channel") ||
      message.includes("raw_content must be");
    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
