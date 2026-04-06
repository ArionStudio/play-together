import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  ArrowCounterClockwise,
  Backspace,
  Crosshair,
  PencilSimple,
  Square,
} from "@phosphor-icons/react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  clearCellValue,
  createSudokuGame,
  getIncorrectIndices,
  getProgress,
  getRelatedIndices,
  isSudokuSolved,
  setCellValue,
  sudokuDifficultyLabels,
  sudokuDifficulties,
  toggleCellNote,
  type SudokuDifficulty,
  type SudokuGameState,
  type SudokuPuzzle,
} from "@workspace/sudoku-engine"

import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import {
  FocusKindIcon,
  SudokuBoard,
  buildFocusForCell,
  toggleFocusMark,
  type FocusKind,
  type FocusMark,
} from "@/features/sudoku/board.tsx"
import { resolveNotesDigitInput } from "@/features/sudoku/input-mode.ts"
import {
  readAppPreferences,
  updateAppPreferences,
  type SudokuInputPreference,
} from "@/lib/app-preferences.ts"

const DIGIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
type EntryMode = "fill" | "notes" | "focus"

type SudokuSession = {
  difficulty: SudokuDifficulty
  elapsedMs: number
  game: SudokuGameState
  history: SudokuGameState[]
  selectedIndex: number | null
  startedAt: number | null
}

type GenerateSudokuPuzzleResponse =
  | {
      difficulty: SudokuDifficulty
      id: number
      puzzle: SudokuPuzzle
    }
  | {
      difficulty: SudokuDifficulty
      error: string
      id: number
    }

function createSeed() {
  return crypto.randomUUID()
}

function findFirstEditableIndex(game: SudokuGameState) {
  return game.cells.findIndex((cell) => !cell.fixed)
}

function createIdleSudokuSession(difficulty: SudokuDifficulty): SudokuSession {
  const game = createSudokuGame({
    clueCount: 0,
    difficulty,
    givens: Array.from({ length: 81 }, () => 0),
    seed: "idle",
    solution: Array.from({ length: 81 }, () => 0),
  })

  return {
    difficulty,
    elapsedMs: 0,
    game,
    history: [],
    selectedIndex: null,
    startedAt: null,
  }
}

function createSudokuSessionFromPuzzle(puzzle: SudokuPuzzle): SudokuSession {
  const game = createSudokuGame(puzzle)

  return {
    difficulty: puzzle.difficulty,
    elapsedMs: 0,
    game,
    history: [],
    selectedIndex: findFirstEditableIndex(game),
    startedAt: null,
  }
}

function clearDigitFromRelatedNotes(args: {
  game: SudokuGameState
  index: number
  value: number
}) {
  if (args.value <= 0 || args.game.puzzle.solution[args.index] !== args.value) {
    return args.game
  }

  const related = new Set(getRelatedIndices(args.index))
  const digit = args.value as (typeof DIGIT_OPTIONS)[number]
  let changed = false
  const nextCells = args.game.cells.map((cell, cellIndex) => {
    if (!related.has(cellIndex) || !cell.notes.includes(digit)) {
      return cell
    }

    changed = true

    return {
      ...cell,
      notes: cell.notes.filter((note) => note !== digit),
    }
  })

  return changed
    ? {
        ...args.game,
        cells: nextCells,
      }
    : args.game
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function SudokuSetupPanel({
  generationError,
  isGenerating,
  isReady,
  isStarting,
  onSelectDifficulty,
  onStart,
  selectedDifficulty,
}: {
  generationError: string | null
  isGenerating: boolean
  isReady: boolean
  isStarting: boolean
  onSelectDifficulty: (difficulty: SudokuDifficulty) => void
  onStart: () => void
  selectedDifficulty: SudokuDifficulty
}) {
  return (
    <Surface className="p-5 sm:p-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Choose a puzzle</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pick a difficulty, then start the solo run.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sudokuDifficulties.map((difficulty) => (
            <Button
              key={difficulty}
              onClick={() => onSelectDifficulty(difficulty)}
              type="button"
              variant={
                selectedDifficulty === difficulty ? "default" : "outline"
              }
            >
              {sudokuDifficultyLabels[difficulty]}
            </Button>
          ))}
        </div>
        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Selected difficulty</span>
            <span className="font-medium">
              {sudokuDifficultyLabels[selectedDifficulty]}
            </span>
          </div>
        </div>
        {generationError ? (
          <p className="text-sm text-destructive">{generationError}</p>
        ) : isReady ? (
          <p className="text-sm text-muted-foreground">Puzzle ready.</p>
        ) : isGenerating ? (
          <p className="text-sm text-muted-foreground">
            Generating on your device. Master and Extreme can take a few
            seconds.
          </p>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          disabled={isStarting}
          onClick={onStart}
          type="button"
        >
          {isStarting ? "Preparing puzzle..." : "Start puzzle"}
        </Button>
      </div>
    </Surface>
  )
}

function SudokuCompletionPanel({
  difficulty,
  onChangeDifficulty,
  onRestart,
  timeLabel,
}: {
  difficulty: SudokuDifficulty
  onChangeDifficulty: () => void
  onRestart: () => void
  timeLabel: string
}) {
  return (
    <Surface className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Puzzle solved.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The board is complete.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRestart} type="button">
            Play again
          </Button>
          <Button onClick={onChangeDifficulty} type="button" variant="outline">
            Change difficulty
          </Button>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
        {[
          ["Result", "Solved"],
          ["Time", timeLabel],
          ["Difficulty", sudokuDifficultyLabels[difficulty]],
          ["Mode", "Local"],
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

function SudokuCompletedBoard({ game }: { game: SudokuGameState }) {
  return (
    <Surface className="p-4 sm:p-5">
      <div className="mx-auto w-full max-w-[min(100vw-1.5rem,24rem)]">
        <div className="grid grid-cols-9 border-2 border-foreground/90 bg-border/50">
          {game.cells.map((cell, index) => {
            const row = Math.floor(index / 9)
            const column = index % 9

            return (
              <div
                key={index}
                className={cn(
                  "flex aspect-square items-center justify-center border border-border text-sm sm:text-base",
                  row === 2 || row === 5 ? "border-b-2 border-b-foreground/90" : "",
                  column === 2 || column === 5 ? "border-r-2 border-r-foreground/90" : "",
                  cell.fixed ? "bg-muted/35 font-semibold text-foreground" : "bg-background text-foreground"
                )}
              >
                {cell.value}
              </div>
            )
          })}
        </div>
      </div>
    </Surface>
  )
}

export function SudokuPage() {
  const storedPreferences = readAppPreferences()
  const workerRef = useRef<Worker | null>(null)
  const nextGenerationIdRef = useRef(0)
  const activeGenerationRef = useRef<{
    difficulty: SudokuDifficulty
    id: number
  } | null>(null)
  const pendingStartDifficultyRef = useRef<SudokuDifficulty | null>(null)
  const requestPuzzleGenerationRef = useRef<(difficulty: SudokuDifficulty) => void>(
    () => {}
  )
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<SudokuDifficulty>(storedPreferences.games.sudoku.solo.difficulty)
  const [session, setSession] = useState(() =>
    createIdleSudokuSession(storedPreferences.games.sudoku.solo.difficulty)
  )
  const [hasStarted, setHasStarted] = useState(false)
  const [preparedPuzzle, setPreparedPuzzle] = useState<SudokuPuzzle | null>(
    null
  )
  const [pendingStartDifficulty, setPendingStartDifficulty] =
    useState<SudokuDifficulty | null>(null)
  const [preparingDifficulty, setPreparingDifficulty] =
    useState<SudokuDifficulty | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [mode, setMode] = useState<EntryMode>("fill")
  const [focusKind, setFocusKind] = useState<FocusKind>("cell")
  const [focuses, setFocuses] = useState<FocusMark[]>([])
  const [activeDigit, setActiveDigit] = useState<number | null>(null)
  const [minimalView, setMinimalView] = useState(false)
  const [fillInput, setFillInput] = useState<SudokuInputPreference>(
    storedPreferences.games.sudoku.controls.fillInput
  )
  const [notesInput, setNotesInput] = useState<SudokuInputPreference>(
    storedPreferences.games.sudoku.controls.notesInput
  )

  const values = useMemo(
    () => session.game.cells.map((cell) => cell.value),
    [session.game]
  )
  const notes = useMemo(
    () => session.game.cells.map((cell) => cell.notes),
    [session.game]
  )
  const incorrectSet = useMemo(
    () => new Set(getIncorrectIndices(session.game)),
    [session.game]
  )
  const progress = useMemo(() => getProgress(session.game), [session.game])
  const solved = useMemo(() => isSudokuSolved(session.game), [session.game])
  const selectedCell =
    session.selectedIndex === null
      ? null
      : (session.game.cells[session.selectedIndex] ?? null)
  const selectedValue = selectedCell?.value ?? 0
  const activeOptionSectionClass =
    mode === "focus"
      ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
      : "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
  const usesStickyDigitSelection =
    mode === "focus" ||
    (mode === "fill" && fillInput === "number_first") ||
    (mode === "notes" && notesInput === "number_first")
  const timeLabel = formatElapsed(session.elapsedMs)
  const selectedPuzzleReady = preparedPuzzle?.difficulty === selectedDifficulty
  const selectedPuzzlePreparing = preparingDifficulty === selectedDifficulty
  const selectedPuzzleStarting = pendingStartDifficulty === selectedDifficulty
  const modeButtons = [
    { icon: Square, label: "Fill", value: "fill" },
    { icon: PencilSimple, label: "Notes", value: "notes" },
  ] as const
  const focusTargets = [
    { label: "Cell", value: "cell" },
    { label: "Row", value: "row" },
    { label: "Col", value: "column" },
    { label: "Box", value: "box" },
    { label: "Digit", value: "digit" },
  ] as const

  useEffect(() => {
    pendingStartDifficultyRef.current = pendingStartDifficulty
  }, [pendingStartDifficulty])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      activeGenerationRef.current = null
    }
  }, [])

  function handleGeneratedPuzzle(response: GenerateSudokuPuzzleResponse) {
    const activeGeneration = activeGenerationRef.current
    const pendingDifficulty = pendingStartDifficultyRef.current

    if (!activeGeneration || activeGeneration.id !== response.id) {
      return
    }

    activeGenerationRef.current = null
    setPreparingDifficulty(null)

    if ("error" in response) {
      setGenerationError(response.error)

      if (pendingDifficulty === response.difficulty) {
        pendingStartDifficultyRef.current = null
        setPendingStartDifficulty(null)
      }

      return
    }

    if (pendingDifficulty === response.difficulty) {
      pendingStartDifficultyRef.current = null
      setPendingStartDifficulty(null)
      resetInteractionState()
      setPreparedPuzzle(null)
      setSelectedDifficulty(response.puzzle.difficulty)
      setSession(createSudokuSessionFromPuzzle(response.puzzle))
      setHasStarted(true)
      requestPuzzleGeneration(response.puzzle.difficulty, true)
      return
    }

    setPreparedPuzzle(response.puzzle)
    setGenerationError(null)
  }

  function createGenerationWorker() {
    const worker = new Worker(
      new URL("./sudoku-generator.worker.ts", import.meta.url),
      { type: "module" }
    )

    worker.addEventListener(
      "message",
      (event: MessageEvent<GenerateSudokuPuzzleResponse>) => {
        handleGeneratedPuzzle(event.data)
      }
    )
    workerRef.current = worker
    return worker
  }

  function requestPuzzleGeneration(
    difficulty: SudokuDifficulty,
    force = false
  ) {
    if (!force && preparedPuzzle?.difficulty === difficulty) {
      return
    }

    if (activeGenerationRef.current?.difficulty === difficulty && !force) {
      return
    }

    if (activeGenerationRef.current) {
      workerRef.current?.terminate()
      workerRef.current = null
      activeGenerationRef.current = null
    }

    const worker = workerRef.current ?? createGenerationWorker()

    const id = nextGenerationIdRef.current + 1
    nextGenerationIdRef.current = id
    activeGenerationRef.current = { difficulty, id }
    setPreparingDifficulty(difficulty)
    setGenerationError(null)

    worker.postMessage({
      difficulty,
      id,
      seed: createSeed(),
    })
  }

  useEffect(() => {
    requestPuzzleGenerationRef.current = requestPuzzleGeneration
  })

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
          solo: {
            difficulty: selectedDifficulty,
          },
        },
      },
    }))
  }, [fillInput, notesInput, selectedDifficulty])

  useEffect(() => {
    if (!preparedPuzzle || preparedPuzzle.difficulty !== selectedDifficulty) {
      requestPuzzleGenerationRef.current(selectedDifficulty)
    }
  }, [preparedPuzzle, selectedDifficulty])

  useEffect(() => {
    if (!hasStarted || session.startedAt === null || solved) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setSession((current) =>
        current.startedAt === null
          ? current
          : { ...current, elapsedMs: Date.now() - current.startedAt }
      )
    }, 250)

    return () => window.clearInterval(interval)
  }, [hasStarted, session.startedAt, solved])

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

  function resetInteractionState() {
    setActiveDigit(null)
    setFocuses([])
    setMode("fill")
    setFocusKind("cell")
    setMinimalView(false)
  }

  function startSessionWithPuzzle(puzzle: SudokuPuzzle) {
    resetInteractionState()
    setPreparedPuzzle(null)
    setSelectedDifficulty(puzzle.difficulty)
    setSession(createSudokuSessionFromPuzzle(puzzle))
    setHasStarted(true)
    requestPuzzleGeneration(puzzle.difficulty, true)
  }

  function startNewGame(nextDifficulty = selectedDifficulty) {
    setSelectedDifficulty(nextDifficulty)

    if (preparedPuzzle?.difficulty === nextDifficulty) {
      startSessionWithPuzzle(preparedPuzzle)
      return
    }

    setPendingStartDifficulty(nextDifficulty)
    requestPuzzleGeneration(nextDifficulty, true)
  }

  function openSetup() {
    resetInteractionState()
    setPendingStartDifficulty(null)
    setSession(createIdleSudokuSession(selectedDifficulty))
    setHasStarted(false)
  }

  function updateGame(updater: (game: SudokuGameState) => SudokuGameState) {
    setSession((current) => {
      const nextGame = updater(current.game)

      if (nextGame === current.game) {
        return current
      }

      const nextStartedAt = current.startedAt ?? Date.now()
      const completed = isSudokuSolved(nextGame)

      return {
        ...current,
        elapsedMs: completed ? Date.now() - nextStartedAt : current.elapsedMs,
        game: nextGame,
        history: [...current.history, current.game],
        startedAt: nextStartedAt,
      }
    })
  }

  function undoLastMove() {
    setSession((current) => {
      const previousGame = current.history[current.history.length - 1]

      if (!previousGame) {
        return current
      }

      return {
        ...current,
        game: previousGame,
        history: current.history.slice(0, -1),
      }
    })
  }

  function runCellAction(
    action: "clear" | "set" | "toggle_note",
    index: number,
    value?: number
  ) {
    updateGame((game) => {
      if (action === "clear") {
        return clearCellValue(game, index)
      }

      if (action === "toggle_note") {
        return toggleCellNote(game, index, value ?? 0)
      }

      const nextGame = setCellValue(game, index, value ?? 0)

      return clearDigitFromRelatedNotes({
        game: nextGame,
        index,
        value: nextGame.cells[index]?.value ?? 0,
      })
    })
  }

  function moveSelection(
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
  ) {
    setSession((current) => {
      const start =
        current.selectedIndex ?? findFirstEditableIndex(current.game)

      if (start === -1 || start === null) {
        return current
      }

      const row = Math.floor(start / 9)
      const column = start % 9
      const deltas = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      } as const
      const [deltaRow, deltaColumn] = deltas[key]
      const nextRow = (row + deltaRow + 9) % 9
      const nextColumn = (column + deltaColumn + 9) % 9

      return {
        ...current,
        selectedIndex: nextRow * 9 + nextColumn,
      }
    })
  }

  function handleBoardClick(index: number) {
    setSession((current) => ({ ...current, selectedIndex: index }))

    if (mode === "focus") {
      if (focusKind === "digit") {
        return
      }

      setFocuses((current) =>
        toggleFocusMark(current, buildFocusForCell(index, focusKind))
      )
      return
    }

    if (
      mode === "notes" &&
      notesInput === "number_first" &&
      activeDigit !== null
    ) {
      runCellAction("toggle_note", index, activeDigit)
      return
    }

    if (
      mode === "fill" &&
      fillInput === "number_first" &&
      activeDigit !== null
    ) {
      runCellAction("set", index, activeDigit)
    }
  }

  function handleDigitPress(digit: number) {
    if (mode === "focus") {
      setActiveDigit(digit)
      setFocuses((current) =>
        toggleFocusMark(current, {
          kind: "digit",
          index: digit,
        })
      )
      return
    }

    if (mode === "notes") {
      const nextNoteInput = resolveNotesDigitInput({
        activeDigit,
        digit,
        notesInput,
        selectedIndex: session.selectedIndex,
      })

      setActiveDigit(nextNoteInput.nextActiveDigit)

      if (nextNoteInput.shouldToggleSelectedCell && session.selectedIndex !== null) {
        runCellAction("toggle_note", session.selectedIndex, digit)
      }

      return
    }

    if (fillInput === "number_first") {
      setActiveDigit((current) => (current === digit ? null : digit))
      return
    }

    setActiveDigit(digit)

    if (session.selectedIndex !== null) {
      runCellAction("set", session.selectedIndex, digit)
    }
  }

  const handleKeyboardDigit = useEffectEvent((digit: number) => {
    handleDigitPress(digit)
  })

  const handleKeyboardMove = useEffectEvent(
    (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      moveSelection(key)
    }
  )

  const handleKeyboardClear = useEffectEvent(() => {
    if (session.selectedIndex === null) {
      return
    }

    runCellAction("clear", session.selectedIndex)
  })

  useEffect(() => {
    if (!hasStarted || solved) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
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
        undoLastMove()
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
  }, [hasStarted, solved])

  if (!hasStarted) {
    return (
      <Page className="mx-auto max-w-2xl">
        <PageHeader
          title="Sudoku"
          description="Choose a puzzle, then start."
          actions={
            <Button asChild type="button" variant="outline">
              <Link to="/games/sudoku/extreme-catalog">Extreme catalog</Link>
            </Button>
          }
        />
        <SudokuSetupPanel
          generationError={selectedPuzzlePreparing ? null : generationError}
          isGenerating={selectedPuzzlePreparing}
          isReady={selectedPuzzleReady}
          isStarting={selectedPuzzleStarting}
          onSelectDifficulty={setSelectedDifficulty}
          onStart={() => startNewGame(selectedDifficulty)}
          selectedDifficulty={selectedDifficulty}
        />
      </Page>
    )
  }

  if (solved) {
    return (
      <Page className="mx-auto max-w-4xl">
        <PageHeader title="Sudoku" />
        <div className="space-y-6">
          <SudokuCompletionPanel
            difficulty={session.difficulty}
            onChangeDifficulty={openSetup}
            onRestart={() => startNewGame(session.difficulty)}
            timeLabel={timeLabel}
          />
          <SudokuCompletedBoard game={session.game} />
        </div>
      </Page>
    )
  }

  const boardClassName = minimalView ? "w-full max-h-full max-w-full" : undefined

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
          actions={
            <Button type="button" onClick={openSetup} variant="outline">
              Change difficulty
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
        <div
          className={cn(
            "space-y-3",
            minimalView && "flex h-full min-h-0 flex-col space-y-2"
          )}
        >
          <div className="flex min-h-8 items-center justify-between gap-3 border-b border-border pb-1.5 text-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">{timeLabel}</span>
              <span className="text-muted-foreground">Solo</span>
              <span className="text-muted-foreground">
                {sudokuDifficultyLabels[session.difficulty]}
              </span>
              <span className="text-muted-foreground">
                {session.startedAt === null ? "Ready" : "Live"}
              </span>
            </div>
            <button
              aria-label={minimalView ? "Exit focus view" : "Enter focus view"}
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
              onClick={() => setMinimalView((current) => !current)}
            >
              {minimalView ? (
                <ArrowsInSimple size={16} />
              ) : (
                <ArrowsOutSimple size={16} />
              )}
            </button>
          </div>

          <div
            className={cn(
              minimalView
                ? "flex min-h-0 flex-1 items-center justify-center overflow-hidden pt-3"
                : ""
            )}
          >
            <SudokuBoard
              className={boardClassName}
              focuses={focuses}
              givens={session.game.puzzle.givens}
              highlightedDigits={[
                ...(selectedValue !== 0 ? [selectedValue] : []),
                ...(activeDigit !== null ? [activeDigit] : []),
              ]}
              incorrectIndices={incorrectSet}
              notes={notes}
              onCellClick={handleBoardClick}
              selectedIndex={session.selectedIndex}
              values={values}
            />
          </div>

          <div
            className={cn(
              "shrink-0 space-y-1.5",
              minimalView ? "" : "border-t border-border pt-2"
            )}
          >
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                {modeButtons.map((option) => {
                  const Icon = option.icon

                  return (
                    <Button
                      key={option.value}
                      size="icon"
                      type="button"
                      className="h-10 w-10"
                      variant={mode === option.value ? "default" : "outline"}
                      onClick={() => setMode(option.value as EntryMode)}
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
                  disabled={session.history.length === 0}
                  className="h-10 w-10"
                  onClick={undoLastMove}
                  aria-label="Undo"
                  title="Undo"
                >
                  <ArrowCounterClockwise size={14} />
                </Button>
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  disabled={session.selectedIndex === null}
                  className="h-10 w-10"
                  onClick={() => {
                    if (session.selectedIndex === null) {
                      return
                    }

                    runCellAction("clear", session.selectedIndex)
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
                  variant={
                    usesStickyDigitSelection && activeDigit === digit
                      ? "default"
                      : "outline"
                  }
                  onClick={() => handleDigitPress(digit)}
                >
                  {digit}
                </Button>
              ))}
            </div>

            <div className="min-h-10">
              {mode === "focus" ? (
                <div
                  className={cn(
                    "mx-auto flex w-fit flex-wrap items-center justify-center gap-2",
                    activeOptionSectionClass
                  )}
                >
                  {focusTargets.map((option) => (
                    <Button
                      key={option.value}
                      size="icon"
                      type="button"
                      className="h-10 w-10"
                      variant={
                        focusKind === option.value ? "default" : "outline"
                      }
                      aria-label={option.label}
                      onClick={() => setFocusKind(option.value)}
                      title={option.label}
                    >
                      <FocusKindIcon kind={option.value} />
                    </Button>
                  ))}
                  {focuses.length > 0 ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      className="h-10 px-3 text-sm"
                      onClick={() => setFocuses([])}
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
                        (mode === "fill" ? fillInput : notesInput) ===
                        option.value
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        mode === "fill"
                          ? setFillInput(option.value as SudokuInputPreference)
                          : setNotesInput(option.value as SudokuInputPreference)
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!minimalView ? (
            <div className="border-t border-border pt-3">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2">
                  <span className="font-medium">You</span>
                  <span className="text-muted-foreground">
                    {session.startedAt === null ? "Ready" : "In progress"}
                  </span>
                  <span className="text-muted-foreground">
                    {sudokuDifficultyLabels[session.difficulty]}
                  </span>
                  <span className="text-muted-foreground">
                    Filled {progress.filledCells}/81
                  </span>
                  <span className="text-muted-foreground">
                    Errors {incorrectSet.size}
                  </span>
                  <span className="text-muted-foreground">
                    {session.selectedIndex === null
                      ? "No selection"
                      : `R${Math.floor(session.selectedIndex / 9) + 1} C${(session.selectedIndex % 9) + 1}`}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  onClick={() => startNewGame(session.difficulty)}
                >
                  New puzzle
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={openSetup}
                >
                  Change difficulty
                </Button>
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Keyboard: `1-9` enter, arrows move, `N` notes, `F` fill, `H`
                focus, `C` clear, `U` undo, `T` cycle mode.
              </p>
            </div>
          ) : null}
        </div>
      </Surface>
    </Page>
  )
}
