import { useTranslation } from "react-i18next";
import { useWindow } from "@/composables/useWindow";
import { useTheme } from "@/composables/useTheme";
import { motion } from "framer-motion";
import { APP_VERSION } from "@/constants";

export default function TopBar() {
  const { t } = useTranslation();
  const { close, minimize, toggleMaximize, startDragging } = useWindow();
  const { isDark } = useTheme();

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) startDragging();
  };

  return (
    <div className="h-10 w-full flex items-center px-4 bg-background border-b border-border select-none shrink-0 relative">
      {/* Traffic lights */}
      <div className="flex items-center gap-1.5 z-10 shrink-0">
        <motion.button
          onClick={close}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all focus:outline-none group"
          title={t("topbar.close")}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="hidden group-hover:flex items-center justify-center w-full h-full text-[#7a0b07] leading-none font-bold" style={{ fontSize: 8 }}>✕</span>
        </motion.button>
        <motion.button
          onClick={minimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-90 transition-all focus:outline-none group"
          title={t("topbar.minimize")}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="hidden group-hover:flex items-center justify-center w-full h-full text-[#7a5400] leading-none font-bold" style={{ fontSize: 8 }}>−</span>
        </motion.button>
        <motion.button
          onClick={toggleMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 transition-all focus:outline-none group"
          title={t("topbar.maximize")}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="hidden group-hover:flex items-center justify-center w-full h-full text-[#0a4a16] leading-none font-bold" style={{ fontSize: 8 }}>+</span>
        </motion.button>
      </div>

      {/* Drag zone — covers everything except the buttons above */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute inset-0 flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing"
        style={{ zIndex: 5 }}
      >
        <motion.img
          src={isDark ? "/White Logo.png" : "/Black Logo.png"}
          alt="PictoolsApp"
          className="h-4 w-4 object-contain pointer-events-none"
          draggable={false}
          whileHover={{ rotate: [0, -5, 5, -5, 0], scale: 1.1 }}
          transition={{ duration: 0.5 }}
        />
        <span className="text-sm font-semibold tracking-tight text-foreground pointer-events-none">PictoolsApp</span>
      </div>

      {/* Version - right side */}
      <div className="absolute right-4 flex items-center gap-1.5 z-10">
        <span className="text-xs font-mono text-muted-foreground pointer-events-none">
          v{APP_VERSION}
        </span>
      </div>
    </div>
  );
}
