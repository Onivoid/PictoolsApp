import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8 page-enter">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-150 animate-pulse" />
        <img
          src="/Base Logo.png"
          alt="PictoolsApp"
          className="relative w-24 h-24 object-contain drop-shadow-2xl"
          draggable={false}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">PictoolsApp</h1>
        <p className="text-base text-muted-foreground max-w-xs">{t("home.subtitle")}</p>
      </div>
    </div>
  );
}
