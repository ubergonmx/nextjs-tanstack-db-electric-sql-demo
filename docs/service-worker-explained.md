# Service Workers Explained

## What is a Service Worker?

A **Service Worker** is a JavaScript file that runs **separately** from your web page, in the background. Think of it as a "proxy" that sits between your app and the network:

```
Your App  ←→  Service Worker  ←→  Internet
```

It can:
- **Intercept** network requests before they go to the server
- **Cache** responses for offline use
- **Serve cached content** when offline (this is how PWAs work offline)
- **Handle push notifications** in the background

## Why does it intercept requests?

In `next.config.ts`, Workbox (a service worker library) is configured with `NetworkFirst` strategy for `/api/*`:

```typescript
{
  urlPattern: ({ url }) => url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/"),
  handler: "NetworkFirst",  // ← Try network first, fall back to cache
  ...
}
```

This means: "For any `/api/*` request, intercept it, try to fetch from network, and if that fails, return cached response."

## The Long-Polling Problem

### Why are there 2 pending requests?

Here's the flow step-by-step:

```
1. TanStack DB/ElectricSQL says: "I need to open a long-polling connection"

2. App makes request:
   GET /api/contacts?live=true...

3. Service Worker intercepts it (because it matches /api/*)

4. Service Worker thinks: "I need to fetch this from network and maybe cache it"

5. Service Worker makes ITS OWN fetch:
   GET /api/contacts?live=true...

6. Now there are TWO open connections:
   - Request #1: App → Service Worker (waiting for SW to respond)
   - Request #2: Service Worker → Server (waiting for server data)
```

### Normal Request vs Long-Polling

**Normal Request** (works fine):
```
App ──request──▶ SW ──request──▶ Server
App ◀──response── SW ◀──response── Server  ✓ Done!
```

**Long-Polling** (the problem):
```
App ──request──▶ SW ──request──▶ Server
App    (waiting)    SW    (waiting)    Server (waiting for changes...)
       ↑                    ↑
       └── Both stuck waiting forever ──┘
       └── 2 pending connections in DevTools
```

For **normal requests**, this is fine:
- Server responds → SW gets response → SW passes it to app → Done!

For **long-polling**, the server **intentionally never responds** until there's new data. So:
- Both requests stay open forever
- Chrome shows 2 pending requests
- You're using 2x the connections

## The Fix

Tell the Service Worker: "Don't intercept `live=true` requests - let them go directly to the server"

```
App ──────────request──────────▶ Server
              (bypasses SW)
```

This is done by checking for `live=true` in the URL and excluding those requests from caching:

```typescript
urlPattern: ({ url }) => {
  const isSameOrigin = self.origin === url.origin;
  // Exclude live/streaming connections from SW interception
  if (url.searchParams.get('live') === 'true') {
    return false;
  }
  return isSameOrigin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
},
```

## Key Takeaways

1. **Service Workers are proxies** - they sit between your app and the network
2. **They intercept requests** based on URL patterns you configure
3. **Long-polling/streaming connections should bypass SW** - they're not meant to be cached
4. **PWAs need SW for offline support** - but not all requests should go through it
