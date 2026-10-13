"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the board's data in place every few minutes, and when the tab comes
// back into view, so a screen left open stays current.
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everyMs]);
  return null;
}
