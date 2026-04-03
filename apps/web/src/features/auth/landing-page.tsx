import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react"
import { ArrowRight } from "@phosphor-icons/react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function ServicesCallToAction() {
  const servicesEnabled = usePlatformServices()

  if (!servicesEnabled) {
    return (
      <Button asChild size="lg">
        <Link to="/sign-in">
          Add Clerk and Convex keys
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    )
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="lg">
            Sign In With Google
            <ArrowRight className="size-4" />
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Button asChild size="lg">
          <Link to="/games/minesweeper/solo">
            Launch Minesweeper
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </SignedIn>
    </>
  )
}

export function LandingPage() {
  const servicesEnabled = usePlatformServices()

  return (
    <Page>
      <PageHeader
        title="Play Together"
        description="Minesweeper and Sudoku solo are live now. Accounts, friends, lobbies, and profile flows are wired into the app structure and activate when Clerk and Convex are configured."
        actions={
          <>
            <ServicesCallToAction />
            <Button asChild size="lg" variant="outline">
              <Link to="/leaderboards">Leaderboards</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Surface className="p-6">
          <h2 className="text-lg font-semibold">Start here</h2>
          <div className="mt-4 divide-y divide-border">
            {[
              {
                title: "Play Minesweeper",
                description: "The live game in this build. Presets and custom boards are already playable.",
                href: "/games/minesweeper/solo",
                label: "Open",
              },
              {
                title: "Play Sudoku",
                description: "Classic solo boards with generated puzzles, notes mode, and difficulty presets.",
                href: "/games/sudoku",
                label: "Open",
              },
              {
                title: "Check leaderboards",
                description: "Preview how ranked results are separated by game and board type.",
                href: "/leaderboards",
                label: "View",
              },
              {
                title: servicesEnabled ? "Open social screens" : "Finish platform setup",
                description: servicesEnabled
                  ? "Friends, onboarding, and profile routes are available when you sign in."
                  : "Add Clerk and Convex keys to enable sign-in, profiles, and realtime data.",
                href: servicesEnabled ? "/friends" : "/sign-in",
                label: servicesEnabled ? "Browse" : "Setup",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={item.href}>{item.label}</Link>
                </Button>
              </div>
            ))}
          </div>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-lg font-semibold">Current state</h2>
          <dl className="mt-4 divide-y divide-border text-sm">
            {[
              ["Playable now", "Solo Minesweeper with presets and custom boards, plus solo Sudoku with seeded puzzles, notes, and difficulty presets."],
              ["Requires setup", "Google sign-in, public profiles, and Convex-backed data."],
              ["Next in line", "Parties, matchmaking, multiplayer lobbies, and more games."],
            ].map(([term, detail]) => (
              <div key={term} className="py-4">
                <dt className="font-medium">{term}</dt>
                <dd className="mt-1 leading-6 text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </div>
    </Page>
  )
}
