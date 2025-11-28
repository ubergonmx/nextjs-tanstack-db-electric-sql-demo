"use server";

import webpush from "web-push";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { pushSubscriptionsTable } from "@/schema";
import { eq, and } from "drizzle-orm";
import { headers, cookies } from "next/headers";

// Configure web-push with VAPID details
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:contact@example.com", // Replace with your email
    vapidPublicKey,
    vapidPrivateKey
  );
}

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

async function getUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  return session.user;
}

export async function subscribeUserToPush(subscription: PushSubscriptionData) {
  try {
    const user = await getUser();

    // Check if subscription already exists
    const existing = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Update existing subscription with new user if different
      if (existing[0].userId !== user.id) {
        await db
          .update(pushSubscriptionsTable)
          .set({ userId: user.id, keys: subscription.keys })
          .where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint));
      }
    } else {
      // Insert new subscription
      await db.insert(pushSubscriptionsTable).values({
        userId: user.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      });
    }

    // Store the endpoint in a cookie so we can exclude this device from notifications
    const cookieStore = await cookies();
    cookieStore.set("push-endpoint", subscription.endpoint, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return { success: true, message: "Subscribed to push notifications" };
  } catch (error) {
    console.error("Error subscribing to push:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to subscribe to push",
    };
  }
}

// Helper to get current device's push endpoint from cookie
export async function getCurrentDeviceEndpoint(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("push-endpoint")?.value || null;
  } catch {
    return null;
  }
}

export async function unsubscribeUserFromPush(endpoint: string) {
  try {
    const user = await getUser();

    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, endpoint),
          eq(pushSubscriptionsTable.userId, user.id)
        )
      );

    // Clear the push endpoint cookie
    const cookieStore = await cookies();
    cookieStore.delete("push-endpoint");

    return { success: true, message: "Unsubscribed from push notifications" };
  } catch (error) {
    console.error("Error unsubscribing from push:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to unsubscribe from push",
    };
  }
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}

// Send notification to a specific user (excluding a specific endpoint to avoid self-notification)
export async function sendPushNotificationToUser(
  userId: string,
  payload: NotificationPayload,
  excludeEndpoint?: string
) {
  try {
    // Get all subscriptions for the user
    let query = db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId));

    const subscriptions = await query;

    console.log(`[Push] User ${userId} has ${subscriptions.length} subscription(s)`);
    if (excludeEndpoint) {
      console.log(`[Push] Excluding endpoint: ${excludeEndpoint.substring(0, 50)}...`);
    }

    if (subscriptions.length === 0) {
      return { success: true, message: "No subscriptions found for user" };
    }

    // Filter subscriptions (excluding current device if endpoint provided)
    const targetSubscriptions = subscriptions.filter(
      (sub) => !excludeEndpoint || sub.endpoint !== excludeEndpoint
    );

    console.log(`[Push] Sending to ${targetSubscriptions.length} of ${subscriptions.length} subscription(s)`);

    const results = await Promise.allSettled(
      targetSubscriptions.map(async (sub) => {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys as PushSubscriptionKeys,
          };

          try {
            await webpush.sendNotification(
              pushSubscription,
              JSON.stringify(payload)
            );
            console.log(`[Push] Successfully sent to ${sub.endpoint.substring(0, 50)}...`);
            return { endpoint: sub.endpoint, success: true };
          } catch (error: any) {
            console.error(`[Push] Failed to send to ${sub.endpoint.substring(0, 50)}...`, error.statusCode, error.message);
            // If subscription is expired or invalid, delete it
            if (error.statusCode === 404 || error.statusCode === 410) {
              console.log(`[Push] Removing expired/invalid subscription: ${sub.endpoint.substring(0, 50)}...`);
              await db
                .delete(pushSubscriptionsTable)
                .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
            }
            throw error;
          }
        })
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return {
      success: true,
      message: `Sent to ${successful} devices, ${failed} failed`,
    };
  } catch (error) {
    console.error("Error sending push notification:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send push notification",
    };
  }
}

// Test sending a notification to the current user
export async function sendTestNotification(message: string) {
  try {
    const user = await getUser();

    return await sendPushNotificationToUser(user.id, {
      title: "Test Notification",
      body: message,
      icon: "/icons/icon-192x192.svg",
      url: "/",
      tag: "test",
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send test notification",
    };
  }
}
