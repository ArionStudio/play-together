export const sudokuDifficulties = [
  "easy",
  "medium",
  "hard",
  "expert",
  "haaard",
] as const
export const SUDOKU_CELL_COUNT = 81
export const SUDOKU_SIZE = 9

const BOX_SIZE = 3
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const difficultyTargetClueCounts = {
  easy: 40,
  medium: 34,
  hard: 30,
  expert: 26,
  haaard: 20,
} as const satisfies Record<SudokuDifficulty, number>
const difficultyAttemptCounts = {
  easy: 2,
  medium: 3,
  hard: 4,
  expert: 6,
  haaard: 8,
} as const satisfies Record<SudokuDifficulty, number>

const rowUnits = Array.from({ length: SUDOKU_SIZE }, (_, row) =>
  Array.from(
    { length: SUDOKU_SIZE },
    (_, column) => row * SUDOKU_SIZE + column
  )
)
const columnUnits = Array.from({ length: SUDOKU_SIZE }, (_, column) =>
  Array.from({ length: SUDOKU_SIZE }, (_, row) => row * SUDOKU_SIZE + column)
)
const boxUnits = Array.from({ length: SUDOKU_SIZE }, (_, box) => {
  const startRow = Math.floor(box / BOX_SIZE) * BOX_SIZE
  const startColumn = (box % BOX_SIZE) * BOX_SIZE

  return Array.from({ length: SUDOKU_CELL_COUNT }, (_, offset) => offset)
    .filter((offset) => offset < BOX_SIZE * BOX_SIZE)
    .map((offset) => {
      const row = startRow + Math.floor(offset / BOX_SIZE)
      const column = startColumn + (offset % BOX_SIZE)
      return row * SUDOKU_SIZE + column
    })
})
const allUnits = [...rowUnits, ...columnUnits, ...boxUnits]
const peerIndices = Array.from({ length: SUDOKU_CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / SUDOKU_SIZE)
  const column = index % SUDOKU_SIZE
  const box =
    Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(column / BOX_SIZE)
  const peers = new Set<number>([
    ...rowUnits[row]!,
    ...columnUnits[column]!,
    ...boxUnits[box]!,
  ])

  peers.delete(index)

  return [...peers].sort((left, right) => left - right)
})

export type SudokuDifficulty = (typeof sudokuDifficulties)[number]
export type SudokuDigit = (typeof DIGITS)[number]

export interface SudokuPuzzle {
  difficulty: SudokuDifficulty
  seed: string
  givens: number[]
  solution: number[]
  clueCount: number
}

export interface SudokuCellState {
  value: number
  fixed: boolean
  notes: SudokuDigit[]
}

export interface SudokuGameState {
  puzzle: SudokuPuzzle
  cells: SudokuCellState[]
}

interface BestEmptyCell {
  index: number
  candidates: SudokuDigit[]
}

function hashSeed(seed: string) {
  let value = 1779033703 ^ seed.length

  for (let index = 0; index < seed.length; index += 1) {
    value = Math.imul(value ^ seed.charCodeAt(index), 3432918353)
    value = (value << 13) | (value >>> 19)
  }

  return () => {
    value = Math.imul(value ^ (value >>> 16), 2246822507)
    value = Math.imul(value ^ (value >>> 13), 3266489909)
    value ^= value >>> 16
    return value >>> 0
  }
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function createRandom(seed: string) {
  return mulberry32(hashSeed(seed)())
}

function shuffle<T>(values: readonly T[], random: () => number) {
  const next = [...values]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]!
    next[swapIndex] = current!
  }

  return next
}

function isValidIndex(index: number) {
  return Number.isInteger(index) && index >= 0 && index < SUDOKU_CELL_COUNT
}

function isSudokuDigit(value: number): value is SudokuDigit {
  return DIGITS.includes(value as SudokuDigit)
}

function buildSolvedBoard(seed: string): number[] {
  const random = createRandom(`${seed}:solution`)
  const groups = [0, 1, 2] as const
  const bands = shuffle(groups, random)
  const stacks = shuffle(groups, random)
  const rows = bands.flatMap((band) =>
    shuffle(groups, random).map((row) => band * BOX_SIZE + row)
  )
  const columns = stacks.flatMap((stack) =>
    shuffle(groups, random).map((column) => stack * BOX_SIZE + column)
  )
  const digits = shuffle(DIGITS, random)

  return rows.flatMap((row) =>
    columns.map((column) => {
      const pattern =
        (BOX_SIZE * (row % BOX_SIZE) + Math.floor(row / BOX_SIZE) + column) %
        SUDOKU_SIZE

      return digits[pattern]!
    })
  )
}

function getCandidates(values: readonly number[], index: number) {
  if (!isValidIndex(index) || values[index] !== 0) {
    return []
  }

  const blocked = new Set<number>()

  for (const peer of peerIndices[index]!) {
    const value = values[peer] ?? 0

    if (value > 0) {
      blocked.add(value)
    }
  }

  return DIGITS.filter((digit) => !blocked.has(digit))
}

function findBestEmptyCell(values: readonly number[]): BestEmptyCell | null {
  let best: BestEmptyCell | null = null

  for (let index = 0; index < SUDOKU_CELL_COUNT; index += 1) {
    if (values[index] !== 0) {
      continue
    }

    const candidates = getCandidates(values, index)

    if (candidates.length === 0) {
      return { index, candidates: [] }
    }

    if (!best || candidates.length < best.candidates.length) {
      best = { index, candidates }
    }

    if (best.candidates.length === 1) {
      return best
    }
  }

  return best
}

function countSolutionsRecursive(values: number[], limit: number): number {
  if (limit <= 0) {
    return 0
  }

  const next = findBestEmptyCell(values)

  if (!next) {
    return 1
  }

  if (next.candidates.length === 0) {
    return 0
  }

  let total = 0

  for (const candidate of next.candidates) {
    values[next.index] = candidate
    total += countSolutionsRecursive(values, limit - total)

    if (total >= limit) {
      break
    }
  }

  values[next.index] = 0

  return total
}

function updateCell(
  gameState: SudokuGameState,
  index: number,
  updater: (cell: SudokuCellState) => SudokuCellState
) {
  if (!isValidIndex(index)) {
    return gameState
  }

  const currentCell = gameState.cells[index]

  if (!currentCell || currentCell.fixed) {
    return gameState
  }

  const nextCell = updater(currentCell)

  if (
    nextCell.value === currentCell.value &&
    nextCell.notes.length === currentCell.notes.length &&
    nextCell.notes.every((note, noteIndex) => note === currentCell.notes[noteIndex])
  ) {
    return gameState
  }

  return {
    ...gameState,
    cells: gameState.cells.map((cell, cellIndex) =>
      cellIndex === index ? nextCell : cell
    ),
  }
}

export function countSudokuSolutions(values: readonly number[], limit = 2) {
  return countSolutionsRecursive([...values], limit)
}

function carvePuzzle(
  solution: readonly number[],
  random: () => number,
  targetClueCount: number
) {
  const givens: number[] = [...solution]
  let clueCount = SUDOKU_CELL_COUNT

  for (const index of shuffle(
    Array.from({ length: Math.ceil(SUDOKU_CELL_COUNT / 2) }, (_, offset) => offset),
    random
  )) {
    if (clueCount <= targetClueCount) {
      break
    }

    const mirrorIndex = SUDOKU_CELL_COUNT - 1 - index
    const removalCount = mirrorIndex === index ? 1 : 2

    if (clueCount - removalCount < targetClueCount) {
      continue
    }

    const next = [...givens]
    next[index] = 0
    next[mirrorIndex] = 0

    if (countSudokuSolutions(next, 2) === 1) {
      givens[index] = 0
      givens[mirrorIndex] = 0
      clueCount -= removalCount
    }
  }

  for (const index of shuffle(
    Array.from({ length: SUDOKU_CELL_COUNT }, (_, offset) => offset),
    random
  )) {
    if (clueCount <= targetClueCount || givens[index] === 0) {
      continue
    }

    const next = [...givens]
    next[index] = 0

    if (countSudokuSolutions(next, 2) === 1) {
      givens[index] = 0
      clueCount -= 1
    }
  }

  return {
    givens,
    clueCount,
  }
}

export function createSudokuPuzzle(
  difficulty: SudokuDifficulty,
  seed: string
): SudokuPuzzle {
  const targetClueCount = difficultyTargetClueCounts[difficulty]
  const attemptCount = difficultyAttemptCounts[difficulty]
  let best:
    | {
        clueCount: number
        givens: number[]
        solution: number[]
      }
    | null = null

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const attemptSeed = `${seed}:${difficulty}:attempt:${attempt}`
    const solution = buildSolvedBoard(attemptSeed)
    const random = createRandom(`${attemptSeed}:puzzle`)
    const candidate = carvePuzzle(solution, random, targetClueCount)

    if (
      !best ||
      Math.abs(candidate.clueCount - targetClueCount) <
        Math.abs(best.clueCount - targetClueCount) ||
      (Math.abs(candidate.clueCount - targetClueCount) ===
        Math.abs(best.clueCount - targetClueCount) &&
        candidate.clueCount < best.clueCount)
    ) {
      best = {
        clueCount: candidate.clueCount,
        givens: candidate.givens,
        solution,
      }
    }

    if (candidate.clueCount === targetClueCount) {
      break
    }
  }

  return {
    difficulty,
    seed,
    givens: best!.givens,
    solution: best!.solution,
    clueCount: best!.clueCount,
  }
}

export function createSudokuGame(puzzle: SudokuPuzzle): SudokuGameState {
  return {
    puzzle,
    cells: puzzle.givens.map((value) => ({
      value,
      fixed: value !== 0,
      notes: [],
    })),
  }
}

export function setCellValue(
  gameState: SudokuGameState,
  index: number,
  value: number
) {
  if (value === 0) {
    return clearCellValue(gameState, index)
  }

  if (!isSudokuDigit(value)) {
    return gameState
  }

  return updateCell(gameState, index, (cell) => ({
    ...cell,
    value,
    notes: [],
  }))
}

export function clearCellValue(gameState: SudokuGameState, index: number) {
  return updateCell(gameState, index, (cell) => ({
    ...cell,
    value: 0,
    notes: [],
  }))
}

export function toggleCellNote(
  gameState: SudokuGameState,
  index: number,
  value: number
) {
  if (!isSudokuDigit(value)) {
    return gameState
  }

  return updateCell(gameState, index, (cell) => {
    if (cell.value !== 0) {
      return cell
    }

    const notes = cell.notes.includes(value)
      ? cell.notes.filter((note) => note !== value)
      : [...cell.notes, value].sort((left, right) => left - right)

    return {
      ...cell,
      notes,
    }
  })
}

export function getRelatedIndices(index: number) {
  if (!isValidIndex(index)) {
    return []
  }

  return peerIndices[index]!
}

export function getConflictingIndices(valuesLike: ArrayLike<number>) {
  const values = Array.from(
    { length: SUDOKU_CELL_COUNT },
    (_, index) => Number(valuesLike[index] ?? 0)
  )
  const conflicts = new Set<number>()

  for (const unit of allUnits) {
    const byValue = new Map<number, number[]>()

    for (const index of unit) {
      const value = values[index] ?? 0

      if (value <= 0) {
        continue
      }

      byValue.set(value, [...(byValue.get(value) ?? []), index])
    }

    for (const duplicateIndices of byValue.values()) {
      if (duplicateIndices.length < 2) {
        continue
      }

      for (const index of duplicateIndices) {
        conflicts.add(index)
      }
    }
  }

  return [...conflicts].sort((left, right) => left - right)
}

export function getIncorrectIndices(gameState: SudokuGameState) {
  return gameState.cells
    .map((cell, index) =>
      !cell.fixed && cell.value !== 0 && cell.value !== gameState.puzzle.solution[index]
        ? index
        : -1
    )
    .filter((index) => index >= 0)
}

export function getProgress(gameState: SudokuGameState) {
  const filledCells = gameState.cells.filter((cell) => cell.value !== 0).length

  return {
    clueCount: gameState.puzzle.clueCount,
    emptyCells: SUDOKU_CELL_COUNT - filledCells,
    filledCells,
  }
}

export function isSudokuSolved(gameState: SudokuGameState) {
  return (
    gameState.cells.every(
      (cell, index) => cell.value === gameState.puzzle.solution[index]
    ) && getConflictingIndices(gameState.cells.map((cell) => cell.value)).length === 0
  )
}
