import { useEffect, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import { Link, useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { demoLobbies } from "@/lib/demo-data.ts"
import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { readAppPreferences, updateAppPreferences } from "@/lib/app-preferences.ts"

type GameKey = "minesweeper" | "sudoku"
type RoomMode = "race" | "coop"
type Visibility = "public" | "private"
type MinesweeperRoomPresetKey = "beginner" | "intermediate" | "expert"

function ChoiceGroup<T extends string>({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  value: T
}) {
  return (
    <div className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            type="button"
            variant={value === option.value ? "default" : "outline"}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function toMatchRoute(gameKey: GameKey, matchId: string) {
  return gameKey === "sudoku"
    ? `/games/sudoku/match/${matchId}`
    : `/games/minesweeper/match/${matchId}`
}

function LobbiesFallback() {
  return (
    <Page>
      <PageHeader title="Rooms" description="Sample data only." />
      <Surface className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_140px_120px_100px] gap-4 border-b border-border px-4 py-3 text-sm font-medium text-muted-foreground">
              <span>Room</span>
              <span>Mode</span>
              <span>Slots</span>
              <span>Access</span>
            </div>
            <div className="divide-y divide-border">
              {demoLobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_140px_120px_100px] gap-4 px-4 py-4 text-sm"
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
  const [storedPreferences] = useState(() => readAppPreferences())
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const [gameKey, setGameKey] = useState<GameKey>(
    storedPreferences.rooms.selectedGameKey
  )
  const [sudokuMode, setSudokuMode] = useState<RoomMode>(
    storedPreferences.games.sudoku.room.mode
  )
  const [minesweeperMode, setMinesweeperMode] = useState<RoomMode>(
    storedPreferences.games.minesweeper.room.mode
  )
  const [visibility, setVisibility] = useState<Visibility>(
    storedPreferences.rooms.visibility
  )
  const [difficulty, setDifficulty] = useState(
    storedPreferences.games.sudoku.room.difficulty
  )
  const [presetKey, setPresetKey] = useState<MinesweeperRoomPresetKey>(
    storedPreferences.games.minesweeper.room.presetKey
  )
  const [joinCode, setJoinCode] = useState("")
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const publicLobbies = useQuery(
    api.lobbies.listPublic,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const myLobbies = useQuery(
    api.lobbies.listMine,
    isConvexAuthenticated && sessionStatus?.hasProfile ? {} : "skip"
  )
  const createLobby = useMutation(api.lobbies.create)
  const joinLobby = useMutation(api.lobbies.join)
  const joinLobbyByCode = useMutation(api.lobbies.joinByCode)
  const leaveLobby = useMutation(api.lobbies.leave)
  const setReady = useMutation(api.lobbies.setReady)
  const startLobby = useMutation(api.lobbies.start)
  const mode = gameKey === "sudoku" ? sudokuMode : minesweeperMode

  useEffect(() => {
    updateAppPreferences((current) => ({
      ...current,
      rooms: {
        ...current.rooms,
        selectedGameKey: gameKey,
        visibility,
      },
      games: {
        ...current.games,
        minesweeper: {
          ...current.games.minesweeper,
          room: {
            mode: minesweeperMode,
            presetKey,
          },
        },
        sudoku: {
          ...current.games.sudoku,
          room: {
            mode: sudokuMode,
            difficulty,
          },
        },
      },
    }))
  }, [difficulty, gameKey, minesweeperMode, presetKey, sudokuMode, visibility])

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-xl">
        <PageHeader
          title="Rooms"
          description="Live rooms require an authenticated profile."
        />
        <Surface className="p-6">
          <SignInButton mode="modal">
            <Button>Sign In</Button>
          </SignInButton>
        </Surface>
      </Page>
    )
  }

  if (sessionStatus === undefined || isConvexLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading rooms...</div>
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
          description="You need a public profile before creating or joining rooms."
        />
        <Surface className="p-6 text-sm text-muted-foreground">
          Finish onboarding to continue.
        </Surface>
      </Page>
    )
  }

  if (publicLobbies === undefined || myLobbies === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading rooms...</div>
  }

  const hasCurrentLobby = myLobbies.length > 0

  return (
    <Page>
      <PageHeader
        title="Rooms"
        description="Create or join a room for Sudoku or Minesweeper."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Surface className="p-5">
          <h2 className="text-lg font-semibold">Create room</h2>
          <div className="mt-4 grid gap-3">
            <ChoiceGroup
              disabled={hasCurrentLobby}
              label="Game"
              onChange={setGameKey}
              options={[
                { label: "Sudoku", value: "sudoku" },
                { label: "Minesweeper", value: "minesweeper" },
              ]}
              value={gameKey}
            />
            <ChoiceGroup
              disabled={hasCurrentLobby}
              label="Mode"
              onChange={(nextMode) => {
                if (gameKey === "sudoku") {
                  setSudokuMode(nextMode)
                  return
                }

                setMinesweeperMode(nextMode)
              }}
              options={
                gameKey === "sudoku"
                  ? [
                      { label: "Duel", value: "race" },
                      { label: "Team solve", value: "coop" },
                    ]
                  : [
                      { label: "Race", value: "race" },
                      { label: "Team clear", value: "coop" },
                    ]
              }
              value={mode}
            />
            {gameKey === "sudoku" ? (
              <ChoiceGroup
                disabled={hasCurrentLobby}
                label="Difficulty"
                onChange={setDifficulty}
                options={[
                  { label: "Easy", value: "easy" },
                  { label: "Medium", value: "medium" },
                  { label: "Hard", value: "hard" },
                  { label: "Master", value: "expert" },
                  { label: "Extreme", value: "haaard" },
                ]}
                value={difficulty}
              />
            ) : (
              <ChoiceGroup
                disabled={hasCurrentLobby}
                label="Board"
                onChange={setPresetKey}
                options={[
                  { label: "Beginner", value: "beginner" },
                  { label: "Intermediate", value: "intermediate" },
                  { label: "Expert", value: "expert" },
                ]}
                value={presetKey}
              />
            )}
            <ChoiceGroup
              disabled={hasCurrentLobby}
              label="Visibility"
              onChange={setVisibility}
              options={[
                { label: "Public", value: "public" },
                { label: "Private", value: "private" },
              ]}
              value={visibility}
            />
          </div>
          <div className="mt-4">
            <Button
              disabled={hasCurrentLobby}
              onClick={async () => {
                setLobbyError(null)

                try {
                  await createLobby({
                    difficulty: gameKey === "sudoku" ? difficulty : undefined,
                    gameKey,
                    mode,
                    presetKey: gameKey === "minesweeper" ? presetKey : undefined,
                    visibility,
                  })
                } catch (error) {
                  setLobbyError(
                    error instanceof Error ? error.message : "Failed to create room."
                  )
                }
              }}
            >
              Create room
            </Button>
            {lobbyError ? (
              <p className="mt-3 text-sm text-destructive">{lobbyError}</p>
            ) : null}
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Join with code</h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                disabled={hasCurrentLobby}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 outline-none transition-colors focus:border-primary"
              />
              <Button
                disabled={hasCurrentLobby || joinCode.trim().length < 4}
                onClick={async () => {
                  setLobbyError(null)

                  try {
                    await joinLobbyByCode({ code: joinCode })
                    setJoinCode("")
                  } catch (error) {
                    setLobbyError(
                      error instanceof Error ? error.message : "Failed to join room."
                    )
                  }
                }}
                type="button"
                variant="outline"
              >
                Join
              </Button>
            </div>
          </div>
        </Surface>

        <div className="space-y-6">
          {myLobbies.length > 0 ? (
            <Surface className="overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Your rooms</h2>
              </div>
              <div className="divide-y divide-border">
                {myLobbies.map((lobbyState) => {
                  const currentMatchRoute = lobbyState.currentMemberMatchId
                    ? toMatchRoute(
                        lobbyState.lobby.gameKey,
                        lobbyState.currentMemberMatchId
                      )
                    : null

                  return (
                    <div key={lobbyState.lobby._id} className="space-y-4 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{lobbyState.lobby.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {lobbyState.gameLabel} / {lobbyState.modeLabel} /{" "}
                            {lobbyState.lobby.status}
                          </p>
                          {lobbyState.lobby.code ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Code {lobbyState.lobby.code}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          {currentMatchRoute ? (
                            <Button asChild size="sm">
                              <Link to={currentMatchRoute}>Open match</Link>
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => leaveLobby({ lobbyId: lobbyState.lobby._id })}
                          >
                            Leave
                          </Button>
                        </div>
                      </div>

                      <div className="divide-y divide-border rounded-lg border border-border">
                        {lobbyState.members.map((member) => (
                          <div
                            key={member.profile.usernameTag}
                            className="flex items-center justify-between gap-4 px-3 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {member.profile.usernameTag}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.isHost ? "Host" : "Player"} / {member.readyState}
                              </p>
                            </div>
                            {member.startedMatchId ? (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  to={toMatchRoute(
                                    lobbyState.lobby.gameKey,
                                    member.startedMatchId
                                  )}
                                >
                                  Match
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setReady({
                              lobbyId: lobbyState.lobby._id,
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
                              lobbyId: lobbyState.lobby._id,
                              readyState: "pending",
                            })
                          }
                        >
                          Unready
                        </Button>
                        {lobbyState.canStart ? (
                          <Button
                            size="sm"
                            onClick={async () => {
                              setLobbyError(null)

                              try {
                                const result = await startLobby({
                                  lobbyId: lobbyState.lobby._id,
                                })

                                if (result.matchId) {
                                  navigate(
                                    toMatchRoute(
                                      lobbyState.lobby.gameKey,
                                      result.matchId
                                    )
                                  )
                                }
                              } catch (error) {
                                setLobbyError(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to start room."
                                )
                              }
                            }}
                          >
                            Start game
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              {lobbyError ? (
                <p className="border-t border-border px-4 py-3 text-sm text-destructive">
                  {lobbyError}
                </p>
              ) : null}
            </Surface>
          ) : null}

          <Surface className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold">Open rooms</h2>
            </div>
            <div className="divide-y divide-border">
              {publicLobbies.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No public rooms are open right now.
                </p>
              ) : (
                publicLobbies.map((lobby) => {
                  const isCurrentLobby = myLobbies.some(
                    (room) => room.lobby._id === lobby._id
                  )
                  const isFull = lobby.memberCount >= lobby.maxPlayers
                  const joinDisabled = hasCurrentLobby || isFull

                  return (
                    <div
                      key={lobby._id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{lobby.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lobby.gameLabel} / {lobby.modeLabel} / {lobby.memberCount}/{lobby.maxPlayers}
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
                              error instanceof Error ? error.message : "Failed to join room."
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
        </div>
      </div>
    </Page>
  )
}

export function LobbiesPage() {
  const servicesEnabled = usePlatformServices()

  return servicesEnabled ? <ConnectedLobbiesPage /> : <LobbiesFallback />
}
