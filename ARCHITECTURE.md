# Architecture Diagrams

This document provides visual diagrams explaining the real-time sync architecture of this contacts application.

## Table of Contents

- [Overall System Architecture](#overall-system-architecture)
- [Authentication Flow](#authentication-flow)
- [Real-time Sync Architecture](#real-time-sync-architecture)
- [Mutation Flow with Optimistic Updates](#mutation-flow-with-optimistic-updates)
- [Collection Lifecycle](#collection-lifecycle)
- [Component Data Flow](#component-data-flow)
- [ElectricSQL Shape Streaming](#electricsql-shape-streaming)

---

## Overall System Architecture

This diagram shows the complete architecture with all major components and their interactions.

```mermaid
flowchart TB
    subgraph Client["Client Browser"]
        UI[React Components]
        LiveQuery[useLiveQuery Hook]
        Collection[TanStack DB Collection]
        ElectricClient[Electric Client]
    end

    subgraph NextJS["Next.js Server"]
        API["/api/contacts<br/>Shape Proxy"]
        Actions["Server Actions<br/>(CRUD)"]
        StackAuth["Stack Auth<br/>Middleware"]
        DB_Client["Drizzle ORM<br/>Client"]
    end

    subgraph External["External Services"]
        Electric["ElectricSQL<br/>Sync Engine"]
        Neon["Neon Postgres<br/>(Source of Truth)"]
        StackService["Stack Auth<br/>Service"]
    end

    UI -->|subscribe via| LiveQuery
    LiveQuery -->|reactive query| Collection
    Collection -->|HTTP sync| ElectricClient
    ElectricClient -->|GET /v1/shape| API

    Collection -->|mutations| Actions
    Actions -->|verify user| StackAuth
    Actions -->|SQL queries| DB_Client
    DB_Client -->|write| Neon

    API -->|proxy + filter| Electric
    Electric -->|logical replication| Neon

    StackAuth -->|validate token| StackService

    Neon -->|notify changes| Electric
    Electric -->|stream updates| API
    API -->|filtered data| ElectricClient
    ElectricClient -->|update| Collection
    Collection -->|re-render| UI

    style Client fill:#e1f5ff
    style NextJS fill:#fff4e1
    style External fill:#f0f0f0
```

---

## Authentication Flow

Shows how Stack Auth integrates with the data access layer to ensure user-scoped data.

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant NextJS as Next.js Server
    participant StackAuth as Stack Auth
    participant ShapeProxy as /api/contacts Proxy
    participant Electric as ElectricSQL
    participant DB as Neon Postgres

    User->>Browser: Access Application
    Browser->>NextJS: Request Page
    NextJS->>StackAuth: getUser({ or: "redirect" })

    alt User Not Authenticated
        StackAuth-->>Browser: Redirect to Login
        Browser->>User: Show Login Page
        User->>StackAuth: Authenticate
        StackAuth-->>Browser: Set Auth Cookie
    else User Authenticated
        StackAuth-->>NextJS: Return User Object
        NextJS-->>Browser: Render Page
    end

    Browser->>ShapeProxy: GET /api/contacts?table=contacts&offset=-1
    ShapeProxy->>StackAuth: Verify Session
    StackAuth-->>ShapeProxy: Return user.id

    ShapeProxy->>Electric: GET /v1/shape?table=contacts<br/>&where=user_id='...'
    Electric->>DB: Query filtered data
    DB-->>Electric: Return user's contacts
    Electric-->>ShapeProxy: Stream shape data
    ShapeProxy-->>Browser: Filtered contacts

    Note over Browser,DB: User can only see their own data
```

---

## Real-time Sync Architecture

Illustrates the four-layer sync architecture: Postgres → ElectricSQL → TanStack DB → UI.

```mermaid
flowchart LR
    subgraph Layer1["Layer 1: Source of Truth"]
        Postgres[(Neon Postgres<br/>with Logical<br/>Replication)]
    end

    subgraph Layer2["Layer 2: Sync Engine"]
        Electric[ElectricSQL Cloud<br/>HTTP Shape API]
        LogRep[Logical Replication<br/>Consumer]
        ShapeLog[Shape Log<br/>Stream]
    end

    subgraph Layer3["Layer 3: Client Store"]
        ShapeProxy[Next.js API Proxy<br/>/api/contacts]
        ElectricClient[Electric Client<br/>ShapeStream]
        Collection[TanStack DB<br/>Collection]
        Handlers[Mutation Handlers<br/>onInsert/Update/Delete]
    end

    subgraph Layer4["Layer 4: Reactive UI"]
        LiveQuery[useLiveQuery Hook]
        Components[React Components]
    end

    Postgres -->|logical replication| LogRep
    LogRep -->|process WAL| ShapeLog
    ShapeLog -->|HTTP streaming| Electric

    Electric -->|GET /v1/shape| ShapeProxy
    ShapeProxy -->|user-filtered stream| ElectricClient
    ElectricClient -->|materialize| Collection

    Collection -->|reactive subscriptions| LiveQuery
    LiveQuery -->|re-render on change| Components

    Components -.->|mutations| Handlers
    Handlers -.->|server actions| Postgres

    style Layer1 fill:#f9f9f9
    style Layer2 fill:#e3f2fd
    style Layer3 fill:#fff3e0
    style Layer4 fill:#e8f5e9
```

---

## Mutation Flow with Optimistic Updates

Demonstrates how mutations work with optimistic updates and server reconciliation.

```mermaid
sequenceDiagram
    participant UI as React Component
    participant Collection as TanStack DB Collection
    participant Handler as Mutation Handler
    participant Action as Server Action
    participant DB as Postgres
    participant Electric as ElectricSQL

    Note over UI,Electric: User Creates New Contact

    UI->>Collection: collection.insert(newContact)

    rect rgb(200, 255, 200)
        Note over Collection: Optimistic Update (Instant UI)
        Collection->>Collection: Generate temp ID
        Collection->>Collection: Apply to local state
        Collection-->>UI: Re-render with new contact
    end

    Collection->>Handler: onInsert({ transaction })
    Handler->>Action: createContactAction(data)
    Action->>Action: Verify user auth
    Action->>DB: INSERT INTO contacts
    DB-->>Action: Return with real ID
    Action-->>Handler: { success: true, contact }

    rect rgb(255, 255, 200)
        Note over DB,Electric: Background Sync
        DB->>Electric: Logical replication event
        Electric->>Electric: Process WAL entry
        Electric->>Electric: Update shape log
    end

    rect rgb(200, 200, 255)
        Note over Collection,Electric: Reconciliation
        Collection->>Electric: Poll for updates (live mode)
        Electric-->>Collection: Stream updated data with real ID
        Collection->>Collection: Replace temp ID with real ID
        Collection->>Collection: Reconcile state
        Collection-->>UI: Re-render (ID updated)
    end

    Note over UI: User sees seamless transition from temp to real ID
```

---

## Collection Lifecycle

Shows the complete lifecycle of a TanStack DB Collection with ElectricSQL.

```mermaid
stateDiagram-v2
    [*] --> Initializing: createCollection()

    Initializing --> Syncing: Start sync

    state Syncing {
        [*] --> InitialSync
        InitialSync --> RequestingData: GET /v1/shape?offset=-1
        RequestingData --> MaterializingData: Receive initial data
        MaterializingData --> UpToDate: electric-up-to-date header

        state UpToDate {
            [*] --> LiveMode
            LiveMode --> Polling: GET /v1/shape?live=true
            Polling --> ProcessingUpdates: Receive changes
            ProcessingUpdates --> Polling: Apply & re-subscribe
        }
    }

    state "Ready for Queries" as Ready {
        [*] --> Idle
        Idle --> Querying: useLiveQuery()
        Querying --> Filtering: Apply filters
        Filtering --> Returning: Return data
        Returning --> Idle
    }

    state "Handling Mutations" as Mutations {
        [*] --> OptimisticUpdate
        OptimisticUpdate --> LocalStateChange: Apply draft changes
        LocalStateChange --> InvokingHandler: Call onInsert/Update/Delete
        InvokingHandler --> ServerAction: Execute server action
        ServerAction --> WaitingForSync: Action complete
        WaitingForSync --> Reconciliation: Receive sync update
        Reconciliation --> [*]: State reconciled
    }

    Syncing --> Ready: Collection ready
    Ready --> Mutations: User triggers mutation
    Mutations --> Ready: Mutation complete

    Syncing --> Error: Network/Auth failure
    Error --> Syncing: Retry with backoff
```

---

## Component Data Flow

Illustrates how data flows through React components using `useLiveQuery`.

```mermaid
flowchart TD
    Start([User Opens Page]) --> Mount[Component Mounts]

    Mount --> UseLiveQuery["useLiveQuery({<br/>collection: contactCollection,<br/>filter: or(ilike(...), ...)<br/>})"]

    UseLiveQuery --> Subscribe[Subscribe to Collection]
    Subscribe --> CheckReady{Collection<br/>Ready?}

    CheckReady -->|No| ShowLoading[Display Loading State]
    ShowLoading --> WaitReady[Wait for Sync]
    WaitReady --> CheckReady

    CheckReady -->|Yes| GetData[Get Current Data]
    GetData --> ApplyFilter[Apply Filter/Sort]
    ApplyFilter --> RenderUI[Render Contact List]

    RenderUI --> WaitEvent{User Action?}

    WaitEvent -->|Search| UpdateFilter[Update Filter State]
    UpdateFilter --> ApplyFilter

    WaitEvent -->|Create| CreateMutation["collection.insert({<br/>id, name, email, ...<br/>})"]
    CreateMutation --> OptimisticUI[Update UI Instantly]
    OptimisticUI --> ServerSync[Sync to Server]
    ServerSync --> ShapeUpdate[ElectricSQL Sends Update]
    ShapeUpdate --> CollectionUpdate[Collection Reconciles]
    CollectionUpdate --> Resubscribe[Trigger Subscription]
    Resubscribe --> ApplyFilter

    WaitEvent -->|Update| UpdateMutation["collection.update(id, draft => {<br/>draft.name = newName<br/>})"]
    UpdateMutation --> OptimisticUI

    WaitEvent -->|Delete| DeleteMutation[collection.delete(id)]
    DeleteMutation --> OptimisticUI

    WaitEvent -->|External Change| ExternalSync[Another Client Mutates]
    ExternalSync --> ShapeUpdate

    RenderUI --> Unmount{Component<br/>Unmounts?}
    Unmount -->|Yes| Cleanup[Unsubscribe]
    Cleanup --> End([End])
    Unmount -->|No| WaitEvent

    style OptimisticUI fill:#90EE90
    style ServerSync fill:#FFD700
    style CollectionUpdate fill:#87CEEB
```

---

## ElectricSQL Shape Streaming

Details the HTTP Shape API streaming protocol used by ElectricSQL.

```mermaid
sequenceDiagram
    participant Client as Electric Client
    participant Proxy as /api/contacts
    participant Electric as ElectricSQL
    participant Postgres as Neon Postgres

    Note over Client,Postgres: Initial Sync Phase

    Client->>Proxy: GET /api/contacts?table=contacts&offset=-1
    Proxy->>Proxy: Inject user_id filter<br/>where=user_id='abc123'
    Proxy->>Electric: GET /v1/shape?table=contacts<br/>&where=user_id='abc123'<br/>&offset=-1

    Electric->>Postgres: Query current state
    Postgres-->>Electric: Return rows
    Electric->>Electric: Build shape log
    Electric-->>Proxy: 200 OK<br/>Headers:<br/>- electric-handle: shape-handle-123<br/>- electric-offset: 0_0<br/>Body: [{operation: insert, value: {...}}, ...]
    Proxy-->>Client: Stream initial data

    loop Until Up-to-Date
        Client->>Proxy: GET with next offset
        Proxy->>Electric: Forward request
        Electric-->>Proxy: More data or empty
        Proxy-->>Client: Continue streaming
    end

    Electric-->>Proxy: Header: electric-up-to-date: true
    Proxy-->>Client: Initial sync complete

    Note over Client,Postgres: Live Mode (Real-time Updates)

    Client->>Proxy: GET /api/contacts?table=contacts<br/>&live=true<br/>&handle=shape-handle-123<br/>&offset=0_0
    Proxy->>Electric: Forward with live=true

    Note over Electric: Long-polling connection held open

    rect rgb(255, 240, 240)
        Note over Postgres: User creates contact in DB
        Postgres->>Electric: Logical replication WAL entry
        Electric->>Electric: Process change<br/>Update shape log
        Electric-->>Proxy: 200 OK<br/>[{operation: insert, value: {...}}]
        Proxy-->>Client: New data chunk
        Client->>Client: Update local collection
    end

    Client->>Proxy: GET with updated offset & cursor
    Proxy->>Electric: Continue live stream

    Note over Client,Postgres: Continuous real-time sync...
```

---

## Key Concepts

### TanStack DB Collection

- **Reactive store**: Automatically notifies subscribers when data changes
- **Optimistic updates**: Apply changes instantly to UI before server confirmation
- **Mutation handlers**: `onInsert`, `onUpdate`, `onDelete` persist changes to server
- **Automatic reconciliation**: Syncs server state back to local state

### ElectricSQL

- **Shape**: A filtered view of database table(s) that syncs to clients
- **HTTP Shape API**: RESTful streaming protocol using `offset` and `handle` parameters
- **Logical replication**: Postgres WAL (Write-Ahead Log) streaming for real-time updates
- **Live mode**: Long-polling HTTP connections for continuous sync

### Server Actions Pattern

- All mutations go through Next.js server actions
- User authentication verified on every mutation
- Row-level security enforced by `userId` filtering
- Returns `{ success, data/error }` response format

### Data Flow Summary

1. **Write Path**: Component → Collection → Mutation Handler → Server Action → Postgres
2. **Read Path**: Postgres → ElectricSQL → Shape Proxy → Electric Client → Collection → useLiveQuery → Component
3. **Sync Path**: After write, ElectricSQL detects change and streams update back through Read Path

---

## Performance Characteristics

### Optimistic Updates
- **UI Latency**: ~0ms (instant)
- **Server Confirmation**: ~100-500ms (network + DB write)
- **Sync Propagation**: ~50-200ms (ElectricSQL processing + streaming)

### Real-time Sync
- **Initial Sync**: Depends on data size (typically <1s for small datasets)
- **Live Updates**: Near real-time (~50-200ms from DB write to all clients)
- **Polling**: Long-polling keeps connection open, no unnecessary requests

### Scalability
- **Client-side**: Collections cached in memory, reactive subscriptions
- **Server-side**: ElectricSQL handles fan-out, Next.js handles auth/filtering
- **Database**: Postgres logical replication slot per shape

---

## Security Model

### Authentication Layer (Stack Auth)
- Cookie-based session management
- Token validation on every server action
- Automatic redirect for unauthenticated users

### Authorization Layer (Row-Level Security)
- Every shape filtered by `user_id='...'` in SQL `WHERE` clause
- Server actions verify `userId` matches authenticated user
- Update/Delete operations check ownership before executing

### Data Isolation
- Users can only sync shapes containing their own data
- Cross-user data access prevented at proxy level
- Even if client tampers with requests, server enforces filtering
