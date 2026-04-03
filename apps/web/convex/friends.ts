import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import {
  buildPairKey,
  getProfileByUsernameTag,
  normalizeUsername,
  requireProfile,
  toPublicProfile,
} from "./lib"

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

      return [toPublicProfile(match)]
    }

    const normalizedUsername = normalizeUsername(rawQuery).toLowerCase()
    const matches = await ctx.db
      .query("profiles")
      .withIndex("by_usernameLower", (query) =>
        query.eq("usernameLower", normalizedUsername)
      )
      .take(10)

    return matches
      .filter((candidate) => candidate._id !== profile._id)
      .map(toPublicProfile)
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

    const friends = []

    for (const friendship of [...friendshipsA, ...friendshipsB]) {
      const otherProfileId =
        friendship.profileAId === profile._id
          ? friendship.profileBId
          : friendship.profileAId
      const otherProfile = await ctx.db.get(otherProfileId)

      if (!otherProfile) {
        continue
      }

      friends.push({
        ...toPublicProfile(otherProfile),
        note: `${otherProfile.status} · ${otherProfile.presence}`,
      })
    }

    return {
      friends,
      incomingInvites: await Promise.all(
        incomingInvites
          .filter((invite) => invite.status === "pending")
          .map(async (invite) => {
            const sender = await ctx.db.get(invite.fromProfileId)

            return sender
              ? {
                  inviteId: invite._id,
                  from: toPublicProfile(sender),
                  createdAt: invite.createdAt,
                }
              : null
          })
      ).then((rows) => rows.filter((row) => row !== null)),
      outgoingInvites: await Promise.all(
        outgoingInvites
          .filter((invite) => invite.status === "pending")
          .map(async (invite) => {
            const recipient = await ctx.db.get(invite.toProfileId)

            return recipient
              ? {
                  inviteId: invite._id,
                  to: toPublicProfile(recipient),
                  createdAt: invite.createdAt,
                }
              : null
          })
      ).then((rows) => rows.filter((row) => row !== null)),
    }
  },
})
