import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const gameKeyValidator = v.union(v.literal("minesweeper"), v.literal("sudoku"))
const teamModeValidator = v.union(
  v.literal("solo"),
  v.literal("race"),
  v.literal("coop")
)
const lobbyVisibilityValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("matchmaking")
)
const readyStateValidator = v.union(v.literal("pending"), v.literal("ready"))
const lobbyStatusValidator = v.union(
  v.literal("open"),
  v.literal("starting"),
  v.literal("in_match"),
  v.literal("closed")
)
const matchStatusValidator = v.union(
  v.literal("waiting"),
  v.literal("ready"),
  v.literal("active"),
  v.literal("finished"),
  v.literal("cancelled")
)
const matchOutcomeValidator = v.union(
  v.literal("won"),
  v.literal("lost"),
  v.literal("abandoned")
)
const profileStatusValidator = v.union(
  v.literal("online"),
  v.literal("available"),
  v.literal("in_game"),
  v.literal("offline")
)
const presenceValidator = v.union(
  v.literal("online"),
  v.literal("idle"),
  v.literal("away"),
  v.literal("offline")
)

const boardConfigValidator = v.object({
  width: v.number(),
  height: v.number(),
  mineCount: v.optional(v.number()),
  density: v.optional(v.number()),
})

const scoreConfigValidator = v.object({
  scoringKey: v.string(),
  timeLimitSeconds: v.optional(v.union(v.number(), v.null())),
  maxMistakes: v.optional(v.union(v.number(), v.null())),
})

const minesweeperGameConfigValidator = v.object({
  firstClickBehavior: v.union(v.literal("safe"), v.literal("safe_zero")),
  eliminationRule: v.optional(
    v.union(
      v.literal("single_life"),
      v.literal("team_wipe"),
      v.literal("three_strikes")
    )
  ),
  sharedLossRule: v.optional(v.union(v.literal("team_wipe"), v.literal("single_life"))),
})

const sudokuBoardConfigValidator = v.object({
  width: v.literal(9),
  height: v.literal(9),
  mineCount: v.optional(v.union(v.null(), v.number())),
  density: v.optional(v.union(v.null(), v.number())),
})

const sudokuGameConfigValidator = v.object({
  variant: v.literal("classic"),
  difficulty: v.union(
    v.literal("easy"),
    v.literal("medium"),
    v.literal("hard"),
    v.literal("expert"),
    v.literal("haaard")
  ),
  clueStyle: v.optional(v.union(v.literal("generated"), v.literal("curated"))),
})

const baseRulesetConfigValidator = {
  modeKey: v.string(),
  ranked: v.boolean(),
  teamMode: teamModeValidator,
  boardConfig: boardConfigValidator,
  scoreConfig: scoreConfigValidator,
}

const rulesetConfigValidator = v.union(
  v.object({
    gameKey: v.literal("minesweeper"),
    ...baseRulesetConfigValidator,
    gameConfig: minesweeperGameConfigValidator,
  }),
  v.object({
    gameKey: v.literal("sudoku"),
    ...baseRulesetConfigValidator,
    boardConfig: sudokuBoardConfigValidator,
    gameConfig: sudokuGameConfigValidator,
  })
)

const minesweeperCellValidator = v.object({
  index: v.number(),
  isMine: v.boolean(),
  adjacentMines: v.number(),
})

const visibleCellValidator = v.object({
  revealed: v.boolean(),
  flagged: v.boolean(),
  exploded: v.boolean(),
})

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),

  profiles: defineTable({
    userId: v.id("users"),
    clerkUserId: v.string(),
    tokenIdentifier: v.string(),
    username: v.string(),
    usernameLower: v.string(),
    tag: v.string(),
    usernameTag: v.string(),
    usernameTagLower: v.string(),
    avatarUrl: v.optional(v.string()),
    status: profileStatusValidator,
    presence: presenceValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_usernameTag", ["usernameTag"])
    .index("by_usernameTagLower", ["usernameTagLower"])
    .index("by_usernameLower", ["usernameLower"]),

  friendInvites: defineTable({
    pairKey: v.string(),
    fromProfileId: v.id("profiles"),
    toProfileId: v.id("profiles"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("cancelled")
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_pairKey", ["pairKey"])
    .index("by_fromProfileId", ["fromProfileId"])
    .index("by_toProfileId", ["toProfileId"]),

  friendships: defineTable({
    profileAId: v.id("profiles"),
    profileBId: v.id("profiles"),
    pairKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_profileAId", ["profileAId"])
    .index("by_profileBId", ["profileBId"])
    .index("by_pairKey", ["pairKey"]),

  parties: defineTable({
    leaderProfileId: v.id("profiles"),
    inviteCode: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_leaderProfileId", ["leaderProfileId"]),

  partyMembers: defineTable({
    partyId: v.id("parties"),
    profileId: v.id("profiles"),
    isLeader: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_partyId", ["partyId"])
    .index("by_profileId", ["profileId"]),

  lobbies: defineTable({
    title: v.string(),
    hostProfileId: v.id("profiles"),
    partyId: v.optional(v.id("parties")),
    gameKey: gameKeyValidator,
    modeKey: v.string(),
    rulesetKey: v.string(),
    ranked: v.boolean(),
    teamMode: teamModeValidator,
    boardConfig: boardConfigValidator,
    scoreConfig: scoreConfigValidator,
    visibility: lobbyVisibilityValidator,
    maxPlayers: v.number(),
    allowFriendsOnly: v.boolean(),
    code: v.optional(v.string()),
    status: lobbyStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hostProfileId", ["hostProfileId"])
    .index("by_visibility_status", ["visibility", "status"])
    .index("by_code", ["code"]),

  lobbyMembers: defineTable({
    lobbyId: v.id("lobbies"),
    profileId: v.id("profiles"),
    readyState: readyStateValidator,
    startedMatchId: v.optional(v.id("matches")),
    joinedAt: v.number(),
  })
    .index("by_lobbyId", ["lobbyId"])
    .index("by_profileId", ["profileId"]),

  queueEntries: defineTable({
    profileId: v.id("profiles"),
    partyId: v.optional(v.id("parties")),
    gameKey: gameKeyValidator,
    modeKey: v.string(),
    rulesetKey: v.string(),
    ranked: v.boolean(),
    teamMode: teamModeValidator,
    boardConfig: boardConfigValidator,
    scoreConfig: scoreConfigValidator,
    queuedAt: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("matched"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
  })
    .index("by_profileId", ["profileId"])
    .index("by_status", ["status"]),

  matches: defineTable({
    lobbyId: v.optional(v.id("lobbies")),
    createdByProfileId: v.id("profiles"),
    gameKey: gameKeyValidator,
    modeKey: v.string(),
    rulesetKey: v.string(),
    ranked: v.boolean(),
    teamMode: teamModeValidator,
    boardConfig: boardConfigValidator,
    scoreConfig: scoreConfigValidator,
    visibility: lobbyVisibilityValidator,
    status: matchStatusValidator,
    outcome: v.optional(matchOutcomeValidator),
    durationMs: v.optional(v.number()),
    seed: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_createdByProfileId", ["createdByProfileId"])
    .index("by_status", ["status"]),

  matchParticipants: defineTable({
    matchId: v.id("matches"),
    profileId: v.id("profiles"),
    teamId: v.optional(v.string()),
    placement: v.optional(v.number()),
    scorePrimary: v.optional(v.number()),
    scoreSecondary: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("finished"),
      v.literal("eliminated")
    ),
    finishedAt: v.optional(v.number()),
  })
    .index("by_matchId", ["matchId"])
    .index("by_profileId", ["profileId"]),

  leaderboardCategories: defineTable({
    key: v.string(),
    gameKey: gameKeyValidator,
    modeKey: v.string(),
    ranked: v.boolean(),
    boardKey: v.string(),
    scoringKey: v.string(),
    rulesetKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_game_mode", ["gameKey", "modeKey"]),

  leaderboardEntries: defineTable({
    categoryKey: v.string(),
    matchId: v.id("matches"),
    profileId: v.id("profiles"),
    scorePrimary: v.number(),
    scoreSecondary: v.optional(v.number()),
    completedAt: v.number(),
    boardKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_categoryKey", ["categoryKey"])
    .index("by_categoryKey_score", ["categoryKey", "scorePrimary", "completedAt"])
    .index("by_matchId_profileId", ["matchId", "profileId"])
    .index("by_profileId", ["profileId"])
    .index("by_profileId_completedAt", ["profileId", "completedAt"]),

  presence: defineTable({
    profileId: v.id("profiles"),
    state: presenceValidator,
    status: profileStatusValidator,
    lastSeenAt: v.number(),
  }).index("by_profileId", ["profileId"]),

  notifications: defineTable({
    profileId: v.id("profiles"),
    type: v.string(),
    payload: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_profileId", ["profileId"]),

  minesweeperMatches: defineTable({
    matchId: v.id("matches"),
    ruleset: rulesetConfigValidator,
    sharedBoard: v.boolean(),
    sharedLossRule: v.union(v.literal("team_wipe"), v.literal("single_life")),
    boardCells: v.optional(v.array(minesweeperCellValidator)),
    activatedAt: v.optional(v.number()),
    lastActionAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_matchId", ["matchId"]),

  minesweeperPlayerStates: defineTable({
    matchId: v.id("matches"),
    profileId: v.id("profiles"),
    visible: v.array(visibleCellValidator),
    flagsUsed: v.number(),
    revealedCount: v.number(),
    mistakes: v.number(),
    alive: v.boolean(),
    finishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_matchId", ["matchId"])
    .index("by_profileId", ["profileId"]),

  minesweeperEvents: defineTable({
    matchId: v.id("matches"),
    profileId: v.optional(v.id("profiles")),
    type: v.string(),
    payload: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_matchId", ["matchId"]),
})
