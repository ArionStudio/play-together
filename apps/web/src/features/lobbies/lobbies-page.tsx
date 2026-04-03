import { useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import { Link, useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { demoLobbies } from "@/lib/demo-data.ts"
import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { api } from "../../../convex/_generated/api"

function LobbiesFallback() {
  return (
    <Page>
      <PageHeader
        title="Lobbies"
        description="Lobby metadata is already separated from game rules, so public and private rooms can reuse the same game surfaces."
      />
      <Surface className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(120px,0.7fr)_100px_100px] gap-4 border-b border-border px-4 py-3 text-sm font-medium text-muted-foreground">
              <span>Lobby</span>
              <span>Mode</span>
              <span>Slots</span>
              <span>Access</span>
            </div>
            <div className="divide-y divide-border">
              {demoLobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(120px,0.7fr)_100px_100px] gap-4 px-4 py-4 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{lobby.title}</p>
                    <p className="mt-1 text-muted-foreground">{lobby.id}</p>
                  </div>
                  <p className="text-muted-foreground">{lobby.mode}</p>
                  <p>{lobby.slots}</p>
                  <p>{lobby.visibility}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Surface>
    </Page>
  )
}

function ConnectedLobbiesPage() {
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const [title, setTitle] = useState("")
  const [visibility, setVisibility] = useState<"public" | "private">("public")
  const [presetKey, setPresetKey] = useState("beginner")
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const publicLobbies = useQuery(
    api.lobbies.listPublic,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const currentLobby = useQuery(
    api.lobbies.getCurrent,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const createLobby = useMutation(api.lobbies.create)
  const joinLobby = useMutation(api.lobbies.join)
  const leaveLobby = useMutation(api.lobbies.leave)
  const setReady = useMutation(api.lobbies.setReady)
  const startLobby = useMutation(api.lobbies.start)

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Lobbies"
          description="Live lobby creation and membership require an authenticated profile."
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
    return <div className="p-6 text-sm text-muted-foreground">Loading lobbies…</div>
  }

  if (!isConvexAuthenticated) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Finish Clerk to Convex auth"
          description="Clerk sign-in succeeded, but Convex is not receiving an authenticated session for lobby features."
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
          description="You need a public profile before creating or joining lobbies."
        />
        <Surface className="p-6 text-sm leading-6 text-muted-foreground">
          Open `/onboarding` to reserve your `username#tag`.
        </Surface>
      </Page>
    )
  }

  if (publicLobbies === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading lobbies…</div>
  }

  if (currentLobby === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading lobbies…</div>
  }

  const hasCurrentLobby = currentLobby !== null
  const createDisabled = hasCurrentLobby
  const createHelperText = hasCurrentLobby
    ? "Leave your current lobby before creating another one."
    : "Create a public or private room and choose how many players it allows."

  return (
    <Page>
      <PageHeader
        title="Lobbies"
        description="Public and private solo lobbies are live. Membership, ready state, and host start checks update from Convex."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Surface className="p-5">
          <h2 className="text-lg font-semibold">Create lobby</h2>
          <p className="mt-2 text-sm text-muted-foreground">{createHelperText}</p>
          <div className="mt-4 grid gap-3">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Expert sprint"
                disabled={createDisabled}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Preset</span>
              <select
                value={presetKey}
                onChange={(event) => setPresetKey(event.target.value)}
                disabled={createDisabled}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
              >
                <option value="beginner">Beginner ranked</option>
                <option value="intermediate">Intermediate ranked</option>
                <option value="expert">Expert ranked</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Visibility</span>
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as "public" | "private")
                }
                disabled={createDisabled}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Player limit</span>
              <input
                type="number"
                min={1}
                max={8}
                value={maxPlayers}
                onChange={(event) => {
                  setMaxPlayers(Number(event.target.value))
                  setLobbyError(null)
                }}
                disabled={createDisabled}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>
          <div className="mt-4">
            <Button
              disabled={createDisabled}
              onClick={async () => {
                setLobbyError(null)

                if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 8) {
                  setLobbyError("Player limit must be an integer between 1 and 8.")
                  return
                }

                try {
                  const lobby = await createLobby({
                    title,
                    visibility,
                    presetKey,
                    maxPlayers,
                  })

                  if (lobby?._id) {
                    setTitle("")
                  }
                } catch (error) {
                  setLobbyError(
                    error instanceof Error ? error.message : "Failed to create lobby."
                  )
                }
              }}
            >
              Create lobby
            </Button>
            {lobbyError ? (
              <p className="mt-3 text-sm text-destructive">{lobbyError}</p>
            ) : null}
          </div>
        </Surface>
        <div className="space-y-6">
          <Surface className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold">Public lobbies</h2>
            </div>
            <div className="divide-y divide-border">
              {publicLobbies.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No public lobbies are open right now.
                </p>
              ) : (
                publicLobbies.map((lobby) => {
                  const isCurrentLobby = currentLobby?.lobby._id === lobby._id
                  const isFull = lobby.memberCount >= lobby.maxPlayers
                  const joinDisabled = Boolean(currentLobby) || isFull

                  return (
                    <div
                      key={lobby._id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{lobby.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lobby.mode} · {lobby.boardKey} · {lobby.memberCount}/
                          {lobby.maxPlayers}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={joinDisabled}
                        onClick={async () => {
                          setLobbyError(null)

                          try {
                            await joinLobby({ lobbyId: lobby._id })
                          } catch (error) {
                            setLobbyError(
                              error instanceof Error
                                ? error.message
                                : "Failed to join lobby."
                            )
                          }
                        }}
                      >
                        {isCurrentLobby ? "Joined" : isFull ? "Full" : "Join"}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </Surface>
          {currentLobby ? (
            <Surface className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{currentLobby.lobby.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentLobby.lobby.visibility} · {currentLobby.lobby.status}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => leaveLobby({ lobbyId: currentLobby.lobby._id })}
                >
                  Leave
                </Button>
              </div>
              <div className="mt-4 divide-y divide-border">
                {currentLobby.members.map((member) => (
                  <div
                    key={member.profile.usernameTag}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{member.profile.usernameTag}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.isHost ? "Host" : "Member"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {member.startedMatchId ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/games/minesweeper/match/${member.startedMatchId}`}>
                            Match
                          </Link>
                        </Button>
                      ) : null}
                      <p className="text-sm text-muted-foreground">{member.readyState}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setReady({
                      lobbyId: currentLobby.lobby._id,
                      readyState: "ready",
                    })
                  }
                >
                  Ready
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setReady({
                      lobbyId: currentLobby.lobby._id,
                      readyState: "pending",
                    })
                  }
                >
                  Unready
                </Button>
                {currentLobby.canStart ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      setLobbyError(null)

                      try {
                        const result = await startLobby({
                          lobbyId: currentLobby.lobby._id,
                        })

                        if (result.matchId) {
                          navigate(`/games/minesweeper/match/${result.matchId}`)
                        }
                      } catch (error) {
                        setLobbyError(
                          error instanceof Error ? error.message : "Failed to start lobby."
                        )
                      }
                    }}
                  >
                    Start game
                  </Button>
                ) : null}
                {currentLobby.currentMemberMatchId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/games/minesweeper/match/${currentLobby.currentMemberMatchId}`}>
                      Open match
                    </Link>
                  </Button>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {currentLobby.currentMemberMatchId
                  ? "The lobby has been started. Open your generated match from here."
                  : currentLobby.canStart
                    ? "The host can start now. Only the joined players need to be ready, not the full player cap."
                    : "Every joined player must be ready before the host can start."}
              </p>
              {lobbyError ? (
                <p className="mt-4 text-sm text-destructive">{lobbyError}</p>
              ) : null}
            </Surface>
          ) : null}
        </div>
      </div>
    </Page>
  )
}

export function LobbiesPage() {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? <ConnectedLobbiesPage /> : <LobbiesFallback />
}
