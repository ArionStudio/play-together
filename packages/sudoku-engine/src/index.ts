export const sudokuDifficulties = [
  "easy",
  "medium",
  "hard",
  "expert",
  "haaard",
] as const
export const sudokuDifficultyLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Master",
  haaard: "Extreme",
} as const
export const SUDOKU_CELL_COUNT = 81
export const SUDOKU_SIZE = 9

const BOX_SIZE = 3
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const difficultyTargetClueCounts = {
  easy: 40,
  medium: 34,
  hard: 30,
  expert: 27,
  haaard: 23,
} as const satisfies Record<SudokuDifficulty, number>
const difficultyCandidateClueCounts = {
  easy: [40, 39],
  medium: [34, 33],
  hard: [31, 30, 29],
  expert: [29, 28, 27, 26],
  haaard: [27, 26, 25, 24, 23],
} as const satisfies Record<SudokuDifficulty, readonly number[]>
const difficultyAttemptCounts = {
  easy: 8,
  medium: 12,
  hard: 20,
  expert: 60,
  haaard: 96,
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

type SudokuTechnique =
  | "none"
  | "naked_single"
  | "hidden_single"
  | "locked_candidates"
  | "naked_pair"
  | "hidden_pair"
  | "naked_triple"
  | "hidden_triple"
  | "skyscraper"
  | "two_string_kite"
  | "x_wing"
  | "xy_wing"
  | "swordfish"
  | "guess"

export interface SudokuDifficultyAnalysis {
  classifiedDifficulty: SudokuDifficulty
  maxTechnique: SudokuTechnique
  remainingEmpty: number
  score: number
  solvedByLogic: boolean
  steps: number
}

interface SudokuSolverState {
  candidates: SudokuDigit[][]
  values: number[]
}

type SudokuSolverStep =
  | {
      action: "set"
      digit: SudokuDigit
      index: number
      type: Exclude<SudokuTechnique, "none" | "guess">
    }
  | {
      action: "eliminate"
      removals: Array<{ digit: SudokuDigit; index: number }>
      type: Exclude<SudokuTechnique, "none" | "guess">
    }

const techniqueRank = {
  none: 0,
  naked_single: 1,
  hidden_single: 2,
  locked_candidates: 3,
  naked_pair: 4,
  hidden_pair: 5,
  naked_triple: 6,
  hidden_triple: 7,
  skyscraper: 8,
  two_string_kite: 9,
  x_wing: 10,
  xy_wing: 11,
  swordfish: 12,
  guess: 13,
} as const satisfies Record<SudokuTechnique, number>

const techniqueBaseScores = {
  none: 0,
  naked_single: 1,
  hidden_single: 2,
  locked_candidates: 4,
  naked_pair: 6,
  hidden_pair: 8,
  naked_triple: 10,
  hidden_triple: 12,
  skyscraper: 14,
  two_string_kite: 16,
  x_wing: 18,
  xy_wing: 22,
  swordfish: 26,
  guess: 12,
} as const satisfies Record<SudokuTechnique, number>

const difficultyRanks = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
  haaard: 4,
} as const satisfies Record<SudokuDifficulty, number>

const difficultyTargetTechniqueRanks = {
  easy: techniqueRank.hidden_single,
  medium: techniqueRank.locked_candidates,
  hard: techniqueRank.naked_pair,
  expert: techniqueRank.xy_wing,
  haaard: techniqueRank.swordfish,
} as const satisfies Record<SudokuDifficulty, number>

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

function getBoxIndex(index: number) {
  const row = Math.floor(index / SUDOKU_SIZE)
  const column = index % SUDOKU_SIZE
  return Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(column / BOX_SIZE)
}

function createSolverState(initialValues: readonly number[]): SudokuSolverState {
  const values = [...initialValues]
  const candidates = Array.from({ length: SUDOKU_CELL_COUNT }, (_, index) =>
    values[index] === 0 ? getCandidates(values, index) : []
  )

  return {
    candidates,
    values,
  }
}

function hasBrokenCandidates(state: SudokuSolverState) {
  return state.values.some(
    (value, index) => value === 0 && (state.candidates[index]?.length ?? 0) === 0
  )
}

function applySetValue(
  state: SudokuSolverState,
  index: number,
  digit: SudokuDigit
) {
  if (state.values[index] !== 0) {
    return false
  }

  state.values[index] = digit
  state.candidates[index] = []

  for (const peer of peerIndices[index]!) {
    if (state.values[peer] !== 0) {
      continue
    }

    state.candidates[peer] = state.candidates[peer]!.filter(
      (candidate) => candidate !== digit
    )
  }

  return true
}

function applyEliminations(
  state: SudokuSolverState,
  removals: Array<{ digit: SudokuDigit; index: number }>
) {
  let changed = false

  for (const { digit, index } of removals) {
    if (state.values[index] !== 0) {
      continue
    }

    const next = state.candidates[index]!.filter((candidate) => candidate !== digit)

    if (next.length === state.candidates[index]!.length) {
      continue
    }

    state.candidates[index] = next
    changed = true
  }

  return changed
}

function findNakedSingleStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (let index = 0; index < SUDOKU_CELL_COUNT; index += 1) {
    if (state.values[index] !== 0 || state.candidates[index]!.length !== 1) {
      continue
    }

    return {
      action: "set",
      digit: state.candidates[index]![0]!,
      index,
      type: "naked_single",
    }
  }

  return null
}

function findHiddenSingleStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const unit of allUnits) {
    for (const digit of DIGITS) {
      const matches = unit.filter(
        (index) =>
          state.values[index] === 0 && state.candidates[index]!.includes(digit)
      )

      if (matches.length !== 1) {
        continue
      }

      return {
        action: "set",
        digit,
        index: matches[0]!,
        type: "hidden_single",
      }
    }
  }

  return null
}

function findLockedCandidatesStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const box of boxUnits) {
    for (const digit of DIGITS) {
      const matches = box.filter(
        (index) =>
          state.values[index] === 0 && state.candidates[index]!.includes(digit)
      )

      if (matches.length < 2) {
        continue
      }

      const rows = [...new Set(matches.map((index) => Math.floor(index / SUDOKU_SIZE)))]
      if (rows.length === 1) {
        const row = rows[0]!
        const removals = rowUnits[row]!
          .filter((index) => !box.includes(index))
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "locked_candidates",
          }
        }
      }

      const columns = [...new Set(matches.map((index) => index % SUDOKU_SIZE))]
      if (columns.length === 1) {
        const column = columns[0]!
        const removals = columnUnits[column]!
          .filter((index) => !box.includes(index))
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "locked_candidates",
          }
        }
      }
    }
  }

  for (const unit of [...rowUnits, ...columnUnits]) {
    for (const digit of DIGITS) {
      const matches = unit.filter(
        (index) =>
          state.values[index] === 0 && state.candidates[index]!.includes(digit)
      )

      if (matches.length < 2) {
        continue
      }

      const boxes = [...new Set(matches.map((index) => getBoxIndex(index)))]

      if (boxes.length !== 1) {
        continue
      }

      const box = boxes[0]!
      const removals = boxUnits[box]!
        .filter((index) => !unit.includes(index))
        .filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digit)
        )
        .map((index) => ({ digit, index }))

      if (removals.length > 0) {
        return {
          action: "eliminate",
          removals,
          type: "locked_candidates",
        }
      }
    }
  }

  return null
}

function findNakedPairStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const unit of allUnits) {
    const pairMap = new Map<string, number[]>()

    for (const index of unit) {
      if (state.values[index] !== 0 || state.candidates[index]!.length !== 2) {
        continue
      }

      const key = state.candidates[index]!.join(",")
      pairMap.set(key, [...(pairMap.get(key) ?? []), index])
    }

    for (const [key, indices] of pairMap.entries()) {
      if (indices.length !== 2) {
        continue
      }

      const digits = key.split(",").map((value) => Number(value) as SudokuDigit)
      const removals = unit
        .filter((index) => !indices.includes(index) && state.values[index] === 0)
        .flatMap((index) =>
          digits
            .filter((digit) => state.candidates[index]!.includes(digit))
            .map((digit) => ({ digit, index }))
        )

      if (removals.length > 0) {
        return {
          action: "eliminate",
          removals,
          type: "naked_pair",
        }
      }
    }
  }

  return null
}

function findHiddenPairStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const unit of allUnits) {
    for (let left = 0; left < DIGITS.length; left += 1) {
      const digitA = DIGITS[left]!

      for (let right = left + 1; right < DIGITS.length; right += 1) {
        const digitB = DIGITS[right]!
        const cellsA = unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digitA)
        )
        const cellsB = unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digitB)
        )

        if (cellsA.length < 2 || cellsB.length < 2) {
          continue
        }

        const pairCells = [...new Set([...cellsA, ...cellsB])]

        if (pairCells.length !== 2) {
          continue
        }

        const removals = pairCells.flatMap((index) =>
          state.candidates[index]!
            .filter((digit) => digit !== digitA && digit !== digitB)
            .map((digit) => ({ digit, index }))
        )

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "hidden_pair",
          }
        }
      }
    }
  }

  return null
}

function findNakedTripleStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const unit of allUnits) {
    const tripleCandidates = unit.filter((index) => {
      const length = state.candidates[index]!.length
      return state.values[index] === 0 && length >= 2 && length <= 3
    })

    for (let first = 0; first < tripleCandidates.length; first += 1) {
      for (let second = first + 1; second < tripleCandidates.length; second += 1) {
        for (let third = second + 1; third < tripleCandidates.length; third += 1) {
          const indices = [
            tripleCandidates[first]!,
            tripleCandidates[second]!,
            tripleCandidates[third]!,
          ]
          const digits = [...new Set(indices.flatMap((index) => state.candidates[index]!))]

          if (digits.length !== 3) {
            continue
          }

          const removals = unit
            .filter((index) => !indices.includes(index) && state.values[index] === 0)
            .flatMap((index) =>
              digits
                .filter((digit) => state.candidates[index]!.includes(digit))
                .map((digit) => ({ digit, index }))
            )

          if (removals.length > 0) {
            return {
              action: "eliminate",
              removals,
              type: "naked_triple",
            }
          }
        }
      }
    }
  }

  return null
}

function findHiddenTripleStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const unit of allUnits) {
    for (let first = 0; first < DIGITS.length; first += 1) {
      const digitA = DIGITS[first]!

      for (let second = first + 1; second < DIGITS.length; second += 1) {
        const digitB = DIGITS[second]!

        for (let third = second + 1; third < DIGITS.length; third += 1) {
          const digitC = DIGITS[third]!
          const tripleCells = [
            ...new Set(
              unit.filter(
                (index) =>
                  state.values[index] === 0 &&
                  (state.candidates[index]!.includes(digitA) ||
                    state.candidates[index]!.includes(digitB) ||
                    state.candidates[index]!.includes(digitC))
              )
            ),
          ]

          if (
            tripleCells.length !== 3 ||
            !tripleCells.some((index) => state.candidates[index]!.includes(digitA)) ||
            !tripleCells.some((index) => state.candidates[index]!.includes(digitB)) ||
            !tripleCells.some((index) => state.candidates[index]!.includes(digitC))
          ) {
            continue
          }

          const removals = tripleCells.flatMap((index) =>
            state.candidates[index]!
              .filter(
                (digit) => digit !== digitA && digit !== digitB && digit !== digitC
              )
              .map((digit) => ({ digit, index }))
          )

          if (removals.length > 0) {
            return {
              action: "eliminate",
              removals,
              type: "hidden_triple",
            }
          }
        }
      }
    }
  }

  return null
}

function getCommonPeerIndices(left: number, right: number) {
  const rightPeers = new Set(peerIndices[right]!)

  return peerIndices[left]!.filter((index) => rightPeers.has(index))
}

function findSkyscraperStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const digit of DIGITS) {
    const rowPairs = rowUnits
      .map((unit, row) => ({
        line: row,
        matches: unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digit)
        ),
      }))
      .filter((entry) => entry.matches.length === 2)

    for (let first = 0; first < rowPairs.length; first += 1) {
      for (let second = first + 1; second < rowPairs.length; second += 1) {
        const top = rowPairs[first]!
        const bottom = rowPairs[second]!
        const sharedColumns = top.matches
          .map((index) => index % SUDOKU_SIZE)
          .filter((column) =>
            bottom.matches.some((index) => index % SUDOKU_SIZE === column)
          )

        if (sharedColumns.length !== 1) {
          continue
        }

        const sharedColumn = sharedColumns[0]!
        const roofA = top.matches.find((index) => index % SUDOKU_SIZE !== sharedColumn)
        const roofB = bottom.matches.find(
          (index) => index % SUDOKU_SIZE !== sharedColumn
        )

        if (
          roofA === undefined ||
          roofB === undefined ||
          roofA % SUDOKU_SIZE === roofB % SUDOKU_SIZE
        ) {
          continue
        }

        const removals = getCommonPeerIndices(roofA, roofB)
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "skyscraper",
          }
        }
      }
    }

    const columnPairs = columnUnits
      .map((unit, column) => ({
        line: column,
        matches: unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digit)
        ),
      }))
      .filter((entry) => entry.matches.length === 2)

    for (let first = 0; first < columnPairs.length; first += 1) {
      for (let second = first + 1; second < columnPairs.length; second += 1) {
        const left = columnPairs[first]!
        const right = columnPairs[second]!
        const sharedRows = left.matches
          .map((index) => Math.floor(index / SUDOKU_SIZE))
          .filter((row) =>
            right.matches.some((index) => Math.floor(index / SUDOKU_SIZE) === row)
          )

        if (sharedRows.length !== 1) {
          continue
        }

        const sharedRow = sharedRows[0]!
        const roofA = left.matches.find(
          (index) => Math.floor(index / SUDOKU_SIZE) !== sharedRow
        )
        const roofB = right.matches.find(
          (index) => Math.floor(index / SUDOKU_SIZE) !== sharedRow
        )

        if (
          roofA === undefined ||
          roofB === undefined ||
          Math.floor(roofA / SUDOKU_SIZE) === Math.floor(roofB / SUDOKU_SIZE)
        ) {
          continue
        }

        const removals = getCommonPeerIndices(roofA, roofB)
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "skyscraper",
          }
        }
      }
    }
  }

  return null
}

function findTwoStringKiteStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const digit of DIGITS) {
    const rowPairs = rowUnits
      .map((unit, row) => ({
        line: row,
        matches: unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digit)
        ),
      }))
      .filter((entry) => entry.matches.length === 2)
    const columnPairs = columnUnits
      .map((unit, column) => ({
        line: column,
        matches: unit.filter(
          (index) =>
            state.values[index] === 0 && state.candidates[index]!.includes(digit)
        ),
      }))
      .filter((entry) => entry.matches.length === 2)

    for (const rowPair of rowPairs) {
      for (const columnPair of columnPairs) {
        for (const rowMatch of rowPair.matches) {
          for (const columnMatch of columnPair.matches) {
            if (getBoxIndex(rowMatch) !== getBoxIndex(columnMatch)) {
              continue
            }

            const rowEndpoint = rowPair.matches.find((index) => index !== rowMatch)
            const columnEndpoint = columnPair.matches.find(
              (index) => index !== columnMatch
            )

            if (
              rowEndpoint === undefined ||
              columnEndpoint === undefined ||
              rowEndpoint === columnEndpoint
            ) {
              continue
            }

            const removals = getCommonPeerIndices(rowEndpoint, columnEndpoint)
              .filter(
                (index) =>
                  index !== rowMatch &&
                  index !== columnMatch &&
                  state.values[index] === 0 &&
                  state.candidates[index]!.includes(digit)
              )
              .map((index) => ({ digit, index }))

            if (removals.length > 0) {
              return {
                action: "eliminate",
                removals,
                type: "two_string_kite",
              }
            }
          }
        }
      }
    }
  }

  return null
}

function findXWingStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const digit of DIGITS) {
    const rowPairs = new Map<string, number[]>()

    for (let row = 0; row < SUDOKU_SIZE; row += 1) {
      const matches = rowUnits[row]!.filter(
        (index) =>
          state.values[index] === 0 && state.candidates[index]!.includes(digit)
      )

      if (matches.length !== 2) {
        continue
      }

      const columns = matches
        .map((index) => index % SUDOKU_SIZE)
        .sort((left, right) => left - right)
      const key = columns.join(",")
      rowPairs.set(key, [...(rowPairs.get(key) ?? []), row])
    }

    for (const [key, rows] of rowPairs.entries()) {
      if (rows.length !== 2) {
        continue
      }

      const columns = key.split(",").map(Number)
      const rowSet = new Set(rows)
      const removals = columns.flatMap((column) =>
        columnUnits[column]!
          .filter(
            (index) =>
              !rowSet.has(Math.floor(index / SUDOKU_SIZE)) &&
              state.values[index] === 0 &&
              state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))
      )

      if (removals.length > 0) {
        return {
          action: "eliminate",
          removals,
          type: "x_wing",
        }
      }
    }

    const columnPairs = new Map<string, number[]>()

    for (let column = 0; column < SUDOKU_SIZE; column += 1) {
      const matches = columnUnits[column]!.filter(
        (index) =>
          state.values[index] === 0 && state.candidates[index]!.includes(digit)
      )

      if (matches.length !== 2) {
        continue
      }

      const rows = matches
        .map((index) => Math.floor(index / SUDOKU_SIZE))
        .sort((left, right) => left - right)
      const key = rows.join(",")
      columnPairs.set(key, [...(columnPairs.get(key) ?? []), column])
    }

    for (const [key, columns] of columnPairs.entries()) {
      if (columns.length !== 2) {
        continue
      }

      const rows = key.split(",").map(Number)
      const columnSet = new Set(columns)
      const removals = rows.flatMap((row) =>
        rowUnits[row]!
          .filter(
            (index) =>
              !columnSet.has(index % SUDOKU_SIZE) &&
              state.values[index] === 0 &&
              state.candidates[index]!.includes(digit)
          )
          .map((index) => ({ digit, index }))
      )

      if (removals.length > 0) {
        return {
          action: "eliminate",
          removals,
          type: "x_wing",
        }
      }
    }
  }

  return null
}

function findXYWingStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (let pivot = 0; pivot < SUDOKU_CELL_COUNT; pivot += 1) {
    if (state.values[pivot] !== 0 || state.candidates[pivot]!.length !== 2) {
      continue
    }

    const [digitX, digitY] = state.candidates[pivot]!
    const bivaluePeers = peerIndices[pivot]!.filter(
      (index) => state.values[index] === 0 && state.candidates[index]!.length === 2
    )

    for (const firstPincer of bivaluePeers) {
      const firstCandidates = state.candidates[firstPincer]!

      if (
        !firstCandidates.includes(digitX) ||
        firstCandidates.includes(digitY)
      ) {
        continue
      }

      const digitZ = firstCandidates.find((digit) => digit !== digitX)

      if (!digitZ || digitZ === digitY) {
        continue
      }

      for (const secondPincer of bivaluePeers) {
        if (secondPincer === firstPincer) {
          continue
        }

        const secondCandidates = state.candidates[secondPincer]!

        if (
          !secondCandidates.includes(digitY) ||
          secondCandidates.includes(digitX) ||
          !secondCandidates.includes(digitZ)
        ) {
          continue
        }

        const removals = getCommonPeerIndices(firstPincer, secondPincer)
          .filter(
            (index) =>
              index !== pivot &&
              index !== firstPincer &&
              index !== secondPincer &&
              state.values[index] === 0 &&
              state.candidates[index]!.includes(digitZ)
          )
          .map((index) => ({ digit: digitZ, index }))

        if (removals.length > 0) {
          return {
            action: "eliminate",
            removals,
            type: "xy_wing",
          }
        }
      }
    }
  }

  return null
}

function findSwordfishStep(state: SudokuSolverState): SudokuSolverStep | null {
  for (const digit of DIGITS) {
    const rowCandidates = rowUnits
      .map((unit, row) => ({
        line: row,
        matches: unit
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => index % SUDOKU_SIZE),
      }))
      .filter(
        (entry) => entry.matches.length >= 2 && entry.matches.length <= 3
      )

    for (let first = 0; first < rowCandidates.length; first += 1) {
      for (let second = first + 1; second < rowCandidates.length; second += 1) {
        for (let third = second + 1; third < rowCandidates.length; third += 1) {
          const lines = [
            rowCandidates[first]!,
            rowCandidates[second]!,
            rowCandidates[third]!,
          ]
          const columns = [...new Set(lines.flatMap((line) => line.matches))].sort(
            (left, right) => left - right
          )

          if (columns.length !== 3) {
            continue
          }

          const rowSet = new Set(lines.map((line) => line.line))
          const removals = columns.flatMap((column) =>
            columnUnits[column]!
              .filter(
                (index) =>
                  !rowSet.has(Math.floor(index / SUDOKU_SIZE)) &&
                  state.values[index] === 0 &&
                  state.candidates[index]!.includes(digit)
              )
              .map((index) => ({ digit, index }))
          )

          if (removals.length > 0) {
            return {
              action: "eliminate",
              removals,
              type: "swordfish",
            }
          }
        }
      }
    }

    const columnCandidates = columnUnits
      .map((unit, column) => ({
        line: column,
        matches: unit
          .filter(
            (index) =>
              state.values[index] === 0 && state.candidates[index]!.includes(digit)
          )
          .map((index) => Math.floor(index / SUDOKU_SIZE)),
      }))
      .filter(
        (entry) => entry.matches.length >= 2 && entry.matches.length <= 3
      )

    for (let first = 0; first < columnCandidates.length; first += 1) {
      for (let second = first + 1; second < columnCandidates.length; second += 1) {
        for (let third = second + 1; third < columnCandidates.length; third += 1) {
          const lines = [
            columnCandidates[first]!,
            columnCandidates[second]!,
            columnCandidates[third]!,
          ]
          const rows = [...new Set(lines.flatMap((line) => line.matches))].sort(
            (left, right) => left - right
          )

          if (rows.length !== 3) {
            continue
          }

          const columnSet = new Set(lines.map((line) => line.line))
          const removals = rows.flatMap((row) =>
            rowUnits[row]!
              .filter(
                (index) =>
                  !columnSet.has(index % SUDOKU_SIZE) &&
                  state.values[index] === 0 &&
                  state.candidates[index]!.includes(digit)
              )
              .map((index) => ({ digit, index }))
          )

          if (removals.length > 0) {
            return {
              action: "eliminate",
              removals,
              type: "swordfish",
            }
          }
        }
      }
    }
  }

  return null
}

function applySolverStep(state: SudokuSolverState, step: SudokuSolverStep) {
  return step.action === "set"
    ? applySetValue(state, step.index, step.digit)
    : applyEliminations(state, step.removals)
}

function classifySudokuDifficulty(args: {
  clueCount: number
  maxTechnique: SudokuTechnique
  score: number
  solvedByLogic: boolean
}) {
  if (!args.solvedByLogic) {
    return args.clueCount <= 24 ? "haaard" : "expert"
  }

  if (
    args.maxTechnique === "none" ||
    args.maxTechnique === "naked_single" ||
    args.maxTechnique === "hidden_single"
  ) {
    return args.clueCount >= 36 && args.score <= 90 ? "easy" : "medium"
  }

  if (args.maxTechnique === "locked_candidates") {
    return args.clueCount <= 31 || args.score >= 115 ? "hard" : "medium"
  }

  if (
    args.maxTechnique === "naked_pair" ||
    args.maxTechnique === "hidden_pair" ||
    args.maxTechnique === "naked_triple" ||
    args.maxTechnique === "hidden_triple"
  ) {
    return "hard"
  }

  if (
    args.maxTechnique === "skyscraper" ||
    args.maxTechnique === "two_string_kite" ||
    args.maxTechnique === "x_wing" ||
    args.maxTechnique === "xy_wing"
  ) {
    return "expert"
  }

  if (args.maxTechnique === "swordfish") {
    return "haaard"
  }

  return "haaard"
}

export function analyzeSudokuDifficulty(valuesLike: ArrayLike<number>): SudokuDifficultyAnalysis {
  const values = Array.from(
    { length: SUDOKU_CELL_COUNT },
    (_, index) => Number(valuesLike[index] ?? 0)
  )
  const state = createSolverState(values)
  let maxTechnique: SudokuTechnique = "none"
  let score = 0
  let steps = 0

  while (true) {
    if (state.values.every((value) => value !== 0)) {
      break
    }

    if (hasBrokenCandidates(state)) {
      break
    }

    const step =
      findNakedSingleStep(state) ??
      findHiddenSingleStep(state) ??
      findLockedCandidatesStep(state) ??
      findNakedPairStep(state) ??
      findHiddenPairStep(state) ??
      findNakedTripleStep(state) ??
      findHiddenTripleStep(state) ??
      findSkyscraperStep(state) ??
      findTwoStringKiteStep(state) ??
      findXWingStep(state) ??
      findXYWingStep(state) ??
      findSwordfishStep(state)

    if (!step) {
      break
    }

    applySolverStep(state, step)
    steps += 1
    score +=
      techniqueBaseScores[step.type] +
      (step.action === "eliminate" ? Math.max(0, step.removals.length - 1) : 0)

    if (techniqueRank[step.type] > techniqueRank[maxTechnique]) {
      maxTechnique = step.type
    }
  }

  const remainingEmpty = state.values.filter((value) => value === 0).length
  const solvedByLogic = remainingEmpty === 0
  const classifiedDifficulty = classifySudokuDifficulty({
    clueCount: values.filter((value) => value !== 0).length,
    maxTechnique: solvedByLogic ? maxTechnique : "guess",
    score,
    solvedByLogic,
  })

  return {
    classifiedDifficulty,
    maxTechnique: solvedByLogic ? maxTechnique : "guess",
    remainingEmpty,
    score,
    solvedByLogic,
    steps,
  }
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
  const candidateClueCounts = difficultyCandidateClueCounts[difficulty]
  const attemptCount = difficultyAttemptCounts[difficulty]
  const maxAttemptCount =
    difficulty === "haaard"
      ? 240
      : difficulty === "expert"
        ? 96
        : attemptCount
  let best:
    | {
        classifiedDifficulty: SudokuDifficulty
        clueCount: number
        givens: number[]
        maxTechnique: SudokuTechnique
        score: number
        solvedByLogic: boolean
        solution: number[]
      }
    | null = null

  for (let attempt = 0; attempt < maxAttemptCount; attempt += 1) {
    const attemptSeed = `${seed}:${difficulty}:attempt:${attempt}`
    const solution = buildSolvedBoard(attemptSeed)
    const random = createRandom(`${attemptSeed}:puzzle`)
    const candidate = carvePuzzle(
      solution,
      random,
      candidateClueCounts[attempt % candidateClueCounts.length]!
    )
    const analysis = analyzeSudokuDifficulty(candidate.givens)
    const candidateDistance = Math.abs(
      difficultyRanks[analysis.classifiedDifficulty] - difficultyRanks[difficulty]
    )
    const bestDistance =
      best === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(difficultyRanks[best.classifiedDifficulty] - difficultyRanks[difficulty])
    const candidateTechniqueDistance = Math.abs(
      (analysis.solvedByLogic
        ? techniqueRank[analysis.maxTechnique]
        : techniqueRank.guess) - difficultyTargetTechniqueRanks[difficulty]
    )
    const bestTechniqueDistance =
      best === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(
            (best.solvedByLogic
              ? techniqueRank[best.maxTechnique]
              : techniqueRank.guess) - difficultyTargetTechniqueRanks[difficulty]
          )

    if (
      !best ||
      candidateDistance < bestDistance ||
      (candidateDistance === bestDistance &&
        Number(analysis.solvedByLogic) > Number(best.solvedByLogic)) ||
      (candidateDistance === bestDistance &&
        analysis.solvedByLogic === best.solvedByLogic &&
        candidateTechniqueDistance < bestTechniqueDistance) ||
      (candidateDistance === bestDistance &&
        analysis.solvedByLogic === best.solvedByLogic &&
        candidateTechniqueDistance === bestTechniqueDistance &&
        Math.abs(candidate.clueCount - targetClueCount) <
          Math.abs(best.clueCount - targetClueCount)) ||
      (candidateDistance === bestDistance &&
        analysis.solvedByLogic === best.solvedByLogic &&
        candidateTechniqueDistance === bestTechniqueDistance &&
        Math.abs(candidate.clueCount - targetClueCount) ===
          Math.abs(best.clueCount - targetClueCount) &&
        analysis.score > best.score)
    ) {
      best = {
        classifiedDifficulty: analysis.classifiedDifficulty,
        clueCount: candidate.clueCount,
        givens: candidate.givens,
        maxTechnique: analysis.maxTechnique,
        score: analysis.score,
        solvedByLogic: analysis.solvedByLogic,
        solution,
      }
    }

    if (
      analysis.classifiedDifficulty === difficulty &&
      analysis.solvedByLogic &&
      candidate.clueCount === targetClueCount
    ) {
      break
    }

    if (
      attempt + 1 >= attemptCount &&
      best?.solvedByLogic
    ) {
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
