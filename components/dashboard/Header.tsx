"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenMobileMenu: () => void;
}

export function Header({
  searchQuery,
  onSearchChange,
  onOpenMobileMenu,
}: HeaderProps) {
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const fetchUnread = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (typeof data.unreadCount === "number") {
            setUnreadCount(data.unreadCount);
          }
        })
        .catch(() => {
          // Ignore header badge fetch error
        });
    };

    fetchUnread();
    window.addEventListener("notifications-updated", fetchUnread);
    window.addEventListener("incidents-updated", fetchUnread);
    return () => {
      active = false;
      window.removeEventListener("notifications-updated", fetchUnread);
      window.removeEventListener("incidents-updated", fetchUnread);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-white/95 backdrop-blur-md z-40 flex items-center justify-between px-space-md lg:px-space-lg select-none border-b border-[#e2e8f0] shadow-2xs gap-space-sm">
      <div className="flex items-center gap-space-sm min-w-0">
        <button
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-md bg-[#f8fafc] text-[#475569] hover:text-[#0f172a] border border-[#e2e8f0] shrink-0"
          onClick={onOpenMobileMenu}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <div className="flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-space-sm">
            <span className="font-headline-md text-headline-md tracking-tight uppercase text-[#0f172a] truncate">
              OPERATIONS CENTER
            </span>
          </div>
          <span className="font-body-sm text-body-sm text-[#64748b] truncate">
            AI Emergency Response Assistant
          </span>
        </div>
      </div>

      <div className="flex items-center gap-space-sm lg:gap-space-md">
        <div className="relative hidden md:flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[#64748b] text-[18px]">
            search
          </span>
          <input
            aria-label="Search incident code, landmark, keyword"
            className="w-64 xl:w-96 h-9 pl-9 pr-14 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#64748b] font-body-sm text-body-sm rounded-md focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#2563eb] focus:border-[#2563eb] transition-all border border-[#cbd5e1]"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search incident code, landmark, keyword..."
            type="text"
            value={searchQuery}
          />
          <kbd className="absolute right-2 font-code-md text-code-md text-[#64748b] bg-white border border-[#e2e8f0] px-1.5 py-0.5 rounded uppercase">
            Ctrl+K
          </kbd>
        </div>

        <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-md bg-[#f0fdf4] border border-[#bbf7d0]">
          <span className="w-2 h-2 rounded-full bg-[#15803d] animate-pulse" />
          <div className="flex flex-col">
            <span className="font-label-caps text-label-caps text-[#15803d] uppercase">
              System Operational
            </span>
            <span className="font-code-md text-code-md text-[#166534] truncate text-[10px] leading-tight">
              AI Correlation Engine Active
            </span>
          </div>
        </div>

        <div className="hidden xl:flex items-center gap-space-xs px-space-sm py-1.5 rounded-md bg-[#f8fafc] font-code-md text-code-md text-[#334155] border border-[#e2e8f0]">
          <span className="material-symbols-outlined text-[#64748b] text-[16px]">
            schedule
          </span>
          <span className="tracking-wider">LIVE IST / UTC</span>
        </div>

        <Link
          aria-label="Notifications"
          className="relative p-2 rounded-md bg-[#f8fafc] text-[#475569] hover:text-[#0f172a] hover:bg-[#f1f5f9] transition-colors border border-[#e2e8f0]"
          href="/notifications"
        >
          <span className="material-symbols-outlined text-[20px]">
            notifications
          </span>
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#dc2626] text-white font-code-md text-[10px] font-bold flex items-center justify-center shadow-xs"
              data-testid="header-unread-badge"
            >
              {unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-space-xs pl-space-xs">
          <div className="w-8 h-8 rounded-full bg-[#2563eb] flex items-center justify-center shadow-2xs">
            <span className="material-symbols-outlined text-white text-[18px]">
              person
            </span>
          </div>
          <span className="material-symbols-outlined text-[#64748b] text-[18px] cursor-pointer hover:text-[#0f172a]">
            expand_more
          </span>
        </div>
      </div>
    </header>
  );
}
