import { createBrowserRouter } from "react-router-dom"

import { RouteErrorLayer } from "@/app/error-layer.tsx"
import { LandingPage } from "@/features/auth/landing-page.tsx"
import { SignInPage } from "@/features/auth/sign-in-page.tsx"
import { LeaderboardsPage } from "@/features/leaderboards/leaderboards-page.tsx"
import { LobbiesPage } from "@/features/lobbies/lobbies-page.tsx"
import { MinesweeperMatchPage } from "@/features/minesweeper/match-page.tsx"
import { MinesweeperSoloPage } from "@/features/minesweeper/solo-page.tsx"
import { PartyPage } from "@/features/party/party-page.tsx"
import { OnboardingPage } from "@/features/profile/onboarding-page.tsx"
import { ProfilePage } from "@/features/profile/profile-page.tsx"
import { ShellLayout } from "@/features/shell/layout.tsx"
import { PlaceholderPage } from "@/features/shell/placeholder-page.tsx"
import { FriendsPage } from "@/features/social/friends-page.tsx"
import { SudokuMatchPage } from "@/features/sudoku/match-page.tsx"
import { SeedGeneratorPage } from "@/features/sudoku/seed-generator-page.tsx"
import { SudokuPage } from "@/features/sudoku/sudoku-page.tsx"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ShellLayout />,
    errorElement: <RouteErrorLayer />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "sign-in", element: <SignInPage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "profile/:usernameTag", element: <ProfilePage /> },
      { path: "friends", element: <FriendsPage /> },
      { path: "party", element: <PartyPage /> },
      { path: "lobbies", element: <LobbiesPage /> },
      {
        path: "matchmaking",
        element: (
          <PlaceholderPage
            title="Matchmaking is not live yet"
            description="Queue entries and related backend structures are planned, but the realtime opponent search flow is not built in this client yet."
          />
        ),
      },
      { path: "leaderboards", element: <LeaderboardsPage /> },
      {
        path: "games/minesweeper",
        element: (
          <PlaceholderPage
            title="Choose a Minesweeper route"
            description="Solo play is live, and multiplayer rooms are available from the rooms page."
            primaryHref="/games/minesweeper/solo"
            primaryLabel="Play solo"
          />
        ),
      },
      { path: "games/minesweeper/solo", element: <MinesweeperSoloPage /> },
      {
        path: "games/minesweeper/custom",
        element: <MinesweeperSoloPage />,
      },
      {
        path: "games/minesweeper/lobby/:lobbyId",
        element: (
          <PlaceholderPage
            title="Minesweeper lobby is not live yet"
            description="Lobby, ready-state, and ruleset metadata are planned, but this room screen is not implemented yet."
          />
        ),
      },
      {
        path: "games/minesweeper/match/:matchId",
        element: <MinesweeperMatchPage />,
      },
      {
        path: "games/sudoku",
        element: (
          <PlaceholderPage
            title="Choose a Sudoku route"
            description="Solo play is live, and multiplayer rooms are available from the rooms page."
            primaryHref="/games/sudoku/solo"
            primaryLabel="Play solo"
          />
        ),
      },
      { path: "games/sudoku/solo", element: <SudokuPage /> },
      { path: "games/sudoku/extreme-catalog", element: <SeedGeneratorPage /> },
      { path: "games/sudoku/match/:matchId", element: <SudokuMatchPage /> },
      {
        path: "settings",
        element: (
          <PlaceholderPage
            title="Settings are not live yet"
            description="Theme, controls, and account settings will move here once the core product routes are finished."
          />
        ),
      },
    ],
  },
])
