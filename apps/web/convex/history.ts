import { buildBoardKey } from "@workspace/game-core"

import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

function resolveCompletedRunOutcome(
  match: Doc<"matches">,
  participant: Doc<"matchParticipants">
) {
  if (match.outcome === "abandoned" || match.status === "cancelled") {
    return "abandoned" as const
  }

  return participant.status === "finished" ? "won" : "lost"
}

export async function recordCompletedRunIfNeeded(
  ctx: MutationCtx,
  args: {
    match: Doc<"matches">
    participant: Doc<"matchParticipants">
  }
) {
  if (args.match.completedAt === undefined) {
    return null
  }

  const existing = await ctx.db
    .query("completedRuns")
    .withIndex("by_matchId_profileId", (query) =>
      query.eq("matchId", args.match._id).eq("profileId", args.participant.profileId)
    )
    .unique()

  if (existing) {
    return existing
  }

  const runId = await ctx.db.insert("completedRuns", {
    matchId: args.match._id,
    profileId: args.participant.profileId,
    gameKey: args.match.gameKey,
    modeKey: args.match.modeKey,
    rulesetKey: args.match.rulesetKey,
    ranked: args.match.ranked,
    boardKey: buildBoardKey(args.match.boardConfig),
    outcome: resolveCompletedRunOutcome(args.match, args.participant),
    durationMs: args.match.durationMs ?? args.participant.scorePrimary ?? null,
    completedAt: args.match.completedAt,
    createdAt: Date.now(),
  })

  return await ctx.db.get(runId)
}

export async function recordCompletedRunsForMatch(
  ctx: MutationCtx,
  match: Doc<"matches">
) {
  if (match.completedAt === undefined) {
    return []
  }

  const participants = await ctx.db
    .query("matchParticipants")
    .withIndex("by_matchId", (query) => query.eq("matchId", match._id))
    .take(8)

  return Promise.all(
    participants.map((participant) =>
      recordCompletedRunIfNeeded(ctx, {
        match,
        participant,
      })
    )
  )
}

export async function purgeMatchEvents(
  ctx: MutationCtx,
  match: Doc<"matches">
) {
  if (match.gameKey === "minesweeper") {
    const events = await ctx.db
      .query("minesweeperEvents")
      .withIndex("by_matchId", (query) => query.eq("matchId", match._id))
      .take(256)

    for (const event of events) {
      await ctx.db.delete(event._id)
    }

    return
  }

  const events = await ctx.db
    .query("sudokuEvents")
    .withIndex("by_matchId", (query) => query.eq("matchId", match._id))
    .take(256)

  for (const event of events) {
    await ctx.db.delete(event._id)
  }
}
