import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"

import { usePlatformServices } from "@/app/providers.tsx"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { api } from "../../../convex/_generated/api"

function OnboardingDisabled() {
  return (
    <Page className="mx-auto max-w-xl">
      <PageHeader
        title="Profile setup"
        description="The profile flow exists, but Clerk and Convex are not configured in this environment."
      />
      <Surface className="p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Add the platform keys to enable public `username#tag` reservation.
        </p>
      </Surface>
    </Page>
  )
}

function ConvexAuthMisconfigured() {
  return (
    <Page className="mx-auto max-w-xl">
      <PageHeader
        title="Finish Clerk to Convex auth"
        description="Clerk sign-in succeeded, but Convex did not receive an authenticated identity for this session."
      />
      <Surface className="space-y-4 p-6 text-sm leading-6 text-muted-foreground">
        <p>
          The usual cause is a missing Clerk JWT template named `convex`, or a
          mismatched `CLERK_JWT_ISSUER_DOMAIN` in the Convex environment.
        </p>
        <p>
          Put the issuer in `apps/web/.env.convex.local`, run
          `pnpm --filter web convex:env:sync`, then restart `pnpm dev`.
        </p>
      </Surface>
    </Page>
  )
}

function normalizeUsernameInput(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, " ").trimStart()
}

function normalizeTagInput(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, "").trim()
}

function validateUsernameInput(value: string) {
  const normalized = value.trim()

  if (normalized.length < 3) {
    return "Username must be at least 3 characters."
  }

  if (normalized.length > 20) {
    return "Username must be at most 20 characters."
  }

  if (normalized.includes("#")) {
    return "Enter only the username. The #tag is assigned on the server."
  }

  if (!/^[A-Za-z0-9]+(?:[ _][A-Za-z0-9]+)*$/.test(normalized)) {
    return "Use letters, numbers, single spaces, and single underscores only."
  }

  return null
}

function validateTagInput(value: string) {
  const normalized = value.trim()

  if (normalized.length < 2) {
    return "Tag must be at least 2 characters."
  }

  if (normalized.length > 12) {
    return "Tag must be at most 12 characters."
  }

  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    return "Tag may use letters, numbers, and underscores only."
  }

  return null
}

function OnboardingConnected() {
  const navigate = useNavigate()
  const sessionStatus = useQuery(api.profiles.sessionStatus)
  const createProfile = useMutation(api.profiles.create)
  const [username, setUsername] = useState("")
  const [tag, setTag] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validationError = useMemo(() => validateUsernameInput(username), [username])
  const tagValidationError = useMemo(() => validateTagInput(tag), [tag])

  if (sessionStatus === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading profile…</div>
  }

  if (!sessionStatus.convexAuthenticated) {
    return <ConvexAuthMisconfigured />
  }

  if (sessionStatus.hasProfile && sessionStatus.usernameTag) {
    return <Navigate to={`/profile/${sessionStatus.usernameTag}`} replace />
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
      navigate(`/profile/${nextProfile.usernameTag}`)
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Profile creation failed."

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
        description="You control the full `username#tag`. The server enforces uniqueness on the combined value."
      />
      <Surface className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="username">
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
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
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
                  className="h-11 w-full rounded-lg border border-input bg-background pl-7 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: `{username.trim() || "Arion"}#{tag.trim() || "UwU"}`
          </p>
          {error || validationError || tagValidationError ? (
            <p className="text-sm text-destructive">
              {error ?? validationError ?? tagValidationError}
            </p>
          ) : null}
          <Button
            disabled={submitting || Boolean(validationError) || Boolean(tagValidationError)}
            type="submit"
          >
            {submitting ? "Creating profile…" : "Reserve identity"}
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
