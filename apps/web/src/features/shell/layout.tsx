import { useConvexAuth, useQuery } from "convex/react"
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react"
import { GameController, House, List, Trophy, Users } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "../../../convex/_generated/api"

const navigation = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/games/minesweeper/solo", label: "Minesweeper", icon: GameController },
  { to: "/games/sudoku", label: "Sudoku", icon: GameController },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/lobbies", label: "Lobbies", icon: List },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
]

function AuthDebugPanel() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(
    api.profiles.sessionStatus,
    isConvexAuthenticated ? {} : "skip"
  )
  const [clerkTokenState, setClerkTokenState] = useState<
    "idle" | "checking" | "present" | "missing" | "error"
  >("idle")

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return
    }

    let cancelled = false

    void (async () => {
      setClerkTokenState("checking")

      try {
        const token = await getToken({ template: "convex" })

        if (!cancelled) {
          setClerkTokenState(token ? "present" : "missing")
        }
      } catch {
        if (!cancelled) {
          setClerkTokenState("error")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [getToken, isLoaded, isSignedIn])

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded border border-border px-2 py-1">
        Clerk: {!isLoaded ? "loading" : isSignedIn ? "signed in" : "signed out"}
      </span>
      <span className="rounded border border-border px-2 py-1">
        Clerk token:{" "}
        {!isSignedIn
          ? "n/a"
          : clerkTokenState === "idle"
            ? "n/a"
            : clerkTokenState}
      </span>
      <span className="rounded border border-border px-2 py-1">
        Convex:{" "}
        {!isSignedIn
          ? "n/a"
          : isConvexLoading
            ? "checking"
            : isConvexAuthenticated
              ? "authenticated"
              : "missing token"}
      </span>
      <span className="rounded border border-border px-2 py-1">
        Profile:{" "}
        {!isSignedIn || !isConvexAuthenticated
          ? "n/a"
          : sessionStatus === undefined
            ? "checking"
            : sessionStatus.hasProfile
              ? sessionStatus.usernameTag
              : "not created"}
      </span>
    </div>
  )
}

function PlatformRouteGuard() {
  const location = useLocation()
  const { isLoaded, isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(
    api.profiles.sessionStatus,
    isConvexAuthenticated ? {} : "skip"
  )

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    if (location.pathname === "/onboarding") {
      return <Navigate to="/sign-in" replace />
    }

    return null
  }

  if ((isSignedIn && isConvexLoading) || (isConvexAuthenticated && sessionStatus === undefined)) {
    return null
  }

  if (
    isConvexAuthenticated &&
    sessionStatus &&
    !sessionStatus.hasProfile &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />
  }

  if (
    isConvexAuthenticated &&
    sessionStatus &&
    sessionStatus.hasProfile &&
    (location.pathname === "/onboarding" || location.pathname === "/sign-in")
  ) {
    return <Navigate to={`/profile/${sessionStatus.usernameTag}`} replace />
  }

  return null
}

function EnabledAuthActions() {
  const profile = useQuery(api.profiles.current)

  return (
    <>
      <SignedIn>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <Link to={profile ? `/profile/${profile.usernameTag}` : "/onboarding"}>
              {profile ? "Profile" : "Finish profile"}
            </Link>
          </Button>
          <UserButton />
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="sm">Sign In With Google</Button>
        </SignInButton>
      </SignedOut>
    </>
  )
}

export function ShellLayout() {
  const servicesEnabled = usePlatformServices()

  return (
    <div className="min-h-svh bg-background text-foreground">
      {servicesEnabled ? <PlatformRouteGuard /> : null}
      <div className="min-h-svh w-full lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-card/40 lg:border-r lg:border-b-0">
          <div className="px-4 py-5 sm:px-6 lg:px-6">
            <Link to="/" className="block">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GameController className="size-5" weight="fill" />
                </div>
                <div>
                  <p className="text-base font-semibold tracking-tight">Play Together</p>
                  <p className="text-sm text-muted-foreground">Puzzle platform</p>
                </div>
              </div>
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {servicesEnabled
                ? "Accounts and Convex-backed state are active."
                : "Running in local preview mode until Clerk and Convex are configured."}
            </p>
          </div>
          <nav className="overflow-x-auto border-t border-border px-3 py-3 lg:border-t-0 lg:px-4 lg:pb-6">
            <ul className="flex gap-2 lg:flex-col">
              {navigation.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    end={end}
                    to={to}
                    className={({ isActive }) =>
                      [
                        "inline-flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      ].join(" ")
                    }
                  >
                    <Icon className="size-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {servicesEnabled
                    ? "Signed-in gameplay, profiles, and social flows are live."
                    : "Social features activate after setup."}
                </p>
                {servicesEnabled ? <AuthDebugPanel /> : null}
              </div>
              <div className="flex items-center gap-3">
                {servicesEnabled ? (
                  <EnabledAuthActions />
                ) : (
                  <Button asChild size="sm">
                    <Link to="/sign-in">Open setup</Link>
                  </Button>
                )}
              </div>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
