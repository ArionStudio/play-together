import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import {
  buildBoardKey,
  buildLeaderboardCategoryKey,
  buildRulesetKey,
  serializeLeaderboardCategoryKey,
} from "@workspace/game-core"
import { MINESWEEPER_RANKED_RULESETS, type RulesetConfig } from "@workspace/game-contracts"
import { sudokuDifficultyLabels, type SudokuDifficulty } from "@workspace/sudoku-engine"
import { getProfilesByIds, requireProfile } from "./lib"

const SUDOKU_DIFFICULTIES = [
  "easy",
  "medium",
  "hard",
  "expert",
  "haaard",
] as const satisfies SudokuDifficulty[]

const MINESWEEPER_PRESETS = [
  "beginner",
  "intermediate",
  "expert",
] as const satisfies Array<keyof typeof MINESWEEPER_RANKED_RULESETS>

export function categoryKeyForRuleset(ruleset: RulesetConfig) {
  return serializeLeaderboardCategoryKey(buildLeaderboardCategoryKey(ruleset))
}

export async function ensureLeaderboardCategory(
  ctx: MutationCtx,
  ruleset: RulesetConfig,
  rulesetKey: string
) {
  const key = categoryKeyForRuleset(ruleset)
  const existing = await ctx.db
    .query("leaderboardCategories")
    .withIndex("by_key", (query) => query.eq("key", key))
    .unique()

  if (existing) {
    return existing
  }

  const categoryInput = buildLeaderboardCategoryKey(ruleset)
  const categoryId = await ctx.db.insert("leaderboardCategories", {
    key,
    ...categoryInput,
    rulesetKey,
    createdAt: Date.now(),
  })

  return await ctx.db.get(categoryId)
}

export async function writeLeaderboardEntryIfNeeded(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    participant: Doc<"matchParticipants">
    ruleset: RulesetConfig
  }
) {
  if (
    args.match.outcome !== "won" ||
    args.match.completedAt === undefined ||
    typeof args.participant.scorePrimary !== "number"
  ) {
    return null
  }

  const existingEntry = await ctx.db
    .query("leaderboardEntries")
    .withIndex("by_matchId_profileId", (query) =>
      query.eq("matchId", args.match._id).eq("profileId", args.participant.profileId)
    )
    .unique()

  if (existingEntry) {
    return existingEntry
  }

  const categoryKey = categoryKeyForRuleset(args.ruleset)
  const boardKey = buildBoardKey(args.ruleset.boardConfig)
  const entryId = await ctx.db.insert("leaderboardEntries", {
    categoryKey,
    matchId: args.match._id,
    profileId: args.participant.profileId,
    scorePrimary: args.participant.scorePrimary,
    scoreSecondary: args.participant.scoreSecondary,
    completedAt: args.match.completedAt,
    boardKey,
    createdAt: Date.now(),
  })

  return await ctx.db.get(entryId)
}

type CategoryRowLike = Pick<
  Doc<"leaderboardCategories">,
  "key" | "gameKey" | "modeKey" | "ranked" | "boardKey" | "rulesetKey" | "createdAt"
>

function buildCanonicalMinesweeperMultiplayerRuleset(args: {
  presetKey: (typeof MINESWEEPER_PRESETS)[number]
  teamMode: "race" | "coop"
}): RulesetConfig {
  const baseRuleset = MINESWEEPER_RANKED_RULESETS[args.presetKey]

  return {
    gameKey: "minesweeper",
    modeKey: args.teamMode,
    ranked: false,
    teamMode: args.teamMode,
    boardConfig: baseRuleset.boardConfig,
    scoreConfig: {
      scoringKey: "time_asc",
      timeLimitSeconds: null,
      maxMistakes: 0,
    },
    gameConfig: {
      firstClickBehavior: "safe_zero",
      eliminationRule: args.teamMode === "coop" ? "team_wipe" : "single_life",
      sharedLossRule: args.teamMode === "coop" ? "team_wipe" : "single_life",
    },
  }
}

function buildCanonicalSudokuRuleset(args: {
  difficulty: SudokuDifficulty
  teamMode: "race" | "coop"
}): RulesetConfig {
  return {
    gameKey: "sudoku",
    modeKey: args.teamMode,
    ranked: false,
    teamMode: args.teamMode,
    boardConfig: {
      width: 9,
      height: 9,
    },
    scoreConfig: {
      scoringKey: "time_asc",
      timeLimitSeconds: null,
      maxMistakes: null,
    },
    gameConfig: {
      variant: "classic",
      difficulty: args.difficulty,
      clueStyle: "generated",
    },
  }
}

function buildCanonicalCategories(): CategoryRowLike[] {
  const categories: CategoryRowLike[] = []

  for (const presetKey of MINESWEEPER_PRESETS) {
    const ruleset = MINESWEEPER_RANKED_RULESETS[presetKey]

    categories.push({
      key: categoryKeyForRuleset(ruleset),
      ...buildLeaderboardCategoryKey(ruleset),
      rulesetKey: buildRulesetKey(ruleset),
      createdAt: 0,
    })

    for (const teamMode of ["race", "coop"] as const) {
      const multiplayerRuleset = buildCanonicalMinesweeperMultiplayerRuleset({
        presetKey,
        teamMode,
      })

      categories.push({
        key: categoryKeyForRuleset(multiplayerRuleset),
        ...buildLeaderboardCategoryKey(multiplayerRuleset),
        rulesetKey: `minesweeper:${teamMode}:${presetKey}`,
        createdAt: 0,
      })
    }
  }

  for (const difficulty of SUDOKU_DIFFICULTIES) {
    for (const teamMode of ["race", "coop"] as const) {
      const ruleset = buildCanonicalSudokuRuleset({
        difficulty,
        teamMode,
      })

      categories.push({
        key: categoryKeyForRuleset(ruleset),
        ...buildLeaderboardCategoryKey(ruleset),
        rulesetKey: `sudoku:${teamMode}:${difficulty}`,
        createdAt: 0,
      })
    }
  }

  return categories
}

function decorateCategories(categories: CategoryRowLike[]) {
  return categories
    .sort((left, right) => {
      if (left.gameKey !== right.gameKey) {
        return left.gameKey.localeCompare(right.gameKey)
      }

      if (left.modeKey !== right.modeKey) {
        return left.modeKey.localeCompare(right.modeKey)
      }

      return left.boardKey.localeCompare(right.boardKey)
    })
    .map((category) => {
      const title = (() => {
        if (category.gameKey === "sudoku" && category.rulesetKey.startsWith("sudoku:")) {
          const [, mode, difficulty] = category.rulesetKey.split(":")
          const difficultyLabel =
            sudokuDifficultyLabels[
              ((difficulty as SudokuDifficulty | undefined) ?? "medium")
            ]

          return `${difficultyLabel} ${mode === "coop" ? "Team Solve" : mode === "race" ? "Duel" : "Solo"}`
        }

        if (
          category.gameKey === "minesweeper" &&
          category.rulesetKey.startsWith("minesweeper:")
        ) {
          const [, mode, preset] = category.rulesetKey.split(":")
          return `${preset ?? category.boardKey} ${mode === "coop" ? "Team Clear" : mode === "race" ? "Race" : "Solo"}`
        }

        if (category.gameKey === "minesweeper" && category.modeKey === "solo") {
          return `${category.boardKey} ${category.ranked ? "Ranked Solo" : "Solo"}`
        }

        return `${category.gameKey} ${category.modeKey}`
      })()

      return {
        ...category,
        title,
      }
    })
}

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const storedCategories = await ctx.db.query("leaderboardCategories").take(64)
    const categoriesByKey = new Map<string, CategoryRowLike>()

    for (const category of buildCanonicalCategories()) {
      categoriesByKey.set(category.key, category)
    }

    for (const category of storedCategories) {
      categoriesByKey.set(category.key, category)
    }

    return decorateCategories([...categoriesByKey.values()])
  },
})

export const globalByCategory = query({
  args: {
    categoryKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50))
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_categoryKey_score", (query) =>
        query.eq("categoryKey", args.categoryKey)
      )
      .take(limit)
    const profilesById = await getProfilesByIds(
      ctx,
      entries.map((entry) => entry.profileId)
    )

    return entries.map((entry, index) => ({
      rank: index + 1,
      usernameTag: profilesById.get(entry.profileId)?.usernameTag ?? "Unknown",
      scorePrimary: entry.scorePrimary,
      completedAt: entry.completedAt,
      boardKey: entry.boardKey,
    }))
  },
})

export const personalBest = query({
  args: {
    categoryKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_profileId_completedAt", (query) =>
        query.eq("profileId", profile._id)
      )
      .order("desc")
      .take(128)

    const best = entries
      .filter((entry) => entry.categoryKey === args.categoryKey)
      .sort((left, right) => left.scorePrimary - right.scorePrimary)[0]

    if (!best) {
      return null
    }

    return {
      scorePrimary: best.scorePrimary,
      completedAt: best.completedAt,
    }
  },
})

export const recentRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const limit = Math.max(1, Math.min(args.limit ?? 10, 20))
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_profileId_completedAt", (query) =>
        query.eq("profileId", profile._id)
      )
      .order("desc")
      .take(limit)

    return entries.map((entry) => ({
      categoryKey: entry.categoryKey,
      scorePrimary: entry.scorePrimary,
      boardKey: entry.boardKey,
      completedAt: entry.completedAt,
    }))
  },
})

export const registerCanonicalCategories = mutation({
  args: {},
  handler: async () => {
    return null
  },
})
