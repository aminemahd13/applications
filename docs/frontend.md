# Frontend Documentation

The frontend is a **Next.js 14** application using the **App Router**.

## Project Structure

```
apps/web/
├── app/                  # App Router
│   ├── (auth)/           # Login, Signup (No Layout)
│   ├── (portal)/         # Applicant Dashboard (Sidebar Layout)
│   ├── (staff)/          # Staff Panel (Event Context Layout)
│   ├── (admin)/          # Global Admin (Admin Layout)
│   └── site/             # Public Microsites
├── components/
│   ├── ui/               # shadcn/ui primitives (Button, Input)
│   ├── shared/           # Reusable business components
│   ├── microsite/        # CMS Block Renderers
│   └── form/             # Dynamic Form Builder components
├── lib/                  # Utilities, API Client, Hooks
└── public/               # Static assets
```

## Routing Strategy

We use **Route Groups** `(...)` to separate layouts without affecting the URL path.

- `(portal)/dashboard` -> `/dashboard`
- `(staff)/staff/[eventId]` -> `/staff/[eventId]`

### Dynamic Routing
- **Events**: `/events/[slug]`
- **Microsites**: Handled via `middleware.ts` rewrites (supports subdomains).

## Component System

We use **shadcn/ui** (based on Radix UI) + **Tailwind CSS**.

### Key Components

#### `BlockRenderer` (`components/microsite/block-renderer.tsx`)
The heart of the CMS. It takes a JSON array of blocks and renders them.
- Supported Blocks: `Hero`, `Text`, `Schedule`, `FAQ`, `Logos`, `Gallery`.
- Each block is a separate component in `components/microsite/blocks/`.

#### `DynamicForm` (`components/form/dynamic-form.tsx`)
Renders a form based on a JSON schema (from the backend).
- Uses `react-hook-form` + `zod` resolver.
- Supports conditional logic (fields show/hide based on other fields).

## State Management

- **Server State**: `TanStack React Query`. Used for almost all data fetching.
- **Client State**: `React.useState` / `useReducer` for complex UI (e.g., Step Builder).
- **URL State**: `nuqs` library to sync state with URL query params (filters, tabs).

## Styling

- **Tailwind v4**: Zero-runtime CSS.
- **Theming**: CSS Variables for colors (`--primary`, `--secondary`).
- **Dark Mode**: Supported natively via `next-themes`.

## Microsite Builder

The builder at `/staff/[eventId]/microsite/[pageId]` allows WYSIWYG editing.
- **Drag & Drop**: Uses `dnd-kit` to reorder blocks.
- **Live Preview**: The editor renders the actual components with an overlay for controls.
- **Auto-Save**: Changes are saved to a draft version in the backend.

## Error Handling

- **Global Error Boundary**: `app/global-error.tsx`.
- **Toasts**: `sonner` is used for notifications (Success/Error).
- **API Errors**: The `apiClient` wrapper automatically parses backend Zod errors and displays them as form errors or toasts.
