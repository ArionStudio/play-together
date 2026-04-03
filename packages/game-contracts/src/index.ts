import { z } from "zod"

export const gameKeys = ["minesweeper", "sudoku"] as const
export const teamModes = ["solo", "race", "coop"] as const
export const matchVisibilities = ["public", "private", "matchmaking"] as const
export const presetBoardKeys = [
  "beginner",
  "intermediate",
  "expert",
  "custom",
] as const
export const matchStatuses = [
  "waiting",
  "ready",
  "active",
  "finished",
  "cancelled",
] as const
export const lobbyStatuses = ["open", "starting", "in_match", "closed"] as const
export const readyStates = ["pending", "ready"] as const
export const leaderboardSortDirections = ["asc", "desc"] as const

export type GameKey = (typeof gameKeys)[number]
export type TeamMode = (typeof teamModes)[number]
export type MatchVisibility = (typeof matchVisibilities)[number]
export type PresetBoardKey = (typeof presetBoardKeys)[number]
export type MatchStatus = (typeof matchStatuses)[number]
export type LobbyStatus = (typeof lobbyStatuses)[number]
export type ReadyState = (typeof readyStates)[number]
export type LeaderboardSortDirection =
  (typeof leaderboardSortDirections)[number]

export interface BoardConfig {
  width: number
  height: number
  mineCount?: number
  density?: number
}

export interface ScoreConfig {
  scoringKey: string
  timeLimitSeconds?: number | null
  maxMistakes?: number | null
}

export interface BaseRulesetConfig {
  gameKey: GameKey
  modeKey: string
  ranked: boolean
  teamMode: TeamMode
  boardConfig: BoardConfig
  scoreConfig: ScoreConfig
}

export interface MinesweeperGameConfig {
  firstClickBehavior: "safe" | "safe_zero"
  eliminationRule?: "single_life" | "team_wipe" | "three_strikes"
  sharedLossRule?: "team_wipe" | "single_life"
}

export interface SudokuBoardConfig extends BoardConfig {
  width: 9
  height: 9
}

export interface SudokuGameConfig {
  variant: "classic"
  difficulty: "easy" | "medium" | "hard" | "expert" | "haaard"
  clueStyle?: "generated" | "curated"
}

export interface MinesweeperRulesetConfig extends BaseRulesetConfig {
  gameKey: "minesweeper"
  gameConfig: MinesweeperGameConfig
}

export interface SudokuRulesetConfig extends BaseRulesetConfig {
  gameKey: "sudoku"
  boardConfig: SudokuBoardConfig
  gameConfig: SudokuGameConfig
}

export type RulesetConfig = MinesweeperRulesetConfig | SudokuRulesetConfig

export interface LobbyConfig {
  gameKey: GameKey
  ruleset: RulesetConfig
  visibility: MatchVisibility
  maxPlayers: number
  allowFriendsOnly: boolean
}

export interface LeaderboardCategoryKey {
  gameKey: GameKey
  modeKey: string
  ranked: boolean
  boardKey: string
  scoringKey: string
}

export interface ProfileSummary {
  _id?: string
  username: string
  tag: string
  usernameTag: string
  status: "online" | "available" | "in_game" | "offline"
  presence: "online" | "idle" | "away" | "offline"
  avatarUrl?: string
}

export interface MatchRulesetEnvelope {
  rulesetKey: string
  ruleset: RulesetConfig
  boardConfig: BoardConfig
  scoreConfig: ScoreConfig
}

export const boardConfigSchema = z.object({
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  mineCount: z.number().int().positive().optional(),
  density: z.number().positive().max(1).optional(),
})

export const scoreConfigSchema = z.object({
  scoringKey: z.string().min(1),
  timeLimitSeconds: z.number().int().positive().nullable().optional(),
  maxMistakes: z.number().int().nonnegative().nullable().optional(),
})

export const minesweeperGameConfigSchema = z.object({
  firstClickBehavior: z.enum(["safe", "safe_zero"]),
  eliminationRule: z
    .enum(["single_life", "team_wipe", "three_strikes"])
    .optional(),
  sharedLossRule: z.enum(["team_wipe", "single_life"]).optional(),
})

export const sudokuBoardConfigSchema = z.object({
  width: z.literal(9),
  height: z.literal(9),
  mineCount: z.undefined().optional(),
  density: z.undefined().optional(),
})

export const sudokuGameConfigSchema = z.object({
  variant: z.literal("classic"),
  difficulty: z.enum(["easy", "medium", "hard", "expert", "haaard"]),
  clueStyle: z.enum(["generated", "curated"]).optional(),
})

const baseRulesetConfigSchema = z.object({
  modeKey: z.string().min(1),
  ranked: z.boolean(),
  teamMode: z.enum(teamModes),
  boardConfig: boardConfigSchema,
  scoreConfig: scoreConfigSchema,
})

export const minesweeperRulesetConfigSchema = baseRulesetConfigSchema.extend({
  gameKey: z.literal("minesweeper"),
  gameConfig: minesweeperGameConfigSchema,
})

export const sudokuRulesetConfigSchema = baseRulesetConfigSchema.extend({
  gameKey: z.literal("sudoku"),
  boardConfig: sudokuBoardConfigSchema,
  gameConfig: sudokuGameConfigSchema,
})

export const rulesetConfigSchema = z.discriminatedUnion("gameKey", [
  minesweeperRulesetConfigSchema,
  sudokuRulesetConfigSchema,
])

export const lobbyConfigSchema = z.object({
  gameKey: z.enum(gameKeys),
  ruleset: rulesetConfigSchema,
  visibility: z.enum(matchVisibilities),
  maxPlayers: z.number().int().min(1).max(8),
  allowFriendsOnly: z.boolean(),
})

export const leaderboardCategoryKeySchema = z.object({
  gameKey: z.enum(gameKeys),
  modeKey: z.string().min(1),
  ranked: z.boolean(),
  boardKey: z.string().min(1),
  scoringKey: z.string().min(1),
})

export const MINESWEEPER_PRESET_BOARDS = {
  beginner: { width: 9, height: 9, mineCount: 10 },
  intermediate: { width: 16, height: 16, mineCount: 40 },
  expert: { width: 30, height: 16, mineCount: 99 },
} satisfies Record<Exclude<PresetBoardKey, "custom">, BoardConfig>

export const MINESWEEPER_TIME_SCORING_KEY = "time_asc" as const

export const MINESWEEPER_RANKED_RULESETS = {
  beginner: {
    gameKey: "minesweeper",
    modeKey: "solo",
    ranked: true,
    teamMode: "solo",
    boardConfig: MINESWEEPER_PRESET_BOARDS.beginner,
    scoreConfig: {
      scoringKey: MINESWEEPER_TIME_SCORING_KEY,
      timeLimitSeconds: null,
      maxMistakes: 0,
    },
    gameConfig: {
      firstClickBehavior: "safe_zero",
      eliminationRule: "single_life",
      sharedLossRule: "single_life",
    },
  },
  intermediate: {
    gameKey: "minesweeper",
    modeKey: "solo",
    ranked: true,
    teamMode: "solo",
    boardConfig: MINESWEEPER_PRESET_BOARDS.intermediate,
    scoreConfig: {
      scoringKey: MINESWEEPER_TIME_SCORING_KEY,
      timeLimitSeconds: null,
      maxMistakes: 0,
    },
    gameConfig: {
      firstClickBehavior: "safe_zero",
      eliminationRule: "single_life",
      sharedLossRule: "single_life",
    },
  },
  expert: {
    gameKey: "minesweeper",
    modeKey: "solo",
    ranked: true,
    teamMode: "solo",
    boardConfig: MINESWEEPER_PRESET_BOARDS.expert,
    scoreConfig: {
      scoringKey: MINESWEEPER_TIME_SCORING_KEY,
      timeLimitSeconds: null,
      maxMistakes: 0,
    },
    gameConfig: {
      firstClickBehavior: "safe_zero",
      eliminationRule: "single_life",
      sharedLossRule: "single_life",
    },
  },
} satisfies Record<Exclude<PresetBoardKey, "custom">, MinesweeperRulesetConfig>

export function getPresetBoardConfig(
  presetKey: Exclude<PresetBoardKey, "custom">
) {
  return MINESWEEPER_PRESET_BOARDS[presetKey]
}

export function findMinesweeperPresetBoardKey(
  boardConfig: BoardConfig
): Exclude<PresetBoardKey, "custom"> | null {
  const presetEntry = Object.entries(MINESWEEPER_PRESET_BOARDS).find(
    ([, preset]) =>
      preset.width === boardConfig.width &&
      preset.height === boardConfig.height &&
      preset.mineCount === boardConfig.mineCount
  )

  if (!presetEntry) {
    return null
  }

  return presetEntry[0] as Exclude<PresetBoardKey, "custom">
}

export function createSoloMinesweeperRuleset(
  boardConfig: BoardConfig,
  options: {
    ranked?: boolean
    firstClickBehavior?: MinesweeperGameConfig["firstClickBehavior"]
  } = {}
): MinesweeperRulesetConfig {
  return {
    gameKey: "minesweeper",
    modeKey: "solo",
    ranked: options.ranked ?? false,
    teamMode: "solo",
    boardConfig,
    scoreConfig: {
      scoringKey: MINESWEEPER_TIME_SCORING_KEY,
      timeLimitSeconds: null,
      maxMistakes: 0,
    },
    gameConfig: {
      firstClickBehavior: options.firstClickBehavior ?? "safe_zero",
      eliminationRule: "single_life",
      sharedLossRule: "single_life",
    },
  }
}
