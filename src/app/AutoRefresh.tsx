"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While a JobTread pull runs in the background, check back this often for it.
const WHILE_REFRESHING_MS = 5000;

// Reloads the board's data in place every few minutes, and when the tab comes
// back into view, so a screen left open stays current.
export function AutoRefresh({ everyMs, refreshing = false }: { everyMs: number; refreshing?: boolean }) {
  const router = useRouter();
  const interval = refreshing ? WHILE_REFRESHING_MS : everyMs;
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      // A tab in the background waits until it is looked at again.
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, interval);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, interval]);
  return refreshing ? (
    <span className="small noprint" role="status">
      Getting the latest from JobTread…
    </span>
  ) : null;
}
