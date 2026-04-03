import type { AuthConfig } from "convex/server"

const issuerDomain =
  (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>
      }
    }
  ).process?.env?.CLERK_JWT_ISSUER_DOMAIN ?? ""

export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
