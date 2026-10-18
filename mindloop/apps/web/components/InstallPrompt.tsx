"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "./icons";
import { Button, Card } from "./ui";
import { useT } from "@/lib/i18n";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Add to home screen": native prompt where supported (Chromium), a hint on iOS, hidden once installed. */
export function InstallPrompt() {
  const t = useT();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    /* eslint-disable react-hooks/set-state-in-effect -- environment detection after hydration */
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!event && !ios)) return null;

  return (
    <Card className="flex items-center gap-4">
      <LogoMark className="h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-ink">{t("profile.installTitle")}</h2>
        <p className="text-sm text-ink-faint">{event ? t("profile.installHint") : t("profile.installIos")}</p>
      </div>
      {event && (
        <Button
          size="sm"
          onClick={async () => {
            await event.prompt();
            setEvent(null);
          }}
        >
          {t("profile.installButton")}
        </Button>
      )}
    </Card>
  );
}
