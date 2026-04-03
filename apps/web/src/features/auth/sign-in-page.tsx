import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react"
import { Link, Navigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function EnabledSignIn() {
  return (
    <>
      <SignedIn>
        <Navigate to="/onboarding" replace />
      </SignedIn>
      <SignedOut>
        <Page className="mx-auto max-w-xl">
          <PageHeader
            title="Sign in"
            description="Clerk handles the account. Convex stores the public profile and game data after the first successful login."
          />
          <Surface className="p-6">
            <SignInButton mode="modal">
              <Button size="lg">Continue with Google</Button>
            </SignInButton>
          </Surface>
        </Page>
      </SignedOut>
    </>
  )
}

export function SignInPage() {
  const servicesEnabled = usePlatformServices()

  if (!servicesEnabled) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Set up authentication"
          description="Copy `apps/web/.env.example` to `apps/web/.env.local`, then copy `apps/web/.env.convex.example` to `apps/web/.env.convex.local`."
        />
        <Surface className="p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            Put `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` in `.env.local`.
            Put `CLERK_JWT_ISSUER_DOMAIN` in `.env.convex.local`, run
            `pnpm --filter web convex:env:sync`, then start `pnpm dev`.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link to="/games/minesweeper/solo">Open Minesweeper</Link>
            </Button>
          </div>
        </Surface>
      </Page>
    )
  }

  return <EnabledSignIn />
}
