"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const NAV_ITEMS = [
  { label: "Calendar",  href: "/calendar",  icon: CalendarDays  },
  { label: "Conflicts", href: "/conflicts", icon: AlertTriangle },
  { label: "Staff",     href: "/staff",     icon: Users         },
  { label: "Settings",  href: "/settings",  icon: Settings      },
];

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

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
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
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
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}