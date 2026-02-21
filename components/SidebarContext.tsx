"use client";

import { createContext, useContext, useState, useCallback, useEffect, startTransition } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);
SidebarContext.displayName = "SidebarContext";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cy_sidebar_collapsed");
    if (saved !== null) {
      startTransition(() => {
        setCollapsedState(saved === "true");
      });
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    localStorage.setItem("cy_sidebar_collapsed", String(value));
    setCollapsedState(value);
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem("cy_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used inside <SidebarProvider>");
  }
  return ctx;
}