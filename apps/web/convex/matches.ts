import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { buildBoardKey } from "@workspace/game-core"
import type { MinesweeperRulesetConfig } from "@workspace/game-contracts"
import { validateBoardConfig } from "@workspace/minesweeper-engine"
import {
  chordCell,
  createBoard,
  createPlayerStateForCellCount,
  revealCell,
  toggleFlag as toggleFlagCell,
  type MinesweeperBoardState,
  type MinesweeperPlayerState,
} from "@workspace/minesweeper-engine"
import { ensureLeaderboardCategory, writeLeaderboardEntryIfNeeded } from "./leaderboards"
import { resolveSoloMinesweeperSelection } from "./minesweeper"
import { requireProfile, serializeJson } from "./lib"

function createSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildBoardState(match: Doc<"matches">, soloMatch: Doc<"minesweeperMatches">) {
  if (!soloMatch.boardCells) {
    return null
  }

  const mineCount =
    match.boardConfig.mineCount ??
    Math.floor(
      match.boardConfig.width * match.boardConfig.height * (match.boardConfig.density ?? 0)
    )

  return {
    width: match.boardConfig.width,
    height: match.boardConfig.height,
    mineCount,
    seed: match.seed,
    cells: soloMatch.boardCells,
  } satisfies MinesweeperBoardState
}

function buildPlayerState(row: Doc<"minesweeperPlayerStates">): MinesweeperPlayerState {
  return {
    visible: row.visible,
    flagsUsed: row.flagsUsed,
    revealedCount: row.revealedCount,
    mistakes: row.mistakes,
    alive: row.alive,
    finishedAt: row.finishedAt ?? null,
  }
}

function getEffectiveTimerStartAt(
  soloMatch: Doc<"minesweeperMatches">,
) {
  if (typeof soloMatch.activatedAt === "number") {
    return soloMatch.activatedAt
  }

  return null
}

function getMinesweeperRuleset(soloMatch: Doc<"minesweeperMatches">) {
  if (soloMatch.ruleset.gameKey !== "minesweeper") {
    throw new Error("Unexpected ruleset.")
  }

  return soloMatch.ruleset as MinesweeperRulesetConfig
}

function buildPublicMatchState(args: {
  match: Doc<"matches">
  soloMatch: Doc<"minesweeperMatches">
  playerState: Doc<"minesweeperPlayerStates">
}) {
  const board = buildBoardState(args.match, args.soloMatch)
  const cellCount = args.match.boardConfig.width * args.match.boardConfig.height
  const boardKey = buildBoardKey(args.match.boardConfig)
  const timerStartedAt = getEffectiveTimerStartAt(args.soloMatch)

  return {
    matchId: args.match._id,
    boardKey,
    ranked: args.match.ranked,
    rulesetKey: args.match.rulesetKey,
    status: args.match.status,
    outcome: args.match.outcome ?? null,
    startedAt: args.match.startedAt,
    timerStartedAt,
    completedAt: args.match.completedAt ?? null,
    durationMs: args.match.durationMs ?? null,
    board: {
      width: args.match.boardConfig.width,
      height: args.match.boardConfig.height,
      mineCount:
        args.match.boardConfig.mineCount ??
        Math.floor(
          args.match.boardConfig.width *
            args.match.boardConfig.height *
            (args.match.boardConfig.density ?? 0)
        ),
      cells: Array.from({ length: cellCount }, (_, index) => {
        const visible = args.playerState.visible[index]
        const hiddenCell = board?.cells[index]
        const revealAll = args.match.status === "finished"
        const revealed = visible?.revealed ?? false
        const shouldShowHidden = revealAll || revealed

        return {
          revealed,
          flagged: visible?.flagged ?? false,
          exploded: visible?.exploded ?? false,
          adjacentMines:
            shouldShowHidden && hiddenCell && !hiddenCell.isMine
              ? hiddenCell.adjacentMines
              : null,
          isMine: shouldShowHidden && hiddenCell ? hiddenCell.isMine : null,
        }
      }),
    },
    stats: {
      flagsUsed: args.playerState.flagsUsed,
      revealedCount: args.playerState.revealedCount,
      mistakes: args.playerState.mistakes,
    },
  }
}

async function ensureTimerActivated(
  ctx: MutationCtx,
  soloMatch: Doc<"minesweeperMatches">
) {
  if (typeof soloMatch.activatedAt === "number") {
    return soloMatch.activatedAt
  }

  const now = Date.now()
  await ctx.db.patch(soloMatch._id, {
    activatedAt: now,
    lastActionAt: now,
  })

  return now
}

async function getActiveLobbyForProfile(
  ctx: MutationCtx,
  profileId: Id<"profiles">
) {
  const memberships = await ctx.db
    .query("lobbyMembers")
    .withIndex("by_profileId", (query) => query.eq("profileId", profileId))
    .take(8)

  for (const membership of memberships) {
    const lobby = await ctx.db.get(membership.lobbyId)

    if (lobby && lobby.status !== "closed") {
      return lobby
    }
  }

  return null
}

export async function createSoloMatchForProfile(
  ctx: MutationCtx,
  args: {
    profileId: Id<"profiles">
    createdByProfileId: Id<"profiles">
    rulesetKey: string
    boardKey: string
    ranked: boolean
    boardConfig: Doc<"matches">["boardConfig"]
    scoreConfig: Doc<"matches">["scoreConfig"]
    ruleset: MinesweeperRulesetConfig
    presetKey: string
    lobbyId?: Id<"lobbies">
  }
) {
  const now = Date.now()
  const seed = createSeed()
  const matchId = await ctx.db.insert("matches", {
    lobbyId: args.lobbyId,
    createdByProfileId: args.createdByProfileId,
    gameKey: "minesweeper",
    modeKey: "solo",
    rulesetKey: args.rulesetKey,
    ranked: args.ranked,
    teamMode: "solo",
    boardConfig: args.boardConfig,
    scoreConfig: args.scoreConfig,
    visibility: "private",
    status: "active",
    seed,
    startedAt: now,
  })

  const participantId = await ctx.db.insert("matchParticipants", {
    matchId,
    profileId: args.profileId,
    status: "active",
  })

  await ensureLeaderboardCategory(ctx, args.ruleset, args.rulesetKey)
  await ctx.db.insert("minesweeperMatches", {
    matchId,
    ruleset: args.ruleset,
    sharedBoard: false,
    sharedLossRule: "single_life",
    createdAt: now,
  })
  const initialPlayerState = createPlayerStateForCellCount(
    args.boardConfig.width * args.boardConfig.height
  )

  await ctx.db.insert("minesweeperPlayerStates", {
    matchId,
    profileId: args.profileId,
    visible: initialPlayerState.visible,
    flagsUsed: initialPlayerState.flagsUsed,
    revealedCount: initialPlayerState.revealedCount,
    mistakes: initialPlayerState.mistakes,
    alive: initialPlayerState.alive,
    updatedAt: now,
  })
  await ctx.db.insert("minesweeperEvents", {
    matchId,
    profileId: args.profileId,
    type: "match_created",
    payload: serializeJson({
      presetKey: args.presetKey,
      boardKey: args.boardKey,
      participantId,
      source: args.lobbyId ? "lobby" : "solo",
    }),
    createdAt: now,
  })

  return { matchId, participantId }
}

async function getSoloMatchContext(ctx: MutationCtx | QueryCtx, matchId: Id<"matches">) {
  const { profile } = await requireProfile(ctx)
  const match = await ctx.db.get(matchId)

  if (!match || match.gameKey !== "minesweeper" || match.modeKey !== "solo") {
    throw new Error("Solo Minesweeper match not found.")
  }

  const participant = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .unique()

  if (!participant || participant.profileId !== profile._id) {
    throw new Error("You do not have access to this match.")
  }

  const soloMatch = await ctx.db
    .query("minesweeperMatches")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .unique()
  const playerStates = await ctx.db
    .query("minesweeperPlayerStates")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .take(8)
  const playerState = playerStates.find((row) => row.profileId === profile._id) ?? null

  if (!soloMatch || !playerState) {
    throw new Error("Match state is incomplete.")
  }

  return { profile, match, participant, soloMatch, playerState }
}

async function materializeBoard(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    soloMatch: Doc<"minesweeperMatches">
    firstClickIndex: number
  }
) {
  const existingBoard = buildBoardState(args.match, args.soloMatch)

  if (existingBoard) {
    return existingBoard
  }

  await ensureTimerActivated(ctx, args.soloMatch)
  const board = createBoard(args.match.boardConfig, args.match.seed, {
    firstClickIndex: args.firstClickIndex,
    firstClickBehavior: getMinesweeperRuleset(args.soloMatch).gameConfig.firstClickBehavior,
  })

  await ctx.db.patch(args.soloMatch._id, {
    boardCells: board.cells,
    activatedAt: Date.now(),
    lastActionAt: Date.now(),
  })

  return board
}

function assertActionable(match: Doc<"matches">, index: number) {
  const cellCount = match.boardConfig.width * match.boardConfig.height

  if (!Number.isInteger(index) || index < 0 || index >= cellCount) {
    throw new Error("Invalid cell index.")
  }

  if (match.status === "finished" || match.status === "cancelled") {
    throw new Error("Match already ended.")
  }
}

async function finalizeIfNeeded(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    participant: Doc<"matchParticipants">
    soloMatch: Doc<"minesweeperMatches">
    playerStateRow: Doc<"minesweeperPlayerStates">
    nextPlayerState: MinesweeperPlayerState
    exploded: boolean
    won: boolean
  }
) {
  const now = Date.now()

  await ctx.db.patch(args.playerStateRow._id, {
    visible: args.nextPlayerState.visible,
    flagsUsed: args.nextPlayerState.flagsUsed,
    revealedCount: args.nextPlayerState.revealedCount,
    mistakes: args.nextPlayerState.mistakes,
    alive: args.nextPlayerState.alive,
    finishedAt: args.exploded || args.won ? now : undefined,
    updatedAt: now,
  })

  await ctx.db.patch(args.soloMatch._id, {
    lastActionAt: now,
  })

  if (!args.exploded && !args.won) {
    return
  }

  const completedAt = now
  const durationStartAt = getEffectiveTimerStartAt(args.soloMatch) ?? completedAt
  const durationMs = completedAt - durationStartAt
  const outcome = args.won ? "won" : "lost"

  await ctx.db.patch(args.match._id, {
    status: "finished",
    outcome,
    durationMs,
    completedAt,
  })
  await ctx.db.patch(args.participant._id, {
    placement: 1,
    scorePrimary: args.won ? durationMs : undefined,
    status: args.won ? "finished" : "eliminated",
    finishedAt: completedAt,
  })

  const refreshedMatch = await ctx.db.get(args.match._id)
  const refreshedParticipant = await ctx.db.get(args.participant._id)

  if (
    refreshedMatch &&
    refreshedParticipant &&
    refreshedMatch.gameKey === "minesweeper"
  ) {
    await writeLeaderboardEntryIfNeeded(ctx, {
      match: refreshedMatch,
      participant: refreshedParticipant,
      ruleset: getMinesweeperRuleset(args.soloMatch),
    })
  }
}

export const createSoloMatch = mutation({
  args: {
    presetKey: v.optional(v.string()),
    boardConfig: v.optional(
      v.object({
        width: v.number(),
        height: v.number(),
        mineCount: v.optional(v.number()),
        density: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const activeLobby = await getActiveLobbyForProfile(ctx, profile._id)

    if (activeLobby) {
      throw new Error("Leave your current lobby before starting a solo match.")
    }

    const selection = resolveSoloMinesweeperSelection({
      presetKey: (args.presetKey as "beginner" | "intermediate" | "expert" | "custom" | undefined) ??
        undefined,
      boardConfig: args.boardConfig,
    })
    const validation = validateBoardConfig(selection.ruleset.boardConfig)

    if (!validation.ok || validation.normalizedMineCount === undefined) {
      throw new Error(validation.errors.join(" "))
    }

    const matchConfig = {
      boardConfig: {
        ...selection.ruleset.boardConfig,
        mineCount: validation.normalizedMineCount,
      },
      scoreConfig: selection.ruleset.scoreConfig,
    }

    const created = await createSoloMatchForProfile(ctx, {
      profileId: profile._id,
      createdByProfileId: profile._id,
      rulesetKey: selection.rulesetKey,
      boardKey: selection.boardKey,
      ranked: selection.ruleset.ranked,
      boardConfig: matchConfig.boardConfig,
      scoreConfig: matchConfig.scoreConfig,
      ruleset: {
        ...selection.ruleset,
        boardConfig: matchConfig.boardConfig,
      },
      presetKey: args.presetKey ?? "custom",
    })

    const createdMatch = await getSoloMatchContext(ctx, created.matchId)
    return buildPublicMatchState({
      match: createdMatch.match,
      soloMatch: createdMatch.soloMatch,
      playerState: createdMatch.playerState,
    })
  },
})

export const getCurrentState = query({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const result = await getSoloMatchContext(ctx, args.matchId)

    return buildPublicMatchState({
      match: result.match,
      soloMatch: result.soloMatch,
      playerState: result.playerState,
    })
  },
})

export const getLatestActiveSoloMatch = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx)
    const participants = await ctx.db
      .query("matchParticipants")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .order("desc")
      .take(12)

    for (const participant of participants) {
      const match = await ctx.db.get(participant.matchId)

      if (
        match &&
        match.gameKey === "minesweeper" &&
        match.modeKey === "solo" &&
        match.status === "active"
      ) {
        const result = await getSoloMatchContext(ctx, match._id)

        return buildPublicMatchState({
          match: result.match,
          soloMatch: result.soloMatch,
          playerState: result.playerState,
        })
      }
    }

    return null
  },
})

export const reveal = mutation({
  args: {
    matchId: v.id("matches"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await getSoloMatchContext(ctx, args.matchId)
    assertActionable(result.match, args.index)
    await ensureTimerActivated(ctx, result.soloMatch)

    const board = await materializeBoard(ctx, {
      match: result.match,
      soloMatch: result.soloMatch,
      firstClickIndex: args.index,
    })
    const nextPlayerState = buildPlayerState(result.playerState)
    const revealResult = revealCell(board, nextPlayerState, args.index)

    await ctx.db.insert("minesweeperEvents", {
      matchId: result.match._id,
      profileId: result.profile._id,
      type: "reveal",
      payload: serializeJson({
        index: args.index,
        changedIndices: revealResult.result.changedIndices,
        exploded: revealResult.result.exploded,
      }),
      createdAt: Date.now(),
    })

    await finalizeIfNeeded(ctx, {
      match: result.match,
      participant: result.participant,
      soloMatch: result.soloMatch,
      playerStateRow: result.playerState,
      nextPlayerState: revealResult.playerState,
      exploded: revealResult.result.exploded,
      won: revealResult.result.won,
    })

    const refreshed = await getSoloMatchContext(ctx, args.matchId)

    return buildPublicMatchState({
      match: refreshed.match,
      soloMatch: refreshed.soloMatch,
      playerState: refreshed.playerState,
    })
  },
})

export const toggleFlag = mutation({
  args: {
    matchId: v.id("matches"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await getSoloMatchContext(ctx, args.matchId)
    assertActionable(result.match, args.index)
    await ensureTimerActivated(ctx, result.soloMatch)
    const nextPlayerState = toggleFlagCell(buildPlayerState(result.playerState), args.index)
    const now = Date.now()

    await ctx.db.patch(result.playerState._id, {
      visible: nextPlayerState.visible,
      flagsUsed: nextPlayerState.flagsUsed,
      revealedCount: nextPlayerState.revealedCount,
      mistakes: nextPlayerState.mistakes,
      alive: nextPlayerState.alive,
      updatedAt: now,
    })
    await ctx.db.patch(result.soloMatch._id, {
      lastActionAt: now,
    })
    await ctx.db.insert("minesweeperEvents", {
      matchId: result.match._id,
      profileId: result.profile._id,
      type: "toggle_flag",
      payload: serializeJson({
        index: args.index,
        flagged: nextPlayerState.visible[args.index]?.flagged ?? false,
      }),
      createdAt: now,
    })

    const refreshed = await getSoloMatchContext(ctx, args.matchId)

    return buildPublicMatchState({
      match: refreshed.match,
      soloMatch: refreshed.soloMatch,
      playerState: refreshed.playerState,
    })
  },
})

export const chord = mutation({
  args: {
    matchId: v.id("matches"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await getSoloMatchContext(ctx, args.matchId)
    assertActionable(result.match, args.index)
    await ensureTimerActivated(ctx, result.soloMatch)
    const board = buildBoardState(result.match, result.soloMatch)

    if (!board) {
      return buildPublicMatchState({
        match: result.match,
        soloMatch: result.soloMatch,
        playerState: result.playerState,
      })
    }

    const nextPlayerState = buildPlayerState(result.playerState)
    const chordResult = chordCell(board, nextPlayerState, args.index)

    await ctx.db.insert("minesweeperEvents", {
      matchId: result.match._id,
      profileId: result.profile._id,
      type: "chord",
      payload: serializeJson({
        index: args.index,
        changedIndices: chordResult.result.changedIndices,
        exploded: chordResult.result.exploded,
      }),
      createdAt: Date.now(),
    })

    await finalizeIfNeeded(ctx, {
      match: result.match,
      participant: result.participant,
      soloMatch: result.soloMatch,
      playerStateRow: result.playerState,
      nextPlayerState: chordResult.playerState,
      exploded: chordResult.result.exploded,
      won: chordResult.result.won,
    })

    const refreshed = await getSoloMatchContext(ctx, args.matchId)

    return buildPublicMatchState({
      match: refreshed.match,
      soloMatch: refreshed.soloMatch,
      playerState: refreshed.playerState,
    })
  },
})
