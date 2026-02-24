"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  AlertTriangle,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const [conflictCount, setConflictCount] = useState<number>(0);

  useEffect(() => {
    const fetchConflicts = () => {
      fetch('/api/conflicts?days=14&location=ORL')
        .then(r => r.ok ? r.json() : null)
        .then((data: { totalConflicts?: number } | null) => {
          if (data?.totalConflicts) setConflictCount(data.totalConflicts);
        })
        .catch(() => {});
    };

    fetchConflicts();
    const interval = setInterval(fetchConflicts, 60_000);
    return () => clearInterval(interval);
  }, []);

  const NAV_ITEMS = [
    { label: "Calendar",  href: "/calendar",  icon: CalendarDays,  badge: null },
    { label: "Conflicts", href: "/conflicts", icon: AlertTriangle, badge: conflictCount > 0 ? conflictCount : null },
    { label: "Staff",     href: "/staff",     icon: Users,         badge: null },
    { label: "Settings",  href: "/settings",  icon: Settings,      badge: null },
  ];

  return (
    <aside
      className={[
        "flex flex-col h-screen shrink-0",
        "bg-(--bg-secondary) border-r border-(--border-light)",
        "transition-[width] duration-150 ease-in-out",
        collapsed ? "w-14" : "w-56",
      ].join(" ")}
    >
      {/* Logo + Collapse toggle */}
      <div className="shrink-0 border-b border-(--border-light)">
        <div
          className={[
            "flex items-center h-14",
            collapsed ? "justify-center px-0" : "px-4 gap-2",
          ].join(" ")}
          title={collapsed ? "Crush Yard" : undefined}
        >
          <Zap size={20} className="text-(--color-primary) shrink-0" />
          {!collapsed && (
            <span className="text-(--text-primary) font-semibold text-sm tracking-wide truncate">
              CRUSH YARD
            </span>
          )}
        </div>
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={[
            "flex items-center w-full px-2 py-1.5 text-xs",
            "text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-secondary)",
            "transition-colors duration-100 border-t border-(--border-light)",
            collapsed ? "justify-center" : "gap-2 px-4",
          ].join(" ")}
        >
          {collapsed ? <ChevronRight size={14} /> : (
            <>
              <ChevronLeft size={14} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav
        aria-label="Main navigation"
        className="flex flex-col flex-1 overflow-y-auto px-2 py-3"
      >
        {NAV_ITEMS.map(({ label, href, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center min-w-0 gap-3 rounded-sm px-2 py-2 text-sm",
                "border-l-2 transition-colors duration-100",
                collapsed ? "justify-center" : "",
                active
                  ? "bg-(--bg-hover) text-(--text-primary) border-(--color-primary) font-medium"
                  : "text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary) border-transparent",
              ].join(" ")}
            >
              <div className="relative shrink-0">
                <Icon size={17} />
                {badge !== null && (
                  <span
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}