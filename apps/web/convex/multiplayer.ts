import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, mutation, query } from "./_generated/server"
import { buildBoardKey } from "@workspace/game-core"
import type {
  MinesweeperRulesetConfig,
  SudokuRulesetConfig,
} from "@workspace/game-contracts"
import {
  chordCell,
  createBoard,
  createPlayerStateForCellCount,
  revealCell,
  toggleFlag as toggleFlagCell,
  validateBoardConfig,
  type MinesweeperBoardState,
  type MinesweeperPlayerState,
} from "@workspace/minesweeper-engine"
import {
  clearCellValue,
  createSudokuGame,
  getRelatedIndices,
  createSudokuPuzzle,
  isSudokuSolved,
  setCellValue,
  type SudokuDifficulty,
  type SudokuGameState,
} from "@workspace/sudoku-engine"
import { purgeMatchEvents, recordCompletedRunsForMatch } from "./history"
import { ensureLeaderboardCategory, writeLeaderboardEntryIfNeeded } from "./leaderboards"
import { parseJson, requireProfile, serializeJson, toPublicProfile } from "./lib"
import {
  createSudokuCatalogSeed,
  getRandomExtremeValidSeed,
} from "./sudokuSeeds"

const COUNTDOWN_MS = 3000
const EMPTY_SUDOKU_NOTES = Array.from({ length: 81 }, () => [] as number[])
const EMPTY_SUDOKU_VALUE_OWNERS = Array.from(
  { length: 81 },
  () => null as Id<"profiles"> | null
)

type CoopValueMoveEvent = {
  index: number
  nextOwner: Id<"profiles"> | null
  nextValue: number
  previousOwner: Id<"profiles"> | null
  previousValue: number
}

type RaceValueMoveEvent = {
  index: number
  nextValue: number
  previousValue: number
}

function createSeed() {
  return crypto.randomUUID()
}

function createSudokuMatchSeed() {
  return createSudokuCatalogSeed()
}

function buildMinesweeperRuleset(args: {
  boardConfig: Doc<"matches">["boardConfig"]
  teamMode: "race" | "coop"
}): MinesweeperRulesetConfig {
  return {
    gameKey: "minesweeper",
    modeKey: args.teamMode,
    ranked: false,
    teamMode: args.teamMode,
    boardConfig: args.boardConfig,
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

function buildSudokuRuleset(args: {
  difficulty: SudokuDifficulty
  teamMode: "race" | "coop"
}): SudokuRulesetConfig {
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

function getMinesweeperLeaderboardRuleset(multiplayerMatch: Doc<"minesweeperMatches">) {
  if (multiplayerMatch.ruleset.gameKey !== "minesweeper") {
    throw new Error("Unexpected Minesweeper ruleset.")
  }

  return multiplayerMatch.ruleset as MinesweeperRulesetConfig
}

function getSudokuLeaderboardRuleset(sudokuMatch: Doc<"sudokuMatches">) {
  if (sudokuMatch.ruleset.gameKey !== "sudoku") {
    throw new Error("Unexpected Sudoku ruleset.")
  }

  return sudokuMatch.ruleset as SudokuRulesetConfig
}

function createSudokuNotesState() {
  return EMPTY_SUDOKU_NOTES.map((notes) => [...notes])
}

function createSudokuValueOwnersState() {
  return EMPTY_SUDOKU_VALUE_OWNERS.map((owner) => owner)
}

function noteMarksToNotes(noteMarks: Array<Array<{ digit: number }>>) {
  return noteMarks.map((cellNotes) =>
    [...cellNotes].map((note) => note.digit).sort((left, right) => left - right)
  )
}

function createSudokuNoteMarksState() {
  return EMPTY_SUDOKU_NOTES.map(() => [] as Array<{
    digit: number
    profileId: Id<"profiles">
  }>)
}

function inflateSudokuGame(args: {
  givens: number[]
  noteMarks: Array<Array<{ digit: number; profileId: Id<"profiles"> }>>
  solution: number[]
  values: number[]
  difficulty: SudokuDifficulty
}): SudokuGameState {
  const notes = noteMarksToNotes(args.noteMarks)
  const puzzle = {
    difficulty: args.difficulty,
    seed: "multiplayer",
    givens: args.givens,
    solution: args.solution,
    clueCount: args.givens.filter((value) => value !== 0).length,
  }

  return {
    puzzle,
    cells: args.values.map((value, index) => ({
      value,
      fixed: args.givens[index] !== 0,
      notes: [...(notes[index] ?? [])] as never,
    })),
  }
}

function clearDigitFromRelatedNoteMarks(args: {
  index: number
  noteMarks: Array<Array<{ digit: number; profileId: Id<"profiles"> }>>
  solution: number[]
  value: number
}) {
  const related = new Set(getRelatedIndices(args.index))

  return args.noteMarks.map((cellNotes, cellIndex) => {
    if (cellIndex === args.index) {
      return []
    }

    if (args.value <= 0 || args.solution[args.index] !== args.value || !related.has(cellIndex)) {
      return cellNotes
    }

    return cellNotes.filter((note) => note.digit !== args.value)
  })
}

function clearDigitFromRelatedNotes(args: {
  index: number
  notes: number[][]
  solution: number[]
  value: number
}) {
  const related = new Set(getRelatedIndices(args.index))

  return args.notes.map((cellNotes, cellIndex) => {
    if (cellIndex === args.index) {
      return []
    }

    if (args.value <= 0 || args.solution[args.index] !== args.value || !related.has(cellIndex)) {
      return cellNotes
    }

    return cellNotes.filter((note) => note !== args.value)
  })
}

function getMatchCountdownState(match: Doc<"matches">) {
  const remainingMs = Math.max(0, match.startedAt - Date.now())

  return {
    countdownEndsAt: match.startedAt,
    hasStarted: remainingMs === 0,
    remainingMs,
  }
}

function buildMinesweeperBoardState(
  match: Doc<"matches">,
  multiplayerMatch: Doc<"minesweeperMatches">
) {
  if (!multiplayerMatch.boardCells) {
    return null
  }

  return {
    width: match.boardConfig.width,
    height: match.boardConfig.height,
    mineCount: match.boardConfig.mineCount ?? 0,
    seed: match.seed,
    cells: multiplayerMatch.boardCells,
  } satisfies MinesweeperBoardState
}

function buildVisibleMinesweeperCells(args: {
  board: MinesweeperBoardState | null
  match: Doc<"matches">
  playerState:
    | Doc<"minesweeperPlayerStates">
    | Doc<"minesweeperSharedStates">
}) {
  const revealAll =
    args.match.status === "finished" ||
    args.match.status === "cancelled" ||
    typeof args.playerState.finishedAt === "number"
  const cellCount = args.match.boardConfig.width * args.match.boardConfig.height

  return Array.from({ length: cellCount }, (_, index) => {
    const visible = args.playerState.visible[index]
    const hiddenCell = args.board?.cells[index]
    const revealed = visible?.revealed ?? false
    const shouldShowHidden = revealAll || revealed

    return {
      adjacentMines:
        shouldShowHidden && hiddenCell && !hiddenCell.isMine ? hiddenCell.adjacentMines : null,
      exploded: visible?.exploded ?? false,
      flagged: visible?.flagged ?? false,
      isMine: shouldShowHidden && hiddenCell ? hiddenCell.isMine : null,
      revealed,
    }
  })
}

function ensureMatchStarted(match: Doc<"matches">) {
  if (Date.now() < match.startedAt) {
    throw new Error("Countdown is still in progress.")
  }
}

async function getParticipantProfiles(
  ctx: MutationCtx | QueryCtx,
  participants: Doc<"matchParticipants">[]
) {
  return Promise.all(
    participants.map(async (participant) => {
      const profile = await ctx.db.get(participant.profileId)
      return profile
        ? {
            participant,
            profile: toPublicProfile(profile),
          }
        : null
    })
  ).then((rows) => rows.filter((row) => row !== null))
}

export async function createMinesweeperLobbyMatch(
  ctx: MutationCtx,
  args: {
    createdByProfileId: Id<"profiles">
    lobby: Doc<"lobbies">
    members: Doc<"lobbyMembers">[]
  }
) {
  const validation = validateBoardConfig(args.lobby.boardConfig)

  if (!validation.ok || validation.normalizedMineCount === undefined) {
    throw new Error(validation.errors.join(" "))
  }

  const now = Date.now()
  const boardConfig = {
    ...args.lobby.boardConfig,
    mineCount: validation.normalizedMineCount,
  }
  const ruleset = buildMinesweeperRuleset({
    boardConfig,
    teamMode: args.lobby.teamMode as "race" | "coop",
  })
  const matchId = await ctx.db.insert("matches", {
    lobbyId: args.lobby._id,
    createdByProfileId: args.createdByProfileId,
    gameKey: "minesweeper",
    modeKey: args.lobby.teamMode,
    rulesetKey: args.lobby.rulesetKey,
    ranked: false,
    teamMode: args.lobby.teamMode,
    boardConfig,
    scoreConfig: args.lobby.scoreConfig,
    visibility: "private",
    status: "active",
    seed: createSeed(),
    startedAt: now + COUNTDOWN_MS,
  })

  await ctx.db.insert("minesweeperMatches", {
    matchId,
    ruleset,
    sharedBoard: args.lobby.teamMode === "coop",
    sharedLossRule: args.lobby.teamMode === "coop" ? "team_wipe" : "single_life",
    createdAt: now,
  })
  await ensureLeaderboardCategory(ctx, ruleset, args.lobby.rulesetKey)

  const basePlayerState = createPlayerStateForCellCount(
    boardConfig.width * boardConfig.height
  )

  if (args.lobby.teamMode === "coop") {
    await ctx.db.insert("minesweeperSharedStates", {
      matchId,
      alive: true,
      flagsUsed: basePlayerState.flagsUsed,
      finishedAt: undefined,
      mistakes: basePlayerState.mistakes,
      revealedCount: basePlayerState.revealedCount,
      updatedAt: now,
      visible: basePlayerState.visible,
    })
  } else {
    for (const member of args.members) {
      await ctx.db.insert("minesweeperPlayerStates", {
        matchId,
        profileId: member.profileId,
        alive: true,
        flagsUsed: basePlayerState.flagsUsed,
        finishedAt: undefined,
        mistakes: basePlayerState.mistakes,
        revealedCount: basePlayerState.revealedCount,
        updatedAt: now,
        visible: basePlayerState.visible,
      })
    }
  }

  for (const member of args.members) {
    await ctx.db.insert("matchParticipants", {
      matchId,
      profileId: member.profileId,
      status: "active",
    })
  }

  await ctx.db.insert("minesweeperEvents", {
    matchId,
    profileId: args.createdByProfileId,
    type: "match_created",
    payload: serializeJson({
      boardKey: buildBoardKey(boardConfig),
      lobbyId: args.lobby._id,
      teamMode: args.lobby.teamMode,
    }),
    createdAt: now,
  })

  return { matchId }
}

export async function createSudokuLobbyMatch(
  ctx: MutationCtx,
  args: {
    createdByProfileId: Id<"profiles">
    difficulty: SudokuDifficulty
    lobby: Doc<"lobbies">
    members: Doc<"lobbyMembers">[]
  }
) {
  const now = Date.now()
  const puzzle =
    args.lobby.teamMode === "race" && args.difficulty === "haaard"
      ? await (async () => {
          const catalogSeed = await getRandomExtremeValidSeed(ctx)

          if (!catalogSeed) {
            throw new Error("No saved Extreme race seeds are available yet.")
          }

          return {
            clueCount: catalogSeed.clueCount,
            difficulty: catalogSeed.difficulty,
            givens: catalogSeed.givens,
            seed: catalogSeed.seed,
            solution: catalogSeed.solution,
          }
        })()
      : createSudokuPuzzle(args.difficulty, createSudokuMatchSeed())
  const baseGame = createSudokuGame(puzzle)
  const ruleset = buildSudokuRuleset({
    difficulty: args.difficulty,
    teamMode: args.lobby.teamMode as "race" | "coop",
  })
  const matchId = await ctx.db.insert("matches", {
    lobbyId: args.lobby._id,
    createdByProfileId: args.createdByProfileId,
    gameKey: "sudoku",
    modeKey: args.lobby.teamMode,
    rulesetKey: args.lobby.rulesetKey,
    ranked: false,
    teamMode: args.lobby.teamMode,
    boardConfig: args.lobby.boardConfig,
    scoreConfig: args.lobby.scoreConfig,
    visibility: "private",
    status: "active",
    seed: puzzle.seed,
    startedAt: now + COUNTDOWN_MS,
  })

  await ctx.db.insert("sudokuMatches", {
    matchId,
    ruleset,
    difficulty: args.difficulty,
    puzzleGivens: puzzle.givens,
    sharedBoard: args.lobby.teamMode === "coop",
    solution: puzzle.solution,
    createdAt: now,
  })
  await ensureLeaderboardCategory(ctx, ruleset, args.lobby.rulesetKey)

  const values = baseGame.cells.map((cell) => cell.value)

  if (args.lobby.teamMode === "coop") {
    await ctx.db.insert("sudokuSharedStates", {
      matchId,
      finishedAt: undefined,
      noteMarks: createSudokuNoteMarksState(),
      updatedAt: now,
      valueOwners: createSudokuValueOwnersState(),
      values,
    })
  } else {
    for (const member of args.members) {
      await ctx.db.insert("sudokuPlayerStates", {
        matchId,
        profileId: member.profileId,
        finishedAt: undefined,
        notes: createSudokuNotesState(),
        updatedAt: now,
        values,
      })
    }
  }

  for (const member of args.members) {
    await ctx.db.insert("matchParticipants", {
      matchId,
      profileId: member.profileId,
      status: "active",
    })

    await ctx.db.insert("sudokuPresences", {
      focuses: [],
      highlight: undefined,
      matchId,
      profileId: member.profileId,
      selectedIndex: undefined,
      updatedAt: now,
    })
  }

  await ctx.db.insert("sudokuEvents", {
    matchId,
    profileId: args.createdByProfileId,
    type: "match_created",
    payload: serializeJson({
      difficulty: args.difficulty,
      lobbyId: args.lobby._id,
      teamMode: args.lobby.teamMode,
    }),
    createdAt: now,
  })

  return { matchId }
}

async function getMinesweeperContext(
  ctx: MutationCtx | QueryCtx,
  matchId: Id<"matches">
) {
  const { profile } = await requireProfile(ctx)
  const match = await ctx.db.get(matchId)

  if (
    !match ||
    match.gameKey !== "minesweeper" ||
    (match.teamMode !== "race" && match.teamMode !== "coop")
  ) {
    throw new Error("Minesweeper match not found.")
  }

  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .take(8)
  const currentParticipant =
    participants.find((participant) => participant.profileId === profile._id) ?? null

  if (!currentParticipant) {
    throw new Error("You do not have access to this match.")
  }

  const multiplayerMatch = await ctx.db
    .query("minesweeperMatches")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .unique()

  if (!multiplayerMatch) {
    throw new Error("Minesweeper state is incomplete.")
  }

  return {
    currentParticipant,
    match,
    multiplayerMatch,
    participants,
    profile,
  }
}

async function materializeMinesweeperBoard(
  ctx: MutationCtx,
  args: {
    firstClickIndex: number
    match: Doc<"matches">
    multiplayerMatch: Doc<"minesweeperMatches">
  }
) {
  const existing = buildMinesweeperBoardState(args.match, args.multiplayerMatch)

  if (existing) {
    return existing
  }

  const board = createBoard(args.match.boardConfig, args.match.seed, {
    firstClickBehavior: "safe_zero",
    firstClickIndex: args.firstClickIndex,
  })

  await ctx.db.patch(args.multiplayerMatch._id, {
    activatedAt: Date.now(),
    boardCells: board.cells,
    lastActionAt: Date.now(),
  })

  return board
}

function assertMinesweeperIndex(match: Doc<"matches">, index: number) {
  const cellCount = match.boardConfig.width * match.boardConfig.height

  if (!Number.isInteger(index) || index < 0 || index >= cellCount) {
    throw new Error("Invalid cell index.")
  }
}

async function buildMinesweeperPublicState(
  ctx: QueryCtx | MutationCtx,
  args: {
    match: Doc<"matches">
    multiplayerMatch: Doc<"minesweeperMatches">
    profileId: Id<"profiles">
  }
) {
  const board = buildMinesweeperBoardState(args.match, args.multiplayerMatch)
  const countdown = getMatchCountdownState(args.match)
  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)
  const participantProfiles = await getParticipantProfiles(ctx, participants)

  if (args.match.teamMode === "coop") {
    const sharedState = await ctx.db
      .query("minesweeperSharedStates")
      .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
      .unique()

    if (!sharedState) {
      throw new Error("Shared board state not found.")
    }

    return {
      board: {
        cells: buildVisibleMinesweeperCells({
          board,
          match: args.match,
          playerState: sharedState,
        }),
        height: args.match.boardConfig.height,
        mineCount: args.match.boardConfig.mineCount ?? 0,
        width: args.match.boardConfig.width,
      },
      boardKey: buildBoardKey(args.match.boardConfig),
      countdownEndsAt: countdown.countdownEndsAt,
      durationMs: args.match.durationMs ?? null,
      gameKey: "minesweeper" as const,
      hasStarted: countdown.hasStarted,
      matchId: args.match._id,
      outcome: args.match.outcome ?? null,
      participants: participantProfiles.map(({ participant, profile }) => ({
        isSelf: participant.profileId === args.profileId,
        profile,
        status: participant.status,
      })),
      remainingCountdownMs: countdown.remainingMs,
      stats: {
        flagsUsed: sharedState.flagsUsed,
        mistakes: sharedState.mistakes,
        revealedCount: sharedState.revealedCount,
      },
      status: args.match.status,
      teamMode: args.match.teamMode,
      viewerProfileId: args.profileId,
    }
  }

  const playerStates = await ctx.db
    .query("minesweeperPlayerStates")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)

  return {
    board: null,
    boardKey: buildBoardKey(args.match.boardConfig),
    countdownEndsAt: countdown.countdownEndsAt,
    durationMs: args.match.durationMs ?? null,
    gameKey: "minesweeper" as const,
    hasStarted: countdown.hasStarted,
    matchId: args.match._id,
    outcome: args.match.outcome ?? null,
    participants: participantProfiles.map(({ participant, profile }) => {
      const state =
        playerStates.find((playerState) => playerState.profileId === participant.profileId) ??
        null

      if (!state) {
        throw new Error("Player board state not found.")
      }

      return {
        board: {
          cells: buildVisibleMinesweeperCells({
            board,
            match: args.match,
            playerState: state,
          }),
          height: args.match.boardConfig.height,
          mineCount: args.match.boardConfig.mineCount ?? 0,
          width: args.match.boardConfig.width,
        },
        isSelf: participant.profileId === args.profileId,
        profile,
        stats: {
          flagsUsed: state.flagsUsed,
          mistakes: state.mistakes,
          revealedCount: state.revealedCount,
        },
        status: participant.status,
      }
    }),
    remainingCountdownMs: countdown.remainingMs,
    status: args.match.status,
    teamMode: args.match.teamMode,
    viewerProfileId: args.profileId,
  }
}

async function finalizeMinesweeperRace(
  ctx: MutationCtx,
  args: {
    allParticipants: Doc<"matchParticipants">[]
    match: Doc<"matches">
    profileId: Id<"profiles">
    won: boolean
  }
) {
  const now = Date.now()
  const durationMs = now - args.match.startedAt
  const winnerId = args.won ? args.profileId : null
  const activeOthers = args.allParticipants.filter(
    (participant) =>
      participant.profileId !== args.profileId && participant.status === "active"
  )

  if (!winnerId && activeOthers.length > 0) {
    return
  }

  await ctx.db.patch(args.match._id, {
    completedAt: now,
    durationMs,
    outcome: winnerId ? "won" : "lost",
    status: "finished",
  })

  for (const participant of args.allParticipants) {
    await ctx.db.patch(participant._id, {
      finishedAt: now,
      placement: winnerId && participant.profileId === winnerId ? 1 : 2,
      scorePrimary: winnerId && participant.profileId === winnerId ? durationMs : undefined,
      status:
        winnerId && participant.profileId === winnerId ? "finished" : "eliminated",
    })
  }

  const refreshedMatch = await ctx.db.get(args.match._id)

  if (!refreshedMatch) {
    return
  }

  await recordCompletedRunsForMatch(ctx, refreshedMatch)

  if (!winnerId) {
    await purgeMatchEvents(ctx, refreshedMatch)
    return
  }

  const multiplayerMatch = await ctx.db
    .query("minesweeperMatches")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .unique()

  if (!multiplayerMatch) {
    await purgeMatchEvents(ctx, refreshedMatch)
    return
  }

  for (const participant of args.allParticipants) {
    if (participant.profileId !== winnerId) {
      continue
    }

    const refreshedParticipant = await ctx.db.get(participant._id)

    if (refreshedParticipant) {
      await writeLeaderboardEntryIfNeeded(ctx, {
        match: refreshedMatch,
        participant: refreshedParticipant,
        ruleset: getMinesweeperLeaderboardRuleset(multiplayerMatch),
      })
    }
  }

  await purgeMatchEvents(ctx, refreshedMatch)
}

export const getMinesweeperMatch = query({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const result = await getMinesweeperContext(ctx, args.matchId)

    return buildMinesweeperPublicState(ctx, {
      match: result.match,
      multiplayerMatch: result.multiplayerMatch,
      profileId: result.profile._id,
    })
  },
})

export const actOnMinesweeper = mutation({
  args: {
    index: v.number(),
    matchId: v.id("matches"),
    mode: v.union(v.literal("reveal"), v.literal("flag")),
  },
  handler: async (ctx, args) => {
    const result = await getMinesweeperContext(ctx, args.matchId)

    ensureMatchStarted(result.match)
    assertMinesweeperIndex(result.match, args.index)

    if (result.match.status === "finished" || result.match.status === "cancelled") {
      throw new Error("Match already ended.")
    }

    const board = await materializeMinesweeperBoard(ctx, {
      firstClickIndex: args.index,
      match: result.match,
      multiplayerMatch: result.multiplayerMatch,
    })
    const now = Date.now()

    if (result.match.teamMode === "coop") {
      const sharedState = await ctx.db
        .query("minesweeperSharedStates")
        .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
        .unique()

      if (!sharedState) {
        throw new Error("Shared board state not found.")
      }

      const currentState: MinesweeperPlayerState = {
        alive: sharedState.alive,
        finishedAt: sharedState.finishedAt ?? null,
        flagsUsed: sharedState.flagsUsed,
        mistakes: sharedState.mistakes,
        revealedCount: sharedState.revealedCount,
        visible: sharedState.visible,
      }
      const nextState =
        args.mode === "flag"
          ? {
              playerState: toggleFlagCell(currentState, args.index),
              result: { exploded: false, won: false },
            }
          : (() => {
              const visible = currentState.visible[args.index]
              return visible?.revealed
                ? chordCell(board, currentState, args.index)
                : revealCell(board, currentState, args.index)
            })()

      await ctx.db.patch(sharedState._id, {
        alive: nextState.playerState.alive,
        finishedAt:
          nextState.result.exploded || nextState.result.won ? now : sharedState.finishedAt,
        flagsUsed: nextState.playerState.flagsUsed,
        mistakes: nextState.playerState.mistakes,
        revealedCount: nextState.playerState.revealedCount,
        updatedAt: now,
        visible: nextState.playerState.visible,
      })
      await ctx.db.patch(result.multiplayerMatch._id, {
        lastActionAt: now,
      })

      if (nextState.result.exploded || nextState.result.won) {
        const participants = await ctx.db
          .query("matchParticipants")
          .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
          .take(8)
        const durationMs = now - result.match.startedAt

        await ctx.db.patch(result.match._id, {
          completedAt: now,
          durationMs,
          outcome: nextState.result.won ? "won" : "lost",
          status: "finished",
        })

        for (const participant of participants) {
          await ctx.db.patch(participant._id, {
            finishedAt: now,
            placement: nextState.result.won ? 1 : 2,
            scorePrimary: nextState.result.won ? durationMs : undefined,
            status: nextState.result.won ? "finished" : "eliminated",
          })
        }

        if (nextState.result.won) {
          const refreshedMatch = await ctx.db.get(result.match._id)

          if (refreshedMatch) {
            await recordCompletedRunsForMatch(ctx, refreshedMatch)

            for (const participant of participants) {
              const refreshedParticipant = await ctx.db.get(participant._id)

              if (refreshedParticipant) {
                await writeLeaderboardEntryIfNeeded(ctx, {
                  match: refreshedMatch,
                  participant: refreshedParticipant,
                  ruleset: getMinesweeperLeaderboardRuleset(result.multiplayerMatch),
                })
              }
            }

            await purgeMatchEvents(ctx, refreshedMatch)
          }
        } else {
          const refreshedMatch = await ctx.db.get(result.match._id)

          if (refreshedMatch) {
            await recordCompletedRunsForMatch(ctx, refreshedMatch)
            await purgeMatchEvents(ctx, refreshedMatch)
          }
        }
      }
    } else {
      const playerState = await ctx.db
        .query("minesweeperPlayerStates")
        .withIndex("by_profileId", (query) => query.eq("profileId", result.profile._id))
        .filter((query) => query.eq(query.field("matchId"), args.matchId))
        .unique()

      if (!playerState) {
        throw new Error("Player state not found.")
      }

      const currentState: MinesweeperPlayerState = {
        alive: playerState.alive,
        finishedAt: playerState.finishedAt ?? null,
        flagsUsed: playerState.flagsUsed,
        mistakes: playerState.mistakes,
        revealedCount: playerState.revealedCount,
        visible: playerState.visible,
      }
      const nextState =
        args.mode === "flag"
          ? {
              playerState: toggleFlagCell(currentState, args.index),
              result: { exploded: false, won: false },
            }
          : (() => {
              const visible = currentState.visible[args.index]
              return visible?.revealed
                ? chordCell(board, currentState, args.index)
                : revealCell(board, currentState, args.index)
            })()

      await ctx.db.patch(playerState._id, {
        alive: nextState.playerState.alive,
        finishedAt:
          nextState.result.exploded || nextState.result.won ? now : playerState.finishedAt,
        flagsUsed: nextState.playerState.flagsUsed,
        mistakes: nextState.playerState.mistakes,
        revealedCount: nextState.playerState.revealedCount,
        updatedAt: now,
        visible: nextState.playerState.visible,
      })
      await ctx.db.patch(result.multiplayerMatch._id, {
        lastActionAt: now,
      })
      await ctx.db.patch(result.currentParticipant._id, {
        finishedAt:
          nextState.result.exploded || nextState.result.won
            ? now
            : result.currentParticipant.finishedAt,
        status:
          nextState.result.exploded
            ? "eliminated"
            : nextState.result.won
              ? "finished"
              : "active",
      })

      const allParticipants = await ctx.db
        .query("matchParticipants")
        .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
        .take(8)

      await finalizeMinesweeperRace(ctx, {
        allParticipants,
        match: result.match,
        profileId: result.profile._id,
        won: nextState.result.won,
      })
    }

    const refreshed = await getMinesweeperContext(ctx, args.matchId)

    return buildMinesweeperPublicState(ctx, {
      match: refreshed.match,
      multiplayerMatch: refreshed.multiplayerMatch,
      profileId: refreshed.profile._id,
    })
  },
})

async function getSudokuContext(
  ctx: MutationCtx | QueryCtx,
  matchId: Id<"matches">
) {
  const { profile } = await requireProfile(ctx)
  const match = await ctx.db.get(matchId)

  if (
    !match ||
    match.gameKey !== "sudoku" ||
    (match.teamMode !== "race" && match.teamMode !== "coop")
  ) {
    throw new Error("Sudoku match not found.")
  }

  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .take(8)
  const currentParticipant =
    participants.find((participant) => participant.profileId === profile._id) ?? null

  if (!currentParticipant) {
    throw new Error("You do not have access to this match.")
  }

  const sudokuMatch = await ctx.db
    .query("sudokuMatches")
    .withIndex("by_matchId", (query) => query.eq("matchId", matchId))
    .unique()

  if (!sudokuMatch) {
    throw new Error("Sudoku state is incomplete.")
  }

  return {
    currentParticipant,
    match,
    participants,
    profile,
    sudokuMatch,
  }
}

async function assertSudokuFillCellAvailable(
  ctx: MutationCtx,
  args: {
    index: number
    matchId: Id<"matches">
    profileId: Id<"profiles">
  }
) {
  const now = Date.now()
  const presences = await ctx.db
    .query("sudokuPresences")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
    .take(8)

  const blockingPresence = presences.find(
    (presence) =>
      presence.profileId !== args.profileId &&
      presence.selectedIndex === args.index &&
      now - presence.updatedAt < 2 * 60 * 1000
  )

  if (blockingPresence) {
    throw new Error("Cell is locked by your teammate.")
  }
}

async function getLatestSudokuMoveEvent(
  ctx: MutationCtx | QueryCtx,
  args: {
    matchId: Id<"matches">
    profileId: Id<"profiles">
    teamMode: "coop" | "race"
  }
) {
  const events = await ctx.db
    .query("sudokuEvents")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
    .take(64)
  const moveType = args.teamMode === "coop" ? "coop_value_move" : "race_value_move"

  return [...events]
    .reverse()
    .find(
      (event) =>
        event.type === moveType &&
        event.profileId === args.profileId
    ) ?? null
}

async function buildSudokuPublicState(
  ctx: MutationCtx | QueryCtx,
  args: {
    match: Doc<"matches">
    profileId: Id<"profiles">
    sudokuMatch: Doc<"sudokuMatches">
  }
) {
  const countdown = getMatchCountdownState(args.match)
  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)
  const participantProfiles = await getParticipantProfiles(ctx, participants)
  const presences = await ctx.db
    .query("sudokuPresences")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)
  const latestMove = await getLatestSudokuMoveEvent(ctx, {
    matchId: args.match._id,
    profileId: args.profileId,
    teamMode: args.match.teamMode as "coop" | "race",
  })

  if (args.match.teamMode === "coop") {
    const sharedState = await ctx.db
      .query("sudokuSharedStates")
      .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
      .unique()

    if (!sharedState) {
      throw new Error("Sudoku shared state not found.")
    }

    if (!sharedState.noteMarks || !sharedState.valueOwners) {
      throw new Error("This Sudoku room is outdated. Leave it and create a new one.")
    }

    return {
      board: {
        noteMarks: sharedState.noteMarks,
        notes: noteMarksToNotes(sharedState.noteMarks),
        valueOwners: sharedState.valueOwners,
        values: sharedState.values,
      },
      countdownEndsAt: countdown.countdownEndsAt,
      difficulty: args.sudokuMatch.difficulty,
      durationMs: args.match.durationMs ?? null,
      gameKey: "sudoku" as const,
      givens: args.sudokuMatch.puzzleGivens,
      hasStarted: countdown.hasStarted,
      canUndo: latestMove !== null,
      matchId: args.match._id,
      outcome: args.match.outcome ?? null,
      participants: participantProfiles.map(({ participant, profile }) => {
        const presence =
          presences.find((row) => row.profileId === participant.profileId) ?? null

        return {
          focuses:
            presence?.focuses ??
            (presence?.highlight ? [presence.highlight] : []),
          isSelf: participant.profileId === args.profileId,
          profile,
          selectedIndex: presence?.selectedIndex ?? null,
          status: participant.status,
        }
      }),
      remainingCountdownMs: countdown.remainingMs,
      status: args.match.status,
      teamMode: args.match.teamMode,
      viewerProfileId: args.profileId,
    }
  }

  const playerStates = await ctx.db
    .query("sudokuPlayerStates")
    .withIndex("by_matchId", (query) => query.eq("matchId", args.match._id))
    .take(8)

  return {
    board: null,
    countdownEndsAt: countdown.countdownEndsAt,
    difficulty: args.sudokuMatch.difficulty,
    durationMs: args.match.durationMs ?? null,
    gameKey: "sudoku" as const,
    givens: args.sudokuMatch.puzzleGivens,
    hasStarted: countdown.hasStarted,
    canUndo: latestMove !== null,
    matchId: args.match._id,
    outcome: args.match.outcome ?? null,
    participants: participantProfiles.map(({ participant, profile }) => {
      const state =
        playerStates.find((playerState) => playerState.profileId === participant.profileId) ??
        null

      if (!state) {
        throw new Error("Sudoku player state not found.")
      }

      return {
        board: {
          notes: state.notes,
          values: state.values,
        },
        isSelf: participant.profileId === args.profileId,
        profile,
        status: participant.status,
      }
    }),
    remainingCountdownMs: countdown.remainingMs,
    status: args.match.status,
    teamMode: args.match.teamMode,
    viewerProfileId: args.profileId,
  }
}

export const getSudokuMatch = query({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const result = await getSudokuContext(ctx, args.matchId)

    return buildSudokuPublicState(ctx, {
      match: result.match,
      profileId: result.profile._id,
      sudokuMatch: result.sudokuMatch,
    })
  },
})

export const updateSudokuPresence = mutation({
  args: {
    clearSelection: v.optional(v.boolean()),
    focuses: v.optional(
      v.array(
        v.union(
          v.object({
            kind: v.literal("cell"),
            index: v.number(),
          }),
          v.object({
            kind: v.literal("row"),
            index: v.number(),
          }),
          v.object({
            kind: v.literal("column"),
            index: v.number(),
          }),
          v.object({
            kind: v.literal("box"),
            index: v.number(),
          }),
          v.object({
            kind: v.literal("digit"),
            index: v.number(),
          })
        )
      )
    ),
    matchId: v.id("matches"),
    selectedIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await getSudokuContext(ctx, args.matchId)
    const presence = await ctx.db
      .query("sudokuPresences")
      .withIndex("by_matchId_profileId", (query) =>
        query.eq("matchId", args.matchId).eq("profileId", result.profile._id)
      )
      .unique()

    if (!presence) {
      throw new Error("Presence state not found.")
    }

    await ctx.db.patch(presence._id, {
      focuses: args.focuses !== undefined ? args.focuses : presence.focuses ?? [],
      highlight:
        args.focuses !== undefined && args.focuses.length > 0
          ? args.focuses[args.focuses.length - 1]
          : undefined,
      selectedIndex:
        args.clearSelection
          ? undefined
          : args.selectedIndex !== undefined
            ? args.selectedIndex
            : presence.selectedIndex,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const cleanupOutdatedSudokuMatches = internalMutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)
    const now = Date.now()
    const sharedStates = await ctx.db.query("sudokuSharedStates").take(128)
    let cleaned = 0

    for (const sharedState of sharedStates) {
      if (sharedState.valueOwners) {
        continue
      }

      await ctx.db.patch(sharedState._id, {
        noteMarks: createSudokuNoteMarksState(),
        updatedAt: now,
        valueOwners: createSudokuValueOwnersState(),
      })

      const match = await ctx.db.get(sharedState.matchId)
      if (!match || match.gameKey !== "sudoku") {
        cleaned += 1
        continue
      }

      await ctx.db.patch(match._id, {
        completedAt: now,
        outcome: "abandoned",
        status: "cancelled",
      })

      const matchParticipants = await ctx.db
        .query("matchParticipants")
        .withIndex("by_matchId", (query) => query.eq("matchId", match._id))
        .take(8)

      for (const row of matchParticipants) {
        await ctx.db.patch(row._id, {
          finishedAt: now,
          status: "eliminated",
        })
      }

      if (match.lobbyId) {
        const lobbyMembers = await ctx.db
          .query("lobbyMembers")
          .withIndex("by_lobbyId", (query) => query.eq("lobbyId", match.lobbyId!))
          .take(8)

        for (const member of lobbyMembers) {
          if (member.startedMatchId === match._id) {
            await ctx.db.patch(member._id, {
              readyState: "pending",
              startedMatchId: undefined,
            })
          }
        }

        const lobby = await ctx.db.get(match.lobbyId)
        if (lobby && lobby.status === "in_match") {
          await ctx.db.patch(lobby._id, {
            status: lobbyMembers.length === 0 ? "closed" : "open",
            updatedAt: now,
          })
        }
      }

      const refreshedMatch = await ctx.db.get(match._id)

      if (refreshedMatch) {
        await recordCompletedRunsForMatch(ctx, refreshedMatch)
        await purgeMatchEvents(ctx, refreshedMatch)
      }

      cleaned += 1
    }

    return { cleaned }
  },
})

export const updateSudokuCell = mutation({
  args: {
    action: v.union(v.literal("clear"), v.literal("set"), v.literal("toggle_note")),
    index: v.number(),
    matchId: v.id("matches"),
    value: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await getSudokuContext(ctx, args.matchId)

    ensureMatchStarted(result.match)

    if (!Number.isInteger(args.index) || args.index < 0 || args.index >= 81) {
      throw new Error("Invalid cell index.")
    }

    if (result.match.status === "finished" || result.match.status === "cancelled") {
      throw new Error("Match already ended.")
    }

    const now = Date.now()

    if (result.match.teamMode === "coop") {
      const sharedState = await ctx.db
        .query("sudokuSharedStates")
        .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
        .unique()

      if (!sharedState) {
        throw new Error("Sudoku shared state not found.")
      }

      if (!sharedState.noteMarks || !sharedState.valueOwners) {
        throw new Error("This Sudoku room is outdated. Leave it and create a new one.")
      }

      if (args.action !== "toggle_note") {
        await assertSudokuFillCellAvailable(ctx, {
          index: args.index,
          matchId: args.matchId,
          profileId: result.profile._id,
        })
      }

      if (args.action === "toggle_note") {
        const digit = args.value ?? 0

        if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
          throw new Error("Invalid note digit.")
        }

        if (
          result.sudokuMatch.puzzleGivens[args.index] !== 0 ||
          sharedState.values[args.index] !== 0
        ) {
          return buildSudokuPublicState(ctx, {
            match: result.match,
            profileId: result.profile._id,
            sudokuMatch: result.sudokuMatch,
          })
        }

        const nextNoteMarks = sharedState.noteMarks.map((cellNotes) =>
          cellNotes.map((note) => ({ ...note }))
        )
        const noteIndex =
          nextNoteMarks[args.index]?.findIndex((note) => note.digit === digit) ?? -1

        if (noteIndex >= 0) {
          const existing = nextNoteMarks[args.index]![noteIndex]

          if (existing?.profileId === result.profile._id) {
            nextNoteMarks[args.index] = nextNoteMarks[args.index]!.filter(
              (note) => note.digit !== digit
            )
          } else {
            nextNoteMarks[args.index] = nextNoteMarks[args.index]!.map((note) =>
              note.digit === digit ? { digit, profileId: result.profile._id } : note
            )
          }
        } else {
          nextNoteMarks[args.index] = [
            ...(nextNoteMarks[args.index] ?? []),
            { digit, profileId: result.profile._id },
          ].sort((left, right) => left.digit - right.digit)
        }

        await ctx.db.patch(sharedState._id, {
          noteMarks: nextNoteMarks,
          updatedAt: now,
        })
        await ctx.db.patch(result.sudokuMatch._id, {
          lastActionAt: now,
        })

        const refreshed = await getSudokuContext(ctx, args.matchId)

        return buildSudokuPublicState(ctx, {
          match: refreshed.match,
          profileId: refreshed.profile._id,
          sudokuMatch: refreshed.sudokuMatch,
        })
      }

      const nextGame = inflateSudokuGame({
        difficulty: result.sudokuMatch.difficulty,
        givens: result.sudokuMatch.puzzleGivens,
        noteMarks: sharedState.noteMarks,
        solution: result.sudokuMatch.solution,
        values: sharedState.values,
      })
      const updated =
        args.action === "clear"
          ? clearCellValue(nextGame, args.index)
          : setCellValue(nextGame, args.index, args.value ?? 0)
      const nextValues = updated.cells.map((cell) => cell.value)
      const previousValue = sharedState.values[args.index] ?? 0

      if (nextValues[args.index] === previousValue) {
        return buildSudokuPublicState(ctx, {
          match: result.match,
          profileId: result.profile._id,
          sudokuMatch: result.sudokuMatch,
        })
      }
      const solved = isSudokuSolved(updated)
      const nextNoteMarks = clearDigitFromRelatedNoteMarks({
        index: args.index,
        noteMarks: sharedState.noteMarks,
        solution: result.sudokuMatch.solution,
        value: nextValues[args.index] ?? 0,
      })
      const nextValueOwners = [...sharedState.valueOwners]
      const previousOwner = nextValueOwners[args.index] ?? null
      const nextOwner = nextValues[args.index] === 0 ? null : result.profile._id

      nextValueOwners[args.index] = nextOwner

      await ctx.db.insert("sudokuEvents", {
        matchId: args.matchId,
        payload: serializeJson({
          index: args.index,
          nextOwner,
          nextValue: nextValues[args.index] ?? 0,
          previousOwner,
          previousValue,
        } satisfies CoopValueMoveEvent),
        profileId: result.profile._id,
        type: "coop_value_move",
        createdAt: now,
      })

      await ctx.db.patch(sharedState._id, {
        finishedAt: solved ? now : sharedState.finishedAt,
        noteMarks: nextNoteMarks,
        updatedAt: now,
        valueOwners: nextValueOwners,
        values: nextValues,
      })
      await ctx.db.patch(result.sudokuMatch._id, {
        lastActionAt: now,
      })

      if (solved) {
        const participants = await ctx.db
          .query("matchParticipants")
          .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
          .take(8)
        const durationMs = now - result.match.startedAt

        await ctx.db.patch(result.match._id, {
          completedAt: now,
          durationMs,
          outcome: "won",
          status: "finished",
        })

        for (const participant of participants) {
          await ctx.db.patch(participant._id, {
            finishedAt: now,
            placement: 1,
            scorePrimary: durationMs,
            status: "finished",
          })
        }

        const refreshedMatch = await ctx.db.get(result.match._id)

        if (refreshedMatch) {
          await recordCompletedRunsForMatch(ctx, refreshedMatch)

          for (const participant of participants) {
            const refreshedParticipant = await ctx.db.get(participant._id)

            if (refreshedParticipant) {
              await writeLeaderboardEntryIfNeeded(ctx, {
                match: refreshedMatch,
                participant: refreshedParticipant,
                ruleset: getSudokuLeaderboardRuleset(result.sudokuMatch),
              })
            }
          }

          await purgeMatchEvents(ctx, refreshedMatch)
        }
      }
    } else {
      const playerState = await ctx.db
        .query("sudokuPlayerStates")
        .withIndex("by_profileId", (query) => query.eq("profileId", result.profile._id))
        .filter((query) => query.eq(query.field("matchId"), args.matchId))
        .unique()

      if (!playerState) {
        throw new Error("Sudoku player state not found.")
      }

      if (args.action === "toggle_note") {
        const digit = args.value ?? 0

        if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
          throw new Error("Invalid note digit.")
        }

        if (
          result.sudokuMatch.puzzleGivens[args.index] !== 0 ||
          playerState.values[args.index] !== 0
        ) {
          return buildSudokuPublicState(ctx, {
            match: result.match,
            profileId: result.profile._id,
            sudokuMatch: result.sudokuMatch,
          })
        }

        const nextNotes = playerState.notes.map((cellNotes) => [...cellNotes])
        const cellNotes = nextNotes[args.index] ?? []

        nextNotes[args.index] = cellNotes.includes(digit)
          ? cellNotes.filter((entry) => entry !== digit)
          : [...cellNotes, digit].sort((left, right) => left - right)

        await ctx.db.patch(playerState._id, {
          notes: nextNotes,
          updatedAt: now,
        })
        await ctx.db.patch(result.sudokuMatch._id, {
          lastActionAt: now,
        })

        const refreshed = await getSudokuContext(ctx, args.matchId)

        return buildSudokuPublicState(ctx, {
          match: refreshed.match,
          profileId: refreshed.profile._id,
          sudokuMatch: refreshed.sudokuMatch,
        })
      }

      const nextGame = inflateSudokuGame({
        difficulty: result.sudokuMatch.difficulty,
        givens: result.sudokuMatch.puzzleGivens,
        noteMarks: playerState.notes.map((cellNotes) =>
          cellNotes.map((digit) => ({ digit, profileId: result.profile._id }))
        ),
        solution: result.sudokuMatch.solution,
        values: playerState.values,
      })
      const updated =
        args.action === "clear"
          ? clearCellValue(nextGame, args.index)
          : setCellValue(nextGame, args.index, args.value ?? 0)
      const previousValue = playerState.values[args.index] ?? 0
      const nextValues = updated.cells.map((cell) => cell.value)

      if (nextValues[args.index] === previousValue) {
        return buildSudokuPublicState(ctx, {
          match: result.match,
          profileId: result.profile._id,
          sudokuMatch: result.sudokuMatch,
        })
      }

      const solved = isSudokuSolved(updated)
      const nextNotes = clearDigitFromRelatedNotes({
        index: args.index,
        notes: playerState.notes,
        solution: result.sudokuMatch.solution,
        value: nextValues[args.index] ?? 0,
      })

      await ctx.db.insert("sudokuEvents", {
        matchId: args.matchId,
        payload: serializeJson({
          index: args.index,
          nextValue: nextValues[args.index] ?? 0,
          previousValue,
        } satisfies RaceValueMoveEvent),
        profileId: result.profile._id,
        type: "race_value_move",
        createdAt: now,
      })

      await ctx.db.patch(playerState._id, {
        finishedAt: solved ? now : playerState.finishedAt,
        notes: nextNotes,
        updatedAt: now,
        values: nextValues,
      })
      await ctx.db.patch(result.sudokuMatch._id, {
        lastActionAt: now,
      })
      await ctx.db.patch(result.currentParticipant._id, {
        finishedAt: solved ? now : result.currentParticipant.finishedAt,
        status: solved ? "finished" : "active",
      })

      if (solved) {
        const participants = await ctx.db
          .query("matchParticipants")
          .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
          .take(8)
        const durationMs = now - result.match.startedAt

        await ctx.db.patch(result.match._id, {
          completedAt: now,
          durationMs,
          outcome: "won",
          status: "finished",
        })

        for (const participant of participants) {
          await ctx.db.patch(participant._id, {
            finishedAt: now,
            placement: participant.profileId === result.profile._id ? 1 : 2,
            scorePrimary: participant.profileId === result.profile._id ? durationMs : undefined,
            status:
              participant.profileId === result.profile._id ? "finished" : "eliminated",
          })
        }

        const refreshedMatch = await ctx.db.get(result.match._id)
        const refreshedParticipant = await ctx.db.get(result.currentParticipant._id)

        if (refreshedMatch) {
          await recordCompletedRunsForMatch(ctx, refreshedMatch)
        }

        if (refreshedMatch && refreshedParticipant) {
          await writeLeaderboardEntryIfNeeded(ctx, {
            match: refreshedMatch,
            participant: refreshedParticipant,
            ruleset: getSudokuLeaderboardRuleset(result.sudokuMatch),
          })
        }

        if (refreshedMatch) {
          await purgeMatchEvents(ctx, refreshedMatch)
        }
      }
    }

    const refreshed = await getSudokuContext(ctx, args.matchId)

    return buildSudokuPublicState(ctx, {
      match: refreshed.match,
      profileId: refreshed.profile._id,
      sudokuMatch: refreshed.sudokuMatch,
    })
  },
})

export const undoSudokuMove = mutation({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const result = await getSudokuContext(ctx, args.matchId)

    ensureMatchStarted(result.match)

    if (result.match.status !== "active") {
      throw new Error("Undo is only available while the match is active.")
    }

    const latestMove = await getLatestSudokuMoveEvent(ctx, {
      matchId: args.matchId,
      profileId: result.profile._id,
      teamMode: result.match.teamMode as "coop" | "race",
    })

    if (!latestMove) {
      return buildSudokuPublicState(ctx, {
        match: result.match,
        profileId: result.profile._id,
        sudokuMatch: result.sudokuMatch,
      })
    }

    const now = Date.now()

    if (result.match.teamMode === "coop") {
      const sharedState = await ctx.db
        .query("sudokuSharedStates")
        .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
        .unique()

      if (!sharedState) {
        throw new Error("Sudoku shared state not found.")
      }

      const latestMatchEvent = (
        await ctx.db
          .query("sudokuEvents")
          .withIndex("by_matchId", (query) => query.eq("matchId", args.matchId))
          .take(64)
      )
        .filter((event) => event.type === "coop_value_move")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null

      if (!latestMatchEvent || latestMatchEvent._id !== latestMove._id) {
        throw new Error("Your teammate has already moved.")
      }

      const move = parseJson<CoopValueMoveEvent | null>(latestMove.payload, null)

      if (!move || move.index < 0 || move.index >= 81) {
        throw new Error("Undo snapshot is invalid.")
      }

      const nextValues = [...sharedState.values]
      const nextValueOwners = [...sharedState.valueOwners]

      nextValues[move.index] = move.previousValue
      nextValueOwners[move.index] = move.previousOwner

      await ctx.db.patch(sharedState._id, {
        updatedAt: now,
        valueOwners: nextValueOwners,
        values: nextValues,
      })
    } else {
      const playerState = await ctx.db
        .query("sudokuPlayerStates")
        .withIndex("by_profileId", (query) => query.eq("profileId", result.profile._id))
        .filter((query) => query.eq(query.field("matchId"), args.matchId))
        .unique()

      if (!playerState) {
        throw new Error("Sudoku player state not found.")
      }

      const move = parseJson<RaceValueMoveEvent | null>(latestMove.payload, null)

      if (!move || move.index < 0 || move.index >= 81) {
        throw new Error("Undo snapshot is invalid.")
      }

      const nextValues = [...playerState.values]
      nextValues[move.index] = move.previousValue

      await ctx.db.patch(playerState._id, {
        updatedAt: now,
        values: nextValues,
      })
    }

    await ctx.db.patch(result.sudokuMatch._id, {
      lastActionAt: now,
    })
    await ctx.db.delete(latestMove._id)

    const refreshed = await getSudokuContext(ctx, args.matchId)

    return buildSudokuPublicState(ctx, {
      match: refreshed.match,
      profileId: refreshed.profile._id,
      sudokuMatch: refreshed.sudokuMatch,
    })
  },
})
