import { useMemo, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { formatDurationMs } from "@workspace/game-core"
import { cn } from "@workspace/ui/lib/utils"

import { api } from "@convex/api"
import { ProfileAvatar } from "@/components/profile-avatar.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

type ActionMode = "reveal" | "flag"

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

function getBoardCellSizeClass(width: number) {
  if (width >= 30) {
    return "1.5rem"
  }

  if (width >= 16) {
    return "1.75rem"
  }

  return "2rem"
}

function cellLabel(cell: {
  adjacentMines: number | null
  exploded: boolean
  flagged: boolean
  isMine: boolean | null
  revealed: boolean
}) {
  if (cell.flagged && !cell.revealed) {
    return "F"
  }

  if (cell.revealed && (cell.exploded || cell.isMine)) {
    return "*"
  }

  if (cell.revealed && (cell.adjacentMines ?? 0) > 0) {
    return cell.adjacentMines
  }

  return ""
}

function MinesweeperBoard({
  actionMode,
  cells,
  onCellAction,
  width,
}: {
  actionMode: ActionMode
  cells: Array<{
    adjacentMines: number | null
    exploded: boolean
    flagged: boolean
    isMine: boolean | null
    revealed: boolean
  }>
  onCellAction: (index: number, mode: ActionMode) => void
  width: number
}) {
  const cellSize = getBoardCellSizeClass(width)

  return (
    <div
      className="grid w-max gap-1 rounded-lg border border-stone-700 bg-stone-900 p-3"
      style={{ gridTemplateColumns: `repeat(${width}, ${cellSize})` }}
    >
      {cells.map((cell, index) => {
        const adjacentMines = cell.adjacentMines ?? 0

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
            {cellLabel(cell)}
          </button>
        )
      })}
    </div>
  )
}

function participantStatusLabel(status: string) {
  if (status === "pending") {
    return "Waiting to start"
  }

  if (status === "active") {
    return "Ready"
  }

  if (status === "finished") {
    return "Finished"
  }

  if (status === "eliminated") {
    return "Out"
  }

  return status
}

function MatchParticipantCard(args: {
  avatarSeed?: string
  avatarUrl?: string
  isSelf: boolean
  meta?: string
  status: string
  usernameTag: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <ProfileAvatar
          avatarSeed={args.avatarSeed}
          avatarUrl={args.avatarUrl}
          className="size-10 shrink-0 rounded-md"
          usernameTag={args.usernameTag}
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{args.isSelf ? "You" : args.usernameTag}</p>
          <p className="text-muted-foreground">{participantStatusLabel(args.status)}</p>
        </div>
      </div>
      {args.meta ? <p className="shrink-0 text-muted-foreground">{args.meta}</p> : null}
    </div>
  )
}

function MatchCompletionPanel(args: {
  boardKey: string
  modeLabel: string
  outcome: "abandoned" | "lost" | "won"
  participantRows: Array<{
    primary: string
    secondary: string
    tertiary?: string
  }>
  timeLabel: string
}) {
  return (
    <Surface className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {args.outcome === "won" ? "Match complete." : "Match ended."}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The final board stays visible below with the end-of-match snapshot.
          </p>
        </div>
        <Button asChild>
          <Link to="/lobbies">Open rooms</Link>
        </Button>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
        {[
          [
            "Result",
            args.outcome === "won"
              ? "Win"
              : args.outcome === "abandoned"
                ? "Abandoned"
                : "Loss",
          ],
          ["Time", args.timeLabel],
          ["Board", args.boardKey],
          ["Mode", args.modeLabel],
        ].map(([term, value]) => (
          <div key={term} className="space-y-1">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {args.participantRows.map((row) => (
          <div key={row.primary} className="rounded-lg border border-border px-4 py-3 text-sm">
            <p className="font-medium">{row.primary}</p>
            <p className="mt-1 text-muted-foreground">{row.secondary}</p>
            {row.tertiary ? <p className="mt-1 text-muted-foreground">{row.tertiary}</p> : null}
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function MinesweeperMatchPage() {
  const params = useParams()
  const matchId = params.matchId ?? null
  const { isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const state = useQuery(
    api.multiplayer.getMinesweeperMatch,
    isConvexAuthenticated && sessionStatus?.hasProfile && matchId
      ? { matchId: matchId as never }
      : "skip"
  )
  const act = useMutation(api.multiplayer.actOnMinesweeper)
  const confirmStart = useMutation(api.multiplayer.confirmMinesweeperStart)
  const [actionMode, setActionMode] = useState<ActionMode>("reveal")
  const [mobileBoard, setMobileBoard] = useState(0)
  const [startPending, setStartPending] = useState(false)

  const participantBoards = useMemo(() => {
    if (!state || state.teamMode === "coop" || !("participants" in state)) {
      return []
    }

    return state.participants
      .filter((participant) => "board" in participant)
      .map((participant) => participant)
  }, [state])

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Minesweeper"
          description="Multiplayer matches require a signed-in profile."
        />
        <Surface className="p-6">
          <SignInButton mode="modal">
            <Button>Sign In</Button>
          </SignInButton>
        </Surface>
      </Page>
    )
  }

  if (sessionStatus === undefined || isConvexLoading || state === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match...</div>
  }

  if (!isConvexAuthenticated) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish Clerk to Convex auth"
          description="Clerk signed in, but Convex did not receive the session."
        />
        <Surface className="p-6 text-sm text-muted-foreground">
          Run `pnpm convex:env:sync`, then restart `pnpm dev`.
        </Surface>
      </Page>
    )
  }

  if (!sessionStatus.hasProfile) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish onboarding"
          description="You need a public profile before opening multiplayer matches."
        />
        <Surface className="p-6">
          <Button asChild>
            <Link to="/onboarding">Open onboarding</Link>
          </Button>
        </Surface>
      </Page>
    )
  }

  if (!state) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match...</div>
  }

  const waitingForPlayers = !state.hasStarted && !state.outcome
  const title = state.teamMode === "coop" ? "Team Clear" : "Race"
  const timeLabel =
    typeof state.durationMs === "number"
      ? formatDurationMs(state.durationMs)
      : state.hasStarted
        ? "In progress"
        : "Not started"
  const selfParticipant =
    state.participants.find((participant) => participant.isSelf) ?? null
  const participantRows =
    state.teamMode === "coop"
      ? state.participants.map((participant) => ({
          primary: participant.isSelf ? "You" : participant.profile.usernameTag,
          secondary: participant.status,
          tertiary: `Flags ${state.stats.flagsUsed} / Revealed ${state.stats.revealedCount} / Mistakes ${state.stats.mistakes}`,
        }))
      : state.participants.map((participant) => ({
          primary: participant.isSelf ? "You" : participant.profile.usernameTag,
          secondary: participant.status,
          tertiary: `Flags ${participant.stats.flagsUsed} / Revealed ${participant.stats.revealedCount} / Mistakes ${participant.stats.mistakes}`,
        }))

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader
        title="Minesweeper"
        description={title}
        actions={
          <Button asChild variant="outline">
            <Link to="/lobbies">Back to rooms</Link>
          </Button>
        }
      />
      {waitingForPlayers ? (
        <Surface className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Board is ready.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Each player needs to press Start. The timer begins only when both
                players are ready on this screen.
              </p>
            </div>
            <Button
              disabled={startPending || selfParticipant?.status !== "pending"}
              onClick={async () => {
                if (!selfParticipant || selfParticipant.status !== "pending") {
                  return
                }

                setStartPending(true)

                try {
                  await confirmStart({ matchId: state.matchId })
                } finally {
                  setStartPending(false)
                }
              }}
            >
              {selfParticipant?.status === "pending"
                ? startPending
                  ? "Starting..."
                  : "Start match"
                : "Waiting for other player"}
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {state.participants.map((participant) => (
              <MatchParticipantCard
                key={participant.profile.usernameTag}
                avatarSeed={participant.profile.avatarSeed}
                avatarUrl={participant.profile.avatarUrl}
                isSelf={participant.isSelf}
                status={participant.status}
                usernameTag={participant.profile.usernameTag}
              />
            ))}
          </div>
        </Surface>
      ) : null}
      {state.outcome ? (
        <MatchCompletionPanel
          boardKey={state.boardKey}
          modeLabel={title}
          outcome={state.outcome}
          participantRows={participantRows}
          timeLabel={timeLabel}
        />
      ) : null}
      <Surface className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-border pb-4">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="space-y-1">
              <dt className="text-muted-foreground">Mode</dt>
              <dd className="font-medium">{title}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Board</dt>
              <dd className="font-medium">{state.boardKey}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{waitingForPlayers ? "ready" : state.status}</dd>
            </div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            {state.teamMode === "coop"
              ? state.participants.map((participant) => (
                  <MatchParticipantCard
                    key={participant.profile.usernameTag}
                    avatarSeed={participant.profile.avatarSeed}
                    avatarUrl={participant.profile.avatarUrl}
                    isSelf={participant.isSelf}
                    meta={`Flags ${state.stats.flagsUsed}`}
                    status={participant.status}
                    usernameTag={participant.profile.usernameTag}
                  />
                ))
              : state.participants.map((participant) => (
                  <MatchParticipantCard
                    key={participant.profile.usernameTag}
                    avatarSeed={participant.profile.avatarSeed}
                    avatarUrl={participant.profile.avatarUrl}
                    isSelf={participant.isSelf}
                    meta={`Flags ${participant.stats.flagsUsed}`}
                    status={participant.status}
                    usernameTag={participant.profile.usernameTag}
                  />
                ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            <Button
              disabled={!state.hasStarted || Boolean(state.outcome)}
              onClick={() => setActionMode("reveal")}
              type="button"
              variant={actionMode === "reveal" ? "default" : "outline"}
            >
              Reveal
            </Button>
            <Button
              disabled={!state.hasStarted || Boolean(state.outcome)}
              onClick={() => setActionMode("flag")}
              type="button"
              variant={actionMode === "flag" ? "default" : "outline"}
            >
              Flag
            </Button>
          </div>
        </div>

        {state.teamMode === "coop" ? (
          <div className="mt-4 space-y-4">
            <div className="-mx-4 overflow-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <MinesweeperBoard
                actionMode={actionMode}
                cells={state.board.cells}
                onCellAction={(index, mode) => {
                  if (!state.hasStarted || state.outcome) {
                    return
                  }

                  void act({ index, matchId: state.matchId, mode })
                }}
                width={state.board.width}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex gap-2 overflow-auto pb-1 md:hidden">
              {participantBoards.map((participant, index) => (
                <Button
                  key={participant.profile.usernameTag}
                  onClick={() => setMobileBoard(index)}
                  size="sm"
                  type="button"
                  variant={mobileBoard === index ? "default" : "outline"}
                >
                  {participant.isSelf ? "You" : participant.profile.usernameTag}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {participantBoards.map((participant, index) => (
                <div
                  key={participant.profile.usernameTag}
                  className={cn(
                    "space-y-3",
                    index !== mobileBoard ? "hidden md:block" : ""
                  )}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <ProfileAvatar
                        avatarSeed={participant.profile.avatarSeed}
                        avatarUrl={participant.profile.avatarUrl}
                        className="size-9 rounded-md"
                        usernameTag={participant.profile.usernameTag}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {participant.isSelf ? "You" : participant.profile.usernameTag}
                        </p>
                        <p className="text-muted-foreground">
                          {participantStatusLabel(participant.status)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-muted-foreground">
                      <p>Flags {participant.stats.flagsUsed}</p>
                      <p>Revealed {participant.stats.revealedCount}</p>
                    </div>
                  </div>
                  <div className="-mx-4 overflow-auto px-4 pb-1 sm:mx-0 sm:px-0">
                    <MinesweeperBoard
                      actionMode={participant.isSelf ? actionMode : "reveal"}
                      cells={participant.board.cells}
                      onCellAction={(index, mode) => {
                        if (!participant.isSelf || !state.hasStarted || state.outcome) {
                          return
                        }

                        void act({ index, matchId: state.matchId, mode })
                      }}
                      width={participant.board.width}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Surface>
    </Page>
  )
}
