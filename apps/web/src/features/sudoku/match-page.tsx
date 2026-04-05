import { useEffect, useEffectEvent, useMemo, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  ArrowCounterClockwise,
  Backspace,
  Crosshair,
  PencilSimple,
  Square,
} from "@phosphor-icons/react"
import { Link, useParams } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  getConflictingIndices,
  getRelatedIndices,
  sudokuDifficultyLabels,
} from "@workspace/sudoku-engine"

import { api } from "@convex/api"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { resolveNotesDigitInput } from "@/features/sudoku/input-mode.ts"
import {
  readAppPreferences,
  updateAppPreferences,
  type SudokuInputPreference,
} from "@/lib/app-preferences.ts"

const DIGIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const PLAYER_COLORS = [
  {
    id: "amber",
    ring: "#d97706",
    text: "#b45309",
    tint: "rgba(217, 119, 6, 0.18)",
  },
  {
    id: "emerald",
    ring: "#059669",
    text: "#047857",
    tint: "rgba(5, 150, 105, 0.18)",
  },
  {
    id: "rose",
    ring: "#e11d48",
    text: "#be123c",
    tint: "rgba(225, 29, 72, 0.16)",
  },
] as const
const EMPTY_SUDOKU_VALUES = Array.from({ length: 81 }, () => 0)
const EMPTY_SUDOKU_NOTES = Array.from({ length: 81 }, () => [] as number[])
const EMPTY_SUDOKU_NOTE_MARKS = Array.from({ length: 81 }, () => [] as NoteMark[])
const EMPTY_SUDOKU_VALUE_OWNERS = Array.from({ length: 81 }, () => null as string | null)

type EntryMode = "fill" | "notes" | "focus"
type FocusKind = "cell" | "row" | "column" | "box" | "digit"
type FocusMark = {
  kind: FocusKind
  index: number
}

type Decoration = {
  color: (typeof PLAYER_COLORS)[number]
  focuses: FocusMark[]
  profileId: string
  selectedIndex: number | null
}

type NoteMark = {
  digit: number
  profileId: string
}

function formatCountdown(remainingMs: number) {
  return Math.max(1, Math.ceil(remainingMs / 1000))
}

function formatClockTimer(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatMatchTimer(args: {
  countdownEndsAt: number
  durationMs: number | null
  hasStarted: boolean
  nowMs: number
}) {
  if (!args.hasStarted) {
    return formatClockTimer(Math.max(0, args.countdownEndsAt - args.nowMs))
  }

  if (typeof args.durationMs === "number") {
    return formatClockTimer(args.durationMs)
  }

  return formatClockTimer(Math.max(0, args.nowMs - args.countdownEndsAt))
}

function getFocusKey(focus: FocusMark) {
  return `${focus.kind}:${focus.index}`
}

function FocusKindIcon({ kind }: { kind: FocusKind }) {
  if (kind === "cell") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6" y="6" width="4" height="4" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "row") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="6.25" width="9" height="3.5" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "column") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6.25" y="3.5" width="3.5" height="9" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "box") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4.5" y="4.5" width="7" height="7" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <text x="8" y="10.1" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor">
        1
      </text>
    </svg>
  )
}

function buildFocusForCell(index: number, focusKind: Exclude<FocusKind, "digit">): FocusMark {
  switch (focusKind) {
    case "cell":
      return { kind: "cell", index }
    case "row":
      return { kind: "row", index: Math.floor(index / 9) }
    case "column":
      return { kind: "column", index: index % 9 }
    case "box":
      return {
        kind: "box",
        index: Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3),
      }
  }
}

function toggleFocusMark(focuses: FocusMark[], nextFocus: FocusMark) {
  const key = getFocusKey(nextFocus)

  return focuses.some((focus) => getFocusKey(focus) === key)
    ? focuses.filter((focus) => getFocusKey(focus) !== key)
    : [...focuses, nextFocus]
}

function matchesFocus(args: {
  focus: FocusMark
  index: number
  values: number[]
}) {
  const row = Math.floor(args.index / 9)
  const column = args.index % 9

  switch (args.focus.kind) {
    case "cell":
      return args.focus.index === args.index
    case "row":
      return args.focus.index === row
    case "column":
      return args.focus.index === column
    case "box":
      return args.focus.index === Math.floor(row / 3) * 3 + Math.floor(column / 3)
    case "digit":
      return args.values[args.index] === args.focus.index
  }
}

function getCellColor(
  ownerKey: string | undefined,
  paletteByProfile: Map<string, (typeof PLAYER_COLORS)[number]>
) {
  return ownerKey ? paletteByProfile.get(ownerKey)?.text : undefined
}

function MultiplayerCompletionPanel(args: {
  difficultyLabel: string
  modeLabel: string
  outcome: "lost" | "won"
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
            {args.outcome === "won" ? "Puzzle solved." : "Match ended."}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The final board stays visible below with the end-of-match state.
          </p>
        </div>
        <Button asChild>
          <Link to="/lobbies">Open rooms</Link>
        </Button>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
        {[
          ["Result", args.outcome === "won" ? "Solved" : "Finished"],
          ["Time", args.timeLabel],
          ["Difficulty", args.difficultyLabel],
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

function SudokuBoard({
  className,
  decorations,
  givens,
  noteMarks,
  notes,
  onCellClick,
  selectedIndex,
  valueOwners,
  values,
}: {
  className?: string
  decorations: Decoration[]
  givens: number[]
  noteMarks?: NoteMark[][]
  notes?: number[][]
  onCellClick: (index: number) => void
  selectedIndex: number | null
  valueOwners?: Array<string | null>
  values: number[]
}) {
  const conflictSet = useMemo(() => new Set(getConflictingIndices(values)), [values])
  const relatedSet = useMemo(
    () => new Set(selectedIndex === null ? [] : getRelatedIndices(selectedIndex)),
    [selectedIndex]
  )
  const paletteByProfile = useMemo(
    () => new Map(decorations.map((decoration) => [decoration.profileId, decoration.color])),
    [decorations]
  )

  return (
    <div className={cn("mx-auto w-full max-w-[min(100vw-1.5rem,24rem)]", className)}>
      <div className="grid grid-cols-9 border-2 border-foreground/90 bg-border/50">
        {values.map((value, index) => {
          const row = Math.floor(index / 9)
          const column = index % 9
          const fixed = givens[index] !== 0
          const isSelected = index === selectedIndex
          const isRelated = relatedSet.has(index)
          const matchingDecorations = decorations.filter((decoration) =>
            decoration.focuses.some((focus) =>
              matchesFocus({
                focus,
                index,
                values,
              })
            )
          )
          const selectionDecorations = decorations.filter(
            (decoration) => decoration.selectedIndex === index
          )
          const ownerKey =
            valueOwners?.[index] !== null && valueOwners?.[index] !== undefined
              ? valueOwners[index] ?? undefined
              : undefined
          const valueColor = getCellColor(ownerKey, paletteByProfile)

          return (
            <button
              key={index}
              type="button"
              onClick={() => onCellClick(index)}
              className={cn(
                "relative flex aspect-square items-center justify-center overflow-hidden border border-border text-sm transition-colors sm:text-base",
                row === 2 || row === 5 ? "border-b-2 border-b-foreground/90" : "",
                column === 2 || column === 5 ? "border-r-2 border-r-foreground/90" : "",
                fixed ? "bg-muted/35 font-semibold text-foreground" : "bg-background text-foreground",
                isRelated ? "bg-muted/60" : "",
                isSelected ? "ring-2 ring-inset ring-primary" : "",
                conflictSet.has(index) ? "text-destructive" : ""
              )}
            >
              {matchingDecorations.map((decoration, decorationIndex) => (
                <span
                  key={`${decoration.profileId}-${decorationIndex}-${index}`}
                  className="pointer-events-none absolute inset-0"
                  style={{ backgroundColor: decoration.color.tint }}
                />
              ))}
              {selectionDecorations.map((decoration) => (
                <span
                  key={`${decoration.profileId}-selection-${index}`}
                  className="pointer-events-none absolute inset-[2px] rounded-[2px] border-2"
                  style={{ borderColor: decoration.color.ring }}
                />
              ))}
              {value !== 0 ? (
                <span
                  className="relative z-10"
                  style={{ color: fixed ? undefined : valueColor }}
                >
                  {value}
                </span>
              ) : (
                <span className="relative z-10 grid h-full w-full grid-cols-3 place-items-center px-[1px] py-[2px] font-mono text-[10px] leading-none text-muted-foreground sm:text-xs">
                  {DIGIT_OPTIONS.map((digit) => {
                    const markedNote =
                      noteMarks?.[index]?.find((note) => note.digit === digit) ?? null
                    const hasNote = markedNote !== null || (notes?.[index]?.includes(digit) ?? false)
                    const noteColor = getCellColor(markedNote?.profileId, paletteByProfile)

                    return (
                      <span
                        key={digit}
                        className={hasNote ? "opacity-100" : "opacity-0"}
                        style={{ color: noteColor }}
                      >
                        {digit}
                      </span>
                    )
                  })}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SudokuMatchPage() {
  const params = useParams()
  const matchId = params.matchId ?? null
  const { isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const state = useQuery(
    api.multiplayer.getSudokuMatch,
    isConvexAuthenticated && sessionStatus?.hasProfile && matchId
      ? { matchId: matchId as never }
      : "skip"
  )
  const [pendingMatchState, setPendingMatchState] = useState<typeof state | null>(null)
  const updateCell = useMutation(api.multiplayer.updateSudokuCell)
  const undoMove = useMutation(api.multiplayer.undoSudokuMove)
  const updatePresence = useMutation(api.multiplayer.updateSudokuPresence)
  const [mode, setMode] = useState<EntryMode>("fill")
  const [focusKind, setFocusKind] = useState<FocusKind>("cell")
  const [activeDigit, setActiveDigit] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [coopSelectedIndex, setCoopSelectedIndex] = useState<number | null>(null)
  const [mobileBoard, setMobileBoard] = useState(0)
  const [localFocuses, setLocalFocuses] = useState<FocusMark[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [minimalView, setMinimalView] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [fillInput, setFillInput] = useState<SudokuInputPreference>(
    readAppPreferences().games.sudoku.controls.fillInput
  )
  const [notesInput, setNotesInput] = useState<SudokuInputPreference>(
    readAppPreferences().games.sudoku.controls.notesInput
  )

  const matchState = pendingMatchState ?? state ?? null
  const isCoop = matchState?.teamMode === "coop"
  const title = isCoop ? "Team Solve" : "Duel"
  const participants = Array.isArray(matchState?.participants) ? matchState.participants : []
  const participantsWithColors = matchState
    ? participants.map((participant, index) => ({
        ...participant,
        color: PLAYER_COLORS[index % PLAYER_COLORS.length]!,
      }))
    : []
  const coopParticipants = (isCoop ? participantsWithColors : []) as Array<{
    color: (typeof PLAYER_COLORS)[number]
    focuses?: FocusMark[]
    isSelf: boolean
    profile: { _id?: string; usernameTag: string }
    selectedIndex: number | null
    status: string
  }>
  const raceParticipants = (!isCoop ? participantsWithColors : []) as Array<{
    board: { notes: number[][]; values: number[] }
    color: (typeof PLAYER_COLORS)[number]
    isSelf: boolean
    profile: { _id?: string; usernameTag: string }
    status: string
  }>
  const coopSelfParticipant =
    coopParticipants.find((participant) => participant.isSelf) ?? null
  const raceSelfParticipant =
    raceParticipants.find((participant) => participant.isSelf) ?? null
  const selfParticipant = isCoop ? coopSelfParticipant : raceSelfParticipant
  const coopBoard = isCoop && matchState?.board ? matchState.board : null
  const coopBoardValues = Array.isArray(coopBoard?.values) ? coopBoard.values : EMPTY_SUDOKU_VALUES
  const coopBoardNoteMarks = Array.isArray(coopBoard?.noteMarks)
    ? coopBoard.noteMarks
    : EMPTY_SUDOKU_NOTE_MARKS
  const coopBoardValueOwners = Array.isArray(coopBoard?.valueOwners)
    ? coopBoard.valueOwners
    : EMPTY_SUDOKU_VALUE_OWNERS
  const currentSelectedIndex = selectedIndex ?? coopSelectedIndex ?? coopSelfParticipant?.selectedIndex ?? null
  const currentFocuses = isCoop
    ? (coopSelfParticipant?.focuses ?? [])
    : localFocuses
  const selfProfileId = selfParticipant?.profile._id ?? null
  const boardDecorations: Decoration[] = isCoop
    ? coopParticipants.map((participant) => ({
        color: participant.color,
        focuses: (participant.focuses ?? []).filter(Boolean),
        profileId: participant.profile._id ?? participant.profile.usernameTag,
        selectedIndex: participant.selectedIndex,
      }))
    : []
  const usesStickyDigitSelection =
    mode === "focus" ||
    (mode === "fill" && fillInput === "number_first") ||
    (mode === "notes" && notesInput === "number_first")
  const localDigitDecoration =
    usesStickyDigitSelection && activeDigit !== null && selfProfileId
      ? {
          color: selfParticipant?.color ?? PLAYER_COLORS[0]!,
          focuses: [{ kind: "digit", index: activeDigit } satisfies FocusMark],
          profileId: `${selfProfileId}-active-digit`,
          selectedIndex: null,
        }
      : null
  const coopNoteMarks =
    coopBoard
      ? coopBoardNoteMarks.map((cellNotes) =>
          cellNotes.map((note) => ({
            digit: note.digit,
            profileId: note.profileId,
          }))
        )
      : undefined
  const requiresSelectedCellForDigitInput =
    (mode === "fill" && fillInput === "cell_first") ||
    (mode === "notes" && notesInput === "cell_first")
  const focusTargets = [
    { label: "Cell", value: "cell" },
    { label: "Row", value: "row" },
    { label: "Col", value: "column" },
    { label: "Box", value: "box" },
    { label: "Digit", value: "digit" },
  ] as const

  useEffect(() => {
    updateAppPreferences((current) => ({
      ...current,
      games: {
        ...current.games,
        sudoku: {
          ...current.games.sudoku,
          controls: {
            fillInput,
            notesInput,
          },
        },
      },
    }))
  }, [fillInput, notesInput])

  useEffect(() => {
    if (state !== undefined) {
      setPendingMatchState(null)
    }
  }, [state])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 250)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isCoop) {
      setCoopSelectedIndex(null)
      return
    }

    setCoopSelectedIndex(coopSelfParticipant?.selectedIndex ?? null)
  }, [coopSelfParticipant?.selectedIndex, isCoop])

  useEffect(() => {
    if (selectedIndex !== null || !isCoop) {
      return
    }

    if (coopSelfParticipant?.selectedIndex !== null && coopSelfParticipant?.selectedIndex !== undefined) {
      setSelectedIndex(coopSelfParticipant.selectedIndex)
    }
  }, [coopSelfParticipant?.selectedIndex, isCoop, selectedIndex])

  useEffect(() => {
    if (!usesStickyDigitSelection && activeDigit !== null) {
      setActiveDigit(null)
    }
  }, [activeDigit, usesStickyDigitSelection])

  useEffect(() => {
    if (!minimalView) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [minimalView])

  async function syncPresence(args: {
    focuses?: FocusMark[]
    selectedIndex?: number | null
  }) {
    if (!isCoop || !matchState) {
      return
    }

    await updatePresence({
      focuses: args.focuses,
      matchId: matchState.matchId,
      selectedIndex: args.selectedIndex === null ? undefined : args.selectedIndex,
    })
  }

  function applyLocalFocuses(nextFocuses: FocusMark[]) {
    if (isCoop) {
      void syncPresence({
        focuses: nextFocuses,
        selectedIndex: currentSelectedIndex,
      })
      return
    }

    setLocalFocuses(nextFocuses)
  }

  function moveSelection(key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") {
    const start = currentSelectedIndex ?? 0
    const row = Math.floor(start / 9)
    const column = start % 9
    const deltas = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    } as const
    const [deltaRow, deltaColumn] = deltas[key]
    const nextIndex = ((row + deltaRow + 9) % 9) * 9 + ((column + deltaColumn + 9) % 9)

    setSelectedIndex(nextIndex)

    if (isCoop) {
      setCoopSelectedIndex(nextIndex)
      void syncPresence({ selectedIndex: nextIndex })
    }
  }

  async function runCellAction(action: "clear" | "set" | "toggle_note", index: number, value?: number) {
    setActionError(null)

    if (!matchState) {
      return
    }

    try {
      const nextState = await updateCell({
        action,
        index,
        matchId: matchState.matchId,
        value,
      })

      setPendingMatchState(nextState)
    } catch (error) {
      if (error instanceof Error && error.message === "Cell is locked by your teammate.") {
        return
      }

      setActionError(error instanceof Error ? error.message : "Action failed.")
    }
  }

  async function handleUndo() {
    if (!matchState) {
      return
    }

    setActionError(null)

    try {
      const nextState = await undoMove({
        matchId: matchState.matchId,
      })

      setPendingMatchState(nextState)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Undo failed.")
    }
  }

  function clearArmedDigit() {
    setActiveDigit(null)

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  function handleModeChange(nextMode: EntryMode) {
    setMode(nextMode)

    if (
      nextMode !== "focus" &&
      ((nextMode === "fill" && fillInput === "cell_first") ||
        (nextMode === "notes" && notesInput === "cell_first"))
    ) {
      clearArmedDigit()
    }
  }

  function handleInputPreferenceChange(nextPreference: SudokuInputPreference) {
    if (mode === "fill") {
      setFillInput(nextPreference)
    } else {
      setNotesInput(nextPreference)
    }

    if (nextPreference === "cell_first") {
      clearArmedDigit()
    }
  }

  function handleFocusCell(index: number) {
    if (focusKind === "digit") {
      return
    }

    const nextFocuses = toggleFocusMark(currentFocuses, buildFocusForCell(index, focusKind))
    applyLocalFocuses(nextFocuses)
  }

  function handleBoardClick(index: number) {
    setActionError(null)
    setSelectedIndex(index)

    if (isCoop) {
      setCoopSelectedIndex(index)
      void syncPresence({ selectedIndex: index })
    }

    if (mode === "focus") {
      handleFocusCell(index)
      return
    }

    if (
      mode === "notes" &&
      notesInput === "number_first" &&
      activeDigit !== null
    ) {
      void runCellAction("toggle_note", index, activeDigit)
      return
    }

    if (mode === "fill" && fillInput === "number_first" && activeDigit !== null) {
      void runCellAction("set", index, activeDigit)
    }
  }

  function handleDigitPress(digit: number) {
    setActionError(null)

    if (mode === "focus") {
      const nextFocuses = toggleFocusMark(currentFocuses, {
        kind: "digit",
        index: digit,
      })
      setActiveDigit(digit)
      applyLocalFocuses(nextFocuses)
      return
    }

    if (mode === "notes") {
      const nextNoteInput = resolveNotesDigitInput({
        activeDigit,
        digit,
        notesInput,
        selectedIndex: currentSelectedIndex,
      })

      setActiveDigit(nextNoteInput.nextActiveDigit)

      if (nextNoteInput.shouldToggleSelectedCell && currentSelectedIndex !== null) {
        void runCellAction("toggle_note", currentSelectedIndex, digit)
      }

      return
    }

    if (fillInput === "number_first") {
      setActiveDigit(null)
      setActiveDigit((current) => (current === digit ? null : digit))
      return
    }

    if (currentSelectedIndex === null) {
      return
    }

    setActiveDigit(null)

    void runCellAction("set", currentSelectedIndex, digit)
  }

  const handleKeyboardDigit = useEffectEvent((digit: number) => {
    handleDigitPress(digit)
  })

  const handleKeyboardClear = useEffectEvent(() => {
    if (currentSelectedIndex === null) {
      return
    }

    void runCellAction("clear", currentSelectedIndex)
  })

  const handleKeyboardMove = useEffectEvent(
    (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      moveSelection(key)
    }
  )
  const handleKeyboardUndo = useEffectEvent(() => {
    void handleUndo()
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!matchState) {
        return
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      const target = event.target

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        handleKeyboardDigit(Number(event.key))
        return
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault()
        handleKeyboardMove(event.key)
        return
      }

      if (
        event.key === "Backspace" ||
        event.key === "Delete" ||
        event.key.toLowerCase() === "c" ||
        event.key === "0"
      ) {
        event.preventDefault()
        handleKeyboardClear()
        return
      }

      if (event.key.toLowerCase() === "u") {
        event.preventDefault()
        handleKeyboardUndo()
        return
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault()
        setMode("notes")
        return
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault()
        setMode("fill")
        return
      }

      if (event.key.toLowerCase() === "h") {
        event.preventDefault()
        setMode("focus")
        return
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault()
        setMode((current) =>
          current === "fill" ? "notes" : current === "notes" ? "focus" : "fill"
        )
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        setActiveDigit(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [matchState])

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Sudoku"
          description="Multiplayer matches require a signed-in profile."
        />
        <Surface className="p-6">
          <SignInButton mode="modal">
            <Button>Sign In With Google</Button>
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

  if (!matchState) {
    return <div className="p-6 text-sm text-muted-foreground">Loading match...</div>
  }

  const timerLabel = formatMatchTimer({
    countdownEndsAt: matchState.countdownEndsAt,
    durationMs: matchState.durationMs,
    hasStarted: matchState.hasStarted,
    nowMs,
  })
  const matchStatusLabel = !matchState.hasStarted
    ? `Starts ${timerLabel}`
    : matchState.outcome
      ? matchState.outcome === "won"
        ? "Solved"
        : "Finished"
      : "Live"
  const boardClassName = "max-w-[min(100vw-1rem,50rem)]"
  const activeOptionSectionClass =
    mode === "focus"
      ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
      : "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
  const modeButtons = [
    { icon: Square, label: "Fill", value: "fill" },
    { icon: PencilSimple, label: "Notes", value: "notes" },
    { icon: Crosshair, label: "Focus", value: "focus" },
  ] as const
  const participantRows = (isCoop ? coopParticipants : raceParticipants).map((participant) => ({
    primary: participant.isSelf ? "You" : participant.profile.usernameTag,
    secondary: participant.status,
    tertiary:
      "selectedIndex" in participant && participant.selectedIndex !== null
        ? `R${Math.floor(participant.selectedIndex / 9) + 1} C${(participant.selectedIndex % 9) + 1}`
        : "No active selection",
  }))

  return (
    <Page
      className={cn(
        minimalView
          ? "fixed inset-0 z-50 min-h-0 space-y-0 bg-background"
          : "mx-auto max-w-5xl"
      )}
    >
      {!minimalView ? (
        <PageHeader
          title="Sudoku"
          description={title}
          actions={
            <Button asChild variant="outline">
              <Link to="/lobbies">Back to rooms</Link>
            </Button>
          }
        />
      ) : null}
      <Surface
        className={cn(
          minimalView
            ? "flex h-full min-h-0 flex-col rounded-none border-0 p-2 sm:p-3"
            : "p-3 sm:p-4"
        )}
      >
        <div className={cn("space-y-3", minimalView && "flex h-full min-h-0 flex-col space-y-2")}>
          <div className="flex min-h-8 items-center justify-between gap-3 border-b border-border pb-1.5 text-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">{timerLabel}</span>
              <span className="text-muted-foreground">{title}</span>
              <span className="text-muted-foreground">
                {sudokuDifficultyLabels[matchState.difficulty]}
              </span>
              <span className="text-muted-foreground">{matchStatusLabel}</span>
            </div>
            <button
              aria-label={minimalView ? "Exit focus view" : "Enter focus view"}
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
              onClick={() => setMinimalView((current) => !current)}
            >
              {minimalView ? <ArrowsInSimple size={16} /> : <ArrowsOutSimple size={16} />}
            </button>
          </div>

          {!minimalView && (matchState.outcome || !matchState.hasStarted) ? (
            <div className="min-h-8">
              {matchState.outcome ? (
              <MultiplayerCompletionPanel
                difficultyLabel={sudokuDifficultyLabels[matchState.difficulty]}
                modeLabel={title}
                outcome={matchState.outcome}
                participantRows={participantRows}
                timeLabel={timerLabel}
              />
              ) : (
              <div className="border border-border px-3 py-2 text-sm">
                <p className="font-medium">
                  Starting in {formatCountdown(matchState.remainingCountdownMs)}
                </p>
              </div>
              )}
            </div>
          ) : null}

          <div
            className={cn(
              minimalView
                ? "min-h-0 flex-1 overflow-auto pt-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                : ""
            )}
          >
            {isCoop ? (
              <SudokuBoard
                className={boardClassName}
                decorations={
                  localDigitDecoration
                    ? [...boardDecorations, localDigitDecoration]
                    : boardDecorations
                }
                givens={matchState.givens}
                noteMarks={coopNoteMarks}
                onCellClick={handleBoardClick}
                selectedIndex={currentSelectedIndex}
                valueOwners={coopBoardValueOwners.map((owner) => owner ?? null)}
                values={coopBoardValues}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center gap-2 overflow-auto pb-1 md:hidden">
                  {participantsWithColors.map((participant, index) => (
                    <Button
                      key={participant.profile.usernameTag}
                      size="sm"
                      type="button"
                      variant={mobileBoard === index ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setMobileBoard(index)}
                    >
                      {participant.isSelf ? "You" : participant.profile.usernameTag}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {raceParticipants.map((participant, index) => {
                    const selfBoardDecorations =
                      participant.isSelf && localDigitDecoration ? [localDigitDecoration] : []

                    return (
                      <div
                        key={participant.profile.usernameTag}
                        className={cn(
                          "space-y-2",
                          index !== mobileBoard ? "hidden md:block" : ""
                        )}
                      >
                        {!minimalView ? (
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div>
                              <p className="font-medium">
                                {participant.isSelf ? "You" : participant.profile.usernameTag}
                              </p>
                              <p className="text-muted-foreground">{participant.status}</p>
                            </div>
                          </div>
                        ) : null}
                        <SudokuBoard
                          className={boardClassName}
                          decorations={selfBoardDecorations}
                          givens={matchState.givens}
                          notes={participant.board?.notes ?? EMPTY_SUDOKU_NOTES}
                          onCellClick={(index) => {
                            if (!participant.isSelf) {
                              return
                            }

                            handleBoardClick(index)
                          }}
                          selectedIndex={participant.isSelf ? currentSelectedIndex : null}
                          values={participant.board?.values ?? EMPTY_SUDOKU_VALUES}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              "shrink-0 space-y-1.5",
              minimalView ? "" : "border-t border-border pt-2"
            )}
          >
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                {modeButtons
                  .filter((option) => option.value !== "focus")
                  .map((option) => {
                    const Icon = option.icon

                    return (
                      <Button
                        key={option.value}
                        size="icon"
                        type="button"
                        className="h-10 w-10"
                        variant={mode === option.value ? "default" : "outline"}
                        onClick={() => handleModeChange(option.value as EntryMode)}
                        aria-label={option.label}
                        title={option.label}
                      >
                        <Icon size={14} />
                      </Button>
                    )
                  })}
              </div>
              <div className="flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <Button
                  size="icon"
                  type="button"
                  className="h-10 w-10"
                  variant={mode === "focus" ? "default" : "outline"}
                  onClick={() => setMode("focus")}
                  aria-label="Focus"
                  title="Focus"
                >
                  <Crosshair size={14} />
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  disabled={!matchState.canUndo}
                  className="h-10 w-10"
                  onClick={() => {
                    void handleUndo()
                  }}
                  aria-label="Undo"
                  title="Undo"
                >
                  <ArrowCounterClockwise size={14} />
                </Button>
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  disabled={currentSelectedIndex === null}
                  className="h-10 w-10"
                  onClick={() => {
                    if (currentSelectedIndex === null) {
                      return
                    }

                    void runCellAction("clear", currentSelectedIndex)
                  }}
                  aria-label="Clear"
                  title="Clear"
                >
                  <Backspace size={14} />
                </Button>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-[24rem] justify-center gap-1.5 py-4">
              {DIGIT_OPTIONS.map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  className="h-10 w-10 rounded-md px-0 text-base"
                  disabled={requiresSelectedCellForDigitInput && currentSelectedIndex === null}
                  variant={usesStickyDigitSelection && activeDigit === digit ? "default" : "outline"}
                  onClick={(event) => {
                    handleDigitPress(digit)

                    if (requiresSelectedCellForDigitInput) {
                      event.currentTarget.blur()
                    }
                  }}
                >
                  {digit}
                </Button>
              ))}
            </div>

            <div className="min-h-10">
              {mode === "focus" ? (
                <div className={cn("mx-auto flex w-fit flex-wrap items-center justify-center gap-2", activeOptionSectionClass)}>
                  {focusTargets.map((option) => (
                    <Button
                      key={option.value}
                      size="icon"
                      type="button"
                      className="h-10 w-10"
                      variant={focusKind === option.value ? "default" : "outline"}
                      aria-label={option.label}
                      onClick={() => setFocusKind(option.value)}
                      title={option.label}
                    >
                      <FocusKindIcon kind={option.value} />
                    </Button>
                  ))}
                  {currentFocuses.length > 0 ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      className="h-10 px-3 text-sm"
                      onClick={() => applyLocalFocuses([])}
                    >
                      Clear all
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div
                  className={cn(
                    "mx-auto flex w-fit flex-wrap items-center justify-center gap-2 text-sm",
                    activeOptionSectionClass
                  )}
                >
                  {[
                    { label: "Cell", value: "cell_first" },
                    { label: "Number", value: "number_first" },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      type="button"
                      className="h-10 px-3 text-sm"
                      variant={
                        (mode === "fill" ? fillInput : notesInput) === option.value
                          ? "default"
                          : "outline"
                      }
                      onClick={() => handleInputPreferenceChange(option.value as SudokuInputPreference)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {actionError ? (
              <div className="border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {actionError}
              </div>
            ) : null}
          </div>

          {!minimalView ? (
            <div className="border-t border-border pt-3">
              <div className="space-y-2 text-sm">
                {(isCoop ? coopParticipants : raceParticipants).map((participant) => (
                  <div
                    key={participant.profile.usernameTag}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2"
                    style={{ borderColor: participant.color.ring }}
                  >
                    <span className="font-medium" style={{ color: participant.color.text }}>
                      {participant.isSelf ? "You" : participant.profile.usernameTag}
                    </span>
                    <span className="text-muted-foreground">{participant.status}</span>
                    {"selectedIndex" in participant && participant.selectedIndex !== null ? (
                      <span className="text-muted-foreground">
                        {`R${Math.floor(participant.selectedIndex / 9) + 1} C${(participant.selectedIndex % 9) + 1}`}
                      </span>
                    ) : null}
                    {"focuses" in participant && (participant.focuses?.length ?? 0) > 0 ? (
                      <span className="text-muted-foreground">
                        {(participant.focuses ?? []).length} focus marks
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Keyboard: `1-9` enter, arrows move, `N` notes, `F` fill, `H` focus, `C`
                clear, `U` undo, `T` cycle mode.
              </p>
            </div>
          ) : null}
        </div>
      </Surface>
    </Page>
  )
}
