import type { BoardConfig } from "@workspace/game-contracts"

export interface MinesweeperCell {
  index: number
  isMine: boolean
  adjacentMines: number
}

export interface VisibleCellState {
  revealed: boolean
  flagged: boolean
  exploded: boolean
}

export interface MinesweeperBoardState {
  width: number
  height: number
  mineCount: number
  seed: string
  cells: MinesweeperCell[]
}

export interface MinesweeperPlayerState {
  visible: VisibleCellState[]
  flagsUsed: number
  revealedCount: number
  mistakes: number
  alive: boolean
  finishedAt: number | null
}

export interface RevealResult {
  changedIndices: number[]
  exploded: boolean
  won: boolean
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  normalizedMineCount?: number
}

export interface CreateBoardOptions {
  firstClickIndex?: number
  firstClickBehavior?: "safe" | "safe_zero"
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

function getNeighborIndices(
  width: number,
  height: number,
  index: number
): number[] {
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

      if (
        nextRow < 0 ||
        nextRow >= height ||
        nextColumn < 0 ||
        nextColumn >= width
      ) {
        continue
      }

      neighbors.push(nextRow * width + nextColumn)
    }
  }

  return neighbors
}

function collectProtectedIndices(
  width: number,
  height: number,
  options: CreateBoardOptions
) {
  if (options.firstClickIndex === undefined) {
    return new Set<number>()
  }

  const protectedIndices = new Set<number>([options.firstClickIndex])

  if (options.firstClickBehavior === "safe_zero") {
    for (const neighbor of getNeighborIndices(
      width,
      height,
      options.firstClickIndex
    )) {
      protectedIndices.add(neighbor)
    }
  }

  return protectedIndices
}

function deriveMineCount(config: BoardConfig) {
  if (typeof config.mineCount === "number") {
    return config.mineCount
  }

  const density = config.density ?? 0
  return Math.max(1, Math.floor(config.width * config.height * density))
}

export function validateBoardConfig(config: BoardConfig): ValidationResult {
  const errors: string[] = []

  if (!Number.isInteger(config.width) || config.width < 6 || config.width > 40) {
    errors.push("Width must be an integer between 6 and 40.")
  }

  if (
    !Number.isInteger(config.height) ||
    config.height < 6 ||
    config.height > 30
  ) {
    errors.push("Height must be an integer between 6 and 30.")
  }

  if (config.mineCount === undefined && config.density === undefined) {
    errors.push("A board requires either mineCount or density.")
  }

  if (
    config.density !== undefined &&
    (config.density <= 0 || config.density > 0.35)
  ) {
    errors.push("Density must be greater than 0 and at most 35%.")
  }

  const normalizedMineCount = deriveMineCount(config)
  const cellCount = config.width * config.height
  const maxMineCount = Math.floor(cellCount * 0.35)

  if (
    !Number.isInteger(normalizedMineCount) ||
    normalizedMineCount < 1 ||
    normalizedMineCount > maxMineCount
  ) {
    errors.push("Mine count exceeds the supported custom board constraints.")
  }

  if (normalizedMineCount >= cellCount) {
    errors.push("Mine count must leave at least one safe cell.")
  }

  return {
    ok: errors.length === 0,
    errors,
    normalizedMineCount,
  }
}

export function createBoard(
  config: BoardConfig,
  seed: string,
  options: CreateBoardOptions = {}
): MinesweeperBoardState {
  const validation = validateBoardConfig(config)

  if (!validation.ok || validation.normalizedMineCount === undefined) {
    throw new Error(validation.errors.join(" "))
  }

  const width = config.width
  const height = config.height
  const mineCount = validation.normalizedMineCount
  const random = createRandom(seed)
  const protectedIndices = collectProtectedIndices(width, height, options)
  const allIndices = Array.from({ length: width * height }, (_, index) => index)
  const placeableIndices = allIndices.filter((index) => !protectedIndices.has(index))

  if (mineCount >= placeableIndices.length) {
    throw new Error("Mine count leaves no room for first-click safety.")
  }

  for (let index = placeableIndices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = placeableIndices[index]
    placeableIndices[index] = placeableIndices[swapIndex]
    placeableIndices[swapIndex] = current
  }

  const mineSet = new Set(placeableIndices.slice(0, mineCount))
  const cells: MinesweeperCell[] = allIndices.map((index) => ({
    index,
    isMine: mineSet.has(index),
    adjacentMines: 0,
  }))

  for (const cell of cells) {
    if (cell.isMine) {
      continue
    }

    cell.adjacentMines = getNeighborIndices(width, height, cell.index).filter(
      (neighbor) => cells[neighbor]?.isMine
    ).length
  }

  return {
    width,
    height,
    mineCount,
    seed,
    cells,
  }
}

export function createPlayerState(
  board: Pick<MinesweeperBoardState, "cells">
): MinesweeperPlayerState {
  return {
    visible: board.cells.map(() => ({
      revealed: false,
      flagged: false,
      exploded: false,
    })),
    flagsUsed: 0,
    revealedCount: 0,
    mistakes: 0,
    alive: true,
    finishedAt: null,
  }
}

export function createPlayerStateForCellCount(
  cellCount: number
): MinesweeperPlayerState {
  return {
    visible: Array.from({ length: cellCount }, () => ({
      revealed: false,
      flagged: false,
      exploded: false,
    })),
    flagsUsed: 0,
    revealedCount: 0,
    mistakes: 0,
    alive: true,
    finishedAt: null,
  }
}

function clonePlayerState(playerState: MinesweeperPlayerState): MinesweeperPlayerState {
  return {
    ...playerState,
    visible: playerState.visible.map((cell) => ({ ...cell })),
  }
}

export function evaluateWin(
  board: MinesweeperBoardState,
  playerState: MinesweeperPlayerState
) {
  return playerState.revealedCount === board.cells.length - board.mineCount
}

export function revealCell(
  board: MinesweeperBoardState,
  playerState: MinesweeperPlayerState,
  index: number
): { playerState: MinesweeperPlayerState; result: RevealResult } {
  const nextState = clonePlayerState(playerState)
  const target = nextState.visible[index]
  const cell = board.cells[index]

  if (!target || !cell || !nextState.alive || target.flagged || target.revealed) {
    return {
      playerState: nextState,
      result: { changedIndices: [], exploded: false, won: evaluateWin(board, nextState) },
    }
  }

  const changedIndices = new Set<number>()
  const queue = [index]
  let exploded = false

  while (queue.length > 0) {
    const currentIndex = queue.shift()

    if (currentIndex === undefined) {
      continue
    }

    const visibleCell = nextState.visible[currentIndex]
    const boardCell = board.cells[currentIndex]

    if (visibleCell.revealed || visibleCell.flagged) {
      continue
    }

    visibleCell.revealed = true
    changedIndices.add(currentIndex)

    if (boardCell.isMine) {
      visibleCell.exploded = true
      exploded = true
      nextState.alive = false
      nextState.mistakes += 1
      continue
    }

    nextState.revealedCount += 1

    if (boardCell.adjacentMines === 0) {
      for (const neighbor of getNeighborIndices(board.width, board.height, currentIndex)) {
        const neighborVisible = nextState.visible[neighbor]

        if (!neighborVisible.revealed && !neighborVisible.flagged) {
          queue.push(neighbor)
        }
      }
    }
  }

  const won = !exploded && evaluateWin(board, nextState)

  return {
    playerState: nextState,
    result: {
      changedIndices: [...changedIndices],
      exploded,
      won,
    },
  }
}

export function toggleFlag(
  playerState: MinesweeperPlayerState,
  index: number
): MinesweeperPlayerState {
  const nextState = clonePlayerState(playerState)
  const target = nextState.visible[index]

  if (!target || !nextState.alive || target.revealed) {
    return nextState
  }

  target.flagged = !target.flagged
  nextState.flagsUsed += target.flagged ? 1 : -1
  return nextState
}

export function chordCell(
  board: MinesweeperBoardState,
  playerState: MinesweeperPlayerState,
  index: number
): { playerState: MinesweeperPlayerState; result: RevealResult } {
  const target = playerState.visible[index]
  const cell = board.cells[index]

  if (!target?.revealed || cell.isMine || cell.adjacentMines === 0) {
    return {
      playerState,
      result: { changedIndices: [], exploded: false, won: evaluateWin(board, playerState) },
    }
  }

  const neighbors = getNeighborIndices(board.width, board.height, index)
  const flaggedNeighbors = neighbors.filter(
    (neighbor) => playerState.visible[neighbor]?.flagged
  ).length

  if (flaggedNeighbors !== cell.adjacentMines) {
    return {
      playerState,
      result: { changedIndices: [], exploded: false, won: evaluateWin(board, playerState) },
    }
  }

  let nextState = playerState
  const changedIndices = new Set<number>()
  let exploded = false
  let won = false

  for (const neighbor of neighbors) {
    if (nextState.visible[neighbor]?.flagged) {
      continue
    }

    const reveal = revealCell(board, nextState, neighbor)
    nextState = reveal.playerState
    reveal.result.changedIndices.forEach((changedIndex) => changedIndices.add(changedIndex))
    exploded = exploded || reveal.result.exploded
    won = won || reveal.result.won

    if (exploded) {
      break
    }
  }

  return {
    playerState: nextState,
    result: {
      changedIndices: [...changedIndices],
      exploded,
      won,
    },
  }
}
