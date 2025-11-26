"use server";

import webpush from "web-push";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { pushSubscriptionsTable } from "@/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

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
      return { success: true, message: "Subscription updated" };
    }

    // Insert new subscription
    await db.insert(pushSubscriptionsTable).values({
      userId: user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
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

    if (subscriptions.length === 0) {
      return { success: true, message: "No subscriptions found for user" };
    }

    const results = await Promise.allSettled(
      subscriptions
        .filter((sub) => !excludeEndpoint || sub.endpoint !== excludeEndpoint)
        .map(async (sub) => {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys as PushSubscriptionKeys,
          };

          try {
            await webpush.sendNotification(
              pushSubscription,
              JSON.stringify(payload)
            );
            return { endpoint: sub.endpoint, success: true };
          } catch (error: any) {
            // If subscription is expired or invalid, delete it
            if (error.statusCode === 404 || error.statusCode === 410) {
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
