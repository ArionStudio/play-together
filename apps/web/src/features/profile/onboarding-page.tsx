import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { ProfileAvatar } from "@/components/profile-avatar.tsx"
import {
  normalizeTagInput,
  normalizeUsernameInput,
  validateTagInput,
  validateUsernameInput,
} from "@/features/profile/profile-identity.ts"
import { buildProfilePath } from "@/features/profile/profile-path.ts"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

function OnboardingDisabled() {
  return (
    <Page className="mx-auto max-w-xl">
      <PageHeader
        title="Profile setup"
        description="Add the platform env values to enable profile creation."
      />
      <Surface className="p-6 text-sm text-muted-foreground">
        Open the setup page and finish the Clerk and Convex configuration.
      </Surface>
    </Page>
  )
}

function ConvexAuthMisconfigured() {
  return (
    <Page className="mx-auto max-w-xl">
      <PageHeader
        title="Finish Clerk to Convex auth"
        description="Clerk signed in, but Convex did not receive the session."
      />
      <Surface className="space-y-3 p-6 text-sm text-muted-foreground">
        <p>
          Check the Clerk `convex` JWT template and `CLERK_JWT_ISSUER_DOMAIN`.
        </p>
        <p>Then run `pnpm convex:env:sync` and restart `pnpm dev`.</p>
      </Surface>
    </Page>
  )
}

function OnboardingConnected() {
  const navigate = useNavigate()
  const sessionStatus = useQuery(api.profiles.sessionStatus)
  const createProfile = useMutation(api.profiles.create)
  const [username, setUsername] = useState("")
  const [tag, setTag] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validationError = useMemo(
    () => validateUsernameInput(username),
    [username]
  )
  const tagValidationError = useMemo(() => validateTagInput(tag), [tag])
  const previewUsernameTag = `${username.trim() || "Arion"}#${tag.trim() || "UwU"}`

  if (sessionStatus === undefined) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading profile...
      </div>
    )
  }

  if (!sessionStatus.convexAuthenticated) {
    return <ConvexAuthMisconfigured />
  }

  if (sessionStatus.hasProfile && sessionStatus.usernameTag) {
    return <Navigate to={buildProfilePath(sessionStatus.usernameTag)} replace />
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (validationError || tagValidationError) {
      setError(validationError ?? tagValidationError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const nextProfile = await createProfile({
        username: username.trim(),
        tag: tag.trim(),
      })
      navigate(buildProfilePath(nextProfile.usernameTag))
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Profile creation failed."

      if (message.includes("Authentication required")) {
        setError(
          "Clerk is signed in, but Convex is not receiving a valid auth token. Check the Clerk `convex` JWT template and `CLERK_JWT_ISSUER_DOMAIN`."
        )
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Page className="mx-auto max-w-xl">
      <PageHeader
        title="Choose your public identity"
        description="Choose the public name used across profiles, friends, and leaderboards."
      />
      <Surface className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="username"
              >
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => {
                  setUsername(normalizeUsernameInput(event.target.value))
                  setError(null)
                }}
                placeholder="Arion"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="tag">
                Tag
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  #
                </span>
                <input
                  id="tag"
                  value={tag}
                  onChange={(event) => {
                    setTag(normalizeTagInput(event.target.value))
                    setError(null)
                  }}
                  placeholder="UwU"
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-7 text-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary"
                />
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
                A pixel avatar will be generated automatically when you create
                the profile.
              </p>
            </div>
          </div>
          {error || validationError || tagValidationError ? (
            <p className="text-sm text-destructive">
              {error ?? validationError ?? tagValidationError}
            </p>
          ) : null}
          <Button
            disabled={
              submitting ||
              Boolean(validationError) ||
              Boolean(tagValidationError)
            }
            type="submit"
          >
            {submitting ? "Creating profile..." : "Reserve identity"}
          </Button>
        </form>
      </Surface>
    </Page>
  )
}

export function OnboardingPage() {
  const servicesEnabled = usePlatformServices()
  return servicesEnabled ? <OnboardingConnected /> : <OnboardingDisabled />
}
