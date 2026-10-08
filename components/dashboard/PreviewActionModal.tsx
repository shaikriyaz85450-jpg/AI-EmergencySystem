"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PreviewIncident,
  PreviewIncidentStatus,
  PreviewIncidentUpdate,
  PreviewUrgencyLevel,
} from "@/lib/preview/dashboard-data";
import type { MatchBreakdown } from "@/types/database";

export type PreviewModalState =
  | { type: "incident_view"; incident: PreviewIncident }
  | { type: "update_status"; incident: PreviewIncident }
  | { type: "correlated_reports"; incident: PreviewIncident }
  | { type: "correlate_pending" }
  | { type: "export_log" }
  | { type: "new_incident" }
  | null;

interface LiveModalReport {
  id: string;
  source_channel: string;
  raw_content: string;
  classification: string;
  information_origin: string;
  incident_id: string | null;
  incident_code: string | null;
  is_unverified_evidence: boolean;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
  reported_at: string;
}

interface PreviewActionModalProps {
  modalState: PreviewModalState;
  onClose: () => void;
  onOperationSuccess?: () => void;
}

type OperatorTab = "overview" | "memory" | "merge" | "split" | "reassign";

const URGENCY_RANK: Record<PreviewUrgencyLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export function PreviewActionModal({
  modalState,
  onClose,
  onOperationSuccess,
}: PreviewActionModalProps) {
  const [allIncidents, setAllIncidents] = useState<PreviewIncident[]>([]);
  const [liveReports, setLiveReports] = useState<LiveModalReport[]>([]);
  const [liveUpdates, setLiveUpdates] = useState<PreviewIncidentUpdate[]>([]);
  const [activeIncident, setActiveIncident] = useState<PreviewIncident | null>(
    null
  );

  // Operator controls state
  const [activeTab, setActiveTab] = useState<OperatorTab>("overview");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Phase 7 — Status, Resolution & Reopen state
  const [statusReason, setStatusReason] = useState<string>("");
  const [resolutionPendingNote, setResolutionPendingNote] =
    useState<string>("");
  const [resolutionConfirmedBy, setResolutionConfirmedBy] = useState<
    "operator" | "responder_confirmed"
  >("operator");
  const [resolutionNotesInput, setResolutionNotesInput] = useState<string>("");
  const [reopenReasonInput, setReopenReasonInput] = useState<string>("");

  // Phase 7 — Incident Memory (Count, Vulnerable People, Resources, Urgency) state
  const [newExplicitPeopleCount, setNewExplicitPeopleCount] =
    useState<string>("");
  const [newVulnerableGroup, setNewVulnerableGroup] = useState<string>("");
  const [newResourceItem, setNewResourceItem] = useState<string>("");
  const [targetUrgency, setTargetUrgency] =
    useState<PreviewUrgencyLevel>("High");
  const [memoryUpdateReason, setMemoryUpdateReason] = useState<string>("");
  const [allowUrgencyDowngrade, setAllowUrgencyDowngrade] =
    useState<boolean>(false);

  // Phase 6 — Merge state
  const [mergePartnerId, setMergePartnerId] = useState<string>("");
  const [mergeDirection, setMergeDirection] = useState<
    "current_survives" | "partner_survives"
  >("current_survives");
  const [confirmMergeChecked, setConfirmMergeChecked] =
    useState<boolean>(false);

  // Phase 6 — Split state
  const [selectedSplitReportIds, setSelectedSplitReportIds] = useState<
    string[]
  >([]);
  const [confirmSplitChecked, setConfirmSplitChecked] =
    useState<boolean>(false);

  // Phase 6 — Reassign state
  const [reassignReportId, setReassignReportId] = useState<string>("");
  const [reassignTargetIncidentId, setReassignTargetIncidentId] =
    useState<string>("");
  const [confirmReassignChecked, setConfirmReassignChecked] =
    useState<boolean>(false);

  const loadLiveModalData = useCallback(async (currentInc?: PreviewIncident) => {
    try {
      const [repRes, incRes] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/incidents", { cache: "no-store" }),
      ]);
      const [repData, incData] = await Promise.all([
        repRes.json(),
        incRes.json(),
      ]);

      if (Array.isArray(repData.display_reports)) {
        setLiveReports(repData.display_reports);
      }
      if (Array.isArray(incData.display_incidents)) {
        const list = incData.display_incidents as PreviewIncident[];
        setAllIncidents(list);
        if (currentInc) {
          const refreshed = list.find(
            (i) =>
              i.id === currentInc.id ||
              i.incidentCode === currentInc.incidentCode
          );
          if (refreshed) {
            setActiveIncident(refreshed);
            setTargetUrgency(refreshed.urgency);
          }
        }
      }
      if (Array.isArray(incData.display_updates)) {
        setLiveUpdates(incData.display_updates);
      }
    } catch {
      // Ignore background refresh error
    }
  }, []);

  useEffect(() => {
    if (!modalState) {
      setActiveIncident(null);
      setActiveTab("overview");
      setFeedbackError(null);
      setFeedbackSuccess(null);
      return;
    }

    setFeedbackError(null);
    setFeedbackSuccess(null);
    setConfirmMergeChecked(false);
    setConfirmSplitChecked(false);
    setConfirmReassignChecked(false);
    setSelectedSplitReportIds([]);
    setMergePartnerId("");
    setReassignReportId("");
    setReassignTargetIncidentId("");
    setStatusReason("");
    setResolutionPendingNote("");
    setResolutionNotesInput("");
    setReopenReasonInput("");
    setNewExplicitPeopleCount("");
    setNewVulnerableGroup("");
    setNewResourceItem("");
    setMemoryUpdateReason("");
    setAllowUrgencyDowngrade(false);

    if (
      modalState.type === "incident_view" ||
      modalState.type === "update_status" ||
      modalState.type === "correlated_reports"
    ) {
      setActiveTab(modalState.type === "update_status" ? "memory" : "overview");
      setActiveIncident(modalState.incident);
      setTargetUrgency(modalState.incident.urgency);
      void loadLiveModalData(modalState.incident);
    }
  }, [modalState, loadLiveModalData]);

  if (!modalState) {
    return null;
  }

  if (
    modalState.type === "incident_view" ||
    modalState.type === "update_status"
  ) {
    const incident = activeIncident ?? modalState.incident;
    const relatedReports = liveReports.filter(
      (r) =>
        r.incident_id === incident.id ||
        r.incident_code === incident.incidentCode
    );
    const relatedUpdates = liveUpdates.filter(
      (u) => u.incidentCode === incident.incidentCode
    );
    const otherIncidents = allIncidents.filter((i) => i.id !== incident.id);
    const selectedMergePartner = otherIncidents.find(
      (i) => i.id === mergePartnerId
    );
    const partnerReports = selectedMergePartner
      ? liveReports.filter(
          (r) =>
            r.incident_id === selectedMergePartner.id ||
            r.incident_code === selectedMergePartner.incidentCode
        )
      : [];

    const sourceIncForMerge =
      mergeDirection === "current_survives" ? selectedMergePartner : incident;
    const targetIncForMerge =
      mergeDirection === "current_survives" ? incident : selectedMergePartner;

    const selectedReassignReport = relatedReports.find(
      (r) => r.id === reassignReportId
    );
    const selectedReassignTarget = otherIncidents.find(
      (i) => i.id === reassignTargetIncidentId
    );

    const isUrgencyDowngrade =
      URGENCY_RANK[targetUrgency] < URGENCY_RANK[incident.urgency];

    const toggleSplitReport = (id: string) => {
      setSelectedSplitReportIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    };

    const handleStatusTransition = async (newStatus: PreviewIncidentStatus) => {
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch(`/api/incidents/${incident.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newStatus,
            reason: statusReason.trim() || null,
            informationOrigin: "operator",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to transition status.");
        }

        setFeedbackSuccess(
          data.timelineEntry?.summary ||
            `Status transitioned from ${incident.status} to ${newStatus}.`
        );
        setStatusReason("");
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Status transition failed."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleMarkResolutionPending = async () => {
      if (!resolutionPendingNote.trim()) return;
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch(`/api/incidents/${incident.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "pending",
            evidenceNote: resolutionPendingNote.trim(),
            informationOrigin: "ai_extracted",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to mark resolution pending.");
        }

        setFeedbackSuccess(
          data.timelineEntry?.summary ||
            "Marked resolution_pending = true (awaiting responder/operator verification)."
        );
        setResolutionPendingNote("");
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to mark pending."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleConfirmResolution = async () => {
      if (!resolutionNotesInput.trim()) return;
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch(`/api/incidents/${incident.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "confirm",
            confirmedBy: resolutionConfirmedBy,
            resolutionNotes: resolutionNotesInput.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to resolve incident.");
        }

        setFeedbackSuccess(
          data.timelineEntry?.summary ||
            `Incident ${incident.incidentCode} verified and Resolved.`
        );
        setResolutionNotesInput("");
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Resolution failed."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleReopenIncident = async () => {
      if (!reopenReasonInput.trim()) return;
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch(`/api/incidents/${incident.id}/reopen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reopenReasonInput.trim(),
            informationOrigin: "operator",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to reopen incident.");
        }

        setFeedbackSuccess(
          data.timelineEntry?.summary ||
            `Incident ${incident.incidentCode} reopened to Active.`
        );
        setReopenReasonInput("");
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Reopen failed."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleUpdateIncidentMemory = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const payload: Record<string, unknown> = {
          informationOrigin: "operator",
          reason: memoryUpdateReason.trim() || null,
        };

        if (newExplicitPeopleCount.trim() !== "") {
          const parsedCount = Number.parseInt(
            newExplicitPeopleCount.trim(),
            10
          );
          if (Number.isNaN(parsedCount) || parsedCount < 0) {
            throw new Error(
              "People affected count must be a non-negative integer."
            );
          }
          payload.explicitPeopleCount = parsedCount;
        }

        if (newVulnerableGroup.trim() !== "") {
          payload.vulnerableGroupsToAdd = newVulnerableGroup
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        if (newResourceItem.trim() !== "") {
          payload.resourcesToAdd = newResourceItem
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        if (targetUrgency !== incident.urgency) {
          payload.newUrgency = targetUrgency;
          payload.allowOperatorUrgencyDowngrade = allowUrgencyDowngrade;
        }

        const res = await fetch(`/api/incidents/${incident.id}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to update incident memory.");
        }

        const summaries = Array.isArray(data.timelineEntries)
          ? data.timelineEntries.map((t: { summary: string }) => t.summary)
          : [];

        setFeedbackSuccess(
          summaries.length > 0
            ? summaries.join(" | ")
            : "Incident memory is already up to date with these values."
        );
        setNewExplicitPeopleCount("");
        setNewVulnerableGroup("");
        setNewResourceItem("");
        setMemoryUpdateReason("");
        setAllowUrgencyDowngrade(false);
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
      } catch (err) {
        setFeedbackError(
          err instanceof Error
            ? err.message
            : "Failed to update incident memory."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleExecuteMerge = async () => {
      if (!sourceIncForMerge || !targetIncForMerge || !confirmMergeChecked) {
        return;
      }
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/incidents/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceIncidentId: sourceIncForMerge.id,
            targetIncidentId: targetIncForMerge.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Merge operation failed.");
        }

        setFeedbackSuccess(data.summary || "Incidents merged successfully.");
        setConfirmMergeChecked(false);
        setMergePartnerId("");
        await loadLiveModalData(targetIncForMerge);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
        setActiveTab("overview");
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to merge incidents."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleExecuteSplit = async () => {
      if (selectedSplitReportIds.length === 0 || !confirmSplitChecked) {
        return;
      }
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/incidents/split", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: incident.id,
            reportIds: selectedSplitReportIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Split operation failed.");
        }

        setFeedbackSuccess(data.summary || "Incident split successfully.");
        setSelectedSplitReportIds([]);
        setConfirmSplitChecked(false);
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
        setActiveTab("overview");
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to split incident."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleExecuteReassign = async () => {
      if (
        !reassignReportId ||
        !reassignTargetIncidentId ||
        !confirmReassignChecked
      ) {
        return;
      }
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/incidents/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: reassignReportId,
            targetIncidentId: reassignTargetIncidentId,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Reassign operation failed.");
        }

        setFeedbackSuccess(data.summary || "Report reassigned successfully.");
        setReassignReportId("");
        setReassignTargetIncidentId("");
        setConfirmReassignChecked(false);
        await loadLiveModalData(incident);
        window.dispatchEvent(new Event("incidents-updated"));
        onOperationSuccess?.();
        setActiveTab("overview");
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to reassign report."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleSendInAppNotification = async () => {
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: incident.id,
            channel: "in_app",
            notificationType: "status_update",
            title: `${incident.incidentCode} — Operational Alert (${incident.status})`,
            message: `${incident.incidentType} near ${incident.location} (${incident.area}): Status ${incident.status}, Urgency ${incident.urgency}. ${incident.latestUpdateSummary}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to send In-App notification.");
        }

        setFeedbackSuccess(
          data.deduplicated
            ? `In-App notification already logged recently (${data.notificationId}).`
            : `In-App notification sent for ${incident.incidentCode} (ID: ${data.notificationId.slice(0, 8)}...).`
        );
        window.dispatchEvent(new Event("notifications-updated"));
      } catch (err) {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to send In-App alert."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleSendMockWhatsApp = async () => {
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/notifications/mock-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: incident.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Failed to simulate Mock WhatsApp alert."
          );
        }

        setFeedbackSuccess(
          `Simulated MOCK WHATSAPP alert created for ${incident.incidentCode} (ID: ${data.notificationId.slice(0, 8)}...).`
        );
        window.dispatchEvent(new Event("notifications-updated"));
      } catch (err) {
        setFeedbackError(
          err instanceof Error
            ? err.message
            : "Failed to simulate Mock WhatsApp alert."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleSendMockSms = async () => {
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/notifications/mock-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: incident.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to simulate Mock SMS alert.");
        }

        setFeedbackSuccess(
          `Simulated MOCK SMS alert created for ${incident.incidentCode} (ID: ${data.notificationId.slice(0, 8)}...).`
        );
        window.dispatchEvent(new Event("notifications-updated"));
      } catch (err) {
        setFeedbackError(
          err instanceof Error
            ? err.message
            : "Failed to simulate Mock SMS alert."
        );
      } finally {
        setSubmitting(false);
      }
    };

    const handleMarkFollowUpAvoided = async () => {
      try {
        setSubmitting(true);
        setFeedbackError(null);
        setFeedbackSuccess(null);

        const res = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: incident.id,
            notificationType: "follow_up_call_avoided",
            followUpCallsAvoided: 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Failed to record avoided follow-up call."
          );
        }

        setFeedbackSuccess(
          data.deduplicated
            ? `Follow-up call avoided already recorded for ${incident.incidentCode} (idempotent — total: ${data.followUpCallsAvoided}).`
            : `Recorded +1 Follow-up Call Avoided on ${incident.incidentCode} (Total: ${data.followUpCallsAvoided}).`
        );
        window.dispatchEvent(new Event("notifications-updated"));
        window.dispatchEvent(new Event("incidents-updated"));
      } catch (err) {
        setFeedbackError(
          err instanceof Error
            ? err.message
            : "Failed to record avoided follow-up call."
        );
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-space-md"
        role="dialog"
      >
        <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-lg bg-surface-container-low border border-outline-variant/40 shadow-xl">
          {/* Header */}
          <div className="px-space-md py-space-sm bg-surface-container flex items-center justify-between border-b border-outline-variant/30">
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="font-code-lg text-code-lg text-primary font-bold">
                {incident.incidentCode}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps uppercase">
                {incident.incidentType}
              </span>
              <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-badge-label text-badge-label">
                {incident.status}
              </span>
              {incident.resolutionPending && (
                <span className="px-2 py-0.5 rounded bg-tertiary/20 text-tertiary font-badge-label text-badge-label">
                  Resolution Pending Verification
                </span>
              )}
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-outline font-code-md text-[11px]">
                Incident Memory &amp; Operator Controls (Live Supabase)
              </span>
            </div>
            <button
              aria-label="Close incident detail view"
              className="p-1 rounded text-outline hover:text-on-surface"
              onClick={onClose}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>
          </div>

          {/* Operator Action Toolbar */}
          <div className="px-space-md py-space-xs bg-surface-container-lowest border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={
                  activeTab === "overview"
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-headline-sm text-xs"
                    : "px-3 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/30"
                }
                onClick={() => {
                  setActiveTab("overview");
                  setFeedbackError(null);
                }}
                type="button"
              >
                Overview &amp; Timeline ({relatedUpdates.length})
              </button>
              <button
                className={
                  activeTab === "memory"
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-headline-sm text-xs"
                    : "px-3 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/30"
                }
                onClick={() => {
                  setActiveTab("memory");
                  setFeedbackError(null);
                }}
                type="button"
              >
                Status, Lifecycle &amp; Memory
              </button>
              <button
                className={
                  activeTab === "merge"
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-headline-sm text-xs"
                    : "px-3 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/30"
                }
                onClick={() => {
                  setActiveTab("merge");
                  setFeedbackError(null);
                  setFeedbackSuccess(null);
                }}
                type="button"
              >
                Merge Incidents
              </button>
              <button
                className={
                  activeTab === "split"
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-headline-sm text-xs"
                    : "px-3 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/30"
                }
                onClick={() => {
                  setActiveTab("split");
                  setFeedbackError(null);
                  setFeedbackSuccess(null);
                }}
                type="button"
              >
                Split Incident ({relatedReports.length})
              </button>
              <button
                className={
                  activeTab === "reassign"
                    ? "px-3 py-1 rounded bg-primary text-on-primary font-headline-sm text-xs"
                    : "px-3 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/30"
                }
                onClick={() => {
                  setActiveTab("reassign");
                  setFeedbackError(null);
                  setFeedbackSuccess(null);
                }}
                type="button"
              >
                Reassign Report
              </button>
            </div>
            <span className="font-code-md text-[11px] text-outline">
              Origin Authority: Operator / Responder
            </span>
          </div>

          <div className="p-space-md flex flex-col gap-space-md">
            {feedbackError && (
              <div className="p-space-sm rounded bg-error-container/30 border border-error text-error font-body-sm text-body-sm">
                <strong>Operator Action Error:</strong> {feedbackError}
              </div>
            )}
            {feedbackSuccess && (
              <div className="p-space-sm rounded bg-primary/15 border border-primary/40 text-primary font-body-sm text-body-sm">
                <strong>Operator Action Confirmed:</strong> {feedbackSuccess}
              </div>
            )}

            {/* CURRENT STATE SUMMARY STRIP (Always visible) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-space-xs bg-surface-container-lowest p-space-sm rounded border border-outline-variant/20">
              <div>
                <span className="font-label-caps text-label-caps text-outline uppercase block">
                  Location &amp; Landmark
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  {incident.location}
                </span>
                <span className="font-code-md text-[11px] text-outline block">
                  Area: {incident.area}
                </span>
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-outline uppercase block">
                  Status &amp; Urgency
                </span>
                <span className="font-headline-sm text-headline-sm text-primary">
                  {incident.status} • {incident.urgency}
                </span>
                <span className="font-code-md text-[11px] text-outline block">
                  Origin: {incident.informationOrigin} ({incident.confidence})
                </span>
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-outline uppercase block">
                  People Affected
                </span>
                <span className="font-body-md text-body-md text-on-surface font-medium block">
                  {incident.peopleAffected}
                </span>
                <span className="font-code-md text-[11px] text-outline block">
                  Vulnerable: {incident.vulnerablePeople}
                </span>
              </div>
              <div>
                <span className="font-label-caps text-label-caps text-outline uppercase block">
                  Resources Needed
                </span>
                <span className="font-body-sm text-body-sm text-on-surface block">
                  {incident.resourcesNeeded}
                </span>
                <span className="font-code-md text-[11px] text-outline block">
                  Related Reports: {incident.relatedReportsCount}
                </span>
              </div>
            </div>

            {/* PHASE 9: NOTIFY & FOLLOW-UP EFFICIENCY ACTIONS */}
            <div className="bg-surface-container-lowest p-space-sm rounded border border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  notifications_active
                </span>
                <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">
                  NOTIFY:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  className="px-2.5 py-1 rounded bg-primary text-on-primary font-label-caps text-label-caps uppercase hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                  disabled={submitting}
                  onClick={handleSendInAppNotification}
                  type="button"
                >
                  Send In-App
                </button>
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-high border border-primary/40 text-primary font-label-caps text-label-caps uppercase hover:bg-primary/10 disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={submitting}
                  onClick={handleSendMockWhatsApp}
                  type="button"
                >
                  Mock WhatsApp
                </button>
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-high border border-tertiary/40 text-tertiary font-label-caps text-label-caps uppercase hover:bg-tertiary/10 disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={submitting}
                  onClick={handleSendMockSms}
                  type="button"
                >
                  Mock SMS
                </button>
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-high border border-outline-variant text-on-surface font-label-caps text-label-caps uppercase hover:bg-surface-bright disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={submitting}
                  onClick={handleMarkFollowUpAvoided}
                  type="button"
                >
                  Mark Follow-up Call Avoided
                </button>
              </div>
            </div>

            {/* TAB 1: OVERVIEW & TIMELINE */}
            {activeTab === "overview" && (
              <>
                <div className="bg-surface-container p-space-sm rounded border border-outline-variant/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Latest Update Summary
                    </span>
                    <span className="font-code-md text-code-md text-outline">
                      {incident.latestUpdateAgo}
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface">
                    {incident.latestUpdateSummary}
                  </p>
                  {incident.resolutionNotes && (
                    <p className="font-code-md text-[11px] text-primary mt-1">
                      Resolution / Lifecycle Notes: {incident.resolutionNotes}
                    </p>
                  )}
                </div>

                <div>
                  <span className="font-label-caps text-label-caps text-outline uppercase block mb-space-xs">
                    Correlated Reports ({relatedReports.length} of{" "}
                    {incident.relatedReportsCount})
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {relatedReports.map((rep) => (
                      <div
                        className="p-space-sm rounded bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs border border-outline-variant/20"
                        key={rep.id}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-code-md text-code-md text-primary font-semibold">
                              [{rep.source_channel}]
                            </span>
                            <span className="font-code-md text-[11px] text-outline">
                              {rep.classification} • {rep.information_origin}
                            </span>
                            {rep.is_unverified_evidence && (
                              <span className="font-code-md text-[10px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                                Unverified Supporting Evidence
                              </span>
                            )}
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface italic">
                            &ldquo;{rep.raw_content}&rdquo;
                          </p>
                          {rep.match_breakdown?.explanation && (
                            <p className="font-code-md text-[10.5px] text-outline mt-0.5">
                              Match reasoning:{" "}
                              {rep.match_breakdown.explanation}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-code-md text-code-md text-outline">
                            {rep.match_score !== null
                              ? `${Math.round(rep.match_score * 100)}% Match`
                              : ""}
                          </span>
                          <button
                            className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-md text-[11px] border border-outline-variant/30"
                            onClick={() => {
                              setReassignReportId(rep.id);
                              setActiveTab("reassign");
                            }}
                            type="button"
                          >
                            Reassign
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="font-label-caps text-label-caps text-outline uppercase block mb-space-xs">
                    Incident Memory Timeline ({relatedUpdates.length} Events —
                    Newest First)
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {relatedUpdates.map((upd) => (
                      <div
                        className="p-space-sm rounded bg-surface-container-lowest flex items-center justify-between gap-space-sm border border-outline-variant/20"
                        key={upd.id}
                      >
                        <div>
                          <span className="font-code-md text-code-md text-primary">
                            {upd.previousStatus
                              ? `${upd.previousStatus} → ${upd.newStatus}`
                              : upd.newStatus}{" "}
                            • Origin: {upd.informationOrigin}
                          </span>
                          <p className="font-body-sm text-body-sm text-on-surface">
                            {upd.updateSummary}
                          </p>
                        </div>
                        <span className="font-code-md text-code-md text-outline shrink-0">
                          {upd.timeAgo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: STATUS LIFECYCLE, RESOLUTION, REOPEN & INCIDENT MEMORY */}
            {activeTab === "memory" && (
              <div className="flex flex-col gap-space-md">
                {/* Section A: Status Transitions OR Reopen */}
                <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col gap-space-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface">
                        1. Operational Status Lifecycle
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Current Status: <strong>{incident.status}</strong>
                        {incident.resolutionPending
                          ? " (Resolution Pending Responder/Operator Verification)"
                          : ""}
                      </p>
                    </div>
                  </div>

                  {incident.status !== "Resolved" ? (
                    <>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          className="flex-1 h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                          onChange={(e) => setStatusReason(e.target.value)}
                          placeholder="Optional reason or operational note for status transition..."
                          type="text"
                          value={statusReason}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          {incident.status !== "Active" && (
                            <button
                              className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-sm text-xs border border-outline-variant/40 cursor-pointer disabled:opacity-40"
                              disabled={submitting}
                              onClick={() =>
                                void handleStatusTransition("Active")
                              }
                              type="button"
                            >
                              Set [Active]
                            </button>
                          )}
                          {incident.status !== "Escalated" && (
                            <button
                              className="px-3 py-1.5 rounded bg-error/20 hover:bg-error/30 text-error font-headline-sm text-xs border border-error/40 cursor-pointer disabled:opacity-40"
                              disabled={submitting}
                              onClick={() =>
                                void handleStatusTransition("Escalated")
                              }
                              type="button"
                            >
                              Set [Escalated]
                            </button>
                          )}
                          {incident.status !== "Rescue in Progress" && (
                            <button
                              className="px-3 py-1.5 rounded bg-primary text-on-primary font-headline-sm text-xs cursor-pointer disabled:opacity-40"
                              disabled={submitting}
                              onClick={() =>
                                void handleStatusTransition(
                                  "Rescue in Progress"
                                )
                              }
                              type="button"
                            >
                              Set [Rescue in Progress]
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Reopen Controls (Only shown when status === 'Resolved') */
                    <div className="p-space-sm rounded bg-surface-container-lowest border border-primary/40 flex flex-col gap-space-xs">
                      <span className="font-label-caps text-label-caps text-primary uppercase">
                        Reopen Resolved Incident (Resolved → Active)
                      </span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Reopening preserves previous resolution history and
                        notes while returning {incident.incidentCode} to Active
                        monitoring.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        <input
                          className="flex-1 h-9 px-3 rounded bg-surface-container text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                          onChange={(e) => setReopenReasonInput(e.target.value)}
                          placeholder="Enter reason/evidence for reopening incident..."
                          type="text"
                          value={reopenReasonInput}
                        />
                        <button
                          className="px-4 py-1.5 rounded bg-primary text-on-primary font-headline-sm text-xs cursor-pointer disabled:opacity-40"
                          disabled={!reopenReasonInput.trim() || submitting}
                          onClick={() => void handleReopenIncident()}
                          type="button"
                        >
                          [Reopen Incident]
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section B: Resolution Workflow (Only shown when status !== 'Resolved') */}
                {incident.status !== "Resolved" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                    {/* Resolution Pending (Citizen / Unverified Claim) */}
                    <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col justify-between gap-space-sm">
                      <div>
                        <h5 className="font-headline-sm text-headline-sm text-tertiary">
                          2A. Mark Resolution Pending
                        </h5>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Record a citizen/unverified claim (e.g., &ldquo;Everyone is
                          safe now&rdquo;). Sets{" "}
                          <code>resolution_pending = true</code> without marking
                          the incident Resolved.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <input
                          className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                          onChange={(e) =>
                            setResolutionPendingNote(e.target.value)
                          }
                          placeholder='e.g. "Everyone is safe now."'
                          type="text"
                          value={resolutionPendingNote}
                        />
                        <button
                          className="px-3 py-1.5 rounded bg-tertiary/20 hover:bg-tertiary/30 text-tertiary font-headline-sm text-xs border border-tertiary/40 cursor-pointer disabled:opacity-40 self-end"
                          disabled={
                            !resolutionPendingNote.trim() || submitting
                          }
                          onClick={() => void handleMarkResolutionPending()}
                          type="button"
                        >
                          [Mark Resolution Pending]
                        </button>
                      </div>
                    </div>

                    {/* Verified Resolution (Operator / Responder Confirmed) */}
                    <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col justify-between gap-space-sm">
                      <div>
                        <h5 className="font-headline-sm text-headline-sm text-primary">
                          2B. Confirm Verified Resolution
                        </h5>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Final <strong>Resolved</strong> status requires
                          explicit Responder or Operator confirmation and
                          resolution notes.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <select
                          className="w-full h-8 px-2 rounded bg-surface-container-lowest text-on-surface font-body-sm text-xs border border-outline-variant/40"
                          onChange={(e) =>
                            setResolutionConfirmedBy(
                              e.target.value as
                                | "operator"
                                | "responder_confirmed"
                            )
                          }
                          value={resolutionConfirmedBy}
                        >
                          <option value="operator">
                            Confirmed by: Operator
                          </option>
                          <option value="responder_confirmed">
                            Confirmed by: Responder Confirmed
                          </option>
                        </select>
                        <input
                          className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                          onChange={(e) =>
                            setResolutionNotesInput(e.target.value)
                          }
                          placeholder="Enter verified resolution notes..."
                          type="text"
                          value={resolutionNotesInput}
                        />
                        <button
                          className="px-3 py-1.5 rounded bg-primary text-on-primary font-headline-sm text-xs cursor-pointer disabled:opacity-40 self-end"
                          disabled={!resolutionNotesInput.trim() || submitting}
                          onClick={() => void handleConfirmResolution()}
                          type="button"
                        >
                          [Resolve Incident]
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Section C: Evolving Incident Memory (Count, Vulnerable People, Resources, Urgency) */}
                <form
                  className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col gap-space-sm"
                  onSubmit={(e) => void handleUpdateIncidentMemory(e)}
                >
                  <div>
                    <h4 className="font-headline-sm text-headline-sm text-on-surface">
                      3. Update Incident Memory (Count, Vulnerable People,
                      Resources, Urgency)
                    </h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      People counts replace previous counts based on explicit
                      evidence (never summed). Vulnerable groups and resources
                      are preserved and appended without duplicates.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                    <div>
                      <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                        Explicit People Affected Count (Replaces, Never Sums)
                      </label>
                      <input
                        className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                        min={0}
                        onChange={(e) =>
                          setNewExplicitPeopleCount(e.target.value)
                        }
                        placeholder="e.g. 30 (leave blank to keep current)"
                        type="number"
                        value={newExplicitPeopleCount}
                      />
                    </div>

                    <div>
                      <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                        Urgency Level (Current: {incident.urgency})
                      </label>
                      <select
                        className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                        onChange={(e) =>
                          setTargetUrgency(
                            e.target.value as PreviewUrgencyLevel
                          )
                        }
                        value={targetUrgency}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                        Add Vulnerable People (Comma-separated)
                      </label>
                      <input
                        className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                        onChange={(e) => setNewVulnerableGroup(e.target.value)}
                        placeholder="e.g. elderly, children"
                        type="text"
                        value={newVulnerableGroup}
                      />
                    </div>

                    <div>
                      <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                        Add Resources Needed (Comma-separated)
                      </label>
                      <input
                        className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                        onChange={(e) => setNewResourceItem(e.target.value)}
                        placeholder="e.g. rescue support, medical assistance"
                        type="text"
                        value={newResourceItem}
                      />
                    </div>
                  </div>

                  {isUrgencyDowngrade && (
                    <label className="flex items-center gap-2 font-body-sm text-xs text-tertiary cursor-pointer">
                      <input
                        checked={allowUrgencyDowngrade}
                        onChange={(e) =>
                          setAllowUrgencyDowngrade(e.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        Confirm explicit operator urgency reduction from{" "}
                        <strong>{incident.urgency}</strong> to{" "}
                        <strong>{targetUrgency}</strong> (requires reason
                        below).
                      </span>
                    </label>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                      onChange={(e) => setMemoryUpdateReason(e.target.value)}
                      placeholder="Reason / evidence context for memory update..."
                      type="text"
                      value={memoryUpdateReason}
                    />
                    <button
                      className="px-4 py-1.5 rounded bg-primary text-on-primary font-headline-sm text-xs cursor-pointer disabled:opacity-40"
                      disabled={submitting}
                      type="submit"
                    >
                      {submitting
                        ? "Saving Memory Update..."
                        : "Apply Memory Update"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: MERGE INCIDENTS */}
            {activeTab === "merge" && (
              <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col gap-space-md">
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface">
                    Operator Action: Merge Two Incidents
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Select another incident to merge with{" "}
                    <strong>{incident.incidentCode}</strong>. All reports from
                    the source incident will be reassigned to the surviving
                    incident. People counts are never summed.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  <div>
                    <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                      Select Incident to Merge With
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                      onChange={(e) => {
                        setMergePartnerId(e.target.value);
                        setConfirmMergeChecked(false);
                      }}
                      value={mergePartnerId}
                    >
                      <option value="">-- Select incident to merge --</option>
                      {otherIncidents.map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.incidentCode} — {other.incidentType} (
                          {other.location})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                      Surviving (Target) Incident
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                      onChange={(e) =>
                        setMergeDirection(
                          e.target.value as
                            | "current_survives"
                            | "partner_survives"
                        )
                      }
                      value={mergeDirection}
                    >
                      <option value="current_survives">
                        {incident.incidentCode} survives (Target)
                      </option>
                      {selectedMergePartner && (
                        <option value="partner_survives">
                          {selectedMergePartner.incidentCode} survives (Target)
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                {sourceIncForMerge && targetIncForMerge && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                    {/* Source Incident Card */}
                    <div className="p-space-sm rounded bg-surface-container-lowest border border-tertiary/40">
                      <span className="font-label-caps text-label-caps text-tertiary uppercase block mb-1">
                        Source Incident (Will Be Merged Into Target)
                      </span>
                      <div className="font-code-md text-code-md text-on-surface font-bold">
                        {sourceIncForMerge.incidentCode} —{" "}
                        {sourceIncForMerge.incidentType}
                      </div>
                      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 space-y-0.5">
                        <div>Location: {sourceIncForMerge.location}</div>
                        <div>
                          Status: {sourceIncForMerge.status} • Urgency:{" "}
                          {sourceIncForMerge.urgency}
                        </div>
                        <div>
                          People Affected: {sourceIncForMerge.peopleAffected}
                        </div>
                        <div>
                          Related Reports:{" "}
                          {sourceIncForMerge.relatedReportsCount}
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-outline-variant/20">
                        <span className="font-code-md text-[10px] text-outline uppercase block mb-1">
                          Reports Moving to Target:
                        </span>
                        {(sourceIncForMerge.id === incident.id
                          ? relatedReports
                          : partnerReports
                        ).map((r) => (
                          <div
                            className="font-body-sm text-[11px] text-on-surface italic truncate"
                            key={r.id}
                          >
                            • [{r.source_channel}] &ldquo;{r.raw_content}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Target Surviving Incident Card */}
                    <div className="p-space-sm rounded bg-surface-container-lowest border border-primary/50">
                      <span className="font-label-caps text-label-caps text-primary uppercase block mb-1">
                        Target / Surviving Incident (Remains Active)
                      </span>
                      <div className="font-code-md text-code-md text-on-surface font-bold">
                        {targetIncForMerge.incidentCode} —{" "}
                        {targetIncForMerge.incidentType}
                      </div>
                      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 space-y-0.5">
                        <div>Location: {targetIncForMerge.location}</div>
                        <div>
                          Status: {targetIncForMerge.status} • Urgency:{" "}
                          {targetIncForMerge.urgency}
                        </div>
                        <div>
                          People Affected: {targetIncForMerge.peopleAffected}
                        </div>
                        <div>
                          Related Reports:{" "}
                          {targetIncForMerge.relatedReportsCount}
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-outline-variant/20">
                        <span className="font-code-md text-[10px] text-outline uppercase block mb-1">
                          Existing Target Reports:
                        </span>
                        {(targetIncForMerge.id === incident.id
                          ? relatedReports
                          : partnerReports
                        ).map((r) => (
                          <div
                            className="font-body-sm text-[11px] text-on-surface italic truncate"
                            key={r.id}
                          >
                            • [{r.source_channel}] &ldquo;{r.raw_content}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {sourceIncForMerge && targetIncForMerge && (
                  <div className="flex flex-col gap-space-xs pt-2 border-t border-outline-variant/30">
                    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface cursor-pointer">
                      <input
                        checked={confirmMergeChecked}
                        onChange={(e) =>
                          setConfirmMergeChecked(e.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I confirm merging source incident{" "}
                        <strong>{sourceIncForMerge.incidentCode}</strong> into
                        surviving incident{" "}
                        <strong>{targetIncForMerge.incidentCode}</strong>.
                      </span>
                    </label>
                    <div className="flex justify-end">
                      <button
                        className="px-space-md py-1.5 rounded bg-primary text-on-primary font-headline-sm text-headline-sm disabled:opacity-40 cursor-pointer"
                        disabled={!confirmMergeChecked || submitting}
                        onClick={() => void handleExecuteMerge()}
                        type="button"
                      >
                        {submitting
                          ? "Merging Incidents..."
                          : `Confirm Merge into ${targetIncForMerge.incidentCode}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: SPLIT INCIDENT */}
            {activeTab === "split" && (
              <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col gap-space-md">
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface">
                    Operator Action: Split Reports Into New Incident
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Select one or more reports below to split out of{" "}
                    <strong>{incident.incidentCode}</strong> into a new
                    independent incident. At least one report must remain in{" "}
                    {incident.incidentCode}.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="font-label-caps text-label-caps text-outline uppercase">
                    Select Reports to Move ({selectedSplitReportIds.length}{" "}
                    selected of {relatedReports.length})
                  </span>
                  {relatedReports.map((rep) => {
                    const checked = selectedSplitReportIds.includes(rep.id);
                    return (
                      <label
                        className={`p-space-sm rounded border flex items-start gap-3 cursor-pointer ${
                          checked
                            ? "bg-primary/10 border-primary"
                            : "bg-surface-container-lowest border-outline-variant/30"
                        }`}
                        key={rep.id}
                      >
                        <input
                          checked={checked}
                          className="mt-1"
                          onChange={() => toggleSplitReport(rep.id)}
                          type="checkbox"
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-code-md text-code-md text-primary font-semibold">
                              [{rep.source_channel}]
                            </span>
                            <span className="font-code-md text-[11px] text-outline">
                              {rep.classification} • {rep.information_origin}
                            </span>
                            {rep.is_unverified_evidence && (
                              <span className="font-code-md text-[10px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary">
                                Unverified Evidence
                              </span>
                            )}
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface italic mt-0.5">
                            &ldquo;{rep.raw_content}&rdquo;
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedSplitReportIds.length > 0 && (
                  <div className="p-space-sm rounded bg-tertiary/10 border border-tertiary/40 text-on-surface font-body-sm text-body-sm">
                    <strong className="text-tertiary">Warning:</strong>{" "}
                    {selectedSplitReportIds.length} selected report(s) will be
                    moved out of <strong>{incident.incidentCode}</strong> into a
                    newly created incident. Both incidents will be recalculated
                    and recorded in the audit timeline.
                  </div>
                )}

                <div className="flex flex-col gap-space-xs pt-2 border-t border-outline-variant/30">
                  <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface cursor-pointer">
                    <input
                      checked={confirmSplitChecked}
                      disabled={selectedSplitReportIds.length === 0}
                      onChange={(e) =>
                        setConfirmSplitChecked(e.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      I confirm splitting {selectedSplitReportIds.length}{" "}
                      report(s) from <strong>{incident.incidentCode}</strong>{" "}
                      into a new incident.
                    </span>
                  </label>
                  <div className="flex justify-end">
                    <button
                      className="px-space-md py-1.5 rounded bg-primary text-on-primary font-headline-sm text-headline-sm disabled:opacity-40 cursor-pointer"
                      disabled={
                        selectedSplitReportIds.length === 0 ||
                        !confirmSplitChecked ||
                        submitting
                      }
                      onClick={() => void handleExecuteSplit()}
                      type="button"
                    >
                      {submitting
                        ? "Splitting Incident..."
                        : "Confirm Split Into New Incident"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: REASSIGN REPORT */}
            {activeTab === "reassign" && (
              <div className="bg-surface-container p-space-md rounded border border-outline-variant/30 flex flex-col gap-space-md">
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface">
                    Operator Action: Reassign Report to Another Incident
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Move a single report from{" "}
                    <strong>{incident.incidentCode}</strong> to another existing
                    active incident. Both incidents will be recalculated
                    without summing people counts.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  <div>
                    <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                      1. Select Report from {incident.incidentCode}
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                      onChange={(e) => {
                        setReassignReportId(e.target.value);
                        setConfirmReassignChecked(false);
                      }}
                      value={reassignReportId}
                    >
                      <option value="">-- Select report to move --</option>
                      {relatedReports.map((r) => (
                        <option key={r.id} value={r.id}>
                          [{r.source_channel}] {r.raw_content.slice(0, 55)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-label-caps text-label-caps text-outline uppercase block mb-1">
                      2. Select Target Incident
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm border border-outline-variant/40"
                      onChange={(e) => {
                        setReassignTargetIncidentId(e.target.value);
                        setConfirmReassignChecked(false);
                      }}
                      value={reassignTargetIncidentId}
                    >
                      <option value="">-- Select target incident --</option>
                      {otherIncidents.map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.incidentCode} — {other.incidentType} (
                          {other.location})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedReassignReport && selectedReassignTarget && (
                  <div className="p-space-sm rounded bg-surface-container-lowest border border-outline-variant/30 space-y-1.5 font-body-sm text-body-sm">
                    <div className="font-code-md text-xs text-primary font-bold">
                      Reassignment Preview
                    </div>
                    <div>
                      <strong>Report Content:</strong> &ldquo;
                      {selectedReassignReport.raw_content}&rdquo;
                    </div>
                    <div>
                      <strong>Classification &amp; Origin:</strong>{" "}
                      {selectedReassignReport.classification} •{" "}
                      {selectedReassignReport.information_origin}
                    </div>
                    <div>
                      <strong>Current Incident:</strong>{" "}
                      {incident.incidentCode} ({incident.incidentType} —{" "}
                      {incident.location})
                    </div>
                    <div>
                      <strong>Target Incident:</strong>{" "}
                      {selectedReassignTarget.incidentCode} (
                      {selectedReassignTarget.incidentType} —{" "}
                      {selectedReassignTarget.location})
                    </div>
                  </div>
                )}

                {selectedReassignReport && selectedReassignTarget && (
                  <div className="flex flex-col gap-space-xs pt-2 border-t border-outline-variant/30">
                    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface cursor-pointer">
                      <input
                        checked={confirmReassignChecked}
                        onChange={(e) =>
                          setConfirmReassignChecked(e.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I confirm reassigning this report from{" "}
                        <strong>{incident.incidentCode}</strong> to{" "}
                        <strong>{selectedReassignTarget.incidentCode}</strong>.
                      </span>
                    </label>
                    <div className="flex justify-end">
                      <button
                        className="px-space-md py-1.5 rounded bg-primary text-on-primary font-headline-sm text-headline-sm disabled:opacity-40 cursor-pointer"
                        disabled={!confirmReassignChecked || submitting}
                        onClick={() => void handleExecuteReassign()}
                        type="button"
                      >
                        {submitting
                          ? "Reassigning Report..."
                          : `Confirm Reassign to ${selectedReassignTarget.incidentCode}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-space-xs">
              <button
                className="px-space-md py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-sm text-headline-sm border border-outline-variant/30"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (modalState.type === "correlated_reports") {
    const incident = activeIncident ?? modalState.incident;
    const relatedReports = liveReports.filter(
      (r) =>
        r.incident_id === incident.id ||
        r.incident_code === incident.incidentCode
    );

    return (
      <div
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-space-md"
        role="dialog"
      >
        <div className="w-full max-w-2xl rounded-lg bg-surface-container-low border border-outline-variant/40 shadow-xl">
          <div className="px-space-md py-space-sm bg-surface-container flex items-center justify-between border-b border-outline-variant/30">
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Correlated Reports — {incident.incidentCode} ({incident.location})
            </span>
            <button
              aria-label="Close correlated reports modal"
              className="p-1 rounded text-outline hover:text-on-surface"
              onClick={onClose}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>
          </div>
          <div className="p-space-md flex flex-col gap-space-sm">
            {relatedReports.map((rep) => (
              <div
                className="p-space-sm rounded bg-surface-container border border-outline-variant/20 flex flex-col gap-1"
                key={rep.id}
              >
                <div className="flex items-center justify-between font-code-md text-code-md">
                  <span className="text-primary font-semibold">
                    {rep.source_channel} • Match:{" "}
                    {rep.match_score !== null
                      ? `${Math.round(rep.match_score * 100)}%`
                      : "100%"}
                  </span>
                  <span className="text-outline">
                    {rep.classification} • {rep.information_origin}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface italic">
                  &ldquo;{rep.raw_content}&rdquo;
                </p>
                {rep.match_breakdown?.explanation && (
                  <p className="font-code-md text-[11px] text-outline">
                    {rep.match_breakdown.explanation}
                  </p>
                )}
              </div>
            ))}
            <div className="flex justify-end pt-space-xs">
              <button
                className="px-space-md py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-sm text-headline-sm border border-outline-variant/30"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const actionMeta = {
    correlate_pending: {
      title: "Correlate Pending Reports",
      description:
        "All pending emergency reports in Supabase public.reports have been correlated into active incidents using multi-signal matching.",
    },
    export_log: {
      title: "Export Incident & Report Log",
      description:
        "Incident and report logs are persisted in Supabase public.incidents, public.reports, and public.incident_updates.",
    },
    new_incident: {
      title: "New Incident / Operator Entry",
      description:
        "Use the '+ Submit Text Report' button in the Incoming Reports table to submit and automatically correlate a new report.",
    },
  }[modalState.type];

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-space-md"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="px-space-md py-space-sm bg-surface-container flex items-center justify-between border-b border-outline-variant/30">
          <span className="font-headline-sm text-headline-sm text-on-surface">
            {actionMeta.title}
          </span>
          <button
            aria-label="Close action preview"
            className="p-1 rounded text-outline hover:text-on-surface"
            onClick={onClose}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-space-md flex flex-col gap-space-md">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {actionMeta.description}
          </p>
          <div className="flex justify-end">
            <button
              className="px-space-md py-1.5 rounded bg-primary-container text-on-primary-container font-headline-sm text-headline-sm"
              onClick={onClose}
              type="button"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
