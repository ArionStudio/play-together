import {
  GameController,
  House,
  List,
  MagnifyingGlass,
  Trophy,
  Users,
  Warning,
} from "@phosphor-icons/react"
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react"
import {
  Link,
  isRouteErrorResponse,
  useLocation,
  useRouteError,
} from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

const recoveryLinks = [
  { to: "/", label: "Home", icon: House },
  { to: "/games/minesweeper/solo", label: "Minesweeper", icon: GameController },
  { to: "/games/sudoku/solo", label: "Sudoku", icon: MagnifyingGlass },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/lobbies", label: "Lobbies", icon: List },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
]

type ErrorState = {
  detail?: string
  description: string
  title: string
}

function stringifyErrorData(data: unknown) {
  if (typeof data === "string") {
    return data
  }

  if (data === null || data === undefined) {
    return undefined
  }

  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function getErrorState(error: unknown): ErrorState {
  if (isRouteErrorResponse(error)) {
    const detail = [error.statusText, stringifyErrorData(error.data)]
      .filter(Boolean)
      .join("\n\n")

    if (error.status === 404) {
      return {
        title: "Page not found",
        description:
          "The route you requested does not exist or is no longer available.",
        detail,
      }
    }

    if (error.status >= 500) {
      return {
        title: "This screen failed to load",
        description:
          "The request reached the app, but the page could not finish rendering.",
        detail,
      }
    }

    return {
      title: "This request could not be completed",
      description:
        "The app rejected the current navigation and returned an error response.",
      detail,
    }
  }

  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      description:
        "The app hit an unexpected error while rendering this screen.",
      detail: import.meta.env.DEV ? error.stack ?? error.message : error.message,
    }
  }

  if (typeof error === "string") {
    return {
      title: "Something went wrong",
      description:
        "The app hit an unexpected error while rendering this screen.",
      detail: error,
    }
  }

  return {
    title: "Something went wrong",
    description:
      "The app hit an unexpected error while rendering this screen.",
    detail: stringifyErrorData(error),
  }
}

function ErrorLayer({
  detail,
  description,
  path,
  title,
}: ErrorState & {
  path: string
}) {
  const canGoBack =
    typeof window !== "undefined" && window.history.length > 1

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-sm font-medium tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GameController className="size-5" weight="fill" />
            </span>
            <span>Play Together</span>
          </Link>
          <div className="hidden text-sm text-muted-foreground sm:block">
            Error recovery
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <nav className="space-y-2">
            {recoveryLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Warning className="size-5" weight="fill" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-5 py-6 sm:px-6">
              <div className="rounded-md border border-border bg-background px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Requested path
                </p>
                <p className="mt-2 break-all text-sm">{path}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => window.location.reload()}>Reload app</Button>
                {canGoBack ? (
                  <Button variant="outline" onClick={() => window.history.back()}>
                    Go back
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link to="/">Go home</Link>
                </Button>
              </div>

              {detail ? (
                <details className="rounded-md border border-border bg-background">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    Technical details
                  </summary>
                  <div className="border-t border-border px-4 py-4">
                    <pre className="overflow-x-auto text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                      {detail}
                    </pre>
                  </div>
                </details>
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export function RouteErrorLayer() {
  const error = useRouteError()
  const location = useLocation()

  return <ErrorLayer path={`${location.pathname}${location.search}`} {...getErrorState(error)} />
}

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: unknown
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Unhandled app error", error, errorInfo)
  }

  render() {
    if (this.state.error) {
      const path =
        typeof window === "undefined"
          ? "/"
          : `${window.location.pathname}${window.location.search}`

      return <ErrorLayer path={path} {...getErrorState(this.state.error)} />
    }

    return this.props.children
  }
}
