"use client";

import { useEffect, useState } from "react";

export interface DashboardLiveStats {
  totalReports: number;
  activeIncidents: number;
  escalatedIncidents: number;
  rescueInProgress: number;
  resolvedIncidents: number;
  followUpCallsAvoided?: number;
  unreadNotifications?: number;
}

interface StatCardsProps {
  stats?: DashboardLiveStats;
}

export function StatCards({ stats: propStats }: StatCardsProps = {}) {
  const [fetchedStats, setFetchedStats] = useState<DashboardLiveStats>({
    totalReports: 0,
    activeIncidents: 0,
    escalatedIncidents: 0,
    rescueInProgress: 0,
    resolvedIncidents: 0,
    followUpCallsAvoided: 0,
    unreadNotifications: 0,
  });

  useEffect(() => {
    if (propStats !== undefined) return;
    let active = true;
    const fetchStats = () => {
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data.stats) {
            setFetchedStats(data.stats);
          }
        })
        .catch(() => {
          // Keep zero fallback
        });
    };

    fetchStats();
    window.addEventListener("incidents-updated", fetchStats);
    window.addEventListener("notifications-updated", fetchStats);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchStats);
      window.removeEventListener("notifications-updated", fetchStats);
    };
  }, [propStats]);

  const stats = propStats ?? fetchedStats;
  const followUpAvoidedCount = stats.followUpCallsAvoided ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-space-sm">
      {/* Card 1: Total Reports */}
      <div className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#64748b]">
            Total Reports
          </span>
          <div className="w-7 h-7 rounded-md bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
            <span className="material-symbols-outlined text-[18px]">inbox</span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#0f172a] tracking-tight leading-none">
            {stats.totalReports}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Incoming reports
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span className="text-[#2563eb] font-medium">Multi-channel</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563eb]" />
      </div>

      {/* Card 2: Active Incidents (Blue/Cyan) */}
      <div className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#0284c7]">
            Active Incidents
          </span>
          <div className="w-7 h-7 rounded-md bg-[#f0f9ff] border border-[#bae6fd] flex items-center justify-center text-[#0284c7]">
            <span className="material-symbols-outlined text-[18px]">
              radar
            </span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#0284c7] tracking-tight leading-none">
            {stats.activeIncidents}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Displayed incidents
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span className="text-[#0284c7] font-medium">status: Active</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0284c7]" />
      </div>

      {/* Card 3: Escalated Incidents (Orange) */}
      <div className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#ea580c]">
            Escalated Incidents
          </span>
          <div className="w-7 h-7 rounded-md bg-[#fff7ed] border border-[#fed7aa] flex items-center justify-center text-[#ea580c]">
            <span className="material-symbols-outlined text-[18px]">
              priority_high
            </span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#ea580c] tracking-tight leading-none">
            {stats.escalatedIncidents}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Require attention
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span className="text-[#ea580c] font-medium">
            ● Immediate review
          </span>
          <span>status: Escalated</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ea580c]" />
      </div>

      {/* Card 4: Rescue in Progress (Strong Emergency Red) */}
      <div className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#dc2626]">
            Rescue in Progress
          </span>
          <div className="w-7 h-7 rounded-md bg-[#fef2f2] border border-[#fecaca] flex items-center justify-center text-[#dc2626]">
            <span className="material-symbols-outlined text-[18px]">
              medical_services
            </span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#dc2626] tracking-tight leading-none">
            {stats.rescueInProgress}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Response underway
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span className="text-[#dc2626] font-medium">
            Assigned action
          </span>
          <span>status: Rescue</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#dc2626]" />
      </div>

      {/* Card 5: Resolved Incidents (Green) */}
      <div className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#15803d]">
            Resolved Incidents
          </span>
          <div className="w-7 h-7 rounded-md bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center text-[#15803d]">
            <span className="material-symbols-outlined text-[18px]">
              check_circle
            </span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#15803d] tracking-tight leading-none">
            {stats.resolvedIncidents}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Verified resolved
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span>Status updated</span>
          <span className="font-medium text-[#15803d]">
            status: Resolved
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#15803d]" />
      </div>

      {/* Card 6: Follow-up Calls Avoided (Operational Efficiency Metric) */}
      <div
        className="bg-white rounded-lg p-space-md flex flex-col justify-between shadow-xs relative overflow-hidden border border-[#e2e8f0]"
        data-testid="stat-followup-calls-avoided"
      >
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-label-caps uppercase text-[#2563eb]">
            Follow-up Calls Avoided
          </span>
          <div className="w-7 h-7 rounded-md bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
            <span className="material-symbols-outlined text-[18px]">
              phone_disabled
            </span>
          </div>
        </div>
        <div className="my-space-xs">
          <div className="font-display-hero text-display-hero text-[#2563eb] tracking-tight leading-none">
            {followUpAvoidedCount}
          </div>
          <div className="font-body-sm text-body-sm text-[#475569] mt-1">
            Correlated context
          </div>
        </div>
        <div className="flex items-center justify-between font-code-md text-code-md text-[#64748b]">
          <span className="text-[#2563eb] font-medium">Efficiency metric</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563eb]" />
      </div>
    </div>
  );
}
