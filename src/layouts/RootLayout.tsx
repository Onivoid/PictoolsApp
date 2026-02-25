import { Outlet } from "react-router-dom";
import { useTheme } from "@/composables";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";

export default function RootLayout() {
  useTheme();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* TopBar — full width */}
      <TopBar />

      {/* Sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
