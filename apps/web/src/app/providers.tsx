import type { ReactNode } from "react"
import { ClerkProvider, useAuth } from "@clerk/clerk-react"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { createContext, useContext } from "react"

import { env, hasPlatformServices } from "@/lib/env.ts"

const PlatformServicesContext = createContext(hasPlatformServices)

const convexClient = env.convexUrl ? new ConvexReactClient(env.convexUrl) : null

function ClerkConvexBridge({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return <>{children}</>
  }

  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!hasPlatformServices || !convexClient) {
    return (
      <PlatformServicesContext.Provider value={false}>
        {children}
      </PlatformServicesContext.Provider>
    )
  }

  return (
    <PlatformServicesContext.Provider value>
      <ClerkProvider publishableKey={env.clerkPublishableKey}>
        <ClerkConvexBridge>{children}</ClerkConvexBridge>
      </ClerkProvider>
    </PlatformServicesContext.Provider>
  )
}

export function usePlatformServices() {
  return useContext(PlatformServicesContext)
}
