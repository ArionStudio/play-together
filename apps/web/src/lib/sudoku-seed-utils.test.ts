import { describe, expect, it } from "vitest"

import {
  computeSudokuPuzzleHash,
  createSudokuCatalogSeed,
} from "@/lib/sudoku-seed-utils.ts"

describe("sudoku seed utils", () => {
  it("creates UUID-shaped catalog seeds", () => {
    const seed = createSudokuCatalogSeed()

    expect(seed).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("creates distinct catalog seeds across repeated calls", () => {
    const seedA = createSudokuCatalogSeed()
    const seedB = createSudokuCatalogSeed()

    expect(seedA).not.toBe(seedB)
  })

  it("computes a stable puzzle hash for the same puzzle", async () => {
    const givens = Array.from({ length: 81 }, (_, index) => (index % 9) + 1)
    const firstHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens,
    })
    const secondHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens: [...givens],
    })

    expect(firstHash).toBe(secondHash)
  })

  it("changes the puzzle hash when givens change", async () => {
    const givens = Array.from({ length: 81 }, () => 0)
    const changedGivens = [...givens]
    changedGivens[17] = 8
    const firstHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens,
    })
    const secondHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens: changedGivens,
    })

    expect(firstHash).not.toBe(secondHash)
  })

  it("produces the same hash for identical givens from different seeds", async () => {
    const givens = Array.from({ length: 81 }, (_, index) => (index % 4 === 0 ? 0 : (index % 9) + 1))
    const firstHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens,
    })
    const secondHash = await computeSudokuPuzzleHash({
      difficulty: "haaard",
      givens: [...givens],
    })

    expect(firstHash).toBe(secondHash)
  })
})
