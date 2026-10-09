"use client";

interface WorkflowPipelineProps {
  onCorrelatePendingClick?: () => void;
  onExportLogClick?: () => void;
  onNewIncidentClick?: () => void;
}

export function WorkflowPipeline({
  onExportLogClick,
  onNewIncidentClick,
}: WorkflowPipelineProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-space-xs">
      <button
        className="px-space-sm py-1.5 rounded-md bg-white hover:bg-[#f8fafc] text-[#334155] font-headline-sm text-headline-sm flex items-center gap-1 transition-colors border border-[#cbd5e1] cursor-pointer"
        onClick={onExportLogClick}
        type="button"
      >
        <span className="material-symbols-outlined text-[16px] text-[#64748b]">
          ios_share
        </span>
        <span>Export Log</span>
      </button>

      <button
        className="px-space-md py-1.5 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] font-headline-sm text-headline-sm flex items-center gap-1 transition-colors cursor-pointer"
        onClick={onNewIncidentClick}
        type="button"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        <span>New Incident</span>
      </button>
    </div>
  );
}
