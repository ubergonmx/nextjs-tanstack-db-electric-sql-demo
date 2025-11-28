"use client";

import { useEffect } from "react";

/**
 * Hook that clears the app badge and notifications when the app becomes visible.
 * This ensures the badge count is reset when the user opens the app.
 */
export function useClearBadge() {
  useEffect(() => {
    // Function to clear badge and notifications
    const clearBadgeAndNotifications = async () => {
      // Clear the app badge using the Badging API
      if ("clearAppBadge" in navigator) {
        try {
          await (navigator as any).clearAppBadge();
        } catch (e) {
          console.error("Failed to clear app badge:", e);
        }
      }

      // Send message to service worker to clear notifications
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "CLEAR_BADGE",
        });
      }
    };

    // Clear on initial mount (app opened)
    clearBadgeAndNotifications();

    // Clear when app becomes visible (tab/window focused)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearBadgeAndNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
