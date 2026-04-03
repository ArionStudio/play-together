import { useDeferredValue, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"

import { Button } from "@workspace/ui/components/button"

import { demoFriends } from "@/lib/demo-data.ts"
import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { api } from "../../../convex/_generated/api"

function FriendsFallback() {
  return (
    <Page>
      <PageHeader
        title="Friends"
        description="This preview shows sample friend records. Search and invites turn on after platform setup."
      />
      <Surface className="divide-y divide-border">
        {demoFriends.map((friend) => (
          <div
            key={friend.usernameTag}
            className="flex flex-col gap-2 px-4 py-4 sm:grid sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center"
          >
            <div className="min-w-0">
              <p className="font-medium">{friend.usernameTag}</p>
              <p className="mt-1 text-sm text-muted-foreground">{friend.note}</p>
            </div>
            <p className="text-sm text-muted-foreground sm:text-right">{friend.status}</p>
          </div>
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
    return <div className="p-6 text-sm text-muted-foreground">Loading friends…</div>
  }

  if (!isConvexAuthenticated) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish Clerk to Convex auth"
          description="Clerk sign-in succeeded, but Convex is not receiving an authenticated session for social features."
        />
        <Surface className="p-6 text-sm leading-6 text-muted-foreground">
          Put `CLERK_JWT_ISSUER_DOMAIN` in `apps/web/.env.convex.local`, run
          `pnpm --filter web convex:env:sync`, then restart `pnpm dev`.
        </Surface>
      </Page>
    )
  }

  if (!sessionStatus.hasProfile) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish onboarding"
          description="You need a public profile before using friend search and invites."
        />
        <Surface className="p-6 text-sm leading-6 text-muted-foreground">
          Open `/onboarding` to reserve your `username#tag`.
        </Surface>
      </Page>
    )
  }

  if (friends === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading friends…</div>
  }

  return (
    <Page>
      <PageHeader
        title="Friends"
        description="Friend identities are built around public username tags instead of private account details."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Surface className="p-5">
          <h2 className="text-lg font-semibold">Find players</h2>
          <label className="mt-4 block space-y-2 text-sm">
            <span className="font-medium">
              Enter the exact username or `username#tag`
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Exact match, for example Nova#2417"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
            />
          </label>
          <div className="mt-4 divide-y divide-border">
            {searchResults?.map((result) => (
              <div
                key={result.usernameTag}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium">{result.usernameTag}</p>
                  <p className="text-sm text-muted-foreground">
                    {result.status} · {result.presence}
                  </p>
                </div>
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
              </div>
            ))}
            {deferredSearch && searchResults?.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No players matched.</p>
            ) : null}
          </div>
        </Surface>
        <div className="space-y-6">
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Incoming invites</h2>
            <div className="mt-4 divide-y divide-border">
              {friends.incomingInvites.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">No pending invites.</p>
              ) : (
                friends.incomingInvites.map((invite) => (
                  <div
                    key={invite.inviteId}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{invite.from.usernameTag}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </p>
                    </div>
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
                  </div>
                ))
              )}
            </div>
          </Surface>
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Friends list</h2>
            <div className="mt-4 divide-y divide-border">
              {friends.friends.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">No friends yet.</p>
              ) : (
                friends.friends.map((friend) => (
                  <div
                    key={friend.usernameTag}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{friend.usernameTag}</p>
                      <p className="text-sm text-muted-foreground">{friend.note}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {friend.status} · {friend.presence}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Surface>
        </div>
      </div>
    </Page>
  )
}

export function FriendsPage() {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? <ConnectedFriendsPage /> : <FriendsFallback />
}
