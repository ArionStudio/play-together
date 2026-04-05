import { describe, expect, it } from "vitest"

import {
  analyzeSudokuDifficulty,
  countSudokuSolutions,
  createSudokuGame,
  createSudokuPuzzle,
  getConflictingIndices,
  isSudokuSolved,
  setCellValue,
  sudokuDifficulties,
  toggleCellNote,
} from "../src/index.ts"

describe("sudoku engine", () => {
  it("reproduces the same puzzle from the same seed", () => {
    const puzzleA = createSudokuPuzzle("medium", "seed-1")
    const puzzleB = createSudokuPuzzle("medium", "seed-1")

    expect(puzzleA.givens).toEqual(puzzleB.givens)
    expect(puzzleA.solution).toEqual(puzzleB.solution)
  })

  it("generates uniquely solvable puzzles", () => {
    const puzzle = createSudokuPuzzle("hard", "seed-unique")

    expect(countSudokuSolutions(puzzle.givens, 2)).toBe(1)
  })

  it("reduces clue counts as difficulty rises", { timeout: 30000 }, () => {
    const clueCounts = sudokuDifficulties.map(
      (difficulty) => createSudokuPuzzle(difficulty, `seed-${difficulty}`).clueCount
    )

    expect(clueCounts[0]).toBeGreaterThan(clueCounts[1]!)
    expect(clueCounts[1]).toBeGreaterThan(clueCounts[2]!)
    expect(clueCounts[2]).toBeGreaterThan(clueCounts[3]!)
    expect(clueCounts[3]).toBeGreaterThan(clueCounts[4]!)
  })

  it("classifies generated puzzles with a logic-based difficulty model", { timeout: 30000 }, () => {
    const classifications = sudokuDifficulties.map((difficulty) =>
      analyzeSudokuDifficulty(
        createSudokuPuzzle(difficulty, `seed-analysis-${difficulty}`).givens
      ).classifiedDifficulty
    )

    expect(classifications).toEqual([
      "easy",
      "medium",
      "hard",
      "expert",
      "haaard",
    ])
  })

  it("does not let fixed clues be edited", () => {
    const game = createSudokuGame(createSudokuPuzzle("easy", "seed-fixed"))
    const fixedIndex = game.cells.findIndex((cell) => cell.fixed)
    const attempted = setCellValue(game, fixedIndex, 9)

    expect(attempted).toBe(game)
  })

  it("stores editable notes in sorted order", () => {
    const game = createSudokuGame(createSudokuPuzzle("medium", "seed-notes"))
    const editableIndex = game.cells.findIndex((cell) => !cell.fixed)
    const withSeven = toggleCellNote(game, editableIndex, 7)
    const withThreeAndSeven = toggleCellNote(withSeven, editableIndex, 3)
    const removedSeven = toggleCellNote(withThreeAndSeven, editableIndex, 7)

    expect(withThreeAndSeven.cells[editableIndex]?.notes).toEqual([3, 7])
    expect(removedSeven.cells[editableIndex]?.notes).toEqual([3])
  })

  it("detects row, column, and box conflicts", () => {
    const values = Array.from({ length: 81 }, () => 0)
    values[0] = 5
    values[1] = 5
    values[9] = 5
    values[10] = 5

    expect(getConflictingIndices(values)).toEqual([0, 1, 9, 10])
  })

  it("recognizes a completed board", () => {
    const puzzle = createSudokuPuzzle("easy", "seed-solved")
    let game = createSudokuGame(puzzle)

    for (let index = 0; index < game.cells.length; index += 1) {
      if (game.cells[index]?.fixed) {
        continue
      }

      game = setCellValue(game, index, puzzle.solution[index]!)
    }

    expect(isSudokuSolved(game)).toBe(true)
  })
})
