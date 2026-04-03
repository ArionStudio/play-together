import type { Doc } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

type ConvexCtx = MutationCtx | QueryCtx
type Identity = NonNullable<
  Awaited<ReturnType<ConvexCtx["auth"]["getUserIdentity"]>>
>

export function normalizeUsername(username: string) {
  return username.trim().replace(/\s+/g, " ")
}

export function assertValidUsername(username: string) {
  if (username.length < 3 || username.length > 20) {
    throw new Error("Username must be between 3 and 20 characters.")
  }

  if (!/^[A-Za-z0-9]+(?:[ _][A-Za-z0-9]+)*$/.test(username)) {
    throw new Error(
      "Username may use letters, numbers, single spaces, and single underscores."
    )
  }
}

export function normalizeTag(tag: string) {
  return tag.trim()
}

export function assertValidTag(tag: string) {
  if (tag.length < 2 || tag.length > 12) {
    throw new Error("Tag must be between 2 and 12 characters.")
  }

  if (!/^[A-Za-z0-9_]+$/.test(tag)) {
    throw new Error("Tag may use letters, numbers, and underscores only.")
  }
}

export function toUsernameTag(username: string, tag: string) {
  return `${username}#${tag}`
}

export function normalizeUsernameTag(usernameTag: string) {
  return usernameTag.trim().toLowerCase()
}

export function buildPairKey(leftProfileId: string, rightProfileId: string) {
  return [leftProfileId, rightProfileId].sort().join(":")
}

export async function requireIdentity(ctx: ConvexCtx) {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new Error("Authentication required.")
  }

  return identity as Identity
}

export async function getProfileByTokenIdentifier(
  ctx: ConvexCtx,
  tokenIdentifier: string
) {
  return ctx.db
    .query("profiles")
    .withIndex("by_tokenIdentifier", (query) =>
      query.eq("tokenIdentifier", tokenIdentifier)
    )
    .unique()
}

export async function getProfileByUsernameTag(
  ctx: ConvexCtx,
  usernameTag: string
) {
  return ctx.db
    .query("profiles")
    .withIndex("by_usernameTagLower", (query) =>
      query.eq("usernameTagLower", normalizeUsernameTag(usernameTag))
    )
    .unique()
}

export async function upsertUser(ctx: MutationCtx, identity: Identity) {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (query) =>
      query.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique()
  const now = Date.now()

  const userPatch = {
    clerkUserId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    email: typeof identity.email === "string" ? identity.email : undefined,
    imageUrl:
      typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined,
    updatedAt: now,
  }

  if (existingUser) {
    await ctx.db.patch(existingUser._id, userPatch)
    return existingUser._id
  }

  return ctx.db.insert("users", {
    ...userPatch,
    createdAt: now,
  })
}

export async function requireProfile(ctx: ConvexCtx) {
  const identity = await requireIdentity(ctx)
  const profile = await getProfileByTokenIdentifier(ctx, identity.tokenIdentifier)

  if (!profile) {
    throw new Error("Profile not found.")
  }

  return { identity, profile }
}

export function serializeJson(value: unknown) {
  return JSON.stringify(value)
}

export function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  return JSON.parse(value) as T
}

export function toPublicProfile(profile: Doc<"profiles">) {
  return {
    _id: profile._id,
    username: profile.username,
    tag: profile.tag,
    usernameTag: profile.usernameTag,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    presence: profile.presence,
  }
}
