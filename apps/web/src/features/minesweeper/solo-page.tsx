import { useEffect, useMemo, useState } from "react"
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
import { api } from "@convex/api"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { readAppPreferences, updateAppPreferences } from "@/lib/app-preferences.ts"

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
  return crypto.randomUUID()
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

function presetToConfig(presetKey: Exclude<PresetKey, "custom">): SoloConfig {
  const preset = MINESWEEPER_PRESET_BOARDS[presetKey]

  return {
    width: preset.width,
    height: preset.height,
    mineCount: preset.mineCount ?? 10,
  }
}

function boardSummaryLabel(config: SoloConfig) {
  return `${config.width} x ${config.height} / ${config.mineCount} mines`
}

function resolveStoredSoloBoardConfig(preferences: {
  customBoard: SoloConfig
  presetKey: PresetKey
}) {
  return preferences.presetKey === "custom"
    ? preferences.customBoard
    : presetToConfig(preferences.presetKey)
}

function cellLabel(cell: PublicBoardCell | null, hiddenCell?: MinesweeperBoardState["cells"][number]) {
  const revealed = cell?.revealed ?? false
  const flagged = cell?.flagged ?? false
  const exploded = cell?.exploded ?? false
  const isMine = cell?.isMine ?? hiddenCell?.isMine ?? false
  const adjacentMines = cell?.adjacentMines ?? hiddenCell?.adjacentMines ?? 0

  if (flagged && !revealed) {
    return "F"
  }

  if (revealed && (exploded || isMine)) {
    return "*"
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
  interactive = true,
}: {
  width: number
  cells: PublicBoardCell[]
  hiddenCells?: MinesweeperBoardState["cells"]
  actionMode: ActionMode
  onCellAction: (index: number, mode: ActionMode) => void
  interactive?: boolean
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
            disabled={!interactive}
            onClick={() => onCellAction(index, actionMode)}
            onContextMenu={handleContextMenu}
            style={{ width: cellSize, height: cellSize, touchAction: "manipulation" }}
            className={[
              "rounded-md border text-center text-sm font-semibold transition-colors disabled:cursor-default disabled:opacity-100",
              cell.revealed
                ? cell.exploded
                  ? "border-rose-400 bg-rose-500/20 text-rose-100"
                  : "border-stone-700 bg-stone-800 text-stone-100"
                : "border-stone-600 bg-stone-700 text-stone-100",
              interactive && !cell.revealed ? "hover:bg-stone-600" : "",
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

  useEffect(() => {
    setDraft(config)
  }, [config])

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
        <Button disabled={!validation.ok} onClick={() => onApply(draft)} type="button">
          Use custom board
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
  const [status, setStatus] = useState<SoloStatus>("ready")
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
      firstClickBehavior: "safe_zero",
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
    ready: "Ready",
    playing: "In progress",
    won: "Board cleared",
    lost: "Mine triggered",
  }[status]
}

function buildLocalBoardCells({
  board,
  config,
  player,
  revealAll = false,
}: {
  board: MinesweeperBoardState | null
  config: SoloConfig
  player: MinesweeperPlayerState | null
  revealAll?: boolean
}) {
  const width = board?.width ?? config.width
  const height = board?.height ?? config.height

  return Array.from({ length: width * height }, (_, index) => {
    const visible = player?.visible[index]
    const hiddenCell = board?.cells[index]
    const revealed = visible?.revealed ?? false
    const shouldShowHidden = revealAll || revealed

    return {
      revealed: shouldShowHidden,
      flagged: visible?.flagged ?? false,
      exploded: visible?.exploded ?? false,
      adjacentMines:
        shouldShowHidden && hiddenCell && !hiddenCell.isMine ? hiddenCell.adjacentMines : null,
      isMine: shouldShowHidden && hiddenCell ? hiddenCell.isMine : null,
    }
  })
}

function buildConnectedBoardCellsForDisplay(
  cells: PublicBoardCell[],
  revealAll = false
) {
  return cells.map((cell) => ({
    ...cell,
    revealed: revealAll || cell.revealed,
  }))
}

function SoloSetupPanel({
  allowCustom,
  customConfig,
  existingRun,
  onApplyCustom,
  onSelectPreset,
  onStart,
  selectedPreset,
  selectionLabel,
  setupNote,
  startLabel,
}: {
  allowCustom: boolean
  customConfig: SoloConfig
  existingRun?: {
    description: string
    label: string
    onResume: () => void
  }
  onApplyCustom: (config: SoloConfig) => void
  onSelectPreset: (presetKey: Exclude<PresetKey, "custom">) => void
  onStart: () => void
  selectedPreset: PresetKey
  selectionLabel: string
  setupNote?: string
  startLabel: string
}) {
  return (
    <div className="space-y-4">
      <Surface className="p-5 sm:p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Choose a board</h2>
            {setupNote ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{setupNote}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["beginner", "intermediate", "expert"] as const).map((presetKey) => (
              <Button
                key={presetKey}
                onClick={() => onSelectPreset(presetKey)}
                type="button"
                variant={selectedPreset === presetKey ? "default" : "outline"}
              >
                {presetKey}
              </Button>
            ))}
            <Button
              disabled={selectedPreset !== "custom"}
              type="button"
              variant={selectedPreset === "custom" ? "default" : "outline"}
            >
              custom
            </Button>
          </div>
          <div className="rounded-lg border border-border px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Selected board</span>
              <span className="font-medium">{selectionLabel}</span>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={onStart} type="button">
            {startLabel}
          </Button>
        </div>
      </Surface>
      {existingRun ? (
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Current run</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {existingRun.description}
              </p>
            </div>
            <Button onClick={existingRun.onResume} type="button" variant="outline">
              {existingRun.label}
            </Button>
          </div>
        </Surface>
      ) : null}
      {allowCustom ? (
        <CustomBoardForm config={customConfig} onApply={onApplyCustom} />
      ) : null}
    </div>
  )
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
    href?: string
    label: string
    onClick?: () => void
  }
}) {
  const isWin = result === "won"

  return (
    <Surface className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{isWin ? "You won." : "You lost."}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isWin ? "The board is clear." : "That run is over."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRestart} type="button">
            Play again
          </Button>
          {secondaryAction?.href ? (
            <Button asChild type="button" variant="outline">
              <Link to={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : secondaryAction?.onClick ? (
            <Button onClick={secondaryAction.onClick} type="button" variant="outline">
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
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

function SoloBoardPanel({
  actionMode,
  boardCells,
  hiddenCells,
  interactive = true,
  onCellAction,
  remainingMines,
  setActionMode,
  status,
  timeLabel,
  width,
}: {
  actionMode: ActionMode
  boardCells: PublicBoardCell[]
  hiddenCells?: MinesweeperBoardState["cells"]
  interactive?: boolean
  onCellAction: (index: number, mode: ActionMode) => void
  onChangeBoard: () => void
  remainingMines: number
  setActionMode: (mode: ActionMode) => void
  status: string
  timeLabel: string
  width: number
}) {
  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          {[
            ["Status", status],
            ["Mines", String(remainingMines)],
            ["Time", timeLabel],
          ].map(([term, value]) => (
            <div key={term} className="space-y-1">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {interactive ? (
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            <Button
              onClick={() => setActionMode("reveal")}
              type="button"
              variant={actionMode === "reveal" ? "default" : "outline"}
            >
              Reveal
            </Button>
            <Button
              onClick={() => setActionMode("flag")}
              type="button"
              variant={actionMode === "flag" ? "default" : "outline"}
            >
              Flag
            </Button>
          </div>
        ) : null}
      </div>
      <div className="-mx-4 overflow-auto px-4 pt-4 pb-1 sm:mx-0 sm:px-0">
        <MinesweeperBoard
          actionMode={actionMode}
          width={width}
          cells={boardCells}
          hiddenCells={hiddenCells}
          interactive={interactive}
          onCellAction={onCellAction}
        />
      </div>
    </Surface>
  )
}

function SoloRunPanel(props: {
  actionMode: ActionMode
  boardCells: PublicBoardCell[]
  hiddenCells?: MinesweeperBoardState["cells"]
  interactive?: boolean
  onCellAction: (index: number, mode: ActionMode) => void
  onChangeBoard: () => void
  remainingMines: number
  setActionMode: (mode: ActionMode) => void
  status: string
  timeLabel: string
  width: number
}) {
  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader
        title="Minesweeper"
        actions={
          <Button onClick={props.onChangeBoard} type="button" variant="outline">
            Change board
          </Button>
        }
      />
      <SoloBoardPanel {...props} />
    </Page>
  )
}

function SoloLossPage({
  actionMode,
  boardCells,
  boardKey,
  hiddenCells,
  mineCount,
  modeLabel,
  onChangeBoard,
  onRestart,
  secondaryAction,
  setActionMode,
  timeLabel,
  width,
}: {
  actionMode: ActionMode
  boardCells: PublicBoardCell[]
  boardKey: string
  hiddenCells?: MinesweeperBoardState["cells"]
  mineCount: number
  modeLabel?: string
  onChangeBoard: () => void
  onRestart: () => void
  secondaryAction?: {
    href?: string
    label: string
    onClick?: () => void
  }
  setActionMode: (mode: ActionMode) => void
  timeLabel: string
  width: number
}) {
  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader
        title="Minesweeper"
        actions={
          <Button onClick={onChangeBoard} type="button" variant="outline">
            Change board
          </Button>
        }
      />
      <div className="space-y-6">
        <SoloCompletionPanel
          result="lost"
          timeLabel={timeLabel}
          boardKey={boardKey}
          mineCount={mineCount}
          modeLabel={modeLabel}
          onRestart={onRestart}
          secondaryAction={secondaryAction}
        />
        <SoloBoardPanel
          actionMode={actionMode}
          boardCells={boardCells}
          hiddenCells={hiddenCells}
          interactive={false}
          onCellAction={() => {}}
          onChangeBoard={onChangeBoard}
          remainingMines={0}
          setActionMode={setActionMode}
          status="Mine triggered"
          timeLabel={timeLabel}
          width={width}
        />
      </div>
    </Page>
  )
}

function SoloWinPage({
  actionMode,
  boardCells,
  boardKey,
  hiddenCells,
  mineCount,
  modeLabel,
  onChangeBoard,
  onRestart,
  secondaryAction,
  setActionMode,
  timeLabel,
  width,
}: {
  actionMode: ActionMode
  boardCells: PublicBoardCell[]
  boardKey: string
  hiddenCells?: MinesweeperBoardState["cells"]
  mineCount: number
  modeLabel?: string
  onChangeBoard: () => void
  onRestart: () => void
  secondaryAction?: {
    href?: string
    label: string
    onClick?: () => void
  }
  setActionMode: (mode: ActionMode) => void
  timeLabel: string
  width: number
}) {
  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader
        title="Minesweeper"
        actions={
          <Button onClick={onChangeBoard} type="button" variant="outline">
            Change board
          </Button>
        }
      />
      <div className="space-y-6">
        <SoloCompletionPanel
          result="won"
          timeLabel={timeLabel}
          boardKey={boardKey}
          mineCount={mineCount}
          modeLabel={modeLabel}
          onRestart={onRestart}
          secondaryAction={secondaryAction}
        />
        <SoloBoardPanel
          actionMode={actionMode}
          boardCells={boardCells}
          hiddenCells={hiddenCells}
          interactive={false}
          onCellAction={() => {}}
          onChangeBoard={onChangeBoard}
          remainingMines={0}
          setActionMode={setActionMode}
          status="Board cleared"
          timeLabel={timeLabel}
          width={width}
        />
      </div>
    </Page>
  )
}

function LocalSoloPage({ allowCustom }: { allowCustom: boolean }) {
  const [storedPreferences] = useState(() => readAppPreferences().games.minesweeper.solo)
  const solo = useMinesweeperSolo(resolveStoredSoloBoardConfig(storedPreferences))
  const [hasStarted, setHasStarted] = useState(false)
  const [setupSelection, setSetupSelection] = useState<{
    boardConfig: SoloConfig
    presetKey: PresetKey
  }>(() => ({
    boardConfig: resolveStoredSoloBoardConfig(storedPreferences),
    presetKey: storedPreferences.presetKey,
  }))

  useEffect(() => {
    updateAppPreferences((current) => ({
      ...current,
      games: {
        ...current.games,
        minesweeper: {
          ...current.games.minesweeper,
          solo: {
            presetKey: setupSelection.presetKey,
            customBoard:
              setupSelection.presetKey === "custom"
                ? setupSelection.boardConfig
                : current.games.minesweeper.solo.customBoard,
          },
        },
      },
    }))
  }, [setupSelection])

  const boardKey = buildBoardKey(nextConfigToBoardConfig(solo.config))
  const remainingMines = Math.max(
    0,
    solo.targetMineCount - (solo.player?.flagsUsed ?? 0)
  )
  const completionResult =
    solo.status === "won" || solo.status === "lost" ? solo.status : null
  const timeLabel = formatDurationMs(solo.elapsed * 1000)
  const finishedBoardCells = buildLocalBoardCells({
    board: solo.board,
    config: solo.config,
    player: solo.player,
    revealAll: true,
  })

  function selectPreset(presetKey: Exclude<PresetKey, "custom">) {
    setSetupSelection({
      boardConfig: presetToConfig(presetKey),
      presetKey,
    })
  }

  function applyCustom(config: SoloConfig) {
    setSetupSelection({
      boardConfig: config,
      presetKey: "custom",
    })
  }

  function startLocalRun() {
    solo.restart(setupSelection.boardConfig)
    setHasStarted(true)
  }

  function openSetup() {
    solo.restart(setupSelection.boardConfig)
    setHasStarted(false)
  }

  if (!hasStarted) {
    return (
      <Page className="mx-auto max-w-2xl">
        <PageHeader
          title="Minesweeper"
          description="Configure the board, then start."
        />
        <SoloSetupPanel
          allowCustom={allowCustom}
          customConfig={setupSelection.boardConfig}
          onApplyCustom={applyCustom}
          onSelectPreset={selectPreset}
          onStart={startLocalRun}
          selectedPreset={setupSelection.presetKey}
          selectionLabel={boardSummaryLabel(setupSelection.boardConfig)}
          setupNote="Solo play runs locally on your device."
          startLabel="Start board"
        />
      </Page>
    )
  }

  if (completionResult === "lost") {
    return (
      <SoloLossPage
        actionMode={solo.actionMode}
        boardCells={finishedBoardCells}
        boardKey={boardKey}
        hiddenCells={solo.board?.cells}
        mineCount={solo.targetMineCount}
        modeLabel="Local"
        onChangeBoard={openSetup}
        onRestart={startLocalRun}
        secondaryAction={{
          label: "Change board",
          onClick: openSetup,
        }}
        setActionMode={solo.setActionMode}
        timeLabel={timeLabel}
        width={solo.board?.width ?? solo.config.width}
      />
    )
  }

  if (completionResult) {
    return (
      <SoloWinPage
        actionMode={solo.actionMode}
        boardCells={finishedBoardCells}
        boardKey={boardKey}
        hiddenCells={solo.board?.cells}
        mineCount={solo.targetMineCount}
        modeLabel="Local"
        onChangeBoard={openSetup}
        onRestart={startLocalRun}
        secondaryAction={{
          label: "Change board",
          onClick: openSetup,
        }}
        setActionMode={solo.setActionMode}
        timeLabel={timeLabel}
        width={solo.board?.width ?? solo.config.width}
      />
    )
  }

  return (
    <SoloRunPanel
      actionMode={solo.actionMode}
      boardCells={buildLocalBoardCells({
        board: solo.board,
        config: solo.config,
        player: solo.player,
      })}
      hiddenCells={solo.board?.cells}
      onCellAction={solo.trigger}
      onChangeBoard={openSetup}
      remainingMines={remainingMines}
      setActionMode={solo.setActionMode}
      status={statusLabel(solo.status)}
      timeLabel={timeLabel}
      width={solo.board?.width ?? solo.config.width}
    />
  )
}

// Kept for the server-authoritative flow, even though the current export uses local solo mode.
export function ConnectedSoloPage({ allowCustom }: { allowCustom: boolean }) {
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
  const [storedPreferences] = useState(() => readAppPreferences().games.minesweeper.solo)
  const [launchConfig, setLaunchConfig] = useState<{
    boardConfig?: SoloConfig
    presetKey: PresetKey
  }>(() => ({
    boardConfig: resolveStoredSoloBoardConfig(storedPreferences),
    presetKey: storedPreferences.presetKey,
  }))
  const [matchId, setMatchId] = useState<string | null>(routeMatchId)
  const [creating, setCreating] = useState(false)
  const activeMatchId = routeMatchId ?? matchId
  const match = useQuery(
    api.matches.getCurrentState,
    activeMatchId ? { matchId: activeMatchId as never } : "skip"
  )
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    updateAppPreferences((current) => ({
      ...current,
      games: {
        ...current.games,
        minesweeper: {
          ...current.games.minesweeper,
          solo: {
            presetKey: launchConfig.presetKey,
            customBoard:
              launchConfig.presetKey === "custom" && launchConfig.boardConfig
                ? launchConfig.boardConfig
                : current.games.minesweeper.solo.customBoard,
          },
        },
      },
    }))
  }, [launchConfig])

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

  async function startMatch(nextConfig: { boardConfig?: SoloConfig; presetKey: PresetKey }) {
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

      if (routeMatchId) {
        navigate(`/games/minesweeper/match/${nextMatch.matchId}`, { replace: true })
      } else {
        setMatchId(nextMatch.matchId)
      }
    } finally {
      setCreating(false)
    }
  }

  function openSetup() {
    if (routeMatchId) {
      setMatchId(null)
      navigate("/games/minesweeper")
      return
    }

    setMatchId(null)
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
            When platform services are enabled, solo games run through Convex.
          </p>
          <div className="flex gap-3">
            <SignInButton mode="modal">
              <Button>Sign In</Button>
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
    return <div className="p-6 text-sm text-muted-foreground">Loading match...</div>
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

  if (
    profile === undefined ||
    latestMatch === undefined ||
    creating ||
    (activeMatchId !== null && match === undefined)
  ) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match...</div>
  }

  if (!match && activeMatchId) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader title="Minesweeper" />
        <Surface className="p-6">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              This run is not available anymore.
            </p>
            <Button onClick={openSetup} type="button">
              Back to setup
            </Button>
          </div>
        </Surface>
      </Page>
    )
  }

  if (!match) {
    return (
      <Page className="mx-auto max-w-2xl">
        <PageHeader
          title="Minesweeper"
          description="Configure the board, then start."
        />
        <SoloSetupPanel
          allowCustom={allowCustom}
          customConfig={launchConfig.boardConfig ?? presetToConfig("beginner")}
          existingRun={
            latestMatch
              ? {
                  description: `${latestMatch.board.width} x ${latestMatch.board.height} / ${latestMatch.board.mineCount} mines`,
                  label: "Resume run",
                  onResume: () => setMatchId(latestMatch.matchId),
                }
              : undefined
          }
          onApplyCustom={(config) =>
            setLaunchConfig({
              boardConfig: config,
              presetKey: "custom",
            })
          }
          onSelectPreset={(presetKey) =>
            setLaunchConfig({
              boardConfig: presetToConfig(presetKey),
              presetKey,
            })
          }
          onStart={() => startMatch(launchConfig)}
          selectedPreset={launchConfig.presetKey}
          selectionLabel={boardSummaryLabel(
            launchConfig.boardConfig ?? presetToConfig("beginner")
          )}
          setupNote="Solo runs here are server-authoritative."
          startLabel={latestMatch ? "Start new board" : "Start board"}
        />
      </Page>
    )
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
        : "In progress"
  const completionResult =
    match.outcome === "won" || match.outcome === "lost" ? match.outcome : null
  const timeLabel =
    typeof match.durationMs === "number"
      ? formatDurationMs(match.durationMs)
      : formatDurationMs(elapsedMs)
  const finishedBoardCells = buildConnectedBoardCellsForDisplay(match.board.cells, true)

  if (completionResult === "lost") {
    return (
      <SoloLossPage
        actionMode={actionMode}
        boardCells={finishedBoardCells}
        boardKey={match.boardKey}
        mineCount={match.board.mineCount}
        modeLabel={match.ranked ? "Ranked" : "Practice"}
        onChangeBoard={openSetup}
        onRestart={() => startMatch(launchConfig)}
        secondaryAction={{ label: "Change board", onClick: openSetup }}
        setActionMode={setActionMode}
        timeLabel={timeLabel}
        width={match.board.width}
      />
    )
  }

  if (completionResult) {
    return (
      <SoloWinPage
        actionMode={actionMode}
        boardCells={finishedBoardCells}
        boardKey={match.boardKey}
        mineCount={match.board.mineCount}
        modeLabel={match.ranked ? "Ranked" : "Practice"}
        onChangeBoard={openSetup}
        onRestart={() => startMatch(launchConfig)}
        secondaryAction={
          completionResult === "won"
            ? { label: "View leaderboards", href: "/leaderboards" }
            : { label: "Change board", onClick: openSetup }
        }
        setActionMode={setActionMode}
        timeLabel={timeLabel}
        width={match.board.width}
      />
    )
  }

  return (
    <SoloRunPanel
      actionMode={actionMode}
      boardCells={match.board.cells}
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
      onChangeBoard={openSetup}
      remainingMines={remainingMines}
      setActionMode={setActionMode}
      status={status}
      timeLabel={timeLabel}
      width={match.board.width}
    />
  )
}

export function MinesweeperSoloPage({
  allowCustom = true,
}: {
  allowCustom?: boolean
}) {
  return <LocalSoloPage allowCustom={allowCustom} />
}
