import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireProfile } from "./lib"
import type { SudokuDifficulty } from "@workspace/sudoku-engine"

const SUDOKU_CELL_COUNT = 81
const SHA_256_HEX_LENGTH = 64

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  return Array.from(view, (value) => value.toString(16).padStart(2, "0")).join("")
}

function assertSudokuDigits(args: {
  clueCount?: number
  difficulty: string
  givens: number[]
  puzzleHash?: string
  seed?: string
  solution?: number[]
}) {
  if (args.difficulty !== "haaard") {
    throw new Error("Only Extreme Sudoku catalog entries can be saved here.")
  }

  if (!args.seed?.trim()) {
    throw new Error("Seed is required.")
  }

  if (args.givens.length !== SUDOKU_CELL_COUNT) {
    throw new Error("Givens must contain 81 cells.")
  }

  if (args.givens.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) {
    throw new Error("Givens must contain digits from 0 to 9.")
  }

  if (args.solution && args.solution.length !== SUDOKU_CELL_COUNT) {
    throw new Error("Solution must contain 81 cells.")
  }

  if (
    args.solution &&
    args.solution.some((value) => !Number.isInteger(value) || value < 1 || value > 9)
  ) {
    throw new Error("Solution must contain digits from 1 to 9.")
  }

  const derivedClueCount = args.givens.filter((value) => value !== 0).length

  if (
    typeof args.clueCount === "number" &&
    (!Number.isInteger(args.clueCount) || args.clueCount !== derivedClueCount)
  ) {
    throw new Error("Clue count does not match the givens array.")
  }

  if (
    args.puzzleHash &&
    (!/^[a-f0-9]+$/.test(args.puzzleHash) ||
      args.puzzleHash.length !== SHA_256_HEX_LENGTH)
  ) {
    throw new Error("Puzzle hash must be a lowercase SHA-256 hex string.")
  }

  return derivedClueCount
}

export function createSudokuCatalogSeed() {
  return crypto.randomUUID()
}

export async function computeSudokuPuzzleHash(args: {
  difficulty: SudokuDifficulty
  givens: number[]
}) {
  const stablePayload = JSON.stringify({
    difficulty: args.difficulty,
    givens: args.givens,
  })
  const encoded = new TextEncoder().encode(stablePayload)
  const digest = await crypto.subtle.digest("SHA-256", encoded)

  return bytesToHex(digest)
}

export async function saveExtremeValidSeedRecordIfNeeded(
  ctx: MutationCtx,
  args: {
    clueCount: number
    createdByProfileId: Id<"profiles">
    difficulty: SudokuDifficulty
    givens: number[]
    puzzleHash?: string
    seed: string
    solution: number[]
  }
) {
  if (args.difficulty !== "haaard") {
    return {
      recordId: null,
      status: "ignored" as const,
    }
  }

  const derivedClueCount = assertSudokuDigits(args)
  const puzzleHash =
    args.puzzleHash ??
    (await computeSudokuPuzzleHash({
      difficulty: args.difficulty,
      givens: args.givens,
    }))
  const existingBySeed = await ctx.db
    .query("sudokuExtremeValidSeeds")
    .withIndex("by_seed", (query) => query.eq("seed", args.seed))
    .unique()

  if (existingBySeed) {
    return {
      recordId: existingBySeed._id,
      status: "duplicate" as const,
    }
  }

  const existingByPuzzleHash = await ctx.db
    .query("sudokuExtremeValidSeeds")
    .withIndex("by_puzzleHash", (query) => query.eq("puzzleHash", puzzleHash))
    .unique()

  if (existingByPuzzleHash) {
    return {
      recordId: existingByPuzzleHash._id,
      status: "duplicate" as const,
    }
  }

  const now = Date.now()
  const recordId: Id<"sudokuExtremeValidSeeds"> = await ctx.db.insert(
    "sudokuExtremeValidSeeds",
    {
      createdByProfileId: args.createdByProfileId,
      clueCount: derivedClueCount,
      createdAt: now,
      difficulty: "haaard",
      givens: args.givens,
      puzzleHash,
      seed: args.seed,
      solution: args.solution,
    }
  )

  return {
    recordId,
    status: "saved" as const,
  }
}

export async function getRandomExtremeValidSeed(
  ctx: MutationCtx | QueryCtx
) {
  const rows = await ctx.db
    .query("sudokuExtremeValidSeeds")
    .withIndex("by_difficulty_createdAt", (query) => query.eq("difficulty", "haaard"))
    .order("desc")
    .take(128)

  if (rows.length === 0) {
    return null
  }

  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % rows.length

  return rows[randomIndex] ?? null
}

async function enrichSeedRow(
  ctx: QueryCtx,
  row: Doc<"sudokuExtremeValidSeeds">
) {
  const profile = await ctx.db.get(row.createdByProfileId)

  return {
    _id: row._id,
    clueCount: row.clueCount,
    createdAt: row.createdAt,
    createdBy: profile?.usernameTag ?? "Unknown",
    difficulty: row.difficulty,
    puzzleHash: row.puzzleHash,
    seed: row.seed,
  }
}

export const getExtremeValidSeedCatalogSnapshot = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 256, 512))
    const rows = await ctx.db
      .query("sudokuExtremeValidSeeds")
      .withIndex("by_difficulty_createdAt", (query) => query.eq("difficulty", "haaard"))
      .order("desc")
      .take(limit)

    return {
      activeValidCatalogCount: rows.length,
      seeds: await Promise.all(rows.map((row) => enrichSeedRow(ctx, row))),
    }
  },
})

export const getMyExtremeSeedContributions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const limit = Math.max(1, Math.min(args.limit ?? 12, 32))
    const rows = await ctx.db
      .query("sudokuExtremeValidSeeds")
      .withIndex("by_createdByProfileId_createdAt", (query) =>
        query.eq("createdByProfileId", profile._id)
      )
      .order("desc")
      .take(limit)

    return rows.map((row) => ({
      _id: row._id,
      clueCount: row.clueCount,
      createdAt: row.createdAt,
      puzzleHash: row.puzzleHash,
      seed: row.seed,
    }))
  },
})

export const saveExtremeValidSeed = mutation({
  args: {
    clueCount: v.number(),
    difficulty: v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard"),
      v.literal("expert"),
      v.literal("haaard")
    ),
    givens: v.array(v.number()),
    puzzleHash: v.string(),
    seed: v.string(),
    solution: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    return saveExtremeValidSeedRecordIfNeeded(ctx, {
      ...args,
      createdByProfileId: profile._id,
    })
  },
})
