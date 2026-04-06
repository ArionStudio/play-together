import { useEffect, useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { useAuth } from "@clerk/clerk-react"

import { formatDurationMs } from "@workspace/game-core"
import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { demoLeaderboard } from "@/lib/demo-data.ts"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

type GameKey = "minesweeper" | "sudoku"

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

function getGameLabel(gameKey: string) {
  return gameKey === "sudoku" ? "Sudoku" : "Minesweeper"
}

function getModeLabel(modeKey: string) {
  if (modeKey === "coop") {
    return "Co-op"
  }

  if (modeKey === "race") {
    return "Race"
  }

  return "Solo"
}

function getVariantLabel(category: {
  boardKey: string
  gameKey: string
  rulesetKey: string
}) {
  if (category.gameKey === "sudoku" && category.rulesetKey.startsWith("sudoku:")) {
    const [, , difficulty] = category.rulesetKey.split(":")

    switch (difficulty) {
      case "easy":
        return "Easy"
      case "medium":
        return "Medium"
      case "hard":
        return "Hard"
      case "expert":
        return "Master"
      case "haaard":
        return "Extreme"
      default:
        return category.boardKey
    }
  }

  if (
    category.gameKey === "minesweeper" &&
    category.rulesetKey.startsWith("minesweeper:")
  ) {
    const [, , preset] = category.rulesetKey.split(":")

    switch (preset) {
      case "beginner":
        return "Beginner"
      case "intermediate":
        return "Intermediate"
      case "expert":
        return "Expert"
      default:
        return category.boardKey
    }
  }

  return category.boardKey
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
  const [selectedGameKey, setSelectedGameKey] = useState<GameKey | null>(null)
  const [selectedModeKey, setSelectedModeKey] = useState<string | null>(null)
  const [selectedCategoryKeyOverride, setSelectedCategoryKeyOverride] = useState<string | null>(
    null
  )

  const gameOptions = useMemo(
    () =>
      catalog
        ? [...new Set(catalog.map((entry) => entry.gameKey))] as GameKey[]
        : [],
    [catalog]
  )
  const effectiveGameKey = selectedGameKey ?? gameOptions[0] ?? null
  const modeOptions = useMemo(
    () =>
      catalog && effectiveGameKey
        ? [
            ...new Set(
              catalog
                .filter((entry) => entry.gameKey === effectiveGameKey)
                .map((entry) => entry.modeKey)
            ),
          ]
        : [],
    [catalog, effectiveGameKey]
  )
  const effectiveModeKey = selectedModeKey ?? modeOptions[0] ?? null
  const variantOptions = useMemo(
    () =>
      catalog && effectiveGameKey && effectiveModeKey
        ? catalog.filter(
            (entry) =>
              entry.gameKey === effectiveGameKey && entry.modeKey === effectiveModeKey
          )
        : [],
    [catalog, effectiveGameKey, effectiveModeKey]
  )
  const selectedCategoryKey =
    selectedCategoryKeyOverride && variantOptions.some((entry) => entry.key === selectedCategoryKeyOverride)
      ? selectedCategoryKeyOverride
      : variantOptions[0]?.key ?? null
  const selectedCategory =
    variantOptions.find((entry) => entry.key === selectedCategoryKey) ?? null

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

  useEffect(() => {
    if (!catalog?.length) {
      return
    }

    setSelectedGameKey((current) =>
      current && gameOptions.includes(current) ? current : gameOptions[0] ?? null
    )
  }, [catalog, gameOptions])

  useEffect(() => {
    if (!effectiveGameKey) {
      return
    }

    setSelectedModeKey((current) =>
      current && modeOptions.includes(current) ? current : modeOptions[0] ?? null
    )
  }, [effectiveGameKey, modeOptions])

  useEffect(() => {
    if (!variantOptions.length) {
      setSelectedCategoryKeyOverride(null)
      return
    }

    setSelectedCategoryKeyOverride((current) =>
      current && variantOptions.some((entry) => entry.key === current)
        ? current
        : variantOptions[0]?.key ?? null
    )
  }, [variantOptions])

  if (catalog === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading leaderboards...</div>
  }

  if (catalog.length === 0 || !selectedCategoryKey) {
    return (
      <Page className="mx-auto max-w-2xl">
        <PageHeader
          title="Leaderboards"
          description="Leaderboard categories will appear here after the first supported runs are available."
        />
        <Surface className="p-6 text-sm text-muted-foreground">
          No leaderboard categories are available yet for this deployment.
        </Surface>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title="Leaderboards" description="Best times across solo and multiplayer categories." />
      <div className="space-y-4">
        <Surface className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Game</p>
              <div className="flex flex-wrap gap-2">
                {gameOptions.map((gameKey) => (
                  <Button
                    key={gameKey}
                    size="sm"
                    type="button"
                    variant={effectiveGameKey === gameKey ? "default" : "outline"}
                    onClick={() => setSelectedGameKey(gameKey)}
                  >
                    {getGameLabel(gameKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Mode</p>
              <div className="flex flex-wrap gap-2">
                {modeOptions.map((modeKey) => (
                  <Button
                    key={modeKey}
                    size="sm"
                    type="button"
                    variant={effectiveModeKey === modeKey ? "default" : "outline"}
                    onClick={() => setSelectedModeKey(modeKey)}
                  >
                    {getModeLabel(modeKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Variant</p>
              <div className="flex flex-wrap gap-2">
                {variantOptions.map((entry) => (
                  <Button
                    key={entry.key}
                    size="sm"
                    type="button"
                    variant={selectedCategoryKey === entry.key ? "default" : "outline"}
                    onClick={() => setSelectedCategoryKeyOverride(entry.key)}
                  >
                    {getVariantLabel(entry)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-sm md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{selectedCategory?.title ?? "Choose a category"}</p>
              <p className="mt-1 text-muted-foreground">
                {selectedCategory
                  ? `${getGameLabel(selectedCategory.gameKey)} / ${getModeLabel(selectedCategory.modeKey)} / ${getVariantLabel(selectedCategory)}`
                  : "No category selected"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-muted-foreground">Personal best</p>
              <p className="mt-1 font-mono">
                {isConvexAuthenticated && sessionStatus?.hasProfile
                  ? personalBest
                    ? formatDurationMs(personalBest.scorePrimary)
                    : "No win yet"
                  : "Sign in to track your best"}
              </p>
            </div>
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
