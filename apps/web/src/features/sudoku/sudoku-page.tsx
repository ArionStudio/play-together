import { useEffect, useEffectEvent, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  clearCellValue,
  createSudokuGame,
  createSudokuPuzzle,
  getConflictingIndices,
  getIncorrectIndices,
  getProgress,
  getRelatedIndices,
  isSudokuSolved,
  setCellValue,
  sudokuDifficulties,
  toggleCellNote,
  type SudokuDifficulty,
  type SudokuGameState,
} from "@workspace/sudoku-engine"

import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

const DIGIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const difficultyLabels: Record<SudokuDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
  haaard: "Haaard",
}

type SudokuSession = {
  difficulty: SudokuDifficulty
  elapsedMs: number
  game: SudokuGameState
  notesMode: boolean
  selectedIndex: number | null
  startedAt: number | null
}

function createSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function findFirstEditableIndex(game: SudokuGameState) {
  return game.cells.findIndex((cell) => !cell.fixed)
}

function createSudokuSession(difficulty: SudokuDifficulty): SudokuSession {
  const game = createSudokuGame(createSudokuPuzzle(difficulty, createSeed()))

  return {
    difficulty,
    elapsedMs: 0,
    game,
    notesMode: false,
    selectedIndex: findFirstEditableIndex(game),
    startedAt: null,
  }
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function SudokuPage() {
  const [session, setSession] = useState(() => createSudokuSession("medium"))

  const values = useMemo(
    () => session.game.cells.map((cell) => cell.value),
    [session.game]
  )
  const conflictSet = useMemo(
    () => new Set(getConflictingIndices(values)),
    [values]
  )
  const incorrectSet = useMemo(
    () => new Set(getIncorrectIndices(session.game)),
    [session.game]
  )
  const relatedSet = useMemo(
    () =>
      new Set(
        session.selectedIndex === null ? [] : getRelatedIndices(session.selectedIndex)
      ),
    [session.selectedIndex]
  )
  const progress = useMemo(() => getProgress(session.game), [session.game])
  const solved = useMemo(() => isSudokuSolved(session.game), [session.game])

  const selectedCell =
    session.selectedIndex === null ? null : session.game.cells[session.selectedIndex] ?? null
  const selectedValue = selectedCell?.value ?? 0
  const selectedIsEditable = selectedCell ? !selectedCell.fixed : false
  const statusLabel = solved
    ? "Solved"
    : session.startedAt === null
      ? "Ready"
      : progress.emptyCells === 0
        ? "Needs review"
        : "In progress"

  useEffect(() => {
    if (session.startedAt === null || solved) {
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
  }, [session.startedAt, solved])

  function startNewGame(nextDifficulty = session.difficulty) {
    setSession(createSudokuSession(nextDifficulty))
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
        startedAt: nextStartedAt,
      }
    })
  }

  function applyDigit(value: number) {
    if (session.selectedIndex === null) {
      return
    }

    updateGame((game) =>
      session.notesMode
        ? toggleCellNote(game, session.selectedIndex!, value)
        : setCellValue(game, session.selectedIndex!, value)
    )
  }

  function clearSelectedCell() {
    if (session.selectedIndex === null) {
      return
    }

    updateGame((game) => clearCellValue(game, session.selectedIndex!))
  }

  function moveSelection(key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") {
    setSession((current) => {
      const start = current.selectedIndex ?? findFirstEditableIndex(current.game)

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

  const handleKeyboardDigit = useEffectEvent((value: number) => {
    applyDigit(value)
  })
  const handleKeyboardClear = useEffectEvent(() => {
    clearSelectedCell()
  })
  const handleKeyboardMove = useEffectEvent(
    (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      moveSelection(key)
    }
  )
  const handleKeyboardNotesToggle = useEffectEvent(() => {
    setSession((current) => ({
      ...current,
      notesMode: !current.notesMode,
    }))
  })

  useEffect(() => {
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

      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        event.preventDefault()
        handleKeyboardClear()
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

      if (event.key.toLowerCase() === "n") {
        event.preventDefault()
        handleKeyboardNotesToggle()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <Page>
      <PageHeader
        title="Sudoku"
        description="Classic solo Sudoku with seeded puzzle generation, note-taking, keyboard controls, and four difficulty presets."
        actions={
          <Button type="button" onClick={() => startNewGame()}>
            New puzzle
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,42rem)_minmax(18rem,1fr)]">
        <Surface className="overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-border px-2 py-1 font-medium">
              {statusLabel}
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              {difficultyLabels[session.difficulty]}
            </span>
            <span className="rounded-md border border-border px-2 py-1 font-mono text-muted-foreground">
              {formatElapsed(session.elapsedMs)}
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              Filled {progress.filledCells}/81
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
              Errors {incorrectSet.size}
            </span>
          </div>
          <div className="mt-4">
            <div className="mx-auto max-w-[38rem]">
              <div className="grid grid-cols-9 border-2 border-foreground/90 bg-border/50">
                {session.game.cells.map((cell, index) => {
                  const row = Math.floor(index / 9)
                  const column = index % 9
                  const isSelected = index === session.selectedIndex
                  const isRelated = relatedSet.has(index)
                  const matchesSelection =
                    selectedValue !== 0 && cell.value === selectedValue
                  const hasConflict = conflictSet.has(index)
                  const isIncorrect = incorrectSet.has(index)

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() =>
                        setSession((current) => ({ ...current, selectedIndex: index }))
                      }
                      aria-label={`Row ${row + 1} column ${column + 1}`}
                      className={cn(
                        "relative flex aspect-square items-center justify-center border border-border text-base transition-colors sm:text-lg",
                        row === 2 || row === 5
                          ? "border-b-2 border-b-foreground/90"
                          : "",
                        column === 2 || column === 5
                          ? "border-r-2 border-r-foreground/90"
                          : "",
                        cell.fixed
                          ? "bg-muted/35 font-semibold text-foreground"
                          : "bg-background text-foreground hover:bg-muted/50",
                        isRelated ? "bg-muted/60" : "",
                        matchesSelection ? "bg-primary/10" : "",
                        isSelected ? "ring-2 ring-inset ring-primary" : "",
                        hasConflict ? "text-destructive" : "",
                        isIncorrect ? "text-amber-700 dark:text-amber-300" : ""
                      )}
                    >
                      {cell.value !== 0 ? (
                        <span>{cell.value}</span>
                      ) : (
                        <span className="grid grid-cols-3 gap-px text-[9px] leading-none text-muted-foreground sm:text-[10px]">
                          {DIGIT_OPTIONS.map((digit) => (
                            <span
                              key={digit}
                              className={cell.notes.includes(digit) ? "opacity-100" : "opacity-0"}
                            >
                              {digit}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm leading-6 text-muted-foreground">
            {solved
              ? `Solved in ${formatElapsed(session.elapsedMs)}.`
              : "Select a cell, use the number pad or keyboard, and toggle notes when you want pencil marks instead of committed entries."}
          </div>
        </Surface>

        <div className="space-y-6">
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Game setup</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {sudokuDifficulties.map((difficulty) => (
                <Button
                  key={difficulty}
                  type="button"
                  variant={difficulty === session.difficulty ? "default" : "outline"}
                  onClick={() => startNewGame(difficulty)}
                >
                  {difficultyLabels[difficulty]}
                </Button>
              ))}
            </div>
            <div className="mt-5 divide-y divide-border text-sm">
              {[
                ["Clues", String(progress.clueCount)],
                ["Empty cells", String(progress.emptyCells)],
                ["Errors", String(incorrectSet.size)],
                ["Selected", selectedCell ? `R${Math.floor((session.selectedIndex ?? 0) / 9) + 1} C${((session.selectedIndex ?? 0) % 9) + 1}` : "None"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Entry</h2>
              <Button
                type="button"
                size="sm"
                variant={session.notesMode ? "default" : "outline"}
                onClick={() =>
                  setSession((current) => ({
                    ...current,
                    notesMode: !current.notesMode,
                  }))
                }
              >
                Notes {session.notesMode ? "on" : "off"}
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {DIGIT_OPTIONS.map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  className="h-12 text-base"
                  onClick={() => applyDigit(digit)}
                >
                  {digit}
                </Button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                disabled={!selectedIsEditable}
                onClick={clearSelectedCell}
              >
                Clear cell
              </Button>
              <Button type="button" variant="outline" onClick={() => startNewGame()}>
                Regenerate
              </Button>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Keyboard: <span className="font-mono">1-9</span> to enter,{" "}
              <span className="font-mono">N</span> to toggle notes,{" "}
              <span className="font-mono">Backspace</span> to clear, arrow keys to
              move.
            </p>
          </Surface>
        </div>
      </div>
    </Page>
  )
}
