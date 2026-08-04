"use client";

import { useEffect, useState } from "react";

/**
 * Reactive network connectivity. Drives the offline banner and triggers
 * background sync when the device reconnects.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof window === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
