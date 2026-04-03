import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import {
  assertValidTag,
  assertValidUsername,
  getProfileByTokenIdentifier,
  getProfileByUsernameTag,
  normalizeTag,
  normalizeUsername,
  requireIdentity,
  requireProfile,
  toPublicProfile,
  toUsernameTag,
  upsertUser,
} from "./lib"

function summarizeRun(match: Doc<"matches">, participant: Doc<"matchParticipants">) {
  const mineCount =
    match.boardConfig.mineCount ??
    Math.floor(
      match.boardConfig.width * match.boardConfig.height * (match.boardConfig.density ?? 0)
    )

  return {
    matchId: match._id,
    outcome: match.outcome ?? "lost",
    boardKey: `${match.boardConfig.width}x${match.boardConfig.height}:${mineCount}`,
    ranked: match.ranked,
    durationMs: match.durationMs ?? participant.scorePrimary ?? null,
    completedAt: match.completedAt ?? match.startedAt,
  }
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    const profile = await getProfileByTokenIdentifier(ctx, identity.tokenIdentifier)
    return profile ? toPublicProfile(profile) : null
  },
})

export const sessionStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return {
        convexAuthenticated: false,
        hasProfile: false,
        usernameTag: null,
      }
    }

    const profile = await getProfileByTokenIdentifier(ctx, identity.tokenIdentifier)

    return {
      convexAuthenticated: true,
      hasProfile: profile !== null,
      usernameTag: profile?.usernameTag ?? null,
    }
  },
})

export const byUsernameTag = query({
  args: {
    usernameTag: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await getProfileByUsernameTag(ctx, args.usernameTag)
    return profile ? toPublicProfile(profile) : null
  },
})

export const profilePage = query({
  args: {
    usernameTag: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await getProfileByUsernameTag(ctx, args.usernameTag)

    if (!profile) {
      return null
    }

    const currentIdentity = await ctx.auth.getUserIdentity()
    const isCurrentUser =
      currentIdentity?.tokenIdentifier === profile.tokenIdentifier

    const participantRows = await ctx.db
      .query("matchParticipants")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .order("desc")
      .take(64)

    const runs: ReturnType<typeof summarizeRun>[] = []
    const boardCounts = new Map<string, number>()
    let wins = 0
    let personalBestMs: number | null = null

    for (const participant of participantRows) {
      const match = await ctx.db.get(participant.matchId)

      if (!match || match.gameKey !== "minesweeper" || match.modeKey !== "solo") {
        continue
      }

      const run = summarizeRun(match, participant)
      runs.push(run)
      boardCounts.set(run.boardKey, (boardCounts.get(run.boardKey) ?? 0) + 1)

      if (match.outcome === "won") {
        wins += 1

        if (
          typeof run.durationMs === "number" &&
          (personalBestMs === null || run.durationMs < personalBestMs)
        ) {
          personalBestMs = run.durationMs
        }
      }
    }

    const favoriteBoard =
      [...boardCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null

    return {
      profile: toPublicProfile(profile),
      isCurrentUser,
      stats: {
        runsPlayed: runs.length,
        wins,
        personalBestMs,
        favoriteBoard,
      },
      recentRuns: runs.slice(0, 10),
    }
  },
})

export const search = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const rawQuery = args.query.trim().toLowerCase()

    if (!rawQuery) {
      return []
    }

    if (rawQuery.includes("#")) {
      const match = await ctx.db
        .query("profiles")
        .withIndex("by_usernameTagLower", (query) =>
          query.eq("usernameTagLower", rawQuery)
        )
        .unique()

      return match ? [toPublicProfile(match)] : []
    }

    const candidates = await ctx.db
      .query("profiles")
      .withIndex("by_usernameLower", (query) => query.gte("usernameLower", rawQuery))
      .take(10)

    return candidates
      .filter((profile) => profile.usernameLower.startsWith(rawQuery))
      .map(toPublicProfile)
  },
})

export const create = mutation({
  args: {
    username: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existingProfile = await getProfileByTokenIdentifier(ctx, identity.tokenIdentifier)

    if (existingProfile) {
      return toPublicProfile(existingProfile)
    }

    const username = normalizeUsername(args.username)
    const tag = normalizeTag(args.tag)
    assertValidUsername(username)
    assertValidTag(tag)

    const usernameLower = username.toLowerCase()
    const userId = await upsertUser(ctx, identity)
    const now = Date.now()
    const usernameTag = toUsernameTag(username, tag)
    const usernameTagLower = usernameTag.toLowerCase()

    const collision = await ctx.db
      .query("profiles")
      .withIndex("by_usernameTagLower", (query) =>
        query.eq("usernameTagLower", usernameTagLower)
      )
      .unique()

    if (collision) {
      throw new Error("That username tag is already taken.")
    }

    const profileId = await ctx.db.insert("profiles", {
      userId,
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      username,
      usernameLower,
      tag,
      usernameTag,
      usernameTagLower,
      avatarUrl:
        typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined,
      status: "available",
      presence: "online",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("presence", {
      profileId,
      state: "online",
      status: "available",
      lastSeenAt: now,
    })

    const createdProfile = await ctx.db.get(profileId)

    if (!createdProfile) {
      throw new Error("Profile creation failed.")
    }

    return toPublicProfile(createdProfile)
  },
})

export const touchPresence = mutation({
  args: {
    presence: v.optional(
      v.union(v.literal("online"), v.literal("idle"), v.literal("away"), v.literal("offline"))
    ),
    status: v.optional(
      v.union(
        v.literal("online"),
        v.literal("available"),
        v.literal("in_game"),
        v.literal("offline")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const now = Date.now()
    const nextPresence = args.presence ?? profile.presence
    const nextStatus = args.status ?? profile.status

    await ctx.db.patch(profile._id, {
      presence: nextPresence,
      status: nextStatus,
      updatedAt: now,
    })

    const presenceRow = await ctx.db
      .query("presence")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .unique()

    if (presenceRow) {
      await ctx.db.patch(presenceRow._id, {
        state: nextPresence,
        status: nextStatus,
        lastSeenAt: now,
      })
      return null
    }

    await ctx.db.insert("presence", {
      profileId: profile._id,
      state: nextPresence,
      status: nextStatus,
      lastSeenAt: now,
    })

    return null
  },
})
