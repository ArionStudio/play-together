import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react"
import { GameController, House, List, Trophy, Users, X } from "@phosphor-icons/react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { buildProfilePath } from "@/features/profile/profile-path.ts"

const navigation = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/games/minesweeper/solo", label: "Minesweeper", icon: GameController },
  { to: "/games/sudoku/solo", label: "Sudoku", icon: GameController },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/lobbies", label: "Lobbies", icon: List },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
]

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
    sessionStatus.usernameTag &&
    (location.pathname === "/onboarding" || location.pathname === "/sign-in")
  ) {
    return <Navigate to={buildProfilePath(sessionStatus.usernameTag)} replace />
  }

  return null
}

function EnabledAuthActions({ stacked = false }: { stacked?: boolean }) {
  const profile = useQuery(api.profiles.current)

  return (
    <>
      <SignedIn>
        <div className={stacked ? "flex flex-col items-stretch gap-3" : "flex items-center gap-3"}>
          <Button asChild className={stacked ? "w-full" : undefined} size="sm" variant="outline">
            <Link to={profile ? buildProfilePath(profile.usernameTag) : "/onboarding"}>
              {profile ? "Profile" : "Finish profile"}
            </Link>
          </Button>
          <UserButton />
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button className={stacked ? "w-full" : undefined} size="sm">
            Sign In With Google
          </Button>
        </SignInButton>
      </SignedOut>
    </>
  )
}

function BrandLink() {
  return (
    <Link to="/" className="block">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GameController className="size-5" weight="fill" />
        </div>
        <p className="text-base font-semibold tracking-tight">Play Together</p>
      </div>
    </Link>
  )
}

function ShellNavigation({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  return (
    <nav className={className}>
      <ul className="flex flex-col gap-2">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              end={end}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "inline-flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
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
  )
}

function PresenceSync() {
  const HEARTBEAT_MS = 120_000
  const location = useLocation()
  const { isLoaded, isSignedIn } = useAuth()
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth()
  const sessionStatus = useQuery(
    api.profiles.sessionStatus,
    isConvexAuthenticated ? {} : "skip"
  )
  const touchPresence = useMutation(api.profiles.touchPresence)
  const lastPublishedAtRef = useRef(0)
  const lastPublishedKeyRef = useRef<string | null>(null)
  const nextStatus =
    location.pathname.startsWith("/games/minesweeper/match/") ? "in_game" : "available"

  const publishPresence = useEffectEvent(
    (
      presence: "online" | "away" | "offline",
      status: "available" | "in_game" | "offline",
      force = false
    ) => {
      const nextKey = `${presence}:${status}`
      const now = Date.now()

      if (
        !force &&
        lastPublishedKeyRef.current === nextKey &&
        now - lastPublishedAtRef.current < HEARTBEAT_MS
      ) {
        return
      }

      lastPublishedAtRef.current = now
      lastPublishedKeyRef.current = nextKey
      void touchPresence({ presence, status })
    }
  )

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isConvexAuthenticated || !sessionStatus?.hasProfile) {
      return
    }

    const syncVisiblePresence = () => {
      publishPresence(
        document.visibilityState === "visible" ? "online" : "away",
        nextStatus
      )
    }

    const handlePageHide = () => {
      publishPresence("offline", "offline", true)
    }

    syncVisiblePresence()

    const interval = window.setInterval(syncVisiblePresence, HEARTBEAT_MS)

    document.addEventListener("visibilitychange", syncVisiblePresence)
    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", syncVisiblePresence)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [isLoaded, isSignedIn, isConvexAuthenticated, nextStatus, sessionStatus?.hasProfile])

  return null
}

export function ShellLayout() {
  const servicesEnabled = usePlatformServices()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-svh bg-background text-foreground">
      {servicesEnabled ? <PlatformRouteGuard /> : null}
      {servicesEnabled ? <PresenceSync /> : null}
      <div className="min-h-svh w-full lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card lg:block">
          <div className="px-4 py-5 sm:px-6 lg:px-6">
            <BrandLink />
          </div>
          <ShellNavigation className="border-t border-border px-4 py-4" />
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <BrandLink />
              <Button
                aria-controls="mobile-navigation"
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileMenuOpen((open) => !open)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                {mobileMenuOpen ? <X weight="bold" /> : <List weight="bold" />}
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3 lg:mt-0">
              <div className="hidden items-center gap-3 sm:flex">
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
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <div
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-full max-w-xs flex-col border-r border-border bg-background"
            id="mobile-navigation"
            role="dialog"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <BrandLink />
              <Button
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <X weight="bold" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <ShellNavigation onNavigate={() => setMobileMenuOpen(false)} />
              <div className="mt-6 border-t border-border pt-6">
                <div>
                  {servicesEnabled ? (
                    <EnabledAuthActions stacked />
                  ) : (
                    <Button asChild className="w-full" size="sm">
                      <Link to="/sign-in">Open setup</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
