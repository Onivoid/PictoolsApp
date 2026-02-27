import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { House, ImageIcon, Layers, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ROUTES } from "@/constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  route: string | null;
  available: boolean;
}

interface NavButtonProps {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
}

function NavButton({ item, collapsed, active, onClick }: NavButtonProps) {
  const btn = (
    <motion.button
      onClick={onClick}
      disabled={!item.available}
      className={`relative flex items-center w-full rounded-md text-sm font-medium
        transition-all duration-200 ease-out overflow-hidden
        ${collapsed ? "h-9 justify-center px-0" : "h-9 gap-2.5 px-2.5"}
        ${item.available
          ? active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          : "opacity-30 cursor-not-allowed text-muted-foreground"
        }`}
      whileHover={item.available ? { x: collapsed ? 0 : 4, scale: collapsed ? 1.05 : 1 } : {}}
      whileTap={item.available ? { scale: 0.95 } : {}}
    >
      {/* Active left bar */}
      <AnimatePresence>
        {active && (
          <motion.span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-sm bg-primary"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <motion.span
        className={`shrink-0 transition-colors duration-200 ${active ? "text-foreground" : ""}`}
        animate={active ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        {item.icon}
      </motion.span>
      <span
        className="truncate transition-all duration-200 ease-out whitespace-nowrap"
        style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 200, overflow: "hidden" }}
      >
        {item.label}
      </span>
    </motion.button>
  );

  if (collapsed && item.available) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return btn;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);

  const isActive = (route: string | null) => !!route && location.pathname === route;

  const navItems: NavItem[] = [
    {
      icon: <House className="w-4 h-4" />,
      label: t("home.title", "Accueil"),
      route: ROUTES.HOME,
      available: true,
    },
    {
      icon: <ImageIcon className="w-4 h-4" />,
      label: t("home.tools.converter.title"),
      route: ROUTES.CONVERT,
      available: true,
    },
    {
      icon: <Layers className="w-4 h-4" />,
      label: t("sidebar.comingSoon"),
      route: null,
      available: false,
    },
  ];

  const collapseBtn = (
    <button
      onClick={() => setCollapsed((v) => !v)}
      className="flex items-center w-full h-9 rounded-md px-2.5 gap-2.5
        text-muted-foreground hover:bg-muted/60 hover:text-foreground
        transition-all duration-200 ease-out overflow-hidden"
    >
      <span className="shrink-0">
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
      </span>
      <span
        className="text-sm font-medium truncate whitespace-nowrap transition-all duration-200 ease-out"
        style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 200, overflow: "hidden" }}
      >
        {t("sidebar.collapse", "Réduire")}
      </span>
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="sidebar-transition shrink-0 flex flex-col h-full bg-background border-r border-border/50 select-none overflow-hidden"
        style={{ width: collapsed ? 56 : 220 }}
      >
        {/* Nav items */}
        <div className="flex flex-col gap-0.5 px-2 pt-3 pb-2 flex-1 overflow-y-auto overflow-x-hidden">
          <div
            className="px-1.5 mb-1.5 overflow-hidden"
            style={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : "auto", transition: "opacity 0.2s ease-out" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {t("sidebar.tools")}
            </span>
          </div>

          {navItems.map((item) => (
            <NavButton
              key={item.route ?? item.label}
              item={item}
              collapsed={collapsed}
              active={isActive(item.route)}
              onClick={() => item.route && navigate(item.route)}
            />
          ))}
        </div>

        {/* Bottom: settings + collapse */}
        <div className="px-2 pb-3 shrink-0 flex flex-col gap-0.5">
          <div className="h-px bg-border/40 mb-1" />
          <NavButton
            item={{ icon: <Settings className="w-4 h-4" />, label: t("settings.title"), route: ROUTES.SETTINGS, available: true }}
            collapsed={collapsed}
            active={isActive(ROUTES.SETTINGS)}
            onClick={() => navigate(ROUTES.SETTINGS)}
          />
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{collapseBtn}</TooltipTrigger>
              <TooltipContent side="right">{t("sidebar.expand")}</TooltipContent>
            </Tooltip>
          ) : collapseBtn}
        </div>
      </aside>
    </TooltipProvider>
  );
}
