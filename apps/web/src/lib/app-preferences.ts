import type { GameKey, PresetBoardKey } from "@workspace/game-contracts"
import { validateBoardConfig } from "@workspace/minesweeper-engine"
import type { SudokuDifficulty } from "@workspace/sudoku-engine"

export type RoomModePreference = "race" | "coop"
export type VisibilityPreference = "public" | "private"
export type SudokuInputPreference = "cell_first" | "number_first"
export type SoloBoardConfigPreference = {
  width: number
  height: number
  mineCount: number
}

type MinesweeperRoomPresetKey = Exclude<PresetBoardKey, "custom">

export type AppPreferences = {
  version: 1
  rooms: {
    selectedGameKey: GameKey
    visibility: VisibilityPreference
  }
  games: {
    minesweeper: {
      room: {
        mode: RoomModePreference
        presetKey: MinesweeperRoomPresetKey
      }
      solo: {
        presetKey: PresetBoardKey
        customBoard: SoloBoardConfigPreference
      }
    }
    sudoku: {
      controls: {
        fillInput: SudokuInputPreference
        notesInput: SudokuInputPreference
      }
      room: {
        mode: RoomModePreference
        difficulty: SudokuDifficulty
      }
      solo: {
        difficulty: SudokuDifficulty
      }
    }
  }
}

const STORAGE_KEY = "play-together:app-preferences"
const STORAGE_VERSION = 1 as const
const ROOM_MODE_VALUES = ["race", "coop"] as const
const VISIBILITY_VALUES = ["public", "private"] as const
const GAME_KEY_VALUES = ["minesweeper", "sudoku"] as const
const MINESWEEPER_ROOM_PRESET_VALUES = [
  "beginner",
  "intermediate",
  "expert",
] as const
const MINESWEEPER_SOLO_PRESET_VALUES = [
  "beginner",
  "intermediate",
  "expert",
  "custom",
] as const
const SUDOKU_DIFFICULTY_VALUES = [
  "easy",
  "medium",
  "hard",
  "expert",
  "haaard",
] as const
const SUDOKU_INPUT_VALUES = ["cell_first", "number_first"] as const

function createDefaultPreferences(): AppPreferences {
  return {
    version: STORAGE_VERSION,
    rooms: {
      selectedGameKey: "sudoku",
      visibility: "public",
    },
    games: {
      minesweeper: {
        room: {
          mode: "race",
          presetKey: "beginner",
        },
        solo: {
          presetKey: "beginner",
          customBoard: {
            width: 9,
            height: 9,
            mineCount: 10,
          },
        },
      },
      sudoku: {
        controls: {
          fillInput: "cell_first",
          notesInput: "number_first",
        },
        room: {
          mode: "race",
          difficulty: "medium",
        },
        solo: {
          difficulty: "medium",
        },
      },
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowedValues: T
): value is T[number] {
  return typeof value === "string" && allowedValues.includes(value as T[number])
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function normalizeSoloBoardConfig(
  value: unknown,
  fallback: SoloBoardConfigPreference
): SoloBoardConfigPreference {
  if (!isObject(value)) {
    return fallback
  }

  const width = isPositiveInteger(value.width) ? value.width : fallback.width
  const height = isPositiveInteger(value.height) ? value.height : fallback.height
  const mineCount = isPositiveInteger(value.mineCount)
    ? value.mineCount
    : fallback.mineCount

  const nextConfig = { width, height, mineCount }

  return validateBoardConfig(nextConfig).ok ? nextConfig : fallback
}

function normalizePreferences(value: unknown): AppPreferences {
  const defaults = createDefaultPreferences()

  if (!isObject(value) || value.version !== STORAGE_VERSION) {
    return defaults
  }

  const rooms = isObject(value.rooms) ? value.rooms : {}
  const games = isObject(value.games) ? value.games : {}
  const minesweeper = isObject(games.minesweeper) ? games.minesweeper : {}
  const sudoku = isObject(games.sudoku) ? games.sudoku : {}
  const sudokuControls = isObject(sudoku.controls) ? sudoku.controls : {}
  const minesweeperRoom = isObject(minesweeper.room) ? minesweeper.room : {}
  const minesweeperSolo = isObject(minesweeper.solo) ? minesweeper.solo : {}
  const sudokuRoom = isObject(sudoku.room) ? sudoku.room : {}
  const sudokuSolo = isObject(sudoku.solo) ? sudoku.solo : {}

  return {
    version: STORAGE_VERSION,
    rooms: {
      selectedGameKey: isOneOf(rooms.selectedGameKey, GAME_KEY_VALUES)
        ? rooms.selectedGameKey
        : defaults.rooms.selectedGameKey,
      visibility: isOneOf(rooms.visibility, VISIBILITY_VALUES)
        ? rooms.visibility
        : defaults.rooms.visibility,
    },
    games: {
      minesweeper: {
        room: {
          mode: isOneOf(minesweeperRoom.mode, ROOM_MODE_VALUES)
            ? minesweeperRoom.mode
            : defaults.games.minesweeper.room.mode,
          presetKey: isOneOf(
            minesweeperRoom.presetKey,
            MINESWEEPER_ROOM_PRESET_VALUES
          )
            ? minesweeperRoom.presetKey
            : defaults.games.minesweeper.room.presetKey,
        },
        solo: {
          presetKey: isOneOf(
            minesweeperSolo.presetKey,
            MINESWEEPER_SOLO_PRESET_VALUES
          )
            ? minesweeperSolo.presetKey
            : defaults.games.minesweeper.solo.presetKey,
          customBoard: normalizeSoloBoardConfig(
            minesweeperSolo.customBoard,
            defaults.games.minesweeper.solo.customBoard
          ),
        },
      },
      sudoku: {
        controls: {
          fillInput: isOneOf(sudokuControls.fillInput, SUDOKU_INPUT_VALUES)
            ? sudokuControls.fillInput
            : defaults.games.sudoku.controls.fillInput,
          notesInput: isOneOf(sudokuControls.notesInput, SUDOKU_INPUT_VALUES)
            ? sudokuControls.notesInput
            : defaults.games.sudoku.controls.notesInput,
        },
        room: {
          mode: isOneOf(sudokuRoom.mode, ROOM_MODE_VALUES)
            ? sudokuRoom.mode
            : defaults.games.sudoku.room.mode,
          difficulty: isOneOf(sudokuRoom.difficulty, SUDOKU_DIFFICULTY_VALUES)
            ? sudokuRoom.difficulty
            : defaults.games.sudoku.room.difficulty,
        },
        solo: {
          difficulty: isOneOf(sudokuSolo.difficulty, SUDOKU_DIFFICULTY_VALUES)
            ? sudokuSolo.difficulty
            : defaults.games.sudoku.solo.difficulty,
        },
      },
    },
  }
}

function getStorage() {
  if (typeof window === "undefined") {
    return null
  }

  return window.localStorage
}

export function readAppPreferences(): AppPreferences {
  const storage = getStorage()

  if (!storage) {
    return createDefaultPreferences()
  }

  try {
    const rawValue = storage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return createDefaultPreferences()
    }

    return normalizePreferences(JSON.parse(rawValue))
  } catch {
    return createDefaultPreferences()
  }
}

export function updateAppPreferences(
  updater: (current: AppPreferences) => AppPreferences
) {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    const nextPreferences = normalizePreferences(updater(readAppPreferences()))
    storage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences))
  } catch {
    return
  }
}
