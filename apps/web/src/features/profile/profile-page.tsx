import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { formatDurationMs } from "@workspace/game-core"
import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { ProfileAvatar } from "@/components/profile-avatar.tsx"
import {
  normalizeUsernameInput,
  validateUsernameInput,
} from "@/features/profile/profile-identity.ts"
import { buildProfilePath } from "@/features/profile/profile-path.ts"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function ProfileFallback({ usernameTag }: { usernameTag?: string }) {
  return (
    <Page>
      <PageHeader
        title={usernameTag ?? "Profile"}
        description="Profile lookup is available when Clerk and Convex are configured."
      />
      <Surface className="p-6">
        <div className="flex items-center gap-4">
          <ProfileAvatar
            className="size-12"
            usernameTag={usernameTag ?? "Profile"}
          />
          <p className="text-sm text-muted-foreground">Local preview only.</p>
        </div>
      </Surface>
    </Page>
  )
}

function ProfileIdentityEditor({
  username,
  tag,
}: {
  username: string
  tag: string
}) {
  const navigate = useNavigate()
  const updateUsername = useMutation(api.profiles.updateUsername)
  const [nextUsername, setNextUsername] = useState(username)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const validationError = useMemo(
    () => validateUsernameInput(nextUsername),
    [nextUsername]
  )
  const trimmedUsername = nextUsername.trim()
  const previewUsername = trimmedUsername || username
  const previewUsernameTag = `${previewUsername}#${tag}`
  const unchanged = previewUsername === username

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (validationError) {
      setError(validationError)
      setMessage(null)
      return
    }

    if (unchanged) {
      setMessage("Choose a different username to update it.")
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const updatedProfile = await updateUsername({ username: trimmedUsername })
      setNextUsername(updatedProfile.username)
      setMessage("Username updated.")
      navigate(buildProfilePath(updatedProfile.usernameTag), { replace: true })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Username update failed."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Public identity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the username part of your public tag. Your tag stays fixed as
            #{tag}.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="profile-username"
              >
                Username
              </label>
              <input
                id="profile-username"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary"
                onChange={(event) => {
                  setNextUsername(normalizeUsernameInput(event.target.value))
                  setError(null)
                  setMessage(null)
                }}
                placeholder="Arion"
                value={nextUsername}
              />
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium">Tag</p>
              <div className="flex h-11 items-center rounded-lg border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                #{tag}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
            <ProfileAvatar
              className="size-12"
              usernameTag={previewUsernameTag}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{previewUsernameTag}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Changing your username updates your public profile link and
                generated avatar.
              </p>
            </div>
          </div>
          {error || validationError ? (
            <p className="text-sm text-destructive">
              {error ?? validationError}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={saving || Boolean(validationError) || unchanged}
              type="submit"
            >
              {saving ? "Saving..." : "Save username"}
            </Button>
            {!unchanged ? (
              <Button
                onClick={() => {
                  setNextUsername(username)
                  setError(null)
                  setMessage(null)
                }}
                type="button"
                variant="outline"
              >
                Reset
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { usernameTag } = useParams()
  const servicesEnabled = usePlatformServices()
  const resolvedUsernameTag = usernameTag
    ? decodeURIComponent(usernameTag)
    : undefined
  const profilePage = useQuery(
    api.profiles.profilePage,
    servicesEnabled && resolvedUsernameTag
      ? { usernameTag: resolvedUsernameTag }
      : "skip"
  )

  if (!servicesEnabled) {
    return <ProfileFallback usernameTag={resolvedUsernameTag} />
  }

  if (profilePage === undefined) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading profile...
      </div>
    )
  }

  if (!profilePage) {
    return (
      <Page>
        <PageHeader
          title="Profile not found"
          description={
            resolvedUsernameTag
              ? `That public identity does not exist in this deployment: ${resolvedUsernameTag}`
              : "That public identity does not exist in this deployment."
          }
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
            ? "Your profile and recent runs."
            : "Public profile."
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Surface className="p-6">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              avatarSeed={profilePage.profile.avatarSeed}
              className="size-12"
              usernameTag={profilePage.profile.usernameTag}
            />
            <div>
              <p className="font-medium">{profilePage.profile.usernameTag}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {profilePage.profile.status} / {profilePage.profile.presence}
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
              [
                "Favorite board",
                profilePage.stats.favoriteBoard ?? "No board yet",
              ],
            ].map(([term, value]) => (
              <div
                key={term}
                className="flex items-center justify-between gap-4 py-3"
              >
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {profilePage.isCurrentUser ? (
            <ProfileIdentityEditor
              tag={profilePage.profile.tag}
              username={profilePage.profile.username}
            />
          ) : null}
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
                      {run.boardKey} / {run.ranked ? "Ranked" : "Practice"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {run.outcome} /{" "}
                      {new Date(run.completedAt).toLocaleString()}
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
