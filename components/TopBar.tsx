"use client";

import { usePathname } from "next/navigation";
import { Search, Bell } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/calendar":  "Calendar",
  "/conflicts": "Conflicts",
  "/staff":     "Staff",
  "/settings":  "Settings",
};

function getPageTitle(pathname: string): string {
  for (const [route, label] of Object.entries(ROUTE_LABELS)) {
    if (pathname === route || pathname.startsWith(route + "/")) return label;
  }
  return "Crush Yard";
}

export default function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex items-center min-w-0 h-14 shrink-0 px-4 gap-4 border-b border-(--border-light) bg-(--bg-primary)">

      {/* Page title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h1 className="text-(--text-primary) text-sm font-semibold tracking-wide truncate">
          {title}
        </h1>
        <span className="text-(--text-muted) text-xs font-mono shrink-0">• Live</span>
      </div>

      {/* Cmd+K search stub */}
      <button
        aria-label="Open search"
        className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs
          text-(--text-muted) bg-(--bg-secondary) border border-(--border-medium)
          hover:text-(--text-secondary)
          transition-colors duration-100"
      >
        <Search size={13} />
        <span>Search</span>
        <span className="ml-1 px-1 py-0.5 rounded text-[10px] bg-(--bg-tertiary) text-(--text-muted) font-mono">
          ⌘K
        </span>
      </button>

      {/* Notification bell */}
      <button
        aria-label="Notifications"
        className="relative flex items-center justify-center w-8 h-8 rounded-sm
          border border-transparent
          text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)
          transition-colors duration-100"
      >
        <Bell size={16} />
      </button>

      {/* User avatar stub */}
      <div
        aria-label="User profile"
        className="flex items-center justify-center w-8 h-8 rounded-md
          bg-(--bg-tertiary) border border-(--border-light)
          text-(--text-secondary) text-xs font-semibold select-none cursor-pointer
          hover:border-(--border-medium) transition-colors duration-100"
      >
        MC
      </div>

    </header>
  );
}