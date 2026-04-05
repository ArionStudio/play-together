import { analyzeSudokuDifficulty, type SudokuPuzzle } from "@workspace/sudoku-engine"

import { computeSudokuPuzzleHash, createSudokuCatalogSeed } from "@/lib/sudoku-seed-utils.ts"

type SaveExtremeSeedInput = {
  clueCount: number
  difficulty: SudokuPuzzle["difficulty"]
  givens: number[]
  puzzleHash: string
  seed: string
  solution: number[]
}

type SaveExtremeSeedResult = {
  recordId: string
  status: "duplicate" | "saved"
}

export type ExtremeSeedAttemptResult =
  | {
      kind: "duplicate"
      puzzleHash: string
      seed: string
    }
  | {
      actualDifficulty: SudokuPuzzle["difficulty"]
      kind: "invalid"
      puzzleHash: string
      seed: string
    }
  | {
      kind: "saved"
      puzzleHash: string
      recordId: string
      seed: string
    }

export async function runExtremeSeedCatalogAttempt(args: {
  existingPuzzleHashes: ReadonlySet<string>
  generatePuzzle: (seed: string) => Promise<SudokuPuzzle>
  saveCandidate: (input: SaveExtremeSeedInput) => Promise<SaveExtremeSeedResult>
}) {
  const seed = createSudokuCatalogSeed()
  const puzzle = await args.generatePuzzle(seed)
  const puzzleHash = await computeSudokuPuzzleHash({
    difficulty: puzzle.difficulty,
    givens: puzzle.givens,
  })
  const actualDifficulty = analyzeSudokuDifficulty(puzzle.givens).classifiedDifficulty

  if (actualDifficulty !== "haaard") {
    return {
      actualDifficulty,
      kind: "invalid" as const,
      puzzleHash,
      seed,
    }
  }

  if (args.existingPuzzleHashes.has(puzzleHash)) {
    return {
      kind: "duplicate" as const,
      puzzleHash,
      seed,
    }
  }

  const saveResult = await args.saveCandidate({
    clueCount: puzzle.clueCount,
    difficulty: puzzle.difficulty,
    givens: puzzle.givens,
    puzzleHash,
    seed,
    solution: puzzle.solution,
  })

  if (saveResult.status === "duplicate") {
    return {
      kind: "duplicate" as const,
      puzzleHash,
      seed,
    }
  }

  return {
    kind: "saved" as const,
    puzzleHash,
    recordId: saveResult.recordId,
    seed,
  }
}
