import { NextRequest, NextResponse } from "next/server";
import { updateIncidentMemory } from "@/lib/incident-memory/update-incident-memory";
import type { InformationOrigin, UrgencyLevel } from "@/types/database";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: incidentId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const rawPeopleCount =
      body.explicitPeopleCount !== undefined
        ? body.explicitPeopleCount
        : body.peopleAffectedCount;

    const explicitPeopleCount =
      rawPeopleCount === null
        ? null
        : typeof rawPeopleCount === "number"
        ? rawPeopleCount
        : undefined;

    const peopleDescription =
      typeof body.peopleDescription === "string"
        ? body.peopleDescription
        : undefined;

    const isUnverifiedRumor = Boolean(body.isUnverifiedRumor);

    const rawVuln = Array.isArray(body.vulnerableGroupsToAdd)
      ? body.vulnerableGroupsToAdd
      : Array.isArray(body.vulnerableGroups)
      ? body.vulnerableGroups
      : undefined;

    const vulnerableGroupsToAdd = rawVuln
      ? rawVuln.filter((g): g is string => typeof g === "string")
      : undefined;

    const rawRes = Array.isArray(body.resourcesToAdd)
      ? body.resourcesToAdd
      : Array.isArray(body.resourcesNeeded)
      ? body.resourcesNeeded
      : undefined;

    const resourcesToAdd = rawRes
      ? rawRes.filter((r): r is string => typeof r === "string")
      : undefined;

    const rawUrgency =
      typeof body.newUrgency === "string"
        ? body.newUrgency
        : typeof body.urgency === "string"
        ? body.urgency
        : undefined;

    const newUrgency =
      rawUrgency && rawUrgency.trim().length > 0
        ? (rawUrgency.trim() as UrgencyLevel)
        : undefined;

    const allowOperatorUrgencyDowngrade = Boolean(
      body.allowOperatorUrgencyDowngrade
    );

    const informationOrigin: InformationOrigin =
      body.informationOrigin === "responder_confirmed" ||
      body.informationOrigin === "ai_extracted"
        ? body.informationOrigin
        : "operator";

    const reportId =
      typeof body.reportId === "string" ? body.reportId.trim() : null;

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : null;

    const result = await updateIncidentMemory({
      incidentId,
      explicitPeopleCount,
      peopleDescription,
      isUnverifiedRumor,
      vulnerableGroupsToAdd,
      resourcesToAdd,
      newUrgency,
      allowOperatorUrgencyDowngrade,
      informationOrigin,
      reportId,
      reason,
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
      err instanceof Error ? err.message : "Failed to update incident memory.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
