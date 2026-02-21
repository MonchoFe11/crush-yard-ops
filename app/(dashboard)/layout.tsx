import { SidebarProvider } from "@/components/SidebarContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">

        {/* Sidebar — fixed left column */}
        <Sidebar />

        {/* Main column — TopBar + scrollable content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <TopBar />
          <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>

      </div>
    </SidebarProvider>
  );
}