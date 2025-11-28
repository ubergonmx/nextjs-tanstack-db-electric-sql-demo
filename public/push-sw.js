// Push notification service worker
// This handles push events when the app is in the background

self.addEventListener("push", function (event) {
  if (!event.data) {
    console.log("Push event but no data");
    return;
  }

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "You have a new notification",
      icon: data.icon || "/icons/icon-192x192.png",
      // Badge must be monochrome (white on transparent) for Android
      badge: "/icons/badge-96x96.svg",
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        url: data.url || "/",
      },
      actions: data.actions || [],
      tag: data.tag || "default",
      renotify: true,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "Contacts App", options)
    );
  } catch (error) {
    console.error("Error showing notification:", error);
  }
});

self.addEventListener("notificationclick", function (event) {
  console.log("Notification click received.");
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    Promise.all([
      // Clear the app badge when notification is clicked
      navigator.clearAppBadge ? navigator.clearAppBadge() : Promise.resolve(),
      // Open or focus the app
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (clientList) {
          // Check if there's already a window/tab open
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && "focus" in client) {
              client.navigate(urlToOpen);
              return client.focus();
            }
          }
          // If no window is open, open a new one
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        }),
    ])
  );
});

// Handle notification close
self.addEventListener("notificationclose", function (event) {
  console.log("Notification was closed", event.notification.tag);
  // Clear badge when notification is dismissed
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
});

// Clear badge and notifications when app becomes visible
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "CLEAR_BADGE") {
    // Clear the app badge
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {});
    }
    // Close all notifications from this app
    self.registration.getNotifications().then(function (notifications) {
      notifications.forEach(function (notification) {
        notification.close();
      });
    });
  }
});
