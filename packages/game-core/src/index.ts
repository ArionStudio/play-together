import type {
  BoardConfig,
  LeaderboardCategoryKey,
  RulesetConfig,
  ScoreConfig,
} from "@workspace/game-contracts"

function sortObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

export function buildBoardKey(boardConfig: BoardConfig) {
  const mineCount =
    boardConfig.mineCount ??
    Math.floor(boardConfig.width * boardConfig.height * (boardConfig.density ?? 0))

  return `${boardConfig.width}x${boardConfig.height}:${mineCount}`
}

export function buildScoreConfig(ruleset: RulesetConfig): ScoreConfig {
  return ruleset.scoreConfig
}

export function buildRulesetKey(ruleset: RulesetConfig) {
  const gameSpecific =
    ruleset.gameKey === "minesweeper"
      ? {
          elimination: ruleset.gameConfig.eliminationRule ?? "none",
          firstClickBehavior: ruleset.gameConfig.firstClickBehavior,
          sharedLossRule: ruleset.gameConfig.sharedLossRule ?? "none",
        }
      : {
          clueStyle: ruleset.gameConfig.clueStyle ?? "none",
          difficulty: ruleset.gameConfig.difficulty,
          variant: ruleset.gameConfig.variant,
        }

  const normalized = sortObject({
    board: buildBoardKey(ruleset.boardConfig),
    game: ruleset.gameKey,
    maxMistakes: ruleset.scoreConfig.maxMistakes ?? "none",
    mode: ruleset.modeKey,
    ranked: ruleset.ranked,
    scoreRule: ruleset.scoreConfig.scoringKey,
    teamMode: ruleset.teamMode,
    timeLimitSeconds: ruleset.scoreConfig.timeLimitSeconds ?? "none",
    ...gameSpecific,
  })

  return Object.entries(normalized)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|")
}

export function buildLeaderboardCategoryKey(
  ruleset: RulesetConfig
): LeaderboardCategoryKey {
  return {
    gameKey: ruleset.gameKey,
    modeKey: ruleset.modeKey,
    ranked: ruleset.ranked,
    boardKey: buildBoardKey(ruleset.boardConfig),
    scoringKey: ruleset.scoreConfig.scoringKey,
  }
}

export function serializeLeaderboardCategoryKey(
  categoryKey: LeaderboardCategoryKey
) {
  const normalized = sortObject({ ...categoryKey })

  return Object.entries(normalized)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|")
}

export function formatUsernameTag(username: string, tag: string) {
  return `${username}#${tag}`
}

export function formatDurationMs(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000)
  const tenths = Math.floor((durationMs % 1000) / 100)
  return `${seconds}.${tenths}s`
}

export function sortByPrimaryThenTime<T extends {
  scorePrimary: number
  completedAt: number
}>(entries: T[], direction: "asc" | "desc" = "asc") {
  return [...entries].sort((left, right) => {
    const primary =
      direction === "asc"
        ? left.scorePrimary - right.scorePrimary
        : right.scorePrimary - left.scorePrimary

    if (primary !== 0) {
      return primary
    }

    return left.completedAt - right.completedAt
  })
}
