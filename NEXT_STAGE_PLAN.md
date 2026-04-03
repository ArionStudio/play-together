# Next Stage Implementation Plan

## Goal

Move from a scaffolded multi-game repo with local solo gameplay into a live online platform with:

- real Clerk + Convex integration
- real profile onboarding
- server-authoritative solo Minesweeper persistence
- first usable social/lobby backend flows

This stage should avoid broad feature sprawl.
The priority is converting the current architecture into a real working product spine.

## Stage Objective

By the end of this stage, a user should be able to:

1. sign in with Google through Clerk
2. complete onboarding and receive a unique `username#tag`
3. start a solo Minesweeper run through Convex
4. submit reveal/flag/chord actions through Convex mutations
5. finish a run and store the result
6. view personal run history and a real leaderboard category

If time remains after that, continue into friend search and basic lobby creation.

## Priority Order

### 1. Activate real platform services

Purpose:
Replace local fallbacks and temporary Convex stubs with real runtime behavior.

Tasks:

- configure Clerk application for Google auth
- configure Convex deployment
- set:
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `VITE_CONVEX_URL`
  - `CLERK_JWT_ISSUER_DOMAIN`
- run `convex dev`
- replace temporary local `apps/web/convex/_generated/*` stubs with real generated files
- verify authenticated frontend-to-Convex request flow

Acceptance:

- sign-in modal works
- authenticated session reaches Convex
- real generated Convex API/types are in use

### 2. Harden profile and onboarding flow

Purpose:
Make public identity creation production-safe before gameplay persistence depends on it.

Tasks:

- tighten username validation rules
- make `username#tag` reservation collision-safe
- ensure `profiles.current` works for authenticated users
- update onboarding route guard behavior
- redirect signed-in users without profiles to onboarding
- redirect users with profiles away from onboarding
- add profile lookup by `usernameTag`
- add tests for:
  - first login profile creation
  - duplicate username with different tags
  - invalid username rejection

Acceptance:

- first login always creates a valid profile
- repeated login does not create duplicates
- profile route resolves the correct public identity

### 3. Implement server-authoritative solo Minesweeper

Purpose:
Convert local solo gameplay into the canonical backend-backed match flow.

Tasks:

- define canonical solo Minesweeper ranked/unranked rulesets
- add Convex mutations/queries for:
  - create solo match
  - fetch current match state
  - reveal cell
  - toggle flag
  - chord cell
  - finalize completed/failed match
- store:
  - frozen ruleset snapshot
  - seed
  - hidden authoritative board
  - per-player visible state
  - event log
- ensure frontend no longer resolves gameplay locally once backend mode is active
- keep local mode only as fallback if services are not configured
- add invalid-action rejection:
  - action after match end
  - invalid index
  - invalid unauthenticated access

Acceptance:

- solo game uses Convex mutations for moves
- final result is computed from authoritative state
- replaying or forging client state cannot write results

### 4. Implement real leaderboard writes and queries

Purpose:
Make ranked solo results visible in the product, not just stored internally.

Tasks:

- create canonical leaderboard category registration flow
- write leaderboard entries only from validated finished matches
- prevent duplicate leaderboard writes
- add queries for:
  - global leaderboard by category
  - personal best by category
  - recent runs for current profile
- replace demo leaderboard UI data with Convex-backed results
- expose board/ruleset category metadata in the UI

Acceptance:

- finishing a ranked run writes exactly one entry
- leaderboard page shows real data
- preset and custom categories remain separate

### 5. Add solo history and profile stats

Purpose:
Make the profile and solo loop feel like a real product.

Tasks:

- add match history query for current user
- add recent runs panel on profile or game page
- add profile stat cards:
  - runs played
  - wins
  - personal best
  - favorite board
- connect profile page to real Convex data

Acceptance:

- a user can see their stored solo performance
- profile page is no longer mostly placeholder

### 6. Start real social backbone

Purpose:
Prepare the platform for multiplayer without yet implementing full race/co-op gameplay.

Tasks:

- implement friend search by `usernameTag`
- implement send invite mutation
- implement accept/decline flow
- implement friends list query
- show presence/basic availability from real profile/presence data

Acceptance:

- one user can find another by `usernameTag`
- invites can be sent and resolved
- friend list reflects accepted relationships

### 7. Add minimal real lobby flow

Purpose:
Create the first actual social launch surface before multiplayer match logic.

Tasks:

- create public/private Minesweeper lobby mutations
- join/leave lobby
- ready/unready state
- host start eligibility checks
- lobby query/subscription for members
- replace demo lobby list with live public lobbies

Acceptance:

- users can create and join lobbies
- lobby state updates live
- start conditions are enforced

## Suggested Technical Sequence

Implement in this exact order:

1. real Clerk + Convex config
2. remove stubbed Convex generated files
3. finish onboarding/profile correctness
4. implement authoritative solo match backend
5. connect solo UI to backend
6. implement leaderboard writes/queries
7. replace demo profile/leaderboard data
8. implement friend search/invites
9. implement minimal live lobbies

This keeps the data model and auth path stable before adding realtime multiplayer complexity.

## Files Most Likely To Change

### Frontend

- `apps/web/src/app/providers.tsx`
- `apps/web/src/app/router.tsx`
- `apps/web/src/features/profile/onboarding-page.tsx`
- `apps/web/src/features/profile/profile-page.tsx`
- `apps/web/src/features/minesweeper/solo-page.tsx`
- `apps/web/src/features/leaderboards/leaderboards-page.tsx`
- `apps/web/src/features/social/friends-page.tsx`
- `apps/web/src/features/lobbies/lobbies-page.tsx`

### Convex

- `apps/web/convex/schema.ts`
- `apps/web/convex/profiles.ts`
- new `apps/web/convex/matches.ts`
- new `apps/web/convex/minesweeper.ts`
- new `apps/web/convex/leaderboards.ts`
- new `apps/web/convex/friends.ts`
- new `apps/web/convex/lobbies.ts`

### Shared packages

- `packages/game-contracts/src/index.ts`
- `packages/game-core/src/index.ts`
- `packages/minesweeper-engine/src/index.ts`

## Risks To Control

### Risk: frontend and backend rules diverge

Mitigation:

- compute ruleset keys only from shared package helpers
- keep engine logic in the shared package
- keep backend authoritative for ranked sessions

### Risk: duplicate leaderboard writes

Mitigation:

- gate writes on terminal match status
- use idempotent completion logic
- store the originating match ID on leaderboard entries

### Risk: social features slow down the real gameplay slice

Mitigation:

- do not start race/co-op before solo persistence and leaderboard correctness are done
- keep social in a minimal vertical slice first

### Risk: current placeholders mask missing live integration

Mitigation:

- replace demo data page by page only after live queries exist
- keep service-disabled fallback mode explicit in UI

## Definition Of Done For Next Stage

The next stage is complete when:

- real Clerk + Convex configuration works locally
- onboarding and profiles work end to end
- solo Minesweeper is backend-authoritative
- ranked solo results persist
- leaderboards show real data
- friend search/invite basics work
- public/private lobby creation basics work

## Recommended First Task

Start with the live-service activation slice:

1. configure real Clerk and Convex
2. run real Convex codegen
3. delete the temporary `_generated` stubs
4. verify onboarding against the live backend

Without that, the rest of the stage remains partially simulated.
