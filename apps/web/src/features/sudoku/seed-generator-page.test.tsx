import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { SeedGeneratorPage } from "@/features/sudoku/seed-generator-page.tsx"

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}))

vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ isSignedIn: false }),
}))

vi.mock("@/app/providers.tsx", () => ({
  usePlatformServices: () => true,
}))

vi.mock("@convex/api", () => ({
  api: {
    profiles: {
      sessionStatus: "profiles.sessionStatus",
    },
    sudokuSeeds: {
      getExtremeValidSeedCatalogSnapshot: "sudokuSeeds.getExtremeValidSeedCatalogSnapshot",
      getMyExtremeSeedContributions: "sudokuSeeds.getMyExtremeSeedContributions",
      saveExtremeValidSeed: "sudokuSeeds.saveExtremeValidSeed",
    },
  },
}))

vi.mock("@/lib/sudoku-seed-utils.ts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sudoku-seed-utils.ts")>(
    "@/lib/sudoku-seed-utils.ts"
  )

  return {
    ...actual,
    hasSudokuCatalogCryptoSupport: () => false,
  }
})

describe("SeedGeneratorPage", () => {
  it("blocks the generator when Web Crypto is unavailable", () => {
    render(<SeedGeneratorPage />)

    expect(screen.getByText("Modern browser required")).toBeInTheDocument()
    expect(screen.getByText(/requires Web Crypto support/i)).toBeInTheDocument()
  })
})
