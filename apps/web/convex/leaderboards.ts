import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import {
  buildBoardKey,
  buildLeaderboardCategoryKey,
  serializeLeaderboardCategoryKey,
} from "@workspace/game-core"
import type { RulesetConfig } from "@workspace/game-contracts"
import { sudokuDifficultyLabels, type SudokuDifficulty } from "@workspace/sudoku-engine"
import { getProfilesByIds, requireProfile } from "./lib"

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

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("leaderboardCategories").take(64)

    return categories.sort((left, right) => {
      if (left.gameKey !== right.gameKey) {
        return left.gameKey.localeCompare(right.gameKey)
      }

      if (left.modeKey !== right.modeKey) {
        return left.modeKey.localeCompare(right.modeKey)
      }

      return left.boardKey.localeCompare(right.boardKey)
    }).map((category) => {
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
