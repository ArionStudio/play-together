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
            Sign In
            <ArrowRight className="size-4" />
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Button asChild size="lg">
          <Link to="/games/minesweeper/solo">
            Play Minesweeper
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
        description="Minesweeper and Sudoku are playable now."
        actions={
          <>
            <ServicesCallToAction />
            <Button asChild size="lg" variant="outline">
              <Link to="/leaderboards">Leaderboards</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-6">
          <h2 className="text-lg font-semibold">Games</h2>
          <div className="mt-4 divide-y divide-border">
            {[
              {
                title: "Minesweeper",
                description: "Solo boards with presets and custom setups.",
                href: "/games/minesweeper/solo",
                label: "Open",
              },
              {
                title: "Sudoku",
                description: "Generated puzzles with notes and difficulty presets.",
                href: "/games/sudoku/solo",
                label: "Open",
              },
              {
                title: "Leaderboards",
                description: "Ranked solo times by category.",
                href: "/leaderboards",
                label: "View",
              },
              {
                title: servicesEnabled ? "Friends and lobbies" : "Platform setup",
                description: servicesEnabled
                  ? "Profiles, friends, and lobbies after sign-in."
                  : "Add Clerk and Convex keys to enable connected features.",
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
          <h2 className="text-lg font-semibold">Platform</h2>
          <dl className="mt-4 divide-y divide-border text-sm">
            {[
              ["Playable now", "Minesweeper and Sudoku solo."],
              ["Connected features", "Profiles, friends, lobbies, and leaderboards."],
              ["Still pending", "Parties, matchmaking, and multiplayer modes."],
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
