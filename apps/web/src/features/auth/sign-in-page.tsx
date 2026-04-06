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
            description="Open Clerk sign-in to continue to your profile."
          />
          <Surface className="p-6">
            <SignInButton mode="modal">
              <Button size="lg">Continue to Sign In</Button>
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
          description="Add the Clerk and Convex env values, then restart the app."
        />
        <Surface className="space-y-3 p-6 text-sm text-muted-foreground">
          <p>`apps/web/.env.local` needs `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`.</p>
          <p>`apps/web/.env.convex.local` needs `CLERK_JWT_ISSUER_DOMAIN`.</p>
          <p>Then run `pnpm convex:env:sync` and `pnpm dev`.</p>
          <div className="pt-1">
            <Button asChild>
              <Link to="/games/sudoku/solo">Open Sudoku</Link>
            </Button>
          </div>
        </Surface>
      </Page>
    )
  }

  return <EnabledSignIn />
}
