import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { validateBoardConfig } from "@workspace/minesweeper-engine"
import { buildBoardKey } from "@workspace/game-core"
import { requireProfile, toPublicProfile } from "./lib"
import { resolveSoloMinesweeperSelection } from "./minesweeper"
import { createSoloMatchForProfile } from "./matches"

async function findActiveLobbyMembership(
  ctx: MutationCtx | QueryCtx,
  profileId: Id<"profiles">
) {
  const memberships = await ctx.db
    .query("lobbyMembers")
    .withIndex("by_profileId", (query) => query.eq("profileId", profileId))
    .take(8)

  for (const membership of memberships) {
    const lobby = await ctx.db.get(membership.lobbyId)

    if (lobby && lobby.status !== "closed") {
      return { membership, lobby }
    }
  }

  return null
}

async function buildLobbyState(
  ctx: MutationCtx | QueryCtx,
  args: {
    lobbyId: Id<"lobbies">
    profileId: Id<"profiles">
  }
) {
  const lobby = await ctx.db.get(args.lobbyId)

  if (!lobby) {
    return null
  }

  const members = await ctx.db
    .query("lobbyMembers")
    .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.lobbyId))
    .take(8)
  const currentMember = members.find((member) => member.profileId === args.profileId) ?? null

  return {
    lobby,
    canStart:
      lobby.hostProfileId === args.profileId &&
      members.length > 0 &&
      lobby.status === "open" &&
      members.every((member) => member.readyState === "ready"),
    currentMemberReadyState: currentMember?.readyState ?? null,
    currentMemberMatchId: currentMember?.startedMatchId ?? null,
    members: await Promise.all(
      members.map(async (member) => {
        const memberProfile = await ctx.db.get(member.profileId)

        return memberProfile
          ? {
              profile: toPublicProfile(memberProfile),
              readyState: member.readyState,
              startedMatchId: member.startedMatchId ?? null,
              isHost: lobby.hostProfileId === member.profileId,
            }
          : null
      })
    ).then((rows) => rows.filter((row) => row !== null)),
  }
}

async function assertAvailableForLobby(
  ctx: MutationCtx,
  profileId: Id<"profiles">
) {
  const activeLobby = await findActiveLobbyMembership(ctx, profileId)

  if (activeLobby) {
    throw new Error("Leave your current lobby before creating or joining another one.")
  }

  const matches = await ctx.db
    .query("matchParticipants")
    .withIndex("by_profileId", (query) => query.eq("profileId", profileId))
    .order("desc")
    .take(12)

  for (const participant of matches) {
    const match = await ctx.db.get(participant.matchId)

    if (match && match.status === "active" && match.modeKey !== "solo") {
      throw new Error("Finish your current multiplayer match before entering a lobby.")
    }
  }
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const lobbies = await ctx.db
      .query("lobbies")
      .withIndex("by_visibility_status", (query) =>
        query.eq("visibility", "public").eq("status", "open")
      )
      .take(20)

    return Promise.all(
      lobbies.map(async (lobby) => {
        const members = await ctx.db
          .query("lobbyMembers")
          .withIndex("by_lobbyId", (query) => query.eq("lobbyId", lobby._id))
          .take(8)

        return {
          _id: lobby._id,
          title: lobby.title,
          mode: lobby.ranked ? "Ranked solo" : "Practice",
          memberCount: members.length,
          maxPlayers: lobby.maxPlayers,
          slots: `${members.length}/${lobby.maxPlayers}`,
          visibility: lobby.visibility,
          boardKey: buildBoardKey(lobby.boardConfig),
        }
      })
    )
  },
})

export const get = query({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    return buildLobbyState(ctx, {
      lobbyId: args.lobbyId,
      profileId: profile._id,
    })
  },
})

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx)
    const activeLobby = await findActiveLobbyMembership(ctx, profile._id)

    if (!activeLobby) {
      return null
    }

    return buildLobbyState(ctx, {
      lobbyId: activeLobby.lobby._id,
      profileId: profile._id,
    })
  },
})

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
    presetKey: v.optional(v.string()),
    boardConfig: v.optional(
      v.object({
        width: v.number(),
        height: v.number(),
        mineCount: v.optional(v.number()),
        density: v.optional(v.number()),
      })
    ),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    await assertAvailableForLobby(ctx, profile._id)
    const selection = resolveSoloMinesweeperSelection({
      presetKey: (args.presetKey as "beginner" | "intermediate" | "expert" | "custom" | undefined) ??
        undefined,
      boardConfig: args.boardConfig,
    })
    const validation = validateBoardConfig(selection.ruleset.boardConfig)

    if (!validation.ok) {
      throw new Error(validation.errors.join(" "))
    }

    const now = Date.now()
    const lobbyId = await ctx.db.insert("lobbies", {
      title: args.title?.trim() || selection.title,
      hostProfileId: profile._id,
      gameKey: "minesweeper",
      modeKey: "solo",
      rulesetKey: selection.rulesetKey,
      ranked: selection.ruleset.ranked,
      teamMode: "solo",
      boardConfig: {
        ...selection.ruleset.boardConfig,
        mineCount: validation.normalizedMineCount,
      },
      scoreConfig: selection.ruleset.scoreConfig,
      visibility: args.visibility,
      maxPlayers: Math.max(1, Math.min(args.maxPlayers ?? 4, 8)),
      allowFriendsOnly: args.visibility === "private",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("lobbyMembers", {
      lobbyId,
      profileId: profile._id,
      readyState: "pending",
      joinedAt: now,
    })

    return await ctx.db.get(lobbyId)
  },
})

export const join = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const existingLobby = await findActiveLobbyMembership(ctx, profile._id)
    const lobby = await ctx.db.get(args.lobbyId)

    if (!lobby || lobby.status !== "open") {
      throw new Error("Lobby is not joinable.")
    }

    if (existingLobby) {
      if (existingLobby.lobby._id === args.lobbyId) {
        return null
      }

      throw new Error("Leave your current lobby before joining another one.")
    }

    await assertAvailableForLobby(ctx, profile._id)

    const members = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.lobbyId))
      .take(8)

    if (members.some((member) => member.profileId === profile._id)) {
      return null
    }

    if (members.length >= lobby.maxPlayers) {
      throw new Error("Lobby is full.")
    }

    await ctx.db.insert("lobbyMembers", {
      lobbyId: args.lobbyId,
      profileId: profile._id,
      readyState: "pending",
      joinedAt: Date.now(),
    })

    await ctx.db.patch(lobby._id, {
      updatedAt: Date.now(),
    })

    return null
  },
})

export const leave = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const lobby = await ctx.db.get(args.lobbyId)

    if (!lobby) {
      throw new Error("Lobby not found.")
    }

    const members = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.lobbyId))
      .take(8)
    const currentMember = members.find((member) => member.profileId === profile._id)

    if (!currentMember) {
      return null
    }

    await ctx.db.delete(currentMember._id)

    const remainingMembers = members.filter((member) => member._id !== currentMember._id)

    if (remainingMembers.length === 0) {
      await ctx.db.patch(lobby._id, {
        status: "closed",
        updatedAt: Date.now(),
      })
      return null
    }

    await ctx.db.patch(lobby._id, {
      hostProfileId:
        lobby.hostProfileId === profile._id
          ? remainingMembers[0]!.profileId
          : lobby.hostProfileId,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const setReady = mutation({
  args: {
    lobbyId: v.id("lobbies"),
    readyState: v.union(v.literal("pending"), v.literal("ready")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const members = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.lobbyId))
      .take(8)
    const currentMember = members.find((member) => member.profileId === profile._id)

    if (!currentMember) {
      throw new Error("You are not in this lobby.")
    }

    await ctx.db.patch(currentMember._id, {
      readyState: args.readyState,
    })

    return null
  },
})

export const start = mutation({
  args: {
    lobbyId: v.id("lobbies"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const lobby = await ctx.db.get(args.lobbyId)

    if (!lobby) {
      throw new Error("Lobby not found.")
    }

    if (lobby.hostProfileId !== profile._id) {
      throw new Error("Only the host can start this lobby.")
    }

    if (lobby.status !== "open") {
      throw new Error("Lobby has already been started.")
    }

    const members = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.lobbyId))
      .take(8)

    if (members.length === 0) {
      throw new Error("Lobby is empty.")
    }

    if (members.some((member) => member.readyState !== "ready")) {
      throw new Error("All joined players must be ready before the host can start.")
    }

    const selection = resolveSoloMinesweeperSelection({
      presetKey: lobby.ranked ? undefined : "custom",
      boardConfig: lobby.boardConfig,
    })
    const validation = validateBoardConfig(selection.ruleset.boardConfig)

    if (!validation.ok || validation.normalizedMineCount === undefined) {
      throw new Error(validation.errors.join(" "))
    }

    const matchBoardConfig = {
      ...selection.ruleset.boardConfig,
      mineCount: validation.normalizedMineCount,
    }
    const ruleset = {
      ...selection.ruleset,
      boardConfig: matchBoardConfig,
    }
    const now = Date.now()

    await ctx.db.patch(lobby._id, {
      status: "starting",
      updatedAt: now,
    })

    let callerMatchId: Id<"matches"> | null = null

    for (const member of members) {
      const created = await createSoloMatchForProfile(ctx, {
        profileId: member.profileId,
        createdByProfileId: profile._id,
        rulesetKey: selection.rulesetKey,
        boardKey: selection.boardKey,
        ranked: selection.ruleset.ranked,
        boardConfig: matchBoardConfig,
        scoreConfig: selection.ruleset.scoreConfig,
        ruleset,
        presetKey: selection.presetKey,
        lobbyId: lobby._id,
      })

      await ctx.db.patch(member._id, {
        startedMatchId: created.matchId,
      })

      if (member.profileId === profile._id) {
        callerMatchId = created.matchId
      }
    }

    await ctx.db.patch(lobby._id, {
      status: "in_match",
      updatedAt: Date.now(),
    })

    return {
      matchId: callerMatchId,
    }
  },
})
