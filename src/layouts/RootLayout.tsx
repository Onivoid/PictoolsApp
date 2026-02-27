import { Outlet } from "react-router-dom";
import { useTheme } from "@/composables";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { InteractiveGridBackground } from "@/components/interactive-grid-background";
import { UpdateNotification } from "@/components/UpdateNotification";

export default function RootLayout() {
  useTheme();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden relative">
      <InteractiveGridBackground
        className="absolute inset-0 bg-background"
        color="var(--muted-foreground)"
        highlightColor="var(--primary)"
        gridGap={20}
        dotSize={0.8}
        radius={100}
      >
        <div className="h-full flex flex-col">
          {/* TopBar — full width */}
          <TopBar />

          {/* Sidebar + main */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-hidden bg-transparent">
              <Outlet />
            </main>
          </div>
        </div>
      </InteractiveGridBackground>

      {/* Update Notification */}
      <UpdateNotification />
    </div>
  );
}
