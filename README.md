# Play Together

Monorepo for a puzzle platform built around:

- `apps/web`: React + Vite frontend with optional Clerk + Convex integration
- `packages/game-contracts`: shared game and ruleset contracts
- `packages/game-core`: shared key-building and scoring helpers
- `packages/minesweeper-engine`: deterministic Minesweeper engine
- `packages/sudoku-engine`: Sudoku generation and gameplay helpers
- `packages/ui`: shared UI components

## Workspace Commands

```bash
pnpm install
pnpm convex:dev
pnpm convex:env:sync
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter web build
pnpm dev
```

## Runtime Setup

This repo expects two local env files inside `apps/web`:

- `.env.local` for frontend Vite variables
- `.env.convex.local` for Convex deployment env variables

Start from the examples:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/web/.env.convex.example apps/web/.env.convex.local
```

Fill them with the values below.

### 1. `VITE_CLERK_PUBLISHABLE_KEY`

Put this in `apps/web/.env.local`.

Where to get it:

- Open the Clerk Dashboard
- Select your application
- If the application was created before November 14, 2025, open `Updates` and enable `Client Trust`
- Go to `API Keys`
- In `Quick Copy`, copy the `Publishable Key`

Expected shape:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 2. `VITE_CONVEX_URL`

Put this in `apps/web/.env.local`.

Where to get it:

- Open the Convex Dashboard
- Select your project and deployment
- Go to `Settings` -> `URL and Deploy Key`
- Copy the deployment URL

Expected shape:

```bash
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

Notes:

- Convex docs say `npx convex dev` can also write the deployment URL into your frontend `.env` file for Vite projects.
- If you already have the URL in the dashboard, copying it manually is fine.

### 3. `CLERK_JWT_ISSUER_DOMAIN`

Put this in `apps/web/.env.convex.local`.

Where to get it:

- Open the Clerk Dashboard
- Select your application
- Enable the `Convex` integration if you have not already
- Go to `API Keys`
- Copy the `Frontend API URL`

Expected shape:

```bash
CLERK_JWT_ISSUER_DOMAIN=https://your-instance.clerk.accounts.dev
```

This repo reads that value in `apps/web/convex/auth.config.ts` and registers Clerk with `applicationID: "convex"`, so the Clerk side must issue the `convex` JWT template expected by `ConvexProviderWithClerk`.

Client Trust note:

- this app uses Clerk's hosted modal sign-in via `SignInButton`, not a custom password sign-in flow
- when Client Trust triggers on a new device for a password sign-in, Clerk handles the extra verification step in its own UI
- there is no repo-specific `needs_client_trust` handler to add unless you later replace the hosted flow with a custom Clerk API sign-in implementation

### 4. Configure the Convex deployment first

Run this from the repo root:

```bash
pnpm convex:dev
```

Why this is required:

- `CLERK_JWT_ISSUER_DOMAIN` is pushed into a specific Convex deployment
- that deployment is not known until `convex dev` links or creates the project locally
- running `npx convex dev` from the repo root fails here because `convex` is installed in `apps/web`, not in the root package

If Convex prints:

```bash
Convex AI files are not installed. Run npx convex ai-files install to get started or npx convex ai-files disable to hide this message.
```

that message is optional. It does not block app setup. You can ignore it or run:

```bash
cd apps/web
npx convex ai-files disable
```

### 5. Sync the Convex env and start dev

```bash
pnpm convex:env:sync
pnpm dev
```

If `convex:env:sync` succeeds, Convex receives `CLERK_JWT_ISSUER_DOMAIN` from `apps/web/.env.convex.local`.

Final expected local files:

```bash
# apps/web/.env.local
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CONVEX_URL=https://your-deployment.convex.cloud

# apps/web/.env.convex.local
CLERK_JWT_ISSUER_DOMAIN=https://your-instance.clerk.accounts.dev
```

## Deploy To Vercel

For production hosting on Vercel, follow `DEPLOY_VERCEL.md`.

The repo already includes `apps/web/vercel.json` for SPA rewrites, and the Vercel project should follow the official Convex setup from `DEPLOY_VERCEL.md` so Vercel can:

- build from `apps/web`
- deploy Convex during the build
- inject `VITE_CONVEX_URL` automatically
- rewrite SPA routes to `index.html`
