"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestNotification,
} from "@/actions/push";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [permissionState, setPermissionState] =
    useState<NotificationPermission>("default");

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermissionState(Notification.permission);
      checkExistingSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  async function checkExistingSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      setSubscription(existingSub);
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function subscribeToPush() {
    setIsLoading(true);
    try {
      // Request permission if not already granted
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== "granted") {
        toast.error("Notification permission denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        toast.error("Push notifications not configured");
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      setSubscription(sub);

      // Send subscription to server
      const subJson = sub.toJSON();
      const result = await subscribeUserToPush({
        endpoint: subJson.endpoint!,
        keys: {
          p256dh: subJson.keys!.p256dh!,
          auth: subJson.keys!.auth!,
        },
      });

      if (result.success) {
        toast.success("Push notifications enabled!");
      } else {
        toast.error(result.error || "Failed to enable notifications");
      }
    } catch (error) {
      console.error("Error subscribing to push:", error);
      toast.error("Failed to enable push notifications");
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribeFromPush() {
    setIsLoading(true);
    try {
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        setSubscription(null);

        const result = await unsubscribeUserFromPush(endpoint);
        if (result.success) {
          toast.success("Push notifications disabled");
        }
      }
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Failed to disable push notifications");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTestNotification() {
    const result = await sendTestNotification("This is a test notification!");
    if (result.success) {
      toast.success("Test notification sent!");
    } else {
      toast.error(result.error || "Failed to send test notification");
    }
  }

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4" />
        <span>Push notifications not supported</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Bell className="h-4 w-4 mr-2 animate-pulse" />
        Loading...
      </Button>
    );
  }

  if (permissionState === "denied") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4" />
        <span>Notifications blocked</span>
      </div>
    );
  }

  if (subscription) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestNotification}
          title="Send test notification"
        >
          <BellRing className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={unsubscribeFromPush}>
          <Bell className="h-4 w-4 mr-2" />
          Disable Notifications
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={subscribeToPush}>
      <Bell className="h-4 w-4 mr-2" />
      Enable Notifications
    </Button>
  );
}
