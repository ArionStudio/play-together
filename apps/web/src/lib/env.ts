export const env = {
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",
  convexUrl: import.meta.env.VITE_CONVEX_URL ?? "",
}

export const hasPlatformServices = Boolean(
  env.clerkPublishableKey && env.convexUrl
)
