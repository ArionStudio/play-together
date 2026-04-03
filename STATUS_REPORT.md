# Play Together Status Report

## Current State

The repo is now a multi-game-ready monorepo with a working frontend shell, shared platform contracts, a deterministic Minesweeper engine, and a playable solo Minesweeper screen.

It is not yet a complete production-ready multiplayer platform.

## Implemented

### Monorepo foundation

- `pnpm` workspace with `apps/web` and shared `packages/*`
- Root `turbo` scripts for `build`, `typecheck`, `lint`, and `test`
- Shared base TypeScript config in `tsconfig.base.json`

### Shared platform packages

- `packages/game-contracts`
  - multi-game contract model
  - discriminated `RulesetConfig` by `gameKey`
  - generic `boardConfig` and `scoreConfig`
  - Minesweeper-specific `gameConfig`
  - Sudoku-specific stub `gameConfig`
- `packages/game-core`
  - deterministic `boardKey`
  - `rulesetKey`
  - leaderboard category key helpers
  - shared score config helper
- `packages/sudoku-engine`
  - placeholder stub only

### Minesweeper engine

- `packages/minesweeper-engine`
  - deterministic seeded board generation
  - safe and safe-zero first click generation options
  - reveal logic
  - flood-fill
  - flagging
  - chord/open-neighbor logic
  - win/loss evaluation
  - custom board validation
- Unit tests for the engine are implemented and passing

### Frontend app shell

- Routed React app in `apps/web/src/app`
- Mobile-first shell layout
- Landing page
- Sign-in setup page
- Onboarding page
- Profile page
- Friends, Party, Lobbies, Matchmaking, Leaderboards, Settings pages
- Minesweeper route group
- Sudoku route as upcoming game

### Playable game slice

- Solo Minesweeper screen is playable in-browser
- Preset boards supported
- Custom board input supported
- HUD includes timer, mines-left counter, restart, and action mode
- Desktop right-click flagging works
- Mobile tap-mode switching between reveal and flag works

### Backend foundation

- Convex schema scaffolded
- Clerk auth config scaffolded
- Game-agnostic platform tables scaffolded:
  - users
  - profiles
  - friendInvites
  - friendships
  - parties
  - partyMembers
  - lobbies
  - lobbyMembers
  - queueEntries
  - matches
  - matchParticipants
  - leaderboardCategories
  - leaderboardEntries
  - presence
  - notifications
- Minesweeper-specific tables scaffolded:
  - minesweeperMatches
  - minesweeperPlayerStates
  - minesweeperEvents
- Profile functions scaffolded:
  - current profile lookup
  - username onboarding
  - server-generated `username#tag`
  - basic search
  - presence touch

### Build and quality checks

- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm lint` passes
- `pnpm --filter web build` passes

## Implemented But Scaffold/Placeholder Level

These areas exist structurally, but are not complete product features yet.

### Clerk + Convex runtime integration

- App providers are wired for Clerk + Convex
- `.env.example` exists
- Real auth/backend flow is blocked until real environment variables and a real Convex deployment are configured
- Temporary local Convex `_generated` stubs are present so the repo can build now

### Social pages

- Friends, Party, Lobbies, Matchmaking, and some game routes exist as product pages
- Most of these are currently UI placeholders or static/demo views
- Full realtime flows are not implemented end to end

### Leaderboards

- Shared leaderboard category model exists
- Leaderboard page exists
- Current UI is illustrative, not backed by live Convex leaderboard queries

### Profile flow

- Onboarding/profile code is written
- It becomes fully live only after Clerk keys and Convex deployment are configured

## Not Yet Implemented

### Multiplayer gameplay

- Minesweeper race multiplayer
- Minesweeper co-op shared-board mode
- Lobby-to-match realtime transition
- Match participant live updates
- Rematch flow

### Social backend flows

- Friend invite send/accept/decline mutations end to end
- Friendship list queries end to end
- Party invite/join/leave flows end to end
- Public/private lobby create/join/start flows end to end
- Matchmaking queue lifecycle end to end

### Ranked and persistence flows

- Server-authoritative solo match creation and move validation
- Ranked result validation
- Match result persistence
- Canonical leaderboard writes from validated final match state
- Personal best and recent runs backed by database queries

### Sudoku implementation

- No Sudoku gameplay engine
- No Sudoku board UI
- No Sudoku backend match flow

### Production polish

- Audio integration
- Reconnect handling
- stale lobby cleanup
- host-leave behavior
- advanced empty/loading states
- mobile polish beyond current baseline

## External Setup Still Required

To activate the real auth and backend path:

- Set `VITE_CLERK_PUBLISHABLE_KEY`
- Set `VITE_CONVEX_URL`
- Set Convex env `CLERK_JWT_ISSUER_DOMAIN`
- Run Convex against a real deployment so generated files replace the local stubs

## Practical Summary

What is finished:

- repo architecture
- shared multi-game contracts
- shared helpers
- Minesweeper engine
- playable solo Minesweeper UI
- backend schema foundation
- profile/onboarding scaffolding

What is not finished:

- real Clerk/Convex live operation
- friends/party/lobby/matchmaking flows
- ranked persistence
- multiplayer Minesweeper
- Sudoku gameplay
