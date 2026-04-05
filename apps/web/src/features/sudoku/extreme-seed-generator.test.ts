import { beforeEach, describe, expect, it, vi } from "vitest"

import { runExtremeSeedCatalogAttempt } from "@/features/sudoku/extreme-seed-generator.ts"

const { createSudokuCatalogSeed, computeSudokuPuzzleHash } = vi.hoisted(() => ({
  computeSudokuPuzzleHash: vi.fn(),
  createSudokuCatalogSeed: vi.fn(),
}))

vi.mock("@workspace/sudoku-engine", async () => {
  const actual = await vi.importActual<typeof import("@workspace/sudoku-engine")>(
    "@workspace/sudoku-engine"
  )

  return {
    ...actual,
    analyzeSudokuDifficulty: () => ({
      classifiedDifficulty: "haaard",
    }),
  }
})

vi.mock("@/lib/sudoku-seed-utils.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sudoku-seed-utils.ts")>(
    "@/lib/sudoku-seed-utils.ts"
  )

  return {
    ...actual,
    computeSudokuPuzzleHash,
    createSudokuCatalogSeed,
  }
})

describe("runExtremeSeedCatalogAttempt", () => {
  beforeEach(() => {
    createSudokuCatalogSeed.mockReset()
    computeSudokuPuzzleHash.mockReset()
  })

  it("saves a valid Extreme puzzle generated from a UUID seed", async () => {
    const seed = "2f8ab2f4-12ab-4d44-bfd2-7cc45b2d17e3"
    const puzzle = {
      clueCount: 23,
      difficulty: "haaard" as const,
      givens: Array.from({ length: 81 }, (_, index) => (index % 7 === 0 ? 0 : (index % 9) + 1)),
      seed,
      solution: Array.from({ length: 81 }, (_, index) => ((index + 3) % 9) + 1),
    }
    const saveCandidate = vi.fn().mockResolvedValue({
      recordId: "seed_1",
      status: "saved",
    })
    const generatePuzzle = vi.fn().mockResolvedValue({
      ...puzzle,
      seed,
    })

    createSudokuCatalogSeed.mockReturnValue(seed)
    computeSudokuPuzzleHash.mockResolvedValue(
      "9d3b6ff4cc2e9987781717ed7b74d7db47d1a36fb4ac27f1fd2ed24c9e5ac412"
    )

    const result = await runExtremeSeedCatalogAttempt({
      existingPuzzleHashes: new Set(),
      generatePuzzle,
      saveCandidate,
    })

    expect(result).toEqual({
      kind: "saved",
      puzzleHash: "9d3b6ff4cc2e9987781717ed7b74d7db47d1a36fb4ac27f1fd2ed24c9e5ac412",
      recordId: "seed_1",
      seed,
    })
    expect(saveCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        difficulty: "haaard",
        puzzleHash: "9d3b6ff4cc2e9987781717ed7b74d7db47d1a36fb4ac27f1fd2ed24c9e5ac412",
        seed,
      })
    )
  })

  it("skips duplicate puzzles produced by different UUID seeds", async () => {
    const firstSeed = "2f8ab2f4-12ab-4d44-bfd2-7cc45b2d17e3"
    const secondSeed = "6bb5e842-159e-4510-83ad-3548ba1fd05e"
    const puzzleHash =
      "80eef8f0378b8af74653610cbf91d0fddfbca44f10f889d4639416e4a1c6d539"
    const puzzle = {
      clueCount: 23,
      difficulty: "haaard" as const,
      givens: Array.from({ length: 81 }, (_, index) => (index % 5 === 0 ? 0 : ((index + 2) % 9) + 1)),
      seed: firstSeed,
      solution: Array.from({ length: 81 }, (_, index) => ((index + 6) % 9) + 1),
    }
    const saveCandidate = vi.fn().mockResolvedValue({
      recordId: "seed_1",
      status: "saved",
    })
    const generatePuzzle = vi.fn().mockResolvedValue({
      ...puzzle,
      seed: firstSeed,
    })

    createSudokuCatalogSeed.mockReturnValueOnce(firstSeed).mockReturnValueOnce(secondSeed)
    computeSudokuPuzzleHash.mockResolvedValue(puzzleHash)

    const firstAttempt = await runExtremeSeedCatalogAttempt({
      existingPuzzleHashes: new Set(),
      generatePuzzle,
      saveCandidate,
    })
    const secondAttempt = await runExtremeSeedCatalogAttempt({
      existingPuzzleHashes: new Set([puzzleHash]),
      generatePuzzle,
      saveCandidate,
    })

    expect(firstAttempt.kind).toBe("saved")
    expect(secondAttempt).toEqual({
      kind: "duplicate",
      puzzleHash,
      seed: secondSeed,
    })
    expect(saveCandidate).toHaveBeenCalledTimes(1)
  })
})
