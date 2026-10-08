"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { PreviewIncident } from "@/lib/preview/dashboard-data";
import type {
  AudioFormat,
  CorrelationStatus,
  MatchBreakdown,
} from "@/types/database";
import { AudioReportPanel } from "./AudioReportPanel";

interface DisplayReportRow {
  id: string;
  source_channel:
    | "WhatsApp"
    | "Audio"
    | "SMS"
    | "Social Media"
    | "Responder"
    | "Operator";
  raw_content: string;
  audio_file_url?: string | null;
  audio_format?: AudioFormat | null;
  original_transcript?: string | null;
  edited_transcript?: string | null;
  detected_language?: string | null;
  english_rendering?: string | null;
  classification:
    | "Real Emergency"
    | "Irrelevant"
    | "Rumor / Unverified"
    | "General Question";
  confidence: number | null;
  incident_type: string | null;
  location: string | null;
  landmark: string | null;
  resolved_area: string | null;
  people_affected_count: number | null;
  people_affected_description: string | null;
  vulnerable_people: string[];
  resources_needed: string[];
  urgency: string | null;
  important_evidence: string | null;
  information_origin: "AI Extracted" | "Responder Confirmed" | "Operator";
  correlation_status: CorrelationStatus;
  incident_id: string | null;
  incident_code: string | null;
  is_unverified_evidence: boolean;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
  reported_at: string;
  created_at: string;
}

export interface ReportsTableProps {
  filterIncidentCode?: string | null;
  globalSearchQuery?: string;
  onClearIncidentFilter?: () => void;
  onSelectIncidentCode?: (incident: PreviewIncident) => void;
}

const SOURCE_STYLE: Record<string, string> = {
  WhatsApp: "bg-[#f0fdf4] text-[#15803d]",
  Audio: "bg-[#eff6ff] text-[#2563eb]",
  SMS: "bg-[#f8fafc] text-[#475569]",
  "Social Media": "bg-[#f3e8ff] text-[#7e22ce]",
  Responder: "bg-[#eef2ff] text-[#4338ca]",
  Operator: "bg-[#f1f5f9] text-[#334155]",
};

const CLASSIFICATION_STYLE: Record<string, string> = {
  "Real Emergency": "bg-[#fef2f2] text-[#b91c1c]",
  "General Question": "bg-[#f1f5f9] text-[#64748b]",
  "Rumor / Unverified": "bg-[#fffbeb] text-[#b45309]",
  Irrelevant: "bg-[#f1f5f9] text-[#64748b]",
};

const ORIGIN_STYLE: Record<string, string> = {
  "AI Extracted": "bg-[#f8fafc] text-[#475569] border border-[#e2e8f0]",
  "Responder Confirmed": "bg-[#f0fdf4] text-[#15803d]",
  Operator: "bg-[#eff6ff] text-[#2563eb]",
};

function formatTimeIST(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return isoString;
  }
}

function getCorrelationBadge(row: DisplayReportRow): {
  text: string;
  subtext: string | null;
  style: string;
} {
  const code = row.incident_code ?? row.incident_id;
  const pct =
    row.match_score !== null ? `${Math.round(row.match_score * 100)}%` : null;

  if (code) {
    if (row.is_unverified_evidence || row.classification === "Rumor / Unverified") {
      return {
        text: `Unverified Evidence → ${code}`,
        subtext: pct ? `Match Score: ${pct} (Unverified Support)` : null,
        style: "bg-[#fffbeb] text-[#b45309] border border-[#fde68a]",
      };
    }
    return {
      text:
        row.correlation_status === "new_incident"
          ? `Created → ${code}`
          : `Correlated → ${code}`,
      subtext: pct ? `Match Score: ${pct}` : null,
      style: "bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]",
    };
  }

  switch (row.correlation_status) {
    case "filtered":
      return {
        text: "Filtered (Non-Incident)",
        subtext: "Excluded from incident creation",
        style: "bg-[#f1f5f9] text-[#64748b]",
      };
    case "possible_match":
      return {
        text: "Possible Match (Review)",
        subtext: pct ? `Match Score: ${pct}` : null,
        style: "bg-[#fffbeb] text-[#b45309]",
      };
    case "unverified_queue":
      return {
        text: "Held — Unverified Queue",
        subtext: null,
        style: "bg-[#fffbeb] text-[#b45309]",
      };
    case "pending":
    default:
      return {
        text: "Pending Correlation",
        subtext: null,
        style: "bg-[#eff6ff] text-[#2563eb]",
      };
  }
}

export function ReportsTable({
  filterIncidentCode = null,
  globalSearchQuery = "",
  onClearIncidentFilter,
}: ReportsTableProps = {}) {
  const [liveReports, setLiveReports] = useState<DisplayReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Quick submission form state for testing/submitting incoming reports
  const [showSubmitForm, setShowSubmitForm] = useState<boolean>(false);
  const [showAudioPanel, setShowAudioPanel] = useState<boolean>(false);
  const [sourceChannel, setSourceChannel] = useState<string>("WhatsApp");
  const [rawContent, setRawContent] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch("/api/reports", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load reports from Supabase.");
      }
      if (Array.isArray(data.display_reports)) {
        setLiveReports(data.display_reports);
      } else {
        setLiveReports([]);
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Unable to load live reports."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
    const handleRefresh = () => {
      void loadReports();
    };
    window.addEventListener("incidents-updated", handleRefresh);
    return () => {
      window.removeEventListener("incidents-updated", handleRefresh);
    };
  }, [loadReports]);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawContent.trim()) return;

    try {
      setSubmitting(true);
      setSubmitStatus(null);
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_channel: sourceChannel,
          raw_content: rawContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process report.");
      }
      setRawContent("");
      setSubmitStatus(
        `Saved & Correlated (${data.extracted?.classification ?? "Processed"} — Mode: ${data.processing_mode})`
      );
      await loadReports();
    } catch (err) {
      setSubmitStatus(
        `Error: ${err instanceof Error ? err.message : "Submission failed"}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const query = globalSearchQuery.trim().toLowerCase();

  const filteredLiveReports = liveReports.filter((row) => {
    if (
      filterIncidentCode &&
      row.incident_code !== filterIncidentCode &&
      row.incident_id !== filterIncidentCode
    ) {
      return false;
    }
    if (!query) return true;
    return (
      row.raw_content.toLowerCase().includes(query) ||
      (row.english_rendering ?? "").toLowerCase().includes(query) ||
      (row.detected_language ?? "").toLowerCase().includes(query) ||
      (row.landmark ?? "").toLowerCase().includes(query) ||
      (row.location ?? "").toLowerCase().includes(query) ||
      (row.incident_code ?? "").toLowerCase().includes(query) ||
      row.classification.toLowerCase().includes(query) ||
      row.source_channel.toLowerCase().includes(query)
    );
  });

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[12px] shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-[20px] py-[16px] border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-[12px]">
        <div>
          <h3 className="text-[15px] font-bold text-[#0f172a]">
            Incoming Reports &amp; AI Classification Log
          </h3>
          <p className="text-[12px] text-[#64748b] mt-[2px]">
            Raw incoming messages preserved verbatim with AI-extracted hazard,
            location, people count, and incident correlation status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[8px]">
          {filterIncidentCode && onClearIncidentFilter && (
            <button
              type="button"
              onClick={onClearIncidentFilter}
              className="px-[10px] py-[4px] rounded-[6px] text-[11px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] cursor-pointer"
            >
              Filter: {filterIncidentCode} ✕
            </button>
          )}
          <span className="inline-flex items-center px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] bg-[#f0fdf4] text-[#15803d]">
            {loading
              ? "Loading Supabase..."
              : `${liveReports.length} Live Reports (Supabase)`}
          </span>
          <button
            type="button"
            onClick={() => void loadReports()}
            className="px-[10px] py-[5px] rounded-[6px] text-[12px] font-semibold border border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc] cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAudioPanel((prev) => !prev)}
            className="px-[10px] py-[5px] rounded-[6px] text-[12px] font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] hover:bg-[#dbeafe] cursor-pointer"
          >
            {showAudioPanel ? "Close Audio Panel" : "+ Upload Audio Report"}
          </button>
          <button
            type="button"
            onClick={() => setShowSubmitForm((prev) => !prev)}
            className="px-[10px] py-[5px] rounded-[6px] text-[12px] font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] cursor-pointer"
          >
            {showSubmitForm ? "Close Form" : "+ Submit Text Report"}
          </button>
        </div>
      </div>

      {showAudioPanel && (
        <AudioReportPanel
          onReportProcessed={() => void loadReports()}
          onClose={() => setShowAudioPanel(false)}
        />
      )}

      {showSubmitForm && (
        <form
          onSubmit={handleReportSubmit}
          className="px-[20px] py-[14px] bg-[#f8fafc] border-b border-[#e2e8f0] flex flex-col gap-[10px]"
        >
          <div className="flex flex-wrap items-center gap-[10px]">
            <label className="text-[12px] font-semibold text-[#334155]">
              Source Channel:
            </label>
            <select
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
              className="px-[10px] py-[6px] rounded-[6px] border border-[#cbd5e1] bg-white text-[12.5px] text-[#0f172a]"
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="SMS">SMS</option>
              <option value="Social Media">Social Media</option>
              <option value="Responder">Responder</option>
              <option value="Operator">Operator</option>
              <option value="Audio">Audio</option>
            </select>
            <input
              type="text"
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="Enter incoming emergency report text..."
              className="flex-1 min-w-[260px] px-[12px] py-[6px] rounded-[6px] border border-[#cbd5e1] bg-white text-[12.5px] text-[#0f172a]"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-[14px] py-[6px] rounded-[6px] bg-[#15803d] text-white text-[12.5px] font-semibold hover:bg-[#166534] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Processing..." : "Process & Save"}
            </button>
          </div>
          {submitStatus && (
            <div className="text-[12px] font-medium text-[#334155]">
              {submitStatus}
            </div>
          )}
        </form>
      )}

      {fetchError && (
        <div className="px-[20px] py-[10px] bg-[#fef2f2] text-[#b91c1c] text-[12px] border-b border-[#fecaca]">
          {fetchError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Source Channel
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Report Content &amp; Extracted Details
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Location / Landmark
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Classification
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Information Origin
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Correlation Status / Match
              </th>
              <th className="text-left px-[16px] py-[12px] bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-[0.04em] text-[#64748b]">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0]">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} className="animate-pulse">
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[22px] w-[76px] rounded-[9999px] bg-[#e2e8f0]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[16px] w-[280px] rounded bg-[#e2e8f0] mb-[8px]" />
                    <div className="h-[14px] w-[180px] rounded bg-[#f1f5f9]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[16px] w-[140px] rounded bg-[#e2e8f0]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[22px] w-[110px] rounded-[9999px] bg-[#e2e8f0]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[22px] w-[96px] rounded-[9999px] bg-[#e2e8f0]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[22px] w-[150px] rounded-[9999px] bg-[#e2e8f0]" />
                  </td>
                  <td className="px-[16px] py-[14px]">
                    <div className="h-[16px] w-[48px] rounded bg-[#e2e8f0]" />
                  </td>
                </tr>
              ))
            ) : filteredLiveReports.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-[16px] py-[36px] text-center text-[13px] text-[#64748b]"
                >
                  {liveReports.length === 0
                    ? "No reports found in Supabase public.reports. Use '+ Submit Text Report' to process an incoming report."
                    : "No live reports match the current search or filter."}
                </td>
              </tr>
            ) : (
              filteredLiveReports.map((row) => {
                const isNonEmergency =
                  row.classification === "General Question" ||
                  row.classification === "Rumor / Unverified" ||
                  row.classification === "Irrelevant";
                const corrBadge = getCorrelationBadge(row);

                return (
                  <tr
                    key={row.id}
                    className={
                      isNonEmergency
                        ? "bg-[#fafafa] hover:bg-[#f8fafc]"
                        : "hover:bg-[#f8fafc]"
                    }
                  >
                    <td className="px-[16px] py-[14px] text-[13px] align-top">
                      <div className="flex flex-col items-start gap-[4px]">
                        <span
                          className={`inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] whitespace-nowrap ${
                            SOURCE_STYLE[row.source_channel] ??
                            "bg-[#f8fafc] text-[#475569]"
                          }`}
                        >
                          {row.source_channel}
                          {row.audio_format ? ` (.${row.audio_format})` : ""}
                        </span>
                        {row.detected_language && (
                          <span className="px-[6px] py-[2px] rounded text-[10.5px] font-semibold bg-[#f8fafc] border border-[#e2e8f0] text-[#475569]">
                            {row.detected_language}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={`px-[16px] py-[14px] text-[13px] align-top max-w-[380px] ${
                        row.classification === "General Question" ||
                        row.classification === "Irrelevant"
                          ? "text-[#64748b]"
                          : "text-[#0f172a]"
                      }`}
                    >
                      <div className="font-medium">
                        &ldquo;{row.raw_content}&rdquo;
                      </div>
                      {row.edited_transcript &&
                        row.original_transcript &&
                        row.edited_transcript !== row.original_transcript && (
                          <div className="mt-[4px] text-[11px] text-[#475569] bg-[#f8fafc] px-[8px] py-[4px] rounded border border-[#e2e8f0]">
                            <span className="font-bold text-[#64748b]">
                              Original STT:{" "}
                            </span>
                            &ldquo;{row.original_transcript}&rdquo;
                          </div>
                        )}
                      {row.english_rendering &&
                        row.english_rendering !== row.raw_content && (
                          <div className="mt-[4px] text-[11.5px] text-[#166534] bg-[#f0fdf4] px-[8px] py-[4px] rounded border border-[#bbf7d0]">
                            <span className="font-bold">English: </span>
                            &ldquo;{row.english_rendering}&rdquo;
                          </div>
                        )}
                      <div className="mt-[6px] flex flex-wrap items-center gap-[6px] text-[11px] text-[#475569]">
                        {row.incident_type && (
                          <span className="px-[6px] py-[2px] rounded bg-[#f1f5f9] font-semibold text-[#334155]">
                            Type: {row.incident_type}
                          </span>
                        )}
                        {row.urgency && (
                          <span className="px-[6px] py-[2px] rounded bg-[#fef2f2] font-semibold text-[#b91c1c]">
                            Urgency: {row.urgency}
                          </span>
                        )}
                        <span className="px-[6px] py-[2px] rounded bg-[#f8fafc] border border-[#e2e8f0] text-[#475569]">
                          People Count:{" "}
                          {row.people_affected_count !== null
                            ? row.people_affected_count
                            : "null (Not explicitly numbered)"}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`px-[16px] py-[14px] text-[13px] align-top ${
                        isNonEmergency
                          ? "text-[#64748b]"
                          : "font-semibold text-[#0f172a]"
                      }`}
                    >
                      <div>
                        {row.landmark ??
                          row.location ??
                          row.resolved_area ??
                          "Unspecified"}
                      </div>
                      {row.resolved_area &&
                        row.landmark &&
                        row.resolved_area !== row.landmark && (
                          <div className="text-[11px] font-normal text-[#64748b] mt-[2px]">
                            Area: {row.resolved_area}
                          </div>
                        )}
                    </td>
                    <td className="px-[16px] py-[14px] text-[13px] align-top">
                      <span
                        className={`inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] whitespace-nowrap ${
                          CLASSIFICATION_STYLE[row.classification] ??
                          "bg-[#f1f5f9] text-[#64748b]"
                        }`}
                      >
                        {row.classification}
                      </span>
                    </td>
                    <td className="px-[16px] py-[14px] text-[13px] align-top">
                      <span
                        className={`inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] whitespace-nowrap ${
                          ORIGIN_STYLE[row.information_origin] ??
                          "bg-[#f8fafc] text-[#475569]"
                        }`}
                      >
                        {row.information_origin}
                      </span>
                    </td>
                    <td className="px-[16px] py-[14px] text-[13px] align-top">
                      <div className="flex flex-col items-start gap-[3px]">
                        <span
                          className={`inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] whitespace-nowrap ${corrBadge.style}`}
                        >
                          {corrBadge.text}
                        </span>
                        {corrBadge.subtext && (
                          <span className="text-[10.5px] text-[#64748b]">
                            {corrBadge.subtext}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-[16px] py-[14px] text-[13px] align-top text-[#64748b] whitespace-nowrap">
                      {formatTimeIST(row.reported_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
