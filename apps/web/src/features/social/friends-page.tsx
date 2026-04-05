import { useDeferredValue, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"

import { Button } from "@workspace/ui/components/button"

import { demoFriends } from "@/lib/demo-data.ts"
import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function PresenceLabel({
  presence,
  status,
}: {
  presence: string
  status: string
}) {
  return (
    <span className="text-sm text-muted-foreground">
      {status} · {presence}
    </span>
  )
}

function SectionHeader({
  description,
  title,
}: {
  description?: string
  title: string
}) {
  return (
    <div className="space-y-1 border-b border-border px-4 py-4 sm:px-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">{message}</p>
}

function FriendRow({
  action,
  meta,
  subtitle,
  title,
}: {
  action?: ReactNode
  meta?: ReactNode
  subtitle?: ReactNode
  title: string
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{title}</p>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
        {action}
      </div>
    </div>
  )
}

function FriendsFallback() {
  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader title="Friends" description="Sample data only." />
      <Surface className="divide-y divide-border">
        <SectionHeader
          title="Friends list"
          description="Preview data for local mode."
        />
        {demoFriends.map((friend) => (
          <FriendRow
            key={friend.usernameTag}
            title={friend.usernameTag}
            subtitle={friend.note}
            meta={friend.status}
          />
        ))}
      </Surface>
    </Page>
  )
}

function ConnectedFriendsPage() {
  const { isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const friends = useQuery(
    api.friends.list,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const searchResults = useQuery(
    api.friends.searchProfiles,
    isConvexAuthenticated && sessionStatus?.hasProfile && deferredSearch
      ? { query: deferredSearch }
      : "skip"
  )
  const sendInvite = useMutation(api.friends.sendInvite)
  const respondToInvite = useMutation(api.friends.respondToInvite)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Friends"
          description="Friend search and invites require an authenticated profile."
        />
        <Surface className="p-6">
          <SignInButton mode="modal">
            <Button>Sign In With Google</Button>
          </SignInButton>
        </Surface>
      </Page>
    )
  }

  if (sessionStatus === undefined || isConvexLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading friends...</div>
  }

  if (!isConvexAuthenticated) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish Clerk to Convex auth"
          description="Clerk signed in, but Convex did not receive the session."
        />
        <Surface className="p-6 text-sm text-muted-foreground">
          Run `pnpm convex:env:sync`, then restart `pnpm dev`.
        </Surface>
      </Page>
    )
  }

  if (!sessionStatus.hasProfile) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish onboarding"
          description="You need a public profile before using friend search."
        />
        <Surface className="p-6 text-sm text-muted-foreground">
          Finish onboarding to continue.
        </Surface>
      </Page>
    )
  }

  if (friends === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading friends...</div>
  }

  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader
        title="Friends"
        description="Search by username or `username#tag`, accept invites, and keep your active list in one place."
      />
      <Surface>
        <SectionHeader
          title="Find players"
          description="Search for an exact username or full `username#tag`."
        />
        <div className="px-4 py-4 sm:px-5">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Username or `username#tag`</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nova#2417"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
            />
          </label>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {searchResults?.map((result) => (
            <FriendRow
              key={result.usernameTag}
              title={result.usernameTag}
              subtitle={<PresenceLabel presence={result.presence} status={result.status} />}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === result.usernameTag}
                  onClick={async () => {
                    setBusyId(result.usernameTag)
                    try {
                      await sendInvite({ usernameTag: result.usernameTag })
                      setSearch("")
                    } finally {
                      setBusyId(null)
                    }
                  }}
                >
                  Invite
                </Button>
              }
            />
          ))}
          {deferredSearch && searchResults?.length === 0 ? (
            <EmptyState message="No players matched." />
          ) : null}
          {!deferredSearch ? (
            <EmptyState message="Search to send a friend invite." />
          ) : null}
        </div>
      </Surface>

      <Surface className="divide-y divide-border">
        <SectionHeader
          title="Incoming invites"
          description="Requests waiting for your response."
        />
        {friends.incomingInvites.length === 0 ? (
          <EmptyState message="No pending invites." />
        ) : (
          friends.incomingInvites.map((invite) => (
            <FriendRow
              key={invite.inviteId}
              title={invite.from.usernameTag}
              subtitle={new Date(invite.createdAt).toLocaleString()}
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      respondToInvite({
                        inviteId: invite.inviteId,
                        action: "accepted",
                      })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      respondToInvite({
                        inviteId: invite.inviteId,
                        action: "declined",
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              }
            />
          ))
        )}
      </Surface>

      <Surface className="divide-y divide-border">
        <SectionHeader
          title="Sent invites"
          description="Pending requests you already sent."
        />
        {friends.outgoingInvites.length === 0 ? (
          <EmptyState message="No outgoing invites." />
        ) : (
          friends.outgoingInvites.map((invite) => (
            <FriendRow
              key={invite.inviteId}
              title={invite.to.usernameTag}
              subtitle={new Date(invite.createdAt).toLocaleString()}
              meta="Pending"
            />
          ))
        )}
      </Surface>

      <Surface className="divide-y divide-border">
        <SectionHeader
          title="Friends list"
          description={`${friends.friends.length} active connection${friends.friends.length === 1 ? "" : "s"}.`}
        />
        {friends.friends.length === 0 ? (
          <EmptyState message="No friends yet." />
        ) : (
          friends.friends.map((friend) => (
            <FriendRow
              key={friend.usernameTag}
              title={friend.usernameTag}
              meta={<PresenceLabel presence={friend.presence} status={friend.status} />}
            />
          ))
        )}
      </Surface>
    </Page>
  )
}

export function FriendsPage() {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? <ConnectedFriendsPage /> : <FriendsFallback />
}
