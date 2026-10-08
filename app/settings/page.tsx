"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function SettingsPage() {
  return (
    <DashboardShell>
      {() => (
        <div className="bg-white rounded-lg p-space-md border border-[#e2e8f0] shadow-xs flex flex-col gap-space-md">
          <div>
            <span className="font-headline-md text-headline-md text-[#0f172a] block">
              Operator Console Settings
            </span>
            <span className="font-body-sm text-body-sm text-[#475569]">
              Operational workspace display preferences (Light Theme Active)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
            <div className="p-space-md rounded-md bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="font-label-caps text-label-caps text-[#64748b] uppercase block mb-1">
                Supported Report Languages
              </span>
              <span className="font-headline-sm text-headline-sm text-[#0f172a]">
                English, Tamil, Hindi
              </span>
              <p className="font-body-sm text-body-sm text-[#475569] mt-1">
                Original language transcripts and English renderings are
                displayed side-by-side for operator review.
              </p>
            </div>

            <div className="p-space-md rounded-md bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="font-label-caps text-label-caps text-[#64748b] uppercase block mb-1">
                Resolution Verification Rule
              </span>
              <span className="font-headline-sm text-headline-sm text-[#2563eb]">
                Responder / Operator Confirmation Required
              </span>
              <p className="font-body-sm text-body-sm text-[#475569] mt-1">
                Citizen reports indicating safety mark incidents as pending
                verification until confirmed by a responder or operator.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
