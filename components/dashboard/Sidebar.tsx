"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  dataPath: string;
  rightBadge?: {
    type: "code" | "error-count" | "neutral-count" | "pulse-dot";
    text?: string;
  };
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [liveCounts, setLiveCounts] = useState<{
    activeIncidents: number;
    totalReports: number;
    unreadNotifications: number;
  }>({
    activeIncidents: 5,
    totalReports: 26,
    unreadNotifications: 0,
  });

  useEffect(() => {
    let active = true;
    const fetchCounts = () => {
      fetch("/api/incidents", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active || !data.stats) return;
          setLiveCounts({
            activeIncidents: Number(data.stats.activeIncidents ?? 5),
            totalReports: Number(data.stats.totalReports ?? 26),
            unreadNotifications: Number(data.stats.unreadNotifications ?? 0),
          });
        })
        .catch(() => {
          // Keep fallback counts
        });
    };

    fetchCounts();
    window.addEventListener("incidents-updated", fetchCounts);
    window.addEventListener("notifications-updated", fetchCounts);
    return () => {
      active = false;
      window.removeEventListener("incidents-updated", fetchCounts);
      window.removeEventListener("notifications-updated", fetchCounts);
    };
  }, []);

  const navItems: readonly NavItem[] = [
    {
      label: "Dashboard",
      href: "/",
      icon: "dashboard",
      dataPath: "dashboard",
      rightBadge: { type: "code", text: "01" },
    },
    {
      label: "Incidents",
      href: "/incidents",
      icon: "emergency",
      dataPath: "incidents",
      rightBadge: {
        type: "error-count",
        text: String(liveCounts.activeIncidents),
      },
    },
    {
      label: "Reports",
      href: "/reports",
      icon: "description",
      dataPath: "reports",
      rightBadge: {
        type: "neutral-count",
        text: String(liveCounts.totalReports),
      },
    },
    {
      label: "Map",
      href: "/map",
      icon: "map",
      dataPath: "map",
    },
    {
      label: "Updates Feed",
      href: "/updates",
      icon: "rss_feed",
      dataPath: "updates",
      rightBadge: { type: "pulse-dot" },
    },
    {
      label: "Notifications",
      href: "/notifications",
      icon: "notifications",
      dataPath: "notifications",
      rightBadge:
        liveCounts.unreadNotifications > 0
          ? {
              type: "error-count",
              text: String(liveCounts.unreadNotifications),
            }
          : undefined,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: "settings",
      dataPath: "settings",
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-white z-50 flex flex-col justify-between select-none border-r border-[#e2e8f0] shadow-xs transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col">
          <div className="h-16 px-space-md flex items-center gap-space-sm bg-[#f8fafc] border-b border-[#e2e8f0]">
            <div className="w-10 h-10 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
              <span className="material-symbols-outlined text-[22px]">hub</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-space-xs">
                <span className="font-label-caps text-label-caps uppercase text-[#2563eb] tracking-widest">
                  OPERATIONS CENTER
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#15803d] animate-pulse" />
              </div>
              <span className="font-code-md text-code-md text-[#64748b] truncate">
                Operational Workspace
              </span>
            </div>
            {mobileOpen && (
              <button
                aria-label="Close navigation menu"
                className="lg:hidden p-1 rounded text-[#64748b] hover:text-[#0f172a]"
                onClick={onCloseMobile}
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            )}
          </div>

          <div className="px-space-md pt-space-md pb-space-xs">
            <span className="font-label-caps text-label-caps uppercase text-[#64748b] tracking-wider">
              System Navigation
            </span>
          </div>

          <nav
            className="flex flex-col gap-1 px-space-xs"
            data-active-classes="bg-[#eff6ff] text-[#2563eb] border-l-2 border-[#2563eb] font-headline-sm"
          >
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex items-center justify-between px-space-sm py-space-sm rounded-md transition-colors group bg-[#eff6ff] text-[#2563eb] border-l-2 border-[#2563eb] font-headline-sm"
                      : "flex items-center justify-between px-space-sm py-space-sm rounded-md text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-colors group"
                  }
                  data-path={item.dataPath}
                  href={item.href}
                  key={item.href}
                  onClick={onCloseMobile}
                >
                  <div className="flex items-center gap-space-md">
                    <span
                      className={`material-symbols-outlined text-[18px] transition-colors ${
                        isActive
                          ? "text-[#2563eb]"
                          : "text-[#64748b] group-hover:text-[#2563eb]"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="font-body-md text-body-md">
                      {item.label}
                    </span>
                  </div>

                  {item.rightBadge?.type === "code" && (
                    <span className="font-code-md text-code-md text-[#64748b]">
                      {item.rightBadge.text}
                    </span>
                  )}

                  {item.rightBadge?.type === "error-count" && (
                    <span className="font-badge-label text-badge-label px-space-xs py-0.5 rounded bg-[#fef2f2] border border-[#fecaca] text-[#dc2626]">
                      {item.rightBadge.text}
                    </span>
                  )}

                  {item.rightBadge?.type === "neutral-count" && (
                    <span className="font-badge-label text-badge-label px-space-xs py-0.5 rounded bg-[#f1f5f9] border border-[#e2e8f0] text-[#334155]">
                      {item.rightBadge.text}
                    </span>
                  )}

                  {item.rightBadge?.type === "pulse-dot" && (
                    <span className="w-2 h-2 rounded-full bg-[#2563eb] animate-pulse" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-space-sm m-space-sm rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
          <div className="flex items-center gap-space-sm mb-space-xs">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center text-[#2563eb]">
                <span className="material-symbols-outlined text-[20px]">
                  person
                </span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#15803d] ring-2 ring-white" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-headline-sm text-headline-sm truncate text-[#0f172a]">
                Emergency Operator
              </span>
              <span className="font-code-md text-code-md truncate text-[#64748b]">
                Active Console Session
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-space-xs mt-space-xs bg-white px-space-sm py-space-xs rounded border border-[#e2e8f0]">
            <div className="flex items-center gap-space-xs">
              <span className="w-2 h-2 rounded-full bg-[#15803d] animate-ping" />
              <span className="font-badge-label text-badge-label text-[#15803d] uppercase tracking-wider">
                Online
              </span>
            </div>
            <span className="font-code-md text-[10px] text-[#64748b]">
              Live DB
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
