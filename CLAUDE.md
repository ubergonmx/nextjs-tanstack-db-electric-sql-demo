# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time contacts management application demonstrating TanStack DB with ElectricSQL sync and Neon Postgres. It showcases optimistic updates, real-time UI synchronization, and user-scoped data access behind Better Auth.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production bundle
- `npm start` - Start production server
- `npm run typecheck` - Run TypeScript type checking
- `npm run fmt` - Format code with Prettier
- `npm run db:generate` - Generate Drizzle migrations from schema
- `npm run db:migrate` - Apply migrations to database
- `npm run db:studio` - Open Drizzle Studio for database management

## Architecture

### Data Flow & Sync Architecture

The application uses a multi-layered sync architecture:

1. **Postgres (Neon)** - Source of truth with logical replication enabled
2. **ElectricSQL** - Sync engine that streams changes via HTTP Shape API
3. **TanStack DB Collections** - Client-side reactive collections with optimistic updates
4. **Server Actions** - Mutations that write back to Postgres

### Key Files & Structure

- `src/schema.ts` - Drizzle schema definitions with Zod validation schemas
  - Exports type-safe schemas for insert/select/update operations

- `src/lib/auth.ts` - Better Auth server configuration
  - Uses Drizzle adapter with PostgreSQL
  - Email/password authentication enabled
  - Session configuration with cookie caching

- `src/lib/auth-client.ts` - Better Auth client for React
  - Exports `signIn`, `signUp`, `signOut`, `useSession`, `getSession`

- `src/lib/auth-schema.ts` - Better Auth database schema (auto-generated)
  - Contains `user`, `session`, `account`, `verification` tables

- `src/collections.ts` - TanStack DB collection configuration
  - Defines `contactCollection` with Electric sync options
  - Implements `onInsert`, `onUpdate`, `onDelete` handlers that call server actions
  - Shape syncs from `/api/contacts` endpoint with user-scoped filtering

- `src/actions/contacts.ts` - Server actions for CRUD operations
  - All operations validate user auth via `auth.api.getSession()`
  - Enforces row-level security by checking `userId` on updates/deletes
  - Returns `{ success, contact/error }` response format

- `src/app/api/auth/[...all]/route.ts` - Better Auth API route handler

- `src/app/api/contacts/route.ts` - Electric Shape proxy endpoint
  - Proxies Electric SQL requests with user-scoped `where` filter
  - Injects Electric credentials from environment variables
  - Strips problematic headers (`content-encoding`, `content-length`)

- `src/db.ts` - Drizzle database client using Neon HTTP driver

### Authentication Flow

1. Better Auth handles user authentication with email/password
2. Server actions call `auth.api.getSession()` to verify auth
3. Shape proxy filters data by `user_id` before streaming to client
4. All mutations verify user ownership before modifying data

### Auth Pages

- `/sign-in` - Sign in page with email/password
- `/sign-up` - Sign up page with email/password

### Client-Side Patterns

Components use `useLiveQuery` from `@tanstack/react-db` to subscribe to collection changes:

```tsx
const { data: contacts } = useLiveQuery(
  (q) => q.from({ contacts: contactCollection }),
  [],
);
```

Mutations are called directly on the collection for optimistic updates, which trigger server actions defined in `collections.ts`.

Use `useSession` from `@/lib/auth-client` to get the current user session on the client.

### Database Migrations

- Contact schema defined in `src/schema.ts`
- Auth schema defined in `src/lib/auth-schema.ts`
- Migrations generated via `drizzle-kit generate` into `migrations/` directory
- Applied using `drizzle-kit migrate`
- Drizzle config in `drizzle.config.ts` points to `DATABASE_URL`

## Environment Setup

Required variables (see `.example.env`):

- `BETTER_AUTH_SECRET` - Secret for Better Auth (generate with: `openssl rand -base64 32`)
- `NEXT_PUBLIC_APP_URL` - App URL (default: http://localhost:3000)
- `DATABASE_URL` - Neon database connection string
- `ELECTRIC_SQL_CLOUD_SOURCE_ID`, `ELECTRIC_SQL_CLOUD_SOURCE_SECRET` - ElectricSQL sync engine credentials

## PWA Configuration

This app is configured as a Progressive Web App using `@ducanh2912/next-pwa`.

### Key PWA Files

- `next.config.ts` - PWA plugin configuration with custom runtime caching
- `public/manifest.json` - Web app manifest with icons, theme colors, display mode
- `public/push-sw.js` - Push notification service worker (imported by main SW)
- `public/sw.js` - Auto-generated service worker (do not edit, add to .gitignore)
- `public/icons/` - App icons for various sizes and purposes

### iOS PWA Considerations

iOS Safari has specific requirements for PWAs:

1. **Standalone Mode** - Requires `appleWebApp.capable: true` in Next.js metadata (configured in `src/app/layout.tsx`)
2. **Cookie Isolation** - iOS PWAs have separate cookie storage from Safari browser
3. **CSRF Issues** - iOS PWAs in standalone mode don't send origin headers properly, requiring `disableCSRFCheck: true` in Better Auth config
4. **Push Notifications** - Only supported on iOS 16.4+ when installed as PWA (not in browser)

### Android PWA Considerations

1. **Notification Badge Icon** - Must be monochrome (white on transparent background). Located at `public/icons/badge-96x96.svg`
2. **Large Icon** - Can be full color, uses `public/icons/icon-192x192.png`

### Service Worker Notes

The default `@ducanh2912/next-pwa` start-url caching uses async/generator syntax that isn't properly bundled, causing `_async_to_generator is not defined` errors. This is fixed by providing custom `runtimeCaching` in `next.config.ts` that avoids the problematic code.

## Push Notifications

### Key Files

- `src/components/push-notification-manager.tsx` - UI component for subscribing to push
- `src/actions/push.ts` - Server actions for managing push subscriptions
- `public/push-sw.js` - Handles push events and notification clicks

### Environment Variables

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - Public VAPID key for push subscriptions
- `VAPID_PRIVATE_KEY` - Private VAPID key (server-side only)

Generate VAPID keys with: `npx web-push generate-vapid-keys`

## Real-time Sync Sound

The `src/hooks/use-contact-sound.ts` hook plays a notification sound when contacts are synced from other devices. It tracks local mutations to avoid playing sounds for the user's own actions. Key behavior:

- Intercepts `contactCollection.insert` to track local mutation IDs
- Uses `subscribeChanges` to detect remote inserts
- IDs are tracked for 30 seconds to handle ElectricSQL sync confirmations

## Authentication for PWAs

Better Auth is configured in `src/lib/auth.ts` with PWA-specific settings:

- `cookiePrefix: "contacts-app"` - Custom cookie prefix (middleware must match this)
- `useSecureCookies` - Only enabled for HTTPS URLs (not NODE_ENV) to support local testing
- `disableCSRFCheck: true` - Required for iOS PWA compatibility
- Session expires in 30 days for better PWA persistence

The middleware (`src/middleware.ts`) checks for `contacts-app.session_token` cookie.

## TanStack DB + ElectricSQL Sync

### Transaction ID (txid) Format

When returning transaction IDs from server actions for TanStack DB sync confirmation, you **must** use the correct PostgreSQL cast to match ElectricSQL's logical replication format:

```sql
SELECT pg_current_xact_id()::xid::text::int as txid
```

- `pg_current_xact_id()` returns the current transaction's 64-bit ID
- `::xid` converts to PostgreSQL's 32-bit transaction ID type (matching logical replication)
- `::text::int` converts to integer for JavaScript

**Wrong format** (causes 409 conflicts and UI flickering):
```sql
SELECT pg_current_xact_id() as txid  -- Returns bigint, not matching Electric's format
```

The server actions in `src/actions/contacts.ts` use transactions to ensure the txid matches the mutation:

```typescript
const [insertResult, txidResult] = await sql.transaction([
  sql`INSERT INTO contacts (...) VALUES (...) RETURNING *`,
  sql`SELECT pg_current_xact_id()::xid::text::int as txid`,
]);
```

The collection handlers in `src/collections.ts` return `{ txid: results }` where results is `number[]`.

## Important Notes

- Logical replication must be enabled in Neon project settings for ElectricSQL to work
- Use unpooled connection string when configuring ElectricSQL sync engine
- All database operations enforce user-scoped access through `userId` filtering
- Path alias `@/*` maps to `src/*`
- Run `npx @better-auth/cli migrate` to create Better Auth tables in database
- Add `public/sw.js` and `public/workbox-*.js` to `.gitignore` (auto-generated)
