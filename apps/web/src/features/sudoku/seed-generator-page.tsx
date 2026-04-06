import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignInButton, useAuth } from "@clerk/clerk-react"
import { Link } from "react-router-dom"

import { Button } from "@workspace/ui/components/button"
import type { SudokuPuzzle } from "@workspace/sudoku-engine"

import { usePlatformServices } from "@/app/providers.tsx"
import { api } from "@convex/api"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"
import { runExtremeSeedCatalogAttempt } from "@/features/sudoku/extreme-seed-generator.ts"
import { hasSudokuCatalogCryptoSupport } from "@/lib/sudoku-seed-utils.ts"

type GenerateSudokuPuzzleResponse =
  | {
      difficulty: "haaard"
      id: number
      puzzle: SudokuPuzzle
    }
  | {
      difficulty: "haaard"
      error: string
      id: number
    }

type WorkerSlot = {
  busy: boolean
  worker: Worker
}

type WorkerWaiter = {
  reject: (reason?: unknown) => void
  resolve: (slotIndex: number) => void
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function seedPreview(seed: string) {
  return seed.slice(0, 12)
}

function resolveExtremeGeneratorWorkerCount() {
  if (typeof navigator === "undefined" || typeof navigator.hardwareConcurrency !== "number") {
    return 4
  }

  return Math.max(2, Math.min(8, navigator.hardwareConcurrency - 1))
}

function resolveExtremeGeneratorWorkerLimit() {
  if (typeof navigator === "undefined" || typeof navigator.hardwareConcurrency !== "number") {
    return 8
  }

  return Math.max(1, navigator.hardwareConcurrency)
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function BlockingPanel({
  action,
  description,
  title,
}: {
  action?: ReactNode
  description: string
  title: string
}) {
  return (
    <Surface className="p-6 sm:p-7">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Surface>
  )
}

function ConnectedSeedGeneratorPage() {
  const cryptoSupported = hasSudokuCatalogCryptoSupport()
  const recommendedWorkerCount = useMemo(() => resolveExtremeGeneratorWorkerCount(), [])
  const workerLimit = useMemo(() => resolveExtremeGeneratorWorkerLimit(), [])
  const workerSlotsRef = useRef<WorkerSlot[]>([])
  const workerWaitersRef = useRef<WorkerWaiter[]>([])
  const nextGenerationIdRef = useRef(0)
  const pendingRequestsRef = useRef(
    new Map<
      number,
      {
        slotIndex: number
        reject: (reason?: unknown) => void
        resolve: (value: SudokuPuzzle) => void
      }
    >()
  )
  const sessionPuzzleHashesRef = useRef(new Set<string>())
  const { isSignedIn } = useAuth()
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth()
  const sessionStatus = useQuery(api.profiles.sessionStatus, isSignedIn ? {} : "skip")
  const snapshot = useQuery(api.sudokuSeeds.getExtremeValidSeedCatalogSnapshot, { limit: 128 })
  const contributions = useQuery(
    api.sudokuSeeds.getMyExtremeSeedContributions,
    isConvexAuthenticated && sessionStatus?.hasProfile ? { limit: 8 } : "skip"
  )
  const saveExtremeValidSeed = useMutation(api.sudokuSeeds.saveExtremeValidSeed)
  const [running, setRunning] = useState(false)
  const [requestedWorkerCount, setRequestedWorkerCount] = useState(recommendedWorkerCount)
  const [savedCount, setSavedCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [invalidCount, setInvalidCount] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [lastSeed, setLastSeed] = useState<string | null>(null)
  const [lastPuzzleHash, setLastPuzzleHash] = useState<string | null>(null)
  const [lastOutcome, setLastOutcome] = useState<
    "duplicate" | "idle" | "invalid" | "saved"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const recentCatalogSeeds = useMemo(() => snapshot?.seeds.slice(0, 8) ?? [], [snapshot?.seeds])
  const activeValidCatalogCount = snapshot?.activeValidCatalogCount ?? 0
  const activeWorkerCount = Math.max(1, Math.min(workerLimit, requestedWorkerCount))

  useEffect(() => {
    if (!cryptoSupported) {
      return undefined
    }

    const pendingRequests = pendingRequestsRef.current
    const workerWaiters = workerWaitersRef.current
    const workerSlots = Array.from({ length: activeWorkerCount }, () => {
      const worker = new Worker(new URL("./sudoku-generator.worker.ts", import.meta.url), {
        type: "module",
      })

      return {
        busy: false,
        worker,
      }
    })

    function releaseWorker(slotIndex: number) {
      const slot = workerSlots[slotIndex]

      if (!slot) {
        return
      }

      const waiter = workerWaiters.shift()

      if (waiter) {
        slot.busy = true
        waiter.resolve(slotIndex)
        return
      }

      slot.busy = false
    }

    function handleMessage(event: MessageEvent<GenerateSudokuPuzzleResponse>) {
      const request = pendingRequests.get(event.data.id)

      if (!request) {
        return
      }

      pendingRequests.delete(event.data.id)
      releaseWorker(request.slotIndex)

      if ("error" in event.data) {
        request.reject(new Error(event.data.error))
        return
      }

      request.resolve(event.data.puzzle)
    }

    for (const slot of workerSlots) {
      slot.worker.addEventListener("message", handleMessage)
    }

    workerSlotsRef.current = workerSlots

    return () => {
      workerSlotsRef.current = []

      for (const request of pendingRequests.values()) {
        request.reject(new Error("Sudoku generator worker stopped."))
      }

      pendingRequests.clear()

      for (const waiter of workerWaiters.splice(0)) {
        waiter.reject(new Error("Sudoku generator worker pool stopped."))
      }

      for (const slot of workerSlots) {
        slot.worker.removeEventListener("message", handleMessage)
        slot.worker.terminate()
      }
    }
  }, [activeWorkerCount, cryptoSupported])

  useEffect(() => {
    if (!running || startedAt === null) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)

    return () => window.clearInterval(interval)
  }, [running, startedAt])

  const acquireWorkerSlot = useEffectEvent(() => {
    const workerSlots = workerSlotsRef.current
    const idleSlotIndex = workerSlots.findIndex((slot) => !slot.busy)

    if (idleSlotIndex >= 0) {
      workerSlots[idleSlotIndex]!.busy = true
      return Promise.resolve(idleSlotIndex)
    }

    return new Promise<number>((resolve, reject) => {
      workerWaitersRef.current.push({
        reject,
        resolve,
      })
    })
  })

  const generateExtremePuzzle = useEffectEvent(async (seed: string) => {
    const slotIndex = await acquireWorkerSlot()
    const slot = workerSlotsRef.current[slotIndex]

    if (!slot) {
      throw new Error("Sudoku generator worker is not available.")
    }

    return new Promise<SudokuPuzzle>((resolve, reject) => {
      const id = nextGenerationIdRef.current + 1
      nextGenerationIdRef.current = id
      pendingRequestsRef.current.set(id, {
        slotIndex,
        reject,
        resolve,
      })
      slot.worker.postMessage({
        difficulty: "haaard",
        id,
        seed,
      })
    })
  })

  useEffect(() => {
    if (
      !running ||
      !cryptoSupported ||
      !snapshot ||
      !isConvexAuthenticated ||
      !sessionStatus?.hasProfile
    ) {
      return undefined
    }

    let active = true

    async function runLoop() {
      while (active) {
        try {
          const result = await runExtremeSeedCatalogAttempt({
            existingPuzzleHashes: new Set(sessionPuzzleHashesRef.current),
            generatePuzzle: generateExtremePuzzle,
            saveCandidate: saveExtremeValidSeed,
          })

          if (!active) {
            return
          }

          setLastSeed(result.seed)
          setLastPuzzleHash(result.puzzleHash)
          setLastOutcome(result.kind)

          if (result.kind === "saved") {
            sessionPuzzleHashesRef.current.add(result.puzzleHash)
            setSavedCount((current) => current + 1)
            continue
          }

          if (result.kind === "duplicate") {
            sessionPuzzleHashesRef.current.add(result.puzzleHash)
            setDuplicateCount((current) => current + 1)
            continue
          }

          setInvalidCount((current) => current + 1)
        } catch (caughtError) {
          if (!active) {
            return
          }

          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Extreme seed generation failed."
          )
          setRunning(false)
          return
        }
      }
    }

    for (let index = 0; index < activeWorkerCount; index += 1) {
      void runLoop()
    }

    return () => {
      active = false
    }
  }, [
    cryptoSupported,
    isConvexAuthenticated,
    running,
    saveExtremeValidSeed,
    sessionStatus?.hasProfile,
    snapshot,
    activeWorkerCount,
  ])

  function handleStart() {
    sessionPuzzleHashesRef.current = new Set()
    setDuplicateCount(0)
    setElapsedMs(0)
    setError(null)
    setInvalidCount(0)
    setLastOutcome("idle")
    setLastPuzzleHash(null)
    setLastSeed(null)
    setSavedCount(0)
    setStartedAt(Date.now())
    setRunning(true)
  }

  function handleStop() {
    setRunning(false)
  }

  async function handleCopySeed() {
    if (!lastSeed || !navigator.clipboard) {
      return
    }

    try {
      await navigator.clipboard.writeText(lastSeed)
    } catch {
      // Clipboard access is optional here.
    }
  }

  if (!cryptoSupported) {
    return (
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title="Extreme Seed Catalog"
          description="Generate and submit valid Extreme Sudoku seeds without exposing timestamps or weak randomness."
        />
        <BlockingPanel
          title="Modern browser required"
          description="This page requires Web Crypto support for UUID seed generation and SHA-256 puzzle hashing. Generation is blocked until `window.crypto.randomUUID()` and `crypto.subtle.digest()` are available."
        />
      </Page>
    )
  }

  if (!isSignedIn) {
    return (
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title="Extreme Seed Catalog"
          description="Generate valid Extreme Sudoku catalog entries and dedupe them by cryptographic puzzle hash."
        />
        <BlockingPanel
          title="Sign in required"
          description="This page saves valid seeds into the shared catalog, so you need an authenticated profile before generation can start."
          action={
            <SignInButton mode="modal">
              <Button type="button">Sign In</Button>
            </SignInButton>
          }
        />
      </Page>
    )
  }

  if (sessionStatus === undefined || snapshot === undefined) {
    return (
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title="Extreme Seed Catalog"
          description="Generate valid Extreme Sudoku catalog entries and dedupe them by cryptographic puzzle hash."
        />
        <Surface className="p-6 text-sm text-muted-foreground">Loading catalog...</Surface>
      </Page>
    )
  }

  if (!sessionStatus.hasProfile) {
    return (
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title="Extreme Seed Catalog"
          description="Generate valid Extreme Sudoku catalog entries and dedupe them by cryptographic puzzle hash."
        />
        <BlockingPanel
          title="Profile required"
          description="Catalog submissions are attributed to a public profile. Finish onboarding before using this generator."
          action={
            <Button asChild type="button">
              <Link to="/onboarding">Finish profile</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader
        title="Extreme Seed Catalog"
        description="Generate Extreme candidates with opaque UUID seeds, hash puzzles with SHA-256, and skip duplicate boards before they pollute the valid catalog."
        actions={
          running ? (
            <Button type="button" variant="outline" onClick={handleStop}>
              Stop generator
            </Button>
          ) : (
            <Button type="button" onClick={handleStart}>
              Start generator
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Elapsed generation time" value={formatElapsed(elapsedMs)} />
        <MetricCard label="Active workers" value={activeWorkerCount} />
        <MetricCard label="Valid saved count" value={savedCount} />
        <MetricCard label="Duplicate skipped count" value={duplicateCount} />
        <MetricCard label="Invalid skipped count" value={invalidCount} />
        <MetricCard label="Loaded catalog sample" value={activeValidCatalogCount} />
        <MetricCard label="Your recent contributions" value={contributions?.length ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,24rem)]">
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Generator status</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The full seed stays internal. Use the preview for quick tracking, and copy the
                complete value only when you need it for debugging.
              </p>
            </div>
            {!running ? (
              <Button type="button" variant="outline" onClick={handleStart}>
                Generate again
              </Button>
            ) : null}
          </div>

          <div className="mt-5 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Processor usage</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set how many workers the generator can use so you can leave headroom for other
                  work on this PC.
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                Limit: {workerLimit} · Recommended: {recommendedWorkerCount}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={1}
                max={workerLimit}
                step={1}
                value={activeWorkerCount}
                onChange={(event) => setRequestedWorkerCount(Number(event.target.value))}
                className="w-full max-w-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Workers</span>
                <input
                  type="number"
                  min={1}
                  max={workerLimit}
                  step={1}
                  value={activeWorkerCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)

                    if (!Number.isFinite(nextValue)) {
                      return
                    }

                    setRequestedWorkerCount(nextValue)
                  }}
                  className="h-10 w-20 rounded-md border border-border bg-background px-3"
                />
              </label>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {running
                ? "Changing this while running will rebalance the worker pool."
                : "Lower values keep the generator lighter while you use the machine."}
            </p>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <dt className="text-sm text-muted-foreground">Latest seed preview</dt>
              <dd className="mt-2 font-mono text-lg">{lastSeed ? seedPreview(lastSeed) : "Idle"}</dd>
            </div>
            <div className="rounded-lg border border-border p-4">
              <dt className="text-sm text-muted-foreground">Latest outcome</dt>
              <dd className="mt-2 text-lg font-medium capitalize">{lastOutcome}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="outline" disabled={!lastSeed} onClick={handleCopySeed}>
              Copy full seed
            </Button>
            {running ? (
              <Button type="button" variant="outline" onClick={handleStop}>
                Pause
              </Button>
            ) : (
              <Button type="button" onClick={handleStart}>
                Resume
              </Button>
            )}
          </div>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          {lastSeed ? (
            <details className="mt-5 rounded-lg border border-border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Latest candidate details</summary>
              <div className="mt-3 space-y-2 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Seed:</span> {lastSeed}
                </p>
                {lastPuzzleHash ? (
                  <p>
                    <span className="font-medium text-foreground">Puzzle hash:</span>{" "}
                    {lastPuzzleHash.slice(0, 16)}...
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
        </Surface>

        <div className="space-y-6">
          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Recent contributions</h2>
            <div className="mt-4 space-y-3">
              {contributions && contributions.length > 0 ? (
                contributions.map((entry) => (
                  <div key={entry._id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-mono">{seedPreview(entry.seed)}</p>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No saved Extreme seeds yet.</p>
              )}
            </div>
          </Surface>

          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Catalog snapshot</h2>
            <div className="mt-4 space-y-3">
              {recentCatalogSeeds.length > 0 ? (
                recentCatalogSeeds.map((entry) => (
                  <div key={entry._id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono">{seedPreview(entry.seed)}</p>
                      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {entry.clueCount} clues
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {entry.createdBy} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Extreme catalog entries have been saved yet.
                </p>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </Page>
  )
}

export function SeedGeneratorPage() {
  const servicesEnabled = usePlatformServices()

  if (!servicesEnabled) {
    return (
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title="Extreme Seed Catalog"
          description="Generate valid Extreme Sudoku catalog entries and dedupe them by cryptographic puzzle hash."
        />
        <BlockingPanel
          title="Platform services required"
          description="This page depends on the live Convex and Clerk setup because it reads the shared valid-seed catalog and saves attributed contributions."
        />
      </Page>
    )
  }

  return <ConnectedSeedGeneratorPage />
}
