"use client";

import { useCallback } from "react";

/**
 * Haptic feedback through the Web Vibration API.
 *
 * iOS Safari maps `navigator.vibrate()` to the Taptic Engine (soft "success"
 * taps), giving the app a native feel. Each call is fire-and-forget and
 * silently no-ops on devices without vibration support.
 */

export type HapticType = "tap" | "success" | "warning" | "delete";

const PATTERNS: Record<HapticType, number | number[]> = {
  tap: 8,
  success: [12, 40, 12],
  warning: [30, 40, 30],
  delete: [20, 30, 20, 30, 20],
};

export function useHaptic() {
  return useCallback((type: HapticType = "tap") => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      navigator.vibrate(PATTERNS[type]);
    } catch {
      // Vibration can throw on some WebViews; ignore.
    }
  }, []);
}
