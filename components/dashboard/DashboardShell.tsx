"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  children: (props: { searchQuery: string }) => React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  return (
    <>
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="lg:pl-72 flex flex-col min-h-screen">
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
        />
        <main className="w-full pt-16 flex-1 bg-[#f1f5f9] bg-[linear-gradient(to_right,#cbd5e145_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e145_1px,transparent_1px)] bg-[size:24px_24px]">
          <div className="flex flex-col w-full p-gutter lg:p-gutter-desktop gap-space-md">
            {children({ searchQuery })}
          </div>
        </main>
      </div>
    </>
  );
}
