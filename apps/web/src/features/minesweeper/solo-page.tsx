import { useEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { buildBoardKey, formatDurationMs } from "@workspace/game-core"
import { MINESWEEPER_PRESET_BOARDS } from "@workspace/game-contracts"
import {
  chordCell,
  createBoard,
  createPlayerState,
  revealCell,
  toggleFlag,
  validateBoardConfig,
  type MinesweeperBoardState,
  type MinesweeperPlayerState,
} from "@workspace/minesweeper-engine"
import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { api } from "../../../convex/_generated/api"

type ActionMode = "reveal" | "flag"
type PresetKey = "beginner" | "intermediate" | "expert" | "custom"

type SoloConfig = {
  width: number
  height: number
  mineCount: number
}

type PublicBoardCell = {
  revealed: boolean
  flagged: boolean
  exploded: boolean
  adjacentMines: number | null
  isMine: boolean | null
}

type SoloStatus = "ready" | "playing" | "won" | "lost"

function createSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function numberColor(value: number) {
  return (
    {
      1: "text-sky-600 dark:text-sky-400",
      2: "text-emerald-600 dark:text-emerald-400",
      3: "text-rose-600 dark:text-rose-400",
      4: "text-violet-600 dark:text-violet-400",
      5: "text-orange-600 dark:text-orange-400",
      6: "text-cyan-600 dark:text-cyan-400",
      7: "text-slate-700 dark:text-slate-200",
      8: "text-fuchsia-600 dark:text-fuchsia-400",
    }[value] ?? "text-foreground"
  )
}

function nextConfigToBoardConfig(config: SoloConfig) {
  return {
    width: config.width,
    height: config.height,
    mineCount: config.mineCount,
  }
}

function cellLabel(cell: PublicBoardCell | null, hiddenCell?: MinesweeperBoardState["cells"][number]) {
  const revealed = cell?.revealed ?? false
  const flagged = cell?.flagged ?? false
  const exploded = cell?.exploded ?? false
  const isMine = cell?.isMine ?? hiddenCell?.isMine ?? false
  const adjacentMines = cell?.adjacentMines ?? hiddenCell?.adjacentMines ?? 0

  if (flagged && !revealed) {
    return "⚑"
  }

  if (revealed && (exploded || isMine)) {
    return "✹"
  }

  if (revealed && adjacentMines > 0) {
    return adjacentMines
  }

  return ""
}

function getBoardCellSizeClass(width: number) {
  if (width >= 30) {
    return "1.7rem"
  }

  if (width >= 16) {
    return "1.95rem"
  }

  return "2.25rem"
}

function MinesweeperBoard({
  width,
  cells,
  hiddenCells,
  actionMode,
  onCellAction,
}: {
  width: number
  cells: PublicBoardCell[]
  hiddenCells?: MinesweeperBoardState["cells"]
  actionMode: ActionMode
  onCellAction: (index: number, mode: ActionMode) => void
}) {
  const cellSize = getBoardCellSizeClass(width)

  return (
    <div
      className="grid w-max gap-1 rounded-lg border border-stone-700 bg-stone-900 p-3"
      style={{ gridTemplateColumns: `repeat(${width}, ${cellSize})` }}
    >
      {cells.map((cell, index) => {
        const adjacentMines = cell.adjacentMines ?? hiddenCells?.[index]?.adjacentMines ?? 0

        function handleContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
          event.preventDefault()
          onCellAction(index, "flag")
        }

        return (
          <button
            key={index}
            type="button"
            onClick={() => onCellAction(index, actionMode)}
            onContextMenu={handleContextMenu}
            style={{ width: cellSize, height: cellSize, touchAction: "manipulation" }}
            className={[
              "rounded-md border text-center text-sm font-semibold transition-colors",
              cell.revealed
                ? cell.exploded
                  ? "border-rose-400 bg-rose-500/20 text-rose-100"
                  : "border-stone-700 bg-stone-800 text-stone-100"
                : "border-stone-600 bg-stone-700 text-stone-100 hover:bg-stone-600",
              !cell.revealed && cell.flagged ? "text-amber-300" : "",
              cell.revealed && adjacentMines > 0 ? numberColor(adjacentMines) : "",
            ].join(" ")}
          >
            {cellLabel(cell, hiddenCells?.[index])}
          </button>
        )
      })}
    </div>
  )
}

function MobileSoloToolbar({
  actionMode,
  setActionMode,
  remainingMines,
  timeLabel,
  status,
  onRestart,
}: {
  actionMode: ActionMode
  setActionMode: (mode: ActionMode) => void
  remainingMines: number
  timeLabel: string
  status: SoloStatus | string
  onRestart: () => void
}) {
  return (
    <Surface className="p-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{status}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {remainingMines} mines left · {timeLabel}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRestart} type="button">
          New board
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant={actionMode === "reveal" ? "default" : "outline"}
          onClick={() => setActionMode("reveal")}
          type="button"
        >
          Reveal
        </Button>
        <Button
          variant={actionMode === "flag" ? "default" : "outline"}
          onClick={() => setActionMode("flag")}
          type="button"
        >
          Flag
        </Button>
      </div>
    </Surface>
  )
}

function CustomBoardForm({
  config,
  onApply,
}: {
  config: SoloConfig
  onApply: (config: SoloConfig) => void
}) {
  const [draft, setDraft] = useState(config)
  const validation = useMemo(
    () => validateBoardConfig(nextConfigToBoardConfig(draft)),
    [draft]
  )

  return (
    <Surface className="p-5">
      <h2 className="text-lg font-semibold">Custom board</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { key: "width", label: "Width" },
          { key: "height", label: "Height" },
          { key: "mineCount", label: "Mines" },
        ].map((field) => (
          <label key={field.key} className="space-y-2 text-sm">
            <span className="font-medium">{field.label}</span>
            <input
              type="number"
              value={draft[field.key as keyof SoloConfig]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [field.key]: Number(event.target.value),
                }))
              }
              className="h-10 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
            />
          </label>
        ))}
      </div>
      {validation.ok ? null : (
        <ul className="mt-4 space-y-1 text-sm text-destructive">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Button
          disabled={!validation.ok}
          onClick={() => onApply(draft)}
          type="button"
        >
          Apply board
        </Button>
      </div>
    </Surface>
  )
}

function useMinesweeperSolo(initialConfig: SoloConfig) {
  const [config, setConfig] = useState(initialConfig)
  const [seed, setSeed] = useState(() => createSeed())
  const [board, setBoard] = useState<MinesweeperBoardState | null>(null)
  const [player, setPlayer] = useState<MinesweeperPlayerState | null>(null)
  const [status, setStatus] = useState<"ready" | "playing" | "won" | "lost">(
    "ready"
  )
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [actionMode, setActionMode] = useState<ActionMode>("reveal")

  useEffect(() => {
    if (status === "won" || status === "lost") {
      return undefined
    }

    const interval = window.setInterval(() => {
      setElapsed(
        timerStartedAt === null ? 0 : Math.floor((Date.now() - timerStartedAt) / 1000)
      )
    }, 250)

    return () => window.clearInterval(interval)
  }, [status, timerStartedAt])

  function restart(nextConfig = config) {
    setConfig(nextConfig)
    setSeed(createSeed())
    setBoard(null)
    setPlayer(null)
    setStatus("ready")
    setTimerStartedAt(null)
    setElapsed(0)
  }

  function ensureBoard(index: number) {
    if (board && player) {
      return { nextBoard: board, nextPlayer: player }
    }

    const nextBoard = createBoard(nextConfigToBoardConfig(config), seed, {
      firstClickIndex: index,
      firstClickBehavior: "safe",
    })
    const nextPlayer = createPlayerState(nextBoard)
    setBoard(nextBoard)
    setPlayer(nextPlayer)
    setStatus("playing")
    return { nextBoard, nextPlayer }
  }

  function handleReveal(index: number) {
    const { nextBoard, nextPlayer } = ensureBoard(index)
    const targetVisible = nextPlayer.visible[index]
    const nextAction =
      targetVisible?.revealed === true
        ? chordCell(nextBoard, nextPlayer, index)
        : revealCell(nextBoard, nextPlayer, index)

    setPlayer(nextAction.playerState)

    if (nextAction.result.exploded) {
      setStatus("lost")
      return
    }

    if (nextAction.result.won) {
      setStatus("won")
    }
  }

  function handleFlag(index: number) {
    const nextPlayer = player
      ? toggleFlag(player, index)
      : toggleFlag(createPlayerState(createBoard(nextConfigToBoardConfig(config), seed)), index)

    if (!board) {
      setBoard(createBoard(nextConfigToBoardConfig(config), seed))
    }

    setPlayer(nextPlayer)
  }

  function trigger(index: number, mode: ActionMode) {
    if (status === "won" || status === "lost") {
      return
    }

    if (timerStartedAt === null) {
      setTimerStartedAt(Date.now())
    }

    if (mode === "flag") {
      handleFlag(index)
      return
    }

    handleReveal(index)
  }

  return {
    actionMode,
    board,
    config,
    elapsed,
    player,
    restart,
    setActionMode,
    status,
    targetMineCount: config.mineCount,
    trigger,
  }
}

function statusLabel(status: SoloStatus) {
  return {
    ready: "Waiting for first move",
    playing: "Game in progress",
    won: "Board cleared",
    lost: "Mine triggered",
  }[status]
}

function SoloCompletionPanel({
  result,
  timeLabel,
  boardKey,
  mineCount,
  modeLabel,
  onRestart,
  secondaryAction,
}: {
  result: "won" | "lost"
  timeLabel: string
  boardKey: string
  mineCount: number
  modeLabel?: string
  onRestart: () => void
  secondaryAction?: {
    label: string
    href: string
  }
}) {
  const isWin = result === "won"

  return (
    <Surface
      className={[
        "border p-5",
        isWin
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-rose-500/30 bg-rose-500/5",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {isWin ? "Board cleared." : "Mine triggered."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {isWin
              ? "The run is complete. Start another board or check how the time stacks up."
              : "That run is over. Start another board and try a different opening route."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRestart} type="button">
            New board
          </Button>
          {secondaryAction ? (
            <Button asChild type="button" variant="outline">
              <Link to={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Result", isWin ? "Win" : "Loss"],
          ["Time", timeLabel],
          ["Mines", String(mineCount)],
          ["Board", boardKey],
          ...(modeLabel ? [["Mode", modeLabel]] : []),
        ].map(([term, value]) => (
          <div key={term} className="space-y-1">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  )
}

function LocalSoloPage({ allowCustom }: { allowCustom: boolean }) {
  const solo = useMinesweeperSolo({
    width: MINESWEEPER_PRESET_BOARDS.beginner.width,
    height: MINESWEEPER_PRESET_BOARDS.beginner.height,
    mineCount: MINESWEEPER_PRESET_BOARDS.beginner.mineCount ?? 10,
  })

  const boardKey = buildBoardKey(nextConfigToBoardConfig(solo.config))
  const remainingMines = Math.max(
    0,
    solo.targetMineCount - (solo.player?.flagsUsed ?? 0)
  )
  const mobileStatus = statusLabel(solo.status)
  const completionResult =
    solo.status === "won" || solo.status === "lost" ? solo.status : null

  return (
    <Page>
      <PageHeader
        title="Minesweeper"
        description="Local fallback mode stays available when Clerk and Convex are not configured."
        actions={
          <Button onClick={() => solo.restart()} type="button" variant="outline">
            New board
          </Button>
        }
      />
      <MobileSoloToolbar
        actionMode={solo.actionMode}
        setActionMode={solo.setActionMode}
        remainingMines={remainingMines}
        timeLabel={`${solo.elapsed}s`}
        status={mobileStatus}
        onRestart={() => solo.restart()}
      />
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block">
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Game</h2>
            <dl className="mt-4 divide-y divide-border text-sm">
              {[
                ["Status", statusLabel(solo.status)],
                ["Time", `${solo.elapsed}s`],
                ["Mines left", String(remainingMines)],
                ["Board key", boardKey],
              ].map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Surface>
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Controls</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={solo.actionMode === "reveal" ? "default" : "outline"}
                onClick={() => solo.setActionMode("reveal")}
                type="button"
              >
                Tap to reveal
              </Button>
              <Button
                variant={solo.actionMode === "flag" ? "default" : "outline"}
                onClick={() => solo.setActionMode("flag")}
                type="button"
              >
                Tap to flag
              </Button>
            </div>
            <div className="mt-5">
              <h3 className="font-medium">Presets</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(MINESWEEPER_PRESET_BOARDS).map(([presetKey, preset]) => (
                  <Button
                    key={presetKey}
                    onClick={() =>
                      solo.restart({
                        width: preset.width,
                        height: preset.height,
                        mineCount: preset.mineCount ?? 10,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    {presetKey}
                  </Button>
                ))}
              </div>
            </div>
          </Surface>
          {allowCustom ? (
            <CustomBoardForm
              config={solo.config}
              onApply={(config) => solo.restart(config)}
            />
          ) : null}
        </div>
        <div className="space-y-4">
          {completionResult ? (
            <SoloCompletionPanel
              result={completionResult}
              timeLabel={formatDurationMs(solo.elapsed * 1000)}
              boardKey={boardKey}
              mineCount={solo.targetMineCount}
              modeLabel="Local fallback"
              onRestart={() => solo.restart()}
            />
          ) : null}
          <Surface className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground lg:hidden">
              <span>Pan to inspect larger boards.</span>
              <span>Tap mode switches above.</span>
            </div>
            <div className="-mx-4 overflow-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <MinesweeperBoard
                actionMode={solo.actionMode}
                width={solo.board?.width ?? solo.config.width}
                cells={Array.from(
                  { length: (solo.board?.width ?? solo.config.width) * (solo.board?.height ?? solo.config.height) },
                  (_, index) => {
                    const visible = solo.player?.visible[index]
                    const hiddenCell = solo.board?.cells[index]

                    return {
                      revealed: visible?.revealed ?? false,
                      flagged: visible?.flagged ?? false,
                      exploded: visible?.exploded ?? false,
                      adjacentMines:
                        visible?.revealed && hiddenCell && !hiddenCell.isMine
                          ? hiddenCell.adjacentMines
                          : null,
                      isMine:
                        visible?.revealed && hiddenCell ? hiddenCell.isMine : null,
                    }
                  }
                )}
                hiddenCells={solo.board?.cells}
                onCellAction={solo.trigger}
              />
            </div>
          </Surface>
          <Surface className="p-4 text-sm leading-6 text-muted-foreground">
            The local fallback includes seeded board generation, flood-fill reveals,
            chording, flagging, win/loss evaluation, and custom board validation.
          </Surface>
          <div className="space-y-4 lg:hidden">
            <Surface className="p-5">
              <h2 className="text-lg font-semibold">Presets</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(MINESWEEPER_PRESET_BOARDS).map(([presetKey, preset]) => (
                  <Button
                    key={presetKey}
                    onClick={() =>
                      solo.restart({
                        width: preset.width,
                        height: preset.height,
                        mineCount: preset.mineCount ?? 10,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    {presetKey}
                  </Button>
                ))}
              </div>
            </Surface>
            {allowCustom ? (
              <CustomBoardForm
                config={solo.config}
                onApply={(config) => solo.restart(config)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </Page>
  )
}

function ConnectedSoloPage({ allowCustom }: { allowCustom: boolean }) {
  const navigate = useNavigate()
  const params = useParams()
  const routeMatchId = params.matchId ?? null
  const { isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const profile = useQuery(
    api.profiles.current,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const latestMatch = useQuery(
    api.matches.getLatestActiveSoloMatch,
    isConvexAuthenticated && sessionStatus?.hasProfile && profile ? {} : "skip"
  )
  const createMatch = useMutation(api.matches.createSoloMatch)
  const reveal = useMutation(api.matches.reveal)
  const toggleFlagMutation = useMutation(api.matches.toggleFlag)
  const chord = useMutation(api.matches.chord)
  const [actionMode, setActionMode] = useState<ActionMode>("reveal")
  const [launchConfig, setLaunchConfig] = useState<{
    presetKey: PresetKey
    boardConfig?: SoloConfig
  }>({
    presetKey: "beginner",
  })
  const [matchId, setMatchId] = useState<string | null>(routeMatchId)
  const [creating, setCreating] = useState(false)
  const autoStarted = useRef(false)
  const match = useQuery(
    api.matches.getCurrentState,
    matchId ? { matchId: matchId as never } : "skip"
  )
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (routeMatchId && routeMatchId !== matchId) {
      setMatchId(routeMatchId)
    }
  }, [routeMatchId, matchId])

  useEffect(() => {
    if (!matchId && latestMatch?.matchId) {
      setMatchId(latestMatch.matchId)
    }
  }, [latestMatch, matchId])

  useEffect(() => {
    if (routeMatchId || !profile || latestMatch !== null || creating || autoStarted.current) {
      return
    }

    autoStarted.current = true
    void (async () => {
      setCreating(true)
      try {
        const nextMatch = await createMatch({ presetKey: "beginner" })
        setMatchId(nextMatch.matchId)
      } finally {
        setCreating(false)
      }
    })()
  }, [createMatch, creating, latestMatch, profile, routeMatchId])

  useEffect(() => {
    if (!match || match.status !== "active") {
      setElapsedMs(match?.durationMs ?? 0)
      return undefined
    }

    const interval = window.setInterval(() => {
      setElapsedMs(match.timerStartedAt === null ? 0 : Date.now() - match.timerStartedAt)
    }, 250)

    return () => window.clearInterval(interval)
  }, [match])

  async function startMatch(nextConfig: { presetKey: PresetKey; boardConfig?: SoloConfig }) {
    setLaunchConfig(nextConfig)
    setCreating(true)

    try {
      const nextMatch = await createMatch(
        nextConfig.presetKey === "custom" && nextConfig.boardConfig
          ? {
              presetKey: "custom",
              boardConfig: nextConfig.boardConfig,
            }
          : {
              presetKey: nextConfig.presetKey,
            }
      )

      setMatchId(nextMatch.matchId)

      if (routeMatchId) {
        navigate(`/games/minesweeper/match/${nextMatch.matchId}`, { replace: true })
      }
    } finally {
      setCreating(false)
    }
  }

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Minesweeper"
          description="Server-authoritative solo runs require a signed-in profile."
        />
        <Surface className="space-y-4 p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            When platform services are enabled, solo games run entirely through Convex.
          </p>
          <div className="flex gap-3">
            <SignInButton mode="modal">
              <Button>Sign In With Google</Button>
            </SignInButton>
            <Button asChild variant="outline">
              <Link to="/leaderboards">View leaderboards</Link>
            </Button>
          </div>
        </Surface>
      </Page>
    )
  }

  if (sessionStatus === undefined || isConvexLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match…</div>
  }

  if (!isConvexAuthenticated) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish Clerk to Convex auth"
          description="Clerk sign-in succeeded, but Convex is not receiving an authenticated session for solo matches."
        />
        <Surface className="p-6 text-sm leading-6 text-muted-foreground">
          Put `CLERK_JWT_ISSUER_DOMAIN` in `apps/web/.env.convex.local`, run
          `pnpm --filter web convex:env:sync`, then restart `pnpm dev`.
        </Surface>
      </Page>
    )
  }

  if (!sessionStatus.hasProfile) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish onboarding"
          description="You need a public `username#tag` before solo results can be stored."
        />
        <Surface className="p-6">
          <Button asChild>
            <Link to="/onboarding">Open onboarding</Link>
          </Button>
        </Surface>
      </Page>
    )
  }

  if (profile === undefined || latestMatch === undefined || creating) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match…</div>
  }

  if (!match) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match…</div>
  }

  const remainingMines = Math.max(
    0,
    match.board.mineCount -
      match.board.cells.filter((cell) => cell.flagged && !cell.revealed).length
  )
  const status =
    match.outcome === "won"
      ? "Board cleared"
      : match.outcome === "lost"
        ? "Mine triggered"
        : "Game in progress"
  const completionResult =
    match.outcome === "won" || match.outcome === "lost" ? match.outcome : null
  const timeLabel =
    typeof match.durationMs === "number"
      ? formatDurationMs(match.durationMs)
      : formatDurationMs(elapsedMs)

  return (
    <Page>
      <PageHeader
        title="Minesweeper"
        description="Solo runs are server-authoritative here. Reveals, flags, chords, results, and leaderboard writes all go through Convex."
        actions={
          <Button onClick={() => startMatch(launchConfig)} type="button" variant="outline">
            New board
          </Button>
        }
      />
      <MobileSoloToolbar
        actionMode={actionMode}
        setActionMode={setActionMode}
        remainingMines={remainingMines}
        timeLabel={timeLabel}
        status={status}
        onRestart={() => startMatch(launchConfig)}
      />
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block">
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Run</h2>
            <dl className="mt-4 divide-y divide-border text-sm">
              {[
                ["Status", status],
                ["Time", timeLabel],
                ["Mines left", String(remainingMines)],
                ["Board key", match.boardKey],
                ["Mode", match.ranked ? "Ranked" : "Practice"],
              ].map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Surface>
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Controls</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={actionMode === "reveal" ? "default" : "outline"}
                onClick={() => setActionMode("reveal")}
                type="button"
              >
                Tap to reveal
              </Button>
              <Button
                variant={actionMode === "flag" ? "default" : "outline"}
                onClick={() => setActionMode("flag")}
                type="button"
              >
                Tap to flag
              </Button>
            </div>
            <div className="mt-5">
              <h3 className="font-medium">Presets</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(MINESWEEPER_PRESET_BOARDS).map(([presetKey]) => (
                  <Button
                    key={presetKey}
                    onClick={() =>
                      startMatch({
                        presetKey: presetKey as PresetKey,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    {presetKey}
                  </Button>
                ))}
              </div>
            </div>
          </Surface>
          {allowCustom ? (
            <CustomBoardForm
              config={launchConfig.boardConfig ?? {
                width: MINESWEEPER_PRESET_BOARDS.beginner.width,
                height: MINESWEEPER_PRESET_BOARDS.beginner.height,
                mineCount: MINESWEEPER_PRESET_BOARDS.beginner.mineCount ?? 10,
              }}
              onApply={(config) =>
                startMatch({
                  presetKey: "custom",
                  boardConfig: config,
                })
              }
            />
          ) : null}
        </div>
        <div className="space-y-4">
          {completionResult ? (
            <SoloCompletionPanel
              result={completionResult}
              timeLabel={timeLabel}
              boardKey={match.boardKey}
              mineCount={match.board.mineCount}
              modeLabel={match.ranked ? "Ranked" : "Practice"}
              onRestart={() => startMatch(launchConfig)}
              secondaryAction={
                completionResult === "won"
                  ? { label: "View leaderboards", href: "/leaderboards" }
                  : undefined
              }
            />
          ) : null}
          <Surface className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground lg:hidden">
              <span>Pan to inspect larger boards.</span>
              <span>Reveal or flag from the mobile toolbar.</span>
            </div>
            <div className="-mx-4 overflow-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <MinesweeperBoard
                actionMode={actionMode}
                width={match.board.width}
                cells={match.board.cells}
                onCellAction={(index, mode) => {
                  if (mode === "flag") {
                    void toggleFlagMutation({ matchId: match.matchId, index })
                    return
                  }

                  if (match.board.cells[index]?.revealed) {
                    void chord({ matchId: match.matchId, index })
                    return
                  }

                  void reveal({ matchId: match.matchId, index })
                }}
              />
            </div>
          </Surface>
          <Surface className="p-4 text-sm leading-6 text-muted-foreground">
            Invalid actions are rejected on the server, and ranked leaderboard entries are
            written only from validated finished matches.
          </Surface>
          <div className="space-y-4 lg:hidden">
            <Surface className="p-5">
              <h2 className="text-lg font-semibold">Presets</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(MINESWEEPER_PRESET_BOARDS).map(([presetKey]) => (
                  <Button
                    key={presetKey}
                    onClick={() =>
                      startMatch({
                        presetKey: presetKey as PresetKey,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    {presetKey}
                  </Button>
                ))}
              </div>
            </Surface>
            {allowCustom ? (
              <CustomBoardForm
                config={launchConfig.boardConfig ?? {
                  width: MINESWEEPER_PRESET_BOARDS.beginner.width,
                  height: MINESWEEPER_PRESET_BOARDS.beginner.height,
                  mineCount: MINESWEEPER_PRESET_BOARDS.beginner.mineCount ?? 10,
                }}
                onApply={(config) =>
                  startMatch({
                    presetKey: "custom",
                    boardConfig: config,
                  })
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </Page>
  )
}

export function MinesweeperSoloPage({
  allowCustom = true,
}: {
  allowCustom?: boolean
}) {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? (
    <ConnectedSoloPage allowCustom={allowCustom} />
  ) : (
    <LocalSoloPage allowCustom={allowCustom} />
  )
}
