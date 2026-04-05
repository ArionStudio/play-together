import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import {
  buildPairKey,
  getPresenceRowsByProfileIds,
  getProfilesByIds,
  getProfileByUsernameTag,
  normalizeUsername,
  requireProfile,
  toPublicProfile,
} from "./lib"

const ONLINE_FRESHNESS_MS = 180_000

async function getLivePublicProfile(ctx: QueryCtx, profile: Doc<"profiles">) {
  const presenceRow = await ctx.db
    .query("presence")
    .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
    .unique()
  const isFresh =
    presenceRow !== null && Date.now() - presenceRow.lastSeenAt <= ONLINE_FRESHNESS_MS

  return {
    ...toPublicProfile(profile),
    presence: isFresh ? presenceRow.state : "offline",
    status: isFresh ? presenceRow.status : "offline",
  }
}

function toLivePublicProfile(args: {
  presenceRow: Doc<"presence"> | null
  profile: Doc<"profiles">
}) {
  const presenceRow = args.presenceRow
  const isFresh =
    presenceRow !== null &&
    Date.now() - presenceRow.lastSeenAt <= ONLINE_FRESHNESS_MS

  return {
    ...toPublicProfile(args.profile),
    presence: isFresh ? presenceRow.state : "offline",
    status: isFresh ? presenceRow.status : "offline",
  }
}

export const searchProfiles = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const rawQuery = args.query.trim()

    if (!rawQuery) {
      return []
    }

    if (rawQuery.includes("#")) {
      const match = await getProfileByUsernameTag(ctx, rawQuery)

      if (!match || match._id === profile._id) {
        return []
      }

      return [await getLivePublicProfile(ctx, match)]
    }

    const normalizedUsername = normalizeUsername(rawQuery).toLowerCase()
    const matches = await ctx.db
      .query("profiles")
      .withIndex("by_usernameLower", (query) =>
        query.gte("usernameLower", normalizedUsername)
      )
      .take(10)
    const filteredMatches = matches.filter(
      (candidate) =>
        candidate._id !== profile._id &&
        candidate.usernameLower.startsWith(normalizedUsername)
    )
    const presenceByProfileId = await getPresenceRowsByProfileIds(
      ctx,
      filteredMatches.map((candidate) => candidate._id)
    )

    return filteredMatches.map((candidate) =>
      toLivePublicProfile({
        presenceRow: presenceByProfileId.get(candidate._id) ?? null,
        profile: candidate,
      })
    )
  },
})

export const sendInvite = mutation({
  args: {
    usernameTag: v.string(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const targetProfile = await getProfileByUsernameTag(ctx, args.usernameTag)

    if (!targetProfile) {
      throw new Error("Player not found.")
    }

    if (targetProfile._id === profile._id) {
      throw new Error("You cannot invite yourself.")
    }

    const pairKey = buildPairKey(profile._id, targetProfile._id)
    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_pairKey", (query) => query.eq("pairKey", pairKey))
      .unique()

    if (friendship) {
      throw new Error("You are already friends.")
    }

    const existingInvites = await ctx.db
      .query("friendInvites")
      .withIndex("by_pairKey", (query) => query.eq("pairKey", pairKey))
      .take(10)

    if (existingInvites.some((invite) => invite.status === "pending")) {
      throw new Error("An invite between these profiles is already pending.")
    }

    const inviteId = await ctx.db.insert("friendInvites", {
      pairKey,
      fromProfileId: profile._id,
      toProfileId: targetProfile._id,
      status: "pending",
      createdAt: Date.now(),
    })

    return await ctx.db.get(inviteId)
  },
})

export const respondToInvite = mutation({
  args: {
    inviteId: v.id("friendInvites"),
    action: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx)
    const invite = await ctx.db.get(args.inviteId)

    if (!invite || invite.status !== "pending") {
      throw new Error("Invite is no longer pending.")
    }

    if (invite.toProfileId !== profile._id) {
      throw new Error("Only the recipient can resolve this invite.")
    }

    const now = Date.now()
    await ctx.db.patch(invite._id, {
      status: args.action,
      resolvedAt: now,
    })

    if (args.action === "accepted") {
      const friendship = await ctx.db
        .query("friendships")
        .withIndex("by_pairKey", (query) => query.eq("pairKey", invite.pairKey))
        .unique()

      if (!friendship) {
        await ctx.db.insert("friendships", {
          profileAId: invite.fromProfileId,
          profileBId: invite.toProfileId,
          pairKey: invite.pairKey,
          createdAt: now,
        })
      }
    }

    return null
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx)
    const [friendshipsA, friendshipsB, incomingInvites, outgoingInvites] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_profileAId", (query) => query.eq("profileAId", profile._id))
        .take(50),
      ctx.db
        .query("friendships")
        .withIndex("by_profileBId", (query) => query.eq("profileBId", profile._id))
        .take(50),
      ctx.db
        .query("friendInvites")
        .withIndex("by_toProfileId", (query) => query.eq("toProfileId", profile._id))
        .take(20),
      ctx.db
        .query("friendInvites")
        .withIndex("by_fromProfileId", (query) => query.eq("fromProfileId", profile._id))
        .take(20),
    ])

    const friendProfileIds = [...friendshipsA, ...friendshipsB].map((friendship) =>
      friendship.profileAId === profile._id
        ? friendship.profileBId
        : friendship.profileAId
    )
    const incomingPendingInvites = incomingInvites.filter(
      (invite) => invite.status === "pending"
    )
    const outgoingPendingInvites = outgoingInvites.filter(
      (invite) => invite.status === "pending"
    )
    const relatedProfiles = await getProfilesByIds(ctx, [
      ...friendProfileIds,
      ...incomingPendingInvites.map((invite) => invite.fromProfileId),
      ...outgoingPendingInvites.map((invite) => invite.toProfileId),
    ])
    const presenceByProfileId = await getPresenceRowsByProfileIds(
      ctx,
      friendProfileIds
    )

    return {
      friends: friendProfileIds.flatMap((otherProfileId) => {
        const otherProfile = relatedProfiles.get(otherProfileId)

        if (!otherProfile) {
          return []
        }

        const liveProfile = toLivePublicProfile({
          presenceRow: presenceByProfileId.get(otherProfileId) ?? null,
          profile: otherProfile,
        })

        return [
          {
            ...liveProfile,
            note: `${liveProfile.status} · ${liveProfile.presence}`,
          },
        ]
      }),
      incomingInvites: incomingPendingInvites.flatMap((invite) => {
        const sender = relatedProfiles.get(invite.fromProfileId)

        return sender
          ? [
              {
                inviteId: invite._id,
                from: toPublicProfile(sender),
                createdAt: invite.createdAt,
              },
            ]
          : []
      }),
      outgoingInvites: outgoingPendingInvites.flatMap((invite) => {
        const recipient = relatedProfiles.get(invite.toProfileId)

        return recipient
          ? [
              {
                inviteId: invite._id,
                to: toPublicProfile(recipient),
                createdAt: invite.createdAt,
              },
            ]
          : []
      }),
    }
  },
})
