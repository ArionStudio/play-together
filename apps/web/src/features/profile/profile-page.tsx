import { useQuery } from "convex/react"
import { UserCircle } from "@phosphor-icons/react"
import { useParams } from "react-router-dom"

import { formatDurationMs } from "@workspace/game-core"

import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { api } from "../../../convex/_generated/api"

function ProfileFallback({ usernameTag }: { usernameTag?: string }) {
  return (
    <Page>
      <PageHeader
        title={usernameTag ?? "Profile"}
        description="Profile lookup is connected when Convex and Clerk are configured."
      />
      <Surface className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
            <UserCircle className="size-7" />
          </div>
          <p className="text-sm text-muted-foreground">
            This is a local preview without a connected player record.
          </p>
        </div>
      </Surface>
    </Page>
  )
}

export function ProfilePage() {
  const { usernameTag } = useParams()
  const servicesEnabled = usePlatformServices()
  const profilePage = useQuery(
    api.profiles.profilePage,
    servicesEnabled && usernameTag ? { usernameTag } : "skip"
  )

  if (!servicesEnabled) {
    return <ProfileFallback usernameTag={usernameTag} />
  }

  if (profilePage === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading profile…</div>
  }

  if (!profilePage) {
    return (
      <Page>
        <PageHeader
          title="Profile not found"
          description="That public identity does not exist in this deployment."
        />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={profilePage.profile.usernameTag}
        description={
          profilePage.isCurrentUser
            ? "This is your public identity, recent solo history, and stored stats."
            : "Public profile backed by Clerk authentication and Convex profile data."
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Surface className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserCircle className="size-7" />
            </div>
            <div>
              <p className="font-medium">{profilePage.profile.usernameTag}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {profilePage.profile.status} · {profilePage.profile.presence}
              </p>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-border text-sm">
            {[
              ["Runs played", String(profilePage.stats.runsPlayed)],
              ["Wins", String(profilePage.stats.wins)],
              [
                "Personal best",
                profilePage.stats.personalBestMs
                  ? formatDurationMs(profilePage.stats.personalBestMs)
                  : "No wins yet",
              ],
              ["Favorite board", profilePage.stats.favoriteBoard ?? "No board yet"],
            ].map(([term, value]) => (
              <div key={term} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Surface>
        <Surface className="p-6">
          <h2 className="text-lg font-semibold">Recent runs</h2>
          {profilePage.recentRuns.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No stored solo runs yet.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-border">
              {profilePage.recentRuns.map((run) => (
                <div
                  key={run.matchId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {run.boardKey} · {run.ranked ? "Ranked" : "Practice"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {run.outcome} · {new Date(run.completedAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="font-mono text-sm">
                    {typeof run.durationMs === "number"
                      ? formatDurationMs(run.durationMs)
                      : "N/A"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </Page>
  )
}
