import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { validateBoardConfig } from "@workspace/minesweeper-engine"
import { buildBoardKey } from "@workspace/game-core"
import { type SudokuDifficulty } from "@workspace/sudoku-engine"
import { purgeMatchEvents, recordCompletedRunsForMatch } from "./history"
import { getProfilesByIds, requireProfile, toPublicProfile } from "./lib"
import { resolveSoloMinesweeperSelection } from "./minesweeper"

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

function getLobbyLabels(args: {
  gameKey: "minesweeper" | "sudoku"
  rulesetKey: string
  teamMode: "race" | "coop" | "solo"
}) {
  if (args.gameKey === "sudoku") {
    return {
      gameLabel: "Sudoku",
      modeLabel: args.teamMode === "coop" ? "Team Solve" : "Duel",
    }
  }

  return {
    gameLabel: "Minesweeper",
    modeLabel: args.teamMode === "coop" ? "Team Clear" : "Race",
  }
}

function createLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))

  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")
}

const LOBBY_NAME_PARTS = {
  left: [
    "fish",
    "monkey",
    "otter",
    "pickle",
    "laser",
    "waffle",
    "mango",
    "sock",
    "rocket",
    "goblin",
    "tofu",
    "panda",
  ],
  middle: [
    "banana",
    "tornado",
    "noodle",
    "pirate",
    "biscuit",
    "cactus",
    "meadow",
    "lizard",
    "teapot",
    "jelly",
    "beacon",
    "yeti",
  ],
  right: [
    "party",
    "arena",
    "parade",
    "circus",
    "brigade",
    "factory",
    "club",
    "shack",
    "station",
    "camp",
    "den",
    "cabinet",
  ],
} as const

function pickRandomNamePart(values: readonly string[], byte: number) {
  return values[byte % values.length]!
}

function createLobbyTitle() {
  const bytes = crypto.getRandomValues(new Uint8Array(3))

  return [
    pickRandomNamePart(LOBBY_NAME_PARTS.left, bytes[0]!),
    pickRandomNamePart(LOBBY_NAME_PARTS.middle, bytes[1]!),
    pickRandomNamePart(LOBBY_NAME_PARTS.right, bytes[2]!),
  ].join("-")
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
  const sortedMembers = [...members].sort((left, right) => left.joinedAt - right.joinedAt)

  if (sortedMembers.length === 0) {
    return null
  }

  const currentMember =
    sortedMembers.find((member) => member.profileId === args.profileId) ?? null
  const labels = getLobbyLabels({
    gameKey: lobby.gameKey,
    rulesetKey: lobby.rulesetKey,
    teamMode: lobby.teamMode,
  })
  const profilesById = await getProfilesByIds(
    ctx,
    sortedMembers.map((member) => member.profileId)
  )

  return {
    canStart:
      lobby.hostProfileId === args.profileId &&
      sortedMembers.length === lobby.maxPlayers &&
      lobby.status === "open" &&
      sortedMembers.every((member) => member.readyState === "ready"),
    currentMemberMatchId: currentMember?.startedMatchId ?? null,
    currentMemberReadyState: currentMember?.readyState ?? null,
    gameLabel: labels.gameLabel,
    lobby,
    modeLabel: labels.modeLabel,
    members: sortedMembers.flatMap((member) => {
      const memberProfile = profilesById.get(member.profileId)

      return memberProfile
        ? [
            {
              isHost: lobby.hostProfileId === member.profileId,
              profile: toPublicProfile(memberProfile),
              readyState: member.readyState,
              startedMatchId: member.startedMatchId ?? null,
            },
          ]
        : []
    }),
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

    if (
      match &&
      match.status === "active" &&
      match.modeKey !== "solo" &&
      participant.status === "active"
    ) {
      const cleaned = await cleanupStaleActiveMatch(ctx, {
        match,
        participantId: participant._id,
        profileId,
      })

      if (cleaned) {
        continue
      }

      throw new Error("Finish your current multiplayer match before entering a lobby.")
    }
  }
}

async function cleanupStaleActiveMatch(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    participantId: Id<"matchParticipants">
    profileId: Id<"profiles">
  }
) {
  const lobby = args.match.lobbyId ? await ctx.db.get(args.match.lobbyId) : null
  const lobbyMembers = args.match.lobbyId
    ? await ctx.db
        .query("lobbyMembers")
        .withIndex("by_lobbyId", (query) => query.eq("lobbyId", args.match.lobbyId!))
        .take(8)
    : []
  const isStillInLobby = lobbyMembers.some((member) => member.profileId === args.profileId)

  if (isStillInLobby && lobby?.status !== "closed" && lobbyMembers.length > 0) {
    return false
  }

  await abandonMatchParticipation(ctx, {
    match: args.match,
    participantId: args.participantId,
  })

  return true
}

async function abandonMatchParticipation(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    participantId: Id<"matchParticipants">
  }
) {
  const now = Date.now()

  await ctx.db.patch(args.participantId, {
    finishedAt: now,
    status: "eliminated",
  })

  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)
  const hasActiveParticipants = participants.some(
    (participant) =>
      participant._id !== args.participantId && participant.status === "active"
  )

  if (args.match.status !== "active" || !hasActiveParticipants) {
    await ctx.db.patch(args.match._id, {
      completedAt: now,
      outcome: "abandoned",
      status: "cancelled",
    })

    const refreshedMatch = await ctx.db.get(args.match._id)

    if (refreshedMatch) {
      await recordCompletedRunsForMatch(ctx, refreshedMatch)
      await purgeMatchEvents(ctx, refreshedMatch)
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
        const sortedMembers = [...members].sort((left, right) => left.joinedAt - right.joinedAt)

        if (sortedMembers.length === 0) {
          return null
        }
        const labels = getLobbyLabels({
          gameKey: lobby.gameKey,
          rulesetKey: lobby.rulesetKey,
          teamMode: lobby.teamMode,
        })
        const profilesById = await getProfilesByIds(
          ctx,
          sortedMembers.map((member) => member.profileId)
        )

        return {
          _id: lobby._id,
          boardKey: buildBoardKey(lobby.boardConfig),
          gameKey: lobby.gameKey,
          gameLabel: labels.gameLabel,
          maxPlayers: lobby.maxPlayers,
          memberCount: sortedMembers.length,
          members: sortedMembers.flatMap((member) => {
            const profile = profilesById.get(member.profileId)

            return profile ? [toPublicProfile(profile)] : []
          }),
          modeLabel: labels.modeLabel,
          slots: `${sortedMembers.length}/${lobby.maxPlayers}`,
          title: lobby.title,
          visibility: lobby.visibility,
        }
      })
    ).then((rows) => rows.filter((row) => row !== null))
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

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx)
    const memberships = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .take(12)

    const lobbies = await Promise.all(
      memberships.map((membership) =>
        buildLobbyState(ctx, {
          lobbyId: membership.lobbyId,
          profileId: profile._id,
        })
      )
    )

    return lobbies
      .filter((lobby) => lobby !== null)
      .sort((left, right) => right.lobby.updatedAt - left.lobby.updatedAt)
  },
})

export const create = mutation({
  args: {
    difficulty: v.optional(v.string()),
    gameKey: v.union(v.literal("minesweeper"), v.literal("sudoku")),
    mode: v.union(v.literal("race"), v.literal("coop")),
    presetKey: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    await assertAvailableForLobby(ctx, profile._id)

    const now = Date.now()
    let boardConfig: {
      width: number
      height: number
      mineCount?: number
    }
    let rulesetKey: string
    let scoreConfig: {
      scoringKey: string
      timeLimitSeconds: number | null
      maxMistakes: number | null
    }
    if (args.gameKey === "sudoku") {
      const difficulty = (args.difficulty ?? "medium") as SudokuDifficulty

      boardConfig = { width: 9, height: 9 }
      rulesetKey = `sudoku:${args.mode}:${difficulty}`
      scoreConfig = {
        scoringKey: "time_asc",
        timeLimitSeconds: null,
        maxMistakes: null,
      }
    } else {
      const selection = resolveSoloMinesweeperSelection({
        presetKey: (args.presetKey as
          | "beginner"
          | "intermediate"
          | "expert"
          | "custom"
          | undefined) ?? "beginner",
      })
      const validation = validateBoardConfig(selection.ruleset.boardConfig)

      if (!validation.ok || validation.normalizedMineCount === undefined) {
        throw new Error(validation.errors.join(" "))
      }

      boardConfig = {
        ...selection.ruleset.boardConfig,
        mineCount: validation.normalizedMineCount,
      }
      rulesetKey = `minesweeper:${args.mode}:${selection.presetKey}`
      scoreConfig = {
        scoringKey: "time_asc",
        timeLimitSeconds: null,
        maxMistakes: 0,
      }
    }

    const lobbyId = await ctx.db.insert("lobbies", {
      title: createLobbyTitle(),
      hostProfileId: profile._id,
      gameKey: args.gameKey,
      modeKey: args.mode,
      rulesetKey,
      ranked: false,
      teamMode: args.mode,
      boardConfig,
      scoreConfig,
      visibility: args.visibility,
      maxPlayers: 2,
      allowFriendsOnly: args.visibility === "private",
      code: createLobbyCode(),
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

export const joinByCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const existingLobby = await findActiveLobbyMembership(ctx, profile._id)
    const normalizedCode = args.code.trim().toUpperCase()
    const lobby = await ctx.db
      .query("lobbies")
      .withIndex("by_code", (query) => query.eq("code", normalizedCode))
      .unique()

    if (!lobby || lobby.status !== "open") {
      throw new Error("Room code is not valid.")
    }

    if (existingLobby) {
      if (existingLobby.lobby._id === lobby._id) {
        return null
      }

      throw new Error("Leave your current lobby before joining another one.")
    }

    await assertAvailableForLobby(ctx, profile._id)

    const members = await ctx.db
      .query("lobbyMembers")
      .withIndex("by_lobbyId", (query) => query.eq("lobbyId", lobby._id))
      .take(8)

    if (members.some((member) => member.profileId === profile._id)) {
      return null
    }

    if (members.length >= lobby.maxPlayers) {
      throw new Error("Room is full.")
    }

    await ctx.db.insert("lobbyMembers", {
      lobbyId: lobby._id,
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

    if (currentMember.startedMatchId) {
      const participant = await ctx.db
        .query("matchParticipants")
        .withIndex("by_matchId", (query) => query.eq("matchId", currentMember.startedMatchId!))
        .filter((query) => query.eq(query.field("profileId"), profile._id))
        .unique()
      const startedMatch = await ctx.db.get(currentMember.startedMatchId)

      if (
        participant &&
        startedMatch &&
        (participant.status === "active" || participant.status === "pending")
      ) {
        await abandonMatchParticipation(ctx, {
          match: startedMatch,
          participantId: participant._id,
        })
      }
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

    if (members.length !== lobby.maxPlayers) {
      throw new Error("Both players need to join before you can start.")
    }

    if (members.some((member) => member.readyState !== "ready")) {
      throw new Error("All joined players must be ready before the host can start.")
    }

    await ctx.db.patch(lobby._id, {
      status: "starting",
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.multiplayer.startLobbyMatch, {
      lobbyId: args.lobbyId,
    })

    return {
      matchId: null,
    }
  },
})
