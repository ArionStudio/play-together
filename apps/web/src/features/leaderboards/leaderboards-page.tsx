import { useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { useAuth } from "@clerk/clerk-react"

import { formatDurationMs } from "@workspace/game-core"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { demoLeaderboard } from "@/lib/demo-data.ts"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function formatRecordDateTime(timestamp: number) {
  const date = new Date(timestamp)

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }
}

function LeaderboardsFallback() {
  return (
    <Page>
      <PageHeader title="Leaderboards" description="Sample data only." />
      <Surface className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/35 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Board</th>
            </tr>
          </thead>
          <tbody>
            {demoLeaderboard.map((entry) => (
              <tr key={entry.rank} className="border-t border-border">
                <td className="px-4 py-4 font-mono">{entry.rank}</td>
                <td className="px-4 py-4 font-medium">{entry.usernameTag}</td>
                <td className="px-4 py-4 font-mono">{entry.score}</td>
                <td className="px-4 py-4 text-muted-foreground">{entry.board}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </Page>
  )
}

function ConnectedLeaderboardsPage() {
  const { isSignedIn } = useAuth()
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const catalog = useQuery(api.leaderboards.listCategories)
  const [selectedCategoryKeyOverride, setSelectedCategoryKeyOverride] = useState<string | null>(
    null
  )
  const selectedCategoryKey = selectedCategoryKeyOverride ?? catalog?.[0]?.key ?? null

  const rows = useQuery(
    api.leaderboards.globalByCategory,
    selectedCategoryKey ? { categoryKey: selectedCategoryKey, limit: 20 } : "skip"
  )
  const personalBest = useQuery(
    api.leaderboards.personalBest,
    isConvexAuthenticated && sessionStatus?.hasProfile && selectedCategoryKey
      ? { categoryKey: selectedCategoryKey }
      : "skip"
  )

  if (!catalog || !selectedCategoryKey) {
    return <div className="p-6 text-sm text-muted-foreground">Loading leaderboards...</div>
  }

  return (
    <Page>
      <PageHeader title="Leaderboards" description="Best times across solo and multiplayer categories." />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Surface className="p-5">
          <h2 className="text-lg font-semibold">Categories</h2>
          <div className="mt-4 space-y-2">
            {catalog.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setSelectedCategoryKeyOverride(entry.key)}
                className={[
                  "flex w-full items-center justify-between rounded-md border px-3 py-3 text-left text-sm transition-colors",
                  selectedCategoryKey === entry.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{entry.title}</span>
                  <span className="block text-xs opacity-80">
                    {entry.gameKey} / {entry.modeKey} / {entry.boardKey}
                  </span>
                </span>
                <span className="font-mono text-xs">{entry.ranked ? "ranked" : "open"}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">Personal best</p>
            <p className="mt-2 font-mono">
              {isConvexAuthenticated && sessionStatus?.hasProfile
                ? personalBest
                  ? formatDurationMs(personalBest.scorePrimary)
                  : "No win yet"
                : "Sign in to track your best"}
            </p>
          </div>
        </Surface>
        <Surface className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/35 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {rows?.length ? (
                rows.map((entry) => {
                  const completed = formatRecordDateTime(entry.completedAt)

                  return (
                    <tr key={`${entry.rank}-${entry.usernameTag}`} className="border-t border-border">
                      <td className="px-4 py-4 font-mono">{entry.rank}</td>
                      <td className="px-4 py-4 font-medium">{entry.usernameTag}</td>
                      <td className="px-4 py-4 font-mono">
                        {formatDurationMs(entry.scorePrimary)}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <div>{completed.date}</div>
                        <div className="text-xs">{completed.time}</div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    No runs have landed in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Surface>
      </div>
    </Page>
  )
}

export function LeaderboardsPage() {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? <ConnectedLeaderboardsPage /> : <LeaderboardsFallback />
}
