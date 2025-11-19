# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time contacts management application demonstrating TanStack DB with ElectricSQL sync and Neon Postgres. It showcases optimistic updates, real-time UI synchronization, and user-scoped data access behind Neon Auth.

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
  - Uses `userSyncTable` from `drizzle-orm/neon` for auth integration
  - Exports type-safe schemas for insert/select/update operations

- `src/collections.ts` - TanStack DB collection configuration
  - Defines `contactCollection` with Electric sync options
  - Implements `onInsert`, `onUpdate`, `onDelete` handlers that call server actions
  - Shape syncs from `/api/contacts` endpoint with user-scoped filtering

- `src/actions/contacts.ts` - Server actions for CRUD operations
  - All operations validate user auth via `stackServerApp.getUser()`
  - Enforces row-level security by checking `userId` on updates/deletes
  - Returns `{ success, contact/error }` response format

- `src/app/api/contacts/route.ts` - Electric Shape proxy endpoint
  - Proxies Electric SQL requests with user-scoped `where` filter
  - Injects Electric credentials from environment variables
  - Strips problematic headers (`content-encoding`, `content-length`)

- `src/db.ts` - Drizzle database client using Neon HTTP driver
- `src/stack.tsx` - Stack Auth server app configuration with `nextjs-cookie` token store

### Authentication Flow

1. Stack Auth handles user authentication with Neon Auth integration
2. Server actions call `stackServerApp.getUser({ or: "throw" })` to verify auth
3. Shape proxy filters data by `user_id` before streaming to client
4. All mutations verify user ownership before modifying data

### Client-Side Patterns

Components use `useLiveQuery` from `@tanstack/react-db` to subscribe to collection changes:

```tsx
const { data: contacts } = useLiveQuery({
  collection: contactCollection,
  filter: or(ilike("name", searchTerm), ilike("email", searchTerm)),
});
```

Mutations are called directly on the collection for optimistic updates, which trigger server actions defined in `collections.ts`.

### Database Migrations

- Schema defined in `src/schema.ts`
- Migrations generated via `drizzle-kit generate` into `migrations/` directory
- Applied using `drizzle-kit migrate`
- Drizzle config in `drizzle.config.ts` points to `DATABASE_URL`

## Environment Setup

Required variables (see `.example.env`):

- `NEXT_PUBLIC_STACK_PROJECT_ID`, `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`, `STACK_SECRET_SERVER_KEY` - Stack Auth credentials
- `DATABASE_URL` - Neon database connection string
- `ELECTRIC_SQL_CLOUD_SOURCE_ID`, `ELECTRIC_SQL_CLOUD_SOURCE_SECRET` - ElectricSQL sync engine credentials

## Important Notes

- Logical replication must be enabled in Neon project settings for ElectricSQL to work
- Use unpooled connection string when configuring ElectricSQL sync engine
- All database operations enforce user-scoped access through `userId` filtering
- Path alias `@/*` maps to `src/*`
