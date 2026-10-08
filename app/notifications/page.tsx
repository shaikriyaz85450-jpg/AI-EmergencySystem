"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { EnrichedNotificationRecord } from "@/lib/notifications/notification-types";
import type { IncidentRecord } from "@/types/database";

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    let rel = "Just now";
    if (diffSec >= 60 && diffSec < 3600) {
      rel = `${Math.floor(diffSec / 60)}m ago`;
    } else if (diffSec >= 3600 && diffSec < 86400) {
      rel = `${Math.floor(diffSec / 3600)}h ago`;
    } else if (diffSec >= 86400) {
      rel = `${Math.floor(diffSec / 86400)}d ago`;
    }
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
    return `${timeStr} IST (${rel})`;
  } catch {
    return isoString;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<
    EnrichedNotificationRecord[]
  >([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [followUpCallsAvoided, setFollowUpCallsAvoided] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<
    "all" | "in_app" | "whatsapp" | "sms"
  >("all");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string>("");

  const fetchNotificationsAndIncidents = useCallback(async () => {
    try {
      const [notifRes, incRes] = await Promise.all([
        fetch("/api/notifications", { cache: "no-store" }),
        fetch("/api/incidents", { cache: "no-store" }),
      ]);

      const notifData = await notifRes.json();
      if (!notifRes.ok) {
        throw new Error(notifData.error ?? "Failed to load notifications.");
      }

      setNotifications(notifData.notifications ?? []);
      setUnreadCount(Number(notifData.unreadCount ?? 0));
      setFollowUpCallsAvoided(Number(notifData.followUpCallsAvoided ?? 0));

      if (incRes.ok) {
        const incData = await incRes.json();
        const incList = (incData.incidents ?? []) as IncidentRecord[];
        setIncidents(incList);
        setSelectedIncidentId((prev) =>
          prev && incList.some((i) => i.id === prev)
            ? prev
            : incList[0]?.id ?? "",
        );
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotificationsAndIncidents();
    const handleRefresh = () => {
      fetchNotificationsAndIncidents();
    };
    window.addEventListener("notifications-updated", handleRefresh);
    window.addEventListener("incidents-updated", handleRefresh);
    return () => {
      window.removeEventListener("notifications-updated", handleRefresh);
      window.removeEventListener("incidents-updated", handleRefresh);
    };
  }, [fetchNotificationsAndIncidents]);

  const handleMarkAsRead = async (notificationId: string) => {
    setMarkingId(notificationId);
    setError(null);
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to mark notification as read.");
      }
      await fetchNotificationsAndIncidents();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to mark notification as read.",
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleSendInApp = async () => {
    if (!selectedIncidentId) return;
    setSubmittingAction("in_app");
    setError(null);
    setActionFeedback(null);
    try {
      const targetInc = incidents.find((i) => i.id === selectedIncidentId);
      const defaultMsg = targetInc
        ? `${targetInc.incident_type} near ${targetInc.canonical_landmark ?? targetInc.location_text} is currently ${targetInc.status} (${targetInc.urgency} urgency). ${targetInc.related_report_count} correlated reports linked.`
        : "Operational status update logged by dispatch.";

      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncidentId,
          channel: "in_app",
          notificationType: "status_update",
          title: `${targetInc?.incident_code ?? "INC"} — In-App Operational Alert`,
          message: customMessage.trim() || defaultMsg,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create In-App notification.");
      }
      setCustomMessage("");
      setActionFeedback(
        data.deduplicated
          ? `Identical In-App alert already recorded (${data.notificationId}).`
          : `In-App notification created for ${targetInc?.incident_code ?? "incident"}.`,
      );
      await fetchNotificationsAndIncidents();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send In-App alert.",
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleSendMockWhatsApp = async () => {
    if (!selectedIncidentId) return;
    setSubmittingAction("whatsapp");
    setError(null);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/notifications/mock-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncidentId,
          message: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create Mock WhatsApp alert.");
      }
      setCustomMessage("");
      setActionFeedback(
        `Simulated MOCK WHATSAPP notification logged (ID: ${data.notificationId.slice(0, 8)}...).`,
      );
      await fetchNotificationsAndIncidents();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create Mock WhatsApp alert.",
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleSendMockSms = async () => {
    if (!selectedIncidentId) return;
    setSubmittingAction("sms");
    setError(null);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/notifications/mock-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncidentId,
          message: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create Mock SMS alert.");
      }
      setCustomMessage("");
      setActionFeedback(
        `Simulated MOCK SMS notification logged (ID: ${data.notificationId.slice(0, 8)}...).`,
      );
      await fetchNotificationsAndIncidents();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create Mock SMS alert.",
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleRecordFollowUpAvoided = async () => {
    if (!selectedIncidentId) return;
    setSubmittingAction("followup");
    setError(null);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncidentId,
          notificationType: "follow_up_call_avoided",
          followUpCallsAvoided: 1,
          reason: customMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? "Failed to record avoided follow-up call.",
        );
      }
      setCustomMessage("");
      setActionFeedback(
        data.deduplicated
          ? `Follow-up call avoided already recorded for this incident context (idempotent — total remains ${data.followUpCallsAvoided}).`
          : `Follow-up call avoided recorded! Total Follow-up Calls Avoided: ${data.followUpCallsAvoided}.`,
      );
      await fetchNotificationsAndIncidents();
      window.dispatchEvent(new Event("notifications-updated"));
      window.dispatchEvent(new Event("incidents-updated"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record avoided follow-up call.",
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (channelFilter !== "all" && item.channel !== channelFilter) {
      return false;
    }
    if (unreadOnly && item.is_read) {
      return false;
    }
    return true;
  });

  return (
    <DashboardShell>
      {() => (
        <div className="flex flex-col gap-space-md">
          {/* Header & Live Metrics Summary */}
          <div className="bg-surface-container-low rounded-lg shadow-sm border border-outline-variant/30 overflow-hidden">
            <div className="p-space-md bg-surface-container border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-space-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-headline-md text-headline-md text-on-surface">
                    Operator Notification Center
                  </span>
                  <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-code-md text-code-md font-semibold">
                    LIVE SUPABASE
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant block mt-0.5">
                  In-App operational alerts, simulated Mock WhatsApp &amp; Mock
                  SMS dispatches, and Follow-up Calls Avoided tracking
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="font-code-md text-code-md px-2.5 py-1 rounded bg-surface-container-high text-on-surface"
                  data-testid="notifications-total-badge"
                >
                  {notifications.length} Total
                </span>
                <span
                  className={`font-code-md text-code-md px-2.5 py-1 rounded font-semibold ${
                    unreadCount > 0
                      ? "bg-error/20 text-error"
                      : "bg-surface-container-high text-outline"
                  }`}
                  data-testid="notifications-unread-badge"
                >
                  {unreadCount} Unread
                </span>
                <span
                  className="font-code-md text-code-md px-2.5 py-1 rounded bg-primary/20 text-primary font-semibold"
                  data-testid="notifications-followup-badge"
                >
                  Follow-up Calls Avoided: {followUpCallsAvoided}
                </span>
              </div>
            </div>

            {/* Operator Quick Notification Dispatch Bar */}
            <div className="p-space-md bg-surface-container-lowest border-b border-outline-variant/20 flex flex-col gap-space-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">
                  Dispatch Notification / Efficiency Action
                </span>
                <span className="font-code-md text-code-md text-outline">
                  WhatsApp &amp; SMS channels are strictly simulated (MOCK)
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
                <div className="lg:col-span-4">
                  <select
                    aria-label="Select target incident"
                    className="w-full rounded bg-surface-container px-3 py-2 font-body-sm text-body-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary"
                    onChange={(e) => setSelectedIncidentId(e.target.value)}
                    value={selectedIncidentId}
                  >
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        {inc.incident_code} — {inc.incident_type} (
                        {inc.canonical_landmark ?? inc.location_text}) [
                        {inc.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-8">
                  <input
                    className="w-full rounded bg-surface-container px-3 py-2 font-body-sm text-body-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary"
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Optional custom alert message or follow-up avoided note (leave blank for automatic incident summary)..."
                    type="text"
                    value={customMessage}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                  disabled={!selectedIncidentId || submittingAction !== null}
                  onClick={handleSendInApp}
                  type="button"
                >
                  {submittingAction === "in_app"
                    ? "Sending..."
                    : "Send In-App"}
                </button>

                <button
                  className="px-3 py-1.5 rounded bg-surface-container-high border border-primary/40 text-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={!selectedIncidentId || submittingAction !== null}
                  onClick={handleSendMockWhatsApp}
                  type="button"
                >
                  {submittingAction === "whatsapp"
                    ? "Simulating..."
                    : "Mock WhatsApp"}
                </button>

                <button
                  className="px-3 py-1.5 rounded bg-surface-container-high border border-tertiary/40 text-tertiary font-label-caps text-label-caps uppercase tracking-wider hover:bg-tertiary/10 disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={!selectedIncidentId || submittingAction !== null}
                  onClick={handleSendMockSms}
                  type="button"
                >
                  {submittingAction === "sms" ? "Simulating..." : "Mock SMS"}
                </button>

                <button
                  className="px-3 py-1.5 rounded bg-surface-container-high border border-outline-variant text-on-surface font-label-caps text-label-caps uppercase tracking-wider hover:bg-surface-bright disabled:opacity-50 transition-colors cursor-pointer"
                  disabled={!selectedIncidentId || submittingAction !== null}
                  onClick={handleRecordFollowUpAvoided}
                  type="button"
                >
                  {submittingAction === "followup"
                    ? "Recording..."
                    : "Mark Follow-up Call Avoided"}
                </button>
              </div>

              {actionFeedback && (
                <div className="p-2.5 rounded bg-primary/10 border border-primary/30 font-body-sm text-body-sm text-primary">
                  {actionFeedback}
                </div>
              )}

              {error && (
                <div className="p-2.5 rounded bg-error-container/25 border border-error/40 font-body-sm text-body-sm text-error">
                  {error}
                </div>
              )}
            </div>

            {/* Filter Bar */}
            <div className="px-space-md py-space-sm bg-surface-container border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: "all", label: "All Channels" },
                    { key: "in_app", label: "In-App" },
                    { key: "whatsapp", label: "Mock WhatsApp" },
                    { key: "sms", label: "Mock SMS" },
                  ] as const
                ).map((tab) => (
                  <button
                    className={`px-2.5 py-1 rounded font-label-caps text-label-caps uppercase transition-colors cursor-pointer ${
                      channelFilter === tab.key
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    }`}
                    key={tab.key}
                    onClick={() => setChannelFilter(tab.key)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 font-code-md text-code-md text-on-surface-variant cursor-pointer select-none">
                <input
                  checked={unreadOnly}
                  className="accent-primary"
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                  type="checkbox"
                />
                Show Unread Only
              </label>
            </div>

            {/* Notification List */}
            <div className="p-space-md flex flex-col gap-space-sm">
              {loading ? (
                <div
                  className="p-space-lg rounded bg-surface-container border border-outline-variant/20 flex items-center justify-center gap-3 text-on-surface-variant"
                  data-testid="notifications-loading"
                >
                  <span className="material-symbols-outlined animate-spin text-primary">
                    progress_activity
                  </span>
                  <span className="font-body-sm text-body-sm">
                    Loading live notifications from Supabase...
                  </span>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div
                  className="p-space-lg rounded bg-surface-container border border-outline-variant/20 text-center flex flex-col items-center gap-1"
                  data-testid="notifications-empty"
                >
                  <span className="material-symbols-outlined text-[28px] text-outline">
                    notifications_off
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    No notifications yet
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Use the dispatch controls above or Incident Detail actions
                    to send an In-App alert, simulated Mock WhatsApp/SMS, or
                    record a Follow-up Call Avoided.
                  </span>
                </div>
              ) : (
                filteredNotifications.map((item) => {
                  const isMock =
                    item.channel === "whatsapp" || item.channel === "sms";
                  return (
                    <div
                      className={`p-space-md rounded border flex flex-col gap-1.5 transition-colors ${
                        item.is_read
                          ? "bg-surface-container border-outline-variant/20 opacity-85"
                          : "bg-surface-container-high/70 border-primary/40"
                      }`}
                      data-testid={`notification-card-${item.id}`}
                      key={item.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-code-md text-code-md text-primary font-bold">
                            {item.incident_code}
                          </span>

                          <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-caps text-label-caps uppercase">
                            {item.display_type_label}
                          </span>

                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant font-code-md text-code-md uppercase">
                            channel: {item.channel}
                          </span>

                          {isMock && (
                            <span
                              className="px-2 py-0.5 rounded bg-tertiary/20 border border-tertiary/50 text-tertiary font-label-caps text-label-caps uppercase font-bold"
                              data-testid="mock-channel-badge"
                            >
                              MOCK
                            </span>
                          )}

                          {item.follow_up_calls_avoided > 0 && (
                            <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-code-md text-code-md font-semibold">
                              +{item.follow_up_calls_avoided} Follow-up Call
                              Avoided
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded font-label-caps text-label-caps uppercase ${
                              item.is_read
                                ? "bg-surface-container-lowest text-outline"
                                : "bg-error/20 text-error font-bold"
                            }`}
                          >
                            {item.is_read ? "READ" : "UNREAD"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-code-md text-code-md text-outline">
                            {formatTimestamp(item.created_at)}
                          </span>
                          {!item.is_read && (
                            <button
                              className="px-2.5 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary font-label-caps text-label-caps uppercase transition-colors cursor-pointer disabled:opacity-50"
                              data-testid={`mark-read-${item.id}`}
                              disabled={markingId === item.id}
                              onClick={() => handleMarkAsRead(item.id)}
                              type="button"
                            >
                              {markingId === item.id
                                ? "Saving..."
                                : "Mark as Read"}
                            </button>
                          )}
                        </div>
                      </div>

                      <span className="font-headline-sm text-headline-sm text-on-surface">
                        {item.title}
                      </span>

                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {item.message}
                      </p>

                      {item.recipient && (
                        <span className="font-code-md text-code-md text-outline">
                          Recipient: {item.recipient}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
