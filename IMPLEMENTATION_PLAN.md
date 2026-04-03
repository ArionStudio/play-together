# Play Together Implementation Plan

## Goal

Build a mobile-first multiplayer browser gaming platform with a reusable multi-game architecture.
v1 ships Minesweeper first, while preserving clean extension points for Sudoku and later games.

Locked stack:

- Monorepo: `pnpm`
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Convex
- Auth: Clerk
- Sign-in: Google only
- Language: English only

## Immediate Bootstrapping

Initialize the repo with the required shadcn monorepo preset:

```bash
pnpm dlx shadcn@latest init --preset b51GGpX1O --template vite --monorepo
```

Then install runtime dependencies in the generated web app:

```bash
pnpm --filter web add convex @clerk/clerk-react react-router-dom
```

If the generated app/package names differ, keep the scaffold and adapt imports/scripts instead of rewriting the workspace layout.

## Target Workspace Layout

```text
play-together/
  apps/
    web/
      src/
        app/
        components/
        features/
        hooks/
        lib/
        routes/
        styles/
      convex/
      public/
  packages/
    ui/
    game-contracts/
    game-core/
    minesweeper-engine/
    sudoku-engine/
```

## Package Responsibilities

### `apps/web`

- App shell, routing, authenticated layout, public pages
- Clerk provider setup
- Convex React client setup
- Feature UIs for onboarding, friends, parties, lobbies, matchmaking, leaderboards, game screens

### `packages/ui`

- Shared app-level UI wrappers over shadcn primitives
- Shared mobile-first layout primitives
- Shared HUD/panel/card patterns for future games

### `packages/game-contracts`

- `GameKey`, `TeamMode`, `MatchVisibility`
- Cross-game DTOs for rulesets, lobbies, matches, leaderboard categories
- Shared validators and literal key registries

### `packages/game-core`

- Ruleset helpers
- Score/rank/session helpers
- Serialization and normalization helpers
- Shared config key builders for leaderboard and board categories

### `packages/minesweeper-engine`

- Pure deterministic TypeScript engine
- Seeded board generation
- Reveal, flag, chord, flood-fill, win/loss logic
- Config validation
- No React or Convex dependencies

### `packages/sudoku-engine`

- Stub package only in milestone one
- Shared contract exports and placeholder APIs

## Frontend Architecture

Use route-based feature organization in `apps/web/src`.

Recommended routes:

- `/`
- `/sign-in`
- `/onboarding`
- `/profile/:usernameTag`
- `/friends`
- `/party`
- `/lobbies`
- `/matchmaking`
- `/leaderboards`
- `/games/minesweeper`
- `/games/minesweeper/solo`
- `/games/minesweeper/custom`
- `/games/minesweeper/lobby/:lobbyId`
- `/games/minesweeper/match/:matchId`
- `/games/sudoku`
- `/settings`

Recommended feature folders:

- `features/auth`
- `features/profile`
- `features/social`
- `features/party`
- `features/lobbies`
- `features/matchmaking`
- `features/leaderboards`
- `features/minesweeper`
- `features/sudoku`
- `features/shell`

## UI Direction

- Use shadcn as the base system, not as the final product look
- Define theme tokens in CSS variables from day one
- Prefer compact numeric typography for timers, counters, rank values, and tags
- Keep the board visually dominant over shell chrome
- Use mobile-first stacked HUD patterns and bottom drawers/sheets for secondary actions
- Keep touch targets comfortable and board interactions scroll-safe

## Auth and Identity Model

Clerk handles authentication. Convex owns public player identity and all game/social state.

### Required env vars

`apps/web/.env.local`

```bash
VITE_CLERK_PUBLISHABLE_KEY=...
VITE_CONVEX_URL=...
```

Convex deployment env:

```bash
CLERK_JWT_ISSUER_DOMAIN=https://<your-clerk-domain>
```

### Flow

1. User signs in with Clerk Google auth.
2. App checks Convex for a profile mapped to Clerk user ID.
3. If absent, redirect to onboarding.
4. Onboarding collects `username`.
5. Convex generates a unique `tag`, stores `usernameTag`, and creates the profile.

### Identity rules

- Public identity is `username#tag`
- `username` alone is not unique
- `usernameTag` is unique
- `tag` is generated server-side

## Core Convex Domain Model

Create game-agnostic platform tables first:

- `users`
- `profiles`
- `friendInvites`
- `friendships`
- `parties`
- `partyMembers`
- `lobbies`
- `lobbyMembers`
- `queueEntries`
- `matches`
- `matchParticipants`
- `leaderboardCategories`
- `leaderboardEntries`
- `presence`
- `notifications`

Minesweeper-specific tables:

- `minesweeperMatches`
- `minesweeperPlayerStates`
- `minesweeperEvents`

Later:

- `sudokuMatches`
- `sudokuPlayerStates`

## Schema Rules

Every match, lobby, queue, and leaderboard category must carry game-specific dimensions as data, not UI assumptions.

Mandatory dimensions:

- `gameKey`
- `modeKey`
- `rulesetKey`
- `ranked`
- `teamMode`
- `boardConfig`
- `scoreConfig`

This prevents a future rewrite when Sudoku and additional modes are added.

## Shared Contracts

Put the user-provided core types into `packages/game-contracts`.

Also add:

- `PresetBoardKey`
- `MatchStatus`
- `LobbyStatus`
- `ReadyState`
- `LeaderboardSortDirection`

Add helpers for:

- `buildBoardKey(boardConfig)`
- `buildRulesetKey(ruleset)`
- `buildLeaderboardCategoryKey(ruleset)`

Keys must be deterministic and stable across frontend/backend/package boundaries.

## Minesweeper Engine Design

Implement the engine as pure deterministic functions:

- `createBoard(config, seed)`
- `createPlayerState(board)`
- `revealCell(board, playerState, index, options)`
- `toggleFlag(playerState, index)`
- `chordCell(board, playerState, index)`
- `evaluateWin(board, playerState)`
- `validateBoardConfig(config)`

Rules:

- Flat array board representation
- Deterministic by `seed`
- Flood-fill for zero cells
- Chording/open-neighbor support
- First-click safety support
- Config validation for width, height, and mine count/density

Preset defaults:

- Beginner: `9x9 / 10`
- Intermediate: `16x16 / 40`
- Expert: `30x16 / 99`

Custom constraints:

- Width: `6..40`
- Height: `6..30`
- Mine ratio max: `35%`

## Server Authority

For ranked play:

- Server stores seed and frozen ruleset
- Client sends actions only
- Convex validates reveal/flag/chord mutations
- Leaderboard writes happen only from validated terminal states

For unranked play:

- Use the same authoritative flow in v1 for consistency
- Do not add local-only boards in the first milestone

## Match and Social Flows

### Friends

- Search by `usernameTag`
- Send invite
- Accept/decline
- View presence
- Invite into party or lobby

### Parties

- Create party
- Invite friend
- Join/leave
- Track leader
- Let leader launch lobby with current party members

### Lobbies

- Public or private
- Browse public lobbies
- Join private lobby by code or invite
- Ready/unready state
- Host starts only when rules are satisfied

### Matchmaking

- Queue entries are generic, keyed by game and ruleset
- Matchmaking-enabled rulesets are configuration-driven
- Successful matches can create either a lobby or direct match depending on the mode

## Leaderboards

Separate categories by:

- game
- mode
- ranked flag
- preset vs custom board
- exact board key
- score rule

Required views:

- global leaderboard
- personal best
- recent personal runs

Write rules:

- only completed validated matches count
- only canonical category per exact ranked ruleset
- no mixing preset and custom boards
- tie-break by earlier completion timestamp unless overridden by mode design

## Recommended Delivery Sequence

### Phase 0: Bootstrap

- Initialize monorepo with the required preset
- Install Convex, Clerk, React Router
- Add TypeScript path aliases across apps/packages
- Add app providers and a protected route shell
- Add theme tokens and base layout primitives

Acceptance:

- App boots
- Clerk Google sign-in works locally
- Convex can be queried from the app
- Authenticated shell renders

### Phase 1: Platform Foundation

- Implement `game-contracts`, `game-core`, `sudoku-engine` stubs
- Create Convex schema and indexes for platform entities
- Implement onboarding and `username#tag` reservation
- Add shell navigation and profile-aware routing

Acceptance:

- First login creates a valid profile
- `usernameTag` is unique
- Game-agnostic match and leaderboard types exist

### Phase 2: Social and Lobby Layer

- Friend search/invite/accept/decline
- Friends list with presence
- Party creation and invite flow
- Public/private lobbies
- Ready state and host controls
- Queue entry creation for future matchmaking

Acceptance:

- Users can find friends by `usernameTag`
- Parties work
- Lobbies work
- Users can ready and prepare for launch

### Phase 3: Minesweeper Engine

- Implement deterministic engine
- Add engine unit tests
- Add ruleset/config validation helpers

Acceptance:

- Seeded generation is reproducible
- Reveal/chord/win/loss rules are tested
- Invalid custom boards are rejected

### Phase 4: Minesweeper Solo

- Solo game page and HUD
- Preset and custom boards
- Server-backed match creation and move handling
- Result persistence and personal history
- Ranked solo leaderboard writes

Acceptance:

- Solo Minesweeper is fully playable
- Ranked results are validated and stored
- Solo leaderboards show correct categories

### Phase 5: Minesweeper Race Multiplayer

- Lobby-to-match transition
- Shared seed, per-player visibility
- Live participant status
- Ranked and unranked race categories

Acceptance:

- Multiple players can race on the same board
- Live progress is visible
- Results land in the correct categories

### Phase 6: Minesweeper Co-op Multiplayer

- Shared board state
- Shared team-wipe loss rule
- Co-op room flow
- Rematch support

Acceptance:

- Shared-board co-op works end to end
- Team loss ends session for everyone
- Rematch path exists

### Phase 7: Matchmaking and Discovery

- Opponent search UI
- Queue lifecycle and stale entry cleanup
- Quick join integration for supported rulesets

### Phase 8: Mobile Polish and Audio

- Board scaling and viewport fixes
- Drawer/sheet polish
- Reconnect/loading/empty states
- Curated SFX integration and asset manifest

### Phase 9: Sudoku Preparation

- Add Sudoku card/page as upcoming
- Keep schema/contracts/navigation ready
- Do not implement Sudoku gameplay

## Testing Strategy

### Unit tests

- ruleset key builders
- board config validation
- seed reproducibility
- mine placement limits
- first-click safety behavior
- flood-fill
- chording
- win/loss detection
- score computation helpers

### Integration tests

- Clerk-authenticated profile creation
- onboarding and username collisions
- friend invite accept/decline
- party invitation
- lobby create/join/ready/start
- match creation from lobby
- leaderboard write after valid completion

### E2E tests

- sign in
- first-time onboarding
- create public Minesweeper lobby
- invite friend to private lobby
- finish solo ranked game
- complete two-player race
- complete co-op and observe shared loss

## Risks and Design Safeguards

- Freeze rulesets at match creation time
- Reject gameplay actions after match end
- Reject invalid board configs on both client and server
- Prevent duplicate leaderboard writes with idempotent terminal-state handling
- Expire stale lobbies and queue entries
- Keep ranked flows fully server-authoritative
- Store enough match event data to debug disputes later

## Recommended First Build Slice

Do not start with gameplay UI.
Start with the platform spine:

1. Bootstrap monorepo and providers
2. Add shared contracts and key builders
3. Add Convex schema for profiles, matches, lobbies, leaderboards
4. Implement onboarding and `username#tag`
5. Implement Minesweeper engine with tests
6. Wire solo Minesweeper against authoritative Convex mutations

This sequence locks the data model early, proves auth/data flow, and avoids building a game UI on unstable foundations.
