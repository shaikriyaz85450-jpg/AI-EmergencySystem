"use client";

import { useEffect, useState } from "react";
import type {
  PreviewIncidentStatus,
  PreviewIncidentUpdate,
} from "@/lib/preview/dashboard-data";

const ITEMS_PER_PAGE = 10;

interface IncidentUpdatesProps {
  showStatusTransitions?: boolean;
  updates?: PreviewIncidentUpdate[];
}

function renderStatusBadge(status: PreviewIncidentStatus) {
  switch (status) {
    case "Active":
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb] font-label-caps text-[9px] uppercase">
          Active
        </span>
      );
    case "Escalated":
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#fff7ed] border border-[#fed7aa] text-[#c2410c] font-label-caps text-[9px] uppercase">
          Escalated
        </span>
      );
    case "Rescue in Progress":
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] font-label-caps text-[9px] uppercase">
          Rescue in Progress
        </span>
      );
    case "Resolved":
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] font-label-caps text-[9px] uppercase">
          Resolved
        </span>
      );
  }
}

export function IncidentUpdates({
  showStatusTransitions = false,
  updates: propUpdates,
}: IncidentUpdatesProps) {
  const [fetchedUpdates, setFetchedUpdates] = useState<PreviewIncidentUpdate[]>(
    []
  );
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    if (propUpdates !== undefined) return;
    let active = true;
    const fetchUpdates = () => {
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (Array.isArray(data.display_updates)) {
            setFetchedUpdates(data.display_updates);
          }
        })
        .catch(() => {
          // Keep empty array on error
        });
    };

    fetchUpdates();
    window.addEventListener("incidents-updated", fetchUpdates);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchUpdates);
    };
  }, [propUpdates]);

  const updates = propUpdates ?? fetchedUpdates;
  const totalUpdates = updates.length;
  const totalPages = Math.max(1, Math.ceil(totalUpdates / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalUpdates);
  const paginatedUpdates = updates.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const pageNumbers = Array.from({ length: totalPages }, (_, idx) => idx + 1);

  return (
    <div
      className="bg-white rounded-lg shadow-xs flex flex-col overflow-hidden border border-[#e2e8f0]"
      data-testid="recent-incident-updates"
    >
      <div className="px-space-md py-space-sm bg-[#f8fafc] flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
            <span className="material-symbols-outlined text-[18px]">
              history
            </span>
          </div>
          <div>
            <span className="font-headline-sm text-headline-sm text-[#0f172a] block">
              Recent Incident Updates
            </span>
            <span className="font-body-sm text-[11px] text-[#475569] block">
              Chronological incident update feed (Newest first • Live Supabase)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="font-code-md text-code-md px-2 py-0.5 rounded bg-[#f1f5f9] border border-[#e2e8f0] text-[#334155]"
            data-testid="updates-range-badge"
          >
            {totalUpdates === 0
              ? "0 Updates"
              : `${startIndex + 1}–${endIndex} of ${totalUpdates}`}
          </span>
        </div>
      </div>

      {/* Recent incident update feed (Strictly 10 updates per page) */}
      <div
        className="p-space-sm flex flex-col gap-1.5"
        data-testid="updates-page-list"
      >
        {paginatedUpdates.length === 0 ? (
          <div className="p-space-md text-center font-body-sm text-body-sm text-[#64748b]">
            No incident updates recorded yet.
          </div>
        ) : (
          paginatedUpdates.map((update) => {
            const iconBoxClass =
              update.accentTone === "error"
                ? "w-6 h-6 rounded bg-[#fef2f2] border border-[#fecaca] flex items-center justify-center text-[#dc2626] shrink-0 mt-0.5"
                : update.accentTone === "tertiary"
                  ? "w-6 h-6 rounded bg-[#fff7ed] border border-[#fed7aa] flex items-center justify-center text-[#ea580c] shrink-0 mt-0.5"
                  : "w-6 h-6 rounded bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb] shrink-0 mt-0.5";

            const timeClass =
              update.accentTone === "error"
                ? "font-code-md text-code-md text-[#dc2626] font-medium"
                : update.accentTone === "tertiary"
                  ? "font-code-md text-code-md text-[#ea580c] font-medium"
                  : "font-code-md text-code-md text-[#64748b]";

            const originClass =
              update.informationOrigin === "Responder Confirmed"
                ? "font-code-md text-[10px] text-[#15803d] font-semibold"
                : "font-code-md text-[10px] text-[#64748b]";

            return (
              <div
                className="p-space-sm rounded-md bg-[#f8fafc] flex items-start gap-space-sm hover:bg-[#f1f5f9] transition-colors border border-[#e2e8f0]"
                data-testid="incident-update-row"
                key={update.id}
              >
                <div className={iconBoxClass}>
                  <span className="material-symbols-outlined text-[14px]">
                    {update.icon}
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-code-md text-code-md text-[#2563eb] font-bold">
                        {update.incidentCode}
                      </span>
                      {showStatusTransitions && update.previousStatus ? (
                        <div className="flex items-center gap-1">
                          {renderStatusBadge(update.previousStatus)}
                          <span className="font-code-md text-[10px] text-[#64748b]">
                            →
                          </span>
                          {renderStatusBadge(update.newStatus)}
                        </div>
                      ) : (
                        renderStatusBadge(update.newStatus)
                      )}
                      <span className={originClass}>
                        Origin: {update.informationOrigin}
                      </span>
                    </div>
                    <span className={timeClass}>{update.timeAgo}</span>
                  </div>

                  <p className="font-body-sm text-body-sm text-[#0f172a] leading-tight mt-0.5">
                    {update.updateSummary}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls (10 updates per page) */}
      <div
        className="px-space-md py-space-xs bg-[#f8fafc] border-t border-[#e2e8f0] flex flex-wrap items-center justify-between gap-2"
        data-testid="updates-pagination-controls"
      >
        <span className="font-code-md text-[11px] text-[#64748b]">
          Page {safeCurrentPage} of {totalPages} ({ITEMS_PER_PAGE} per page)
        </span>

        <div className="flex flex-wrap items-center gap-1">
          <button
            className="px-2.5 py-1 rounded text-[11.5px] font-semibold border border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
            data-testid="updates-prev-button"
            disabled={safeCurrentPage <= 1}
            onClick={() =>
              setCurrentPage((prev) =>
                Math.max(1, Math.min(prev, totalPages) - 1)
              )
            }
            type="button"
          >
            Previous
          </button>

          {pageNumbers.map((pageNum) => {
            const isActivePage = pageNum === safeCurrentPage;
            return (
              <button
                aria-current={isActivePage ? "page" : undefined}
                className={
                  isActivePage
                    ? "min-w-[28px] px-2 py-1 rounded text-[11.5px] font-bold border border-[#2563eb] bg-[#2563eb] text-white cursor-pointer transition-colors"
                    : "min-w-[28px] px-2 py-1 rounded text-[11.5px] font-semibold border border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9] cursor-pointer transition-colors"
                }
                data-testid={`updates-page-${pageNum}`}
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                type="button"
              >
                {pageNum}
              </button>
            );
          })}

          <button
            className="px-2.5 py-1 rounded text-[11.5px] font-semibold border border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
            data-testid="updates-next-button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() =>
              setCurrentPage((prev) =>
                Math.min(totalPages, Math.max(1, prev) + 1)
              )
            }
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
