# Deploy To Vercel

This repo is prepared for the official Convex + Vercel setup with the Vercel project rooted at `apps/web`.

The checked-in `apps/web/vercel.json` only handles SPA rewrites. The Convex deployment step follows the official Convex docs through the Vercel dashboard Build Command override.

## What Runs Where

- `Vercel`: hosts the built frontend from `apps/web/dist`
- `Convex`: backend, database, realtime, and game state
- `Clerk`: authentication

## Required Accounts

- Vercel
- Convex
- Clerk
- a Git provider connected to Vercel, usually GitHub

## Before Vercel

### 1. Prepare Clerk

Create a Clerk application and copy:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

If the Clerk application was created before November 14, 2025, open `Updates` in the Clerk Dashboard and enable `Client Trust` before shipping password sign-ins on production.

You can use `apps/web/.env.example` and `apps/web/.env.convex.example` as the source of truth for variable names.

### 2. Prepare Convex production

From the repo root:

```bash
pnpm convex:deploy
```

Then set the Clerk issuer domain on the Convex production deployment:

```bash
pnpm --filter web exec convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev
```

You can verify it with:

```bash
pnpm --filter web exec convex env get --prod CLERK_JWT_ISSUER_DOMAIN
```

### 3. Generate a Convex production deploy key

In the Convex dashboard:

- open your project
- open the production deployment
- open deployment settings
- generate a production deploy key
- copy it

This key is used by Vercel so every Git push deploys both the frontend and the Convex functions.

## Vercel Setup

### 1. Import the repo

Create a new Vercel project and import this repository.

Set:

- `Root Directory`: `apps/web`
- `Include files outside the root directory in the Build Step`: enabled
- `Framework Preset`: `Vite`

In `Build & Output Settings`, override:

- `Build Command`: `npx convex deploy --cmd "pnpm build"`
- `Output Directory`: `dist`

This app still depends on workspace packages from `packages/*`, so the "include files outside root" setting must stay enabled.

### 2. Environment variables in Vercel

Add these in Vercel Project Settings -> Environment Variables:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CONVEX_DEPLOY_KEY`

Notes:

- `VITE_CLERK_PUBLISHABLE_KEY` comes from Clerk
- `CONVEX_DEPLOY_KEY` comes from the Convex production deployment settings
- you do **not** need to set `VITE_CONVEX_URL` manually, because `convex deploy` injects it during the build

### 3. Deploy

Click Deploy.

If the deploy succeeds, Vercel will:

- install dependencies
- deploy Convex functions to production
- build the Vite app with the production Convex URL
- publish the frontend

## After Deploy

### 1. Add the production URL to Clerk

In Clerk, add your production frontend URL to the allowed origins / redirect URLs required by your auth setup.

Important:

- Convex docs note that Clerk does not support `https://<project>.vercel.app` as the final production URL
- plan to attach a custom domain in Vercel for production auth
- this repo uses Clerk-hosted sign-in, so Client Trust verification on new devices is handled by Clerk without extra frontend code

### 2. Test these routes directly

Open them directly in the browser, not only through navigation:

- `/`
- `/sign-in`
- `/friends`
- `/lobbies`
- `/leaderboards`
- `/games/minesweeper/solo`

If these work after a full page refresh, the SPA rewrite is correct.

## Ongoing Deploy Flow

After the first setup, the normal flow is:

1. Push to Git
2. Vercel starts a deployment
3. Convex production gets the updated backend
4. The frontend is rebuilt against the production Convex URL

## If You Want Preview Deployments Later

This repo is set up for a production deployment first.

If you later want per-branch preview backends too, add a separate Preview `CONVEX_DEPLOY_KEY` in Vercel. Convex supports that, but it is extra setup and not required for a small friends-only app.
