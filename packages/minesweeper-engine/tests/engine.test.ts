import { describe, expect, it } from "vitest"

import {
  chordCell,
  createBoard,
  createPlayerState,
  revealCell,
  toggleFlag,
  validateBoardConfig,
} from "../src/index.ts"

function neighborIndices(width: number, index: number) {
  const row = Math.floor(index / width)
  const column = index % width
  const neighbors: number[] = []

  for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
    for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn += 1) {
      if (deltaRow === 0 && deltaColumn === 0) {
        continue
      }

      const nextRow = row + deltaRow
      const nextColumn = column + deltaColumn

      if (nextRow < 0 || nextColumn < 0) {
        continue
      }

      neighbors.push(nextRow * width + nextColumn)
    }
  }

  return neighbors
}

describe("minesweeper engine", () => {
  it("reproduces the same board from the same seed", () => {
    const boardA = createBoard({ width: 9, height: 9, mineCount: 10 }, "seed-1")
    const boardB = createBoard({ width: 9, height: 9, mineCount: 10 }, "seed-1")

    expect(boardA.cells.map((cell) => cell.isMine)).toEqual(
      boardB.cells.map((cell) => cell.isMine)
    )
  })

  it("honors safe first click", () => {
    const board = createBoard(
      { width: 9, height: 9, mineCount: 10 },
      "seed-safe",
      { firstClickIndex: 0, firstClickBehavior: "safe" }
    )

    expect(board.cells[0]?.isMine).toBe(false)
  })

  it("honors safe_zero first click across the neighborhood", () => {
    const board = createBoard(
      { width: 9, height: 9, mineCount: 10 },
      "seed-safe-zero",
      { firstClickIndex: 10, firstClickBehavior: "safe_zero" }
    )

    expect(board.cells[10]?.adjacentMines).toBe(0)
  })

  it("reveals flood-fill regions", () => {
    const board = createBoard(
      { width: 9, height: 9, mineCount: 10 },
      "seed-flood",
      { firstClickIndex: 0, firstClickBehavior: "safe_zero" }
    )

    const player = createPlayerState(board)
    const reveal = revealCell(board, player, 0)

    expect(reveal.result.exploded).toBe(false)
    expect(reveal.result.changedIndices.length).toBeGreaterThan(1)
  })

  it("supports chording when adjacent flag counts match", () => {
    const board = createBoard(
      { width: 9, height: 9, mineCount: 10 },
      "seed-chord",
      { firstClickIndex: 40, firstClickBehavior: "safe" }
    )

    const chordTarget = board.cells.find(
      (cell) =>
        !cell.isMine &&
        cell.adjacentMines > 0 &&
        neighborIndices(board.width, cell.index).some(
          (neighbor) => board.cells[neighbor]?.isMine
        )
    )

    expect(chordTarget).toBeDefined()

    const revealed = revealCell(board, createPlayerState(board), chordTarget!.index)
    const flaggedMineIndex = neighborIndices(board.width, chordTarget!.index).find(
      (neighbor) => board.cells[neighbor]?.isMine
    )

    expect(flaggedMineIndex).toBeDefined()

    const flagged = toggleFlag(revealed.playerState, flaggedMineIndex!)
    const chorded = chordCell(board, flagged, chordTarget!.index)

    expect(chorded.result.changedIndices.length).toBeGreaterThan(0)
  })

  it("rejects invalid custom boards", () => {
    const validation = validateBoardConfig({ width: 5, height: 50, mineCount: 500 })

    expect(validation.ok).toBe(false)
    expect(validation.errors.length).toBeGreaterThan(0)
  })
})
