import { useMemo } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { getConflictingIndices, getRelatedIndices } from "@workspace/sudoku-engine"

const DIGIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export type FocusKind = "cell" | "row" | "column" | "box" | "digit"

export type FocusMark = {
  kind: FocusKind
  index: number
}

export type DecorationColor = {
  ring: string
  text: string
  tint: string
}

export type Decoration = {
  color: DecorationColor
  focuses: FocusMark[]
  profileId: string
  selectedIndex: number | null
}

export type NoteMark = {
  digit: number
  profileId: string
}

export function FocusKindIcon({ kind }: { kind: FocusKind }) {
  if (kind === "cell") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6" y="6" width="4" height="4" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "row") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3.5" y="6.25" width="9" height="3.5" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "column") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6.25" y="3.5" width="3.5" height="9" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  if (kind === "box") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4.5" y="4.5" width="7" height="7" rx="0.75" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <text x="8" y="10.1" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor">
        1
      </text>
    </svg>
  )
}

function getFocusKey(focus: FocusMark) {
  return `${focus.kind}:${focus.index}`
}

export function buildFocusForCell(
  index: number,
  focusKind: Exclude<FocusKind, "digit">
): FocusMark {
  switch (focusKind) {
    case "cell":
      return { kind: "cell", index }
    case "row":
      return { kind: "row", index: Math.floor(index / 9) }
    case "column":
      return { kind: "column", index: index % 9 }
    case "box":
      return {
        kind: "box",
        index: Math.floor(index / 27) * 3 + Math.floor((index % 9) / 3),
      }
  }
}

export function toggleFocusMark(focuses: FocusMark[], nextFocus: FocusMark) {
  const key = getFocusKey(nextFocus)

  return focuses.some((focus) => getFocusKey(focus) === key)
    ? focuses.filter((focus) => getFocusKey(focus) !== key)
    : [...focuses, nextFocus]
}

export function matchesFocus(args: {
  focus: FocusMark
  index: number
  values: number[]
}) {
  const row = Math.floor(args.index / 9)
  const column = args.index % 9

  switch (args.focus.kind) {
    case "cell":
      return args.focus.index === args.index
    case "row":
      return args.focus.index === row
    case "column":
      return args.focus.index === column
    case "box":
      return args.focus.index === Math.floor(row / 3) * 3 + Math.floor(column / 3)
    case "digit":
      return args.values[args.index] === args.focus.index
  }
}

function getCellColor(
  ownerKey: string | undefined,
  paletteByProfile: Map<string, DecorationColor>
) {
  return ownerKey ? paletteByProfile.get(ownerKey)?.text : undefined
}

export function SudokuBoard({
  className,
  decorations = [],
  focuses = [],
  givens,
  highlightedDigits,
  incorrectIndices,
  noteMarks,
  notes,
  onCellClick,
  selectedIndex,
  valueOwners,
  values,
}: {
  className?: string
  decorations?: Decoration[]
  focuses?: FocusMark[]
  givens: number[]
  highlightedDigits?: Iterable<number>
  incorrectIndices?: Iterable<number>
  noteMarks?: NoteMark[][]
  notes?: number[][]
  onCellClick: (index: number) => void
  selectedIndex: number | null
  valueOwners?: Array<string | null>
  values: number[]
}) {
  const conflictSet = useMemo(() => new Set(getConflictingIndices(values)), [values])
  const incorrectSet = useMemo(() => new Set(incorrectIndices ?? []), [incorrectIndices])
  const relatedSet = useMemo(
    () => new Set(selectedIndex === null ? [] : getRelatedIndices(selectedIndex)),
    [selectedIndex]
  )
  const highlightedDigitSet = useMemo(
    () => new Set(Array.from(highlightedDigits ?? [])),
    [highlightedDigits]
  )
  const paletteByProfile = useMemo(
    () => new Map(decorations.map((decoration) => [decoration.profileId, decoration.color])),
    [decorations]
  )

  return (
    <div
      className={cn(
        "mx-auto aspect-square w-full max-w-[min(100vw-1.5rem,24rem)]",
        className
      )}
    >
      <div className="grid h-full w-full grid-cols-9 grid-rows-9 border-2 border-foreground/90 bg-border/50">
        {values.map((value, index) => {
          const row = Math.floor(index / 9)
          const column = index % 9
          const fixed = givens[index] !== 0
          const isSelected = index === selectedIndex
          const isRelated = relatedSet.has(index)
          const matchesDigit = value !== 0 && highlightedDigitSet.has(value)
          const matchesFocusMark = focuses.some((focus) =>
            matchesFocus({
              focus,
              index,
              values,
            })
          )
          const matchingDecorations = decorations.filter((decoration) =>
            decoration.focuses.some((focus) =>
              matchesFocus({
                focus,
                index,
                values,
              })
            )
          )
          const selectionDecorations = decorations.filter(
            (decoration) => decoration.selectedIndex === index
          )
          const ownerKey =
            valueOwners?.[index] !== null && valueOwners?.[index] !== undefined
              ? valueOwners[index] ?? undefined
              : undefined
          const valueColor = getCellColor(ownerKey, paletteByProfile)

          return (
            <button
              key={index}
              type="button"
              onClick={() => onCellClick(index)}
              className={cn(
                "relative flex h-full w-full items-center justify-center overflow-hidden border border-border text-sm transition-colors sm:text-base",
                row === 2 || row === 5 ? "border-b-2 border-b-foreground/90" : "",
                column === 2 || column === 5 ? "border-r-2 border-r-foreground/90" : "",
                fixed ? "bg-muted/35 font-semibold text-foreground" : "bg-background text-foreground",
                isRelated ? "bg-muted/60" : "",
                matchesDigit ? "bg-primary/10" : "",
                matchesFocusMark ? "bg-amber-500/15" : "",
                isSelected ? "ring-2 ring-inset ring-primary" : "",
                conflictSet.has(index) ? "text-destructive" : "",
                incorrectSet.has(index) ? "text-amber-700 dark:text-amber-300" : ""
              )}
            >
              {matchingDecorations.map((decoration, decorationIndex) => (
                <span
                  key={`${decoration.profileId}-${decorationIndex}-${index}`}
                  className="pointer-events-none absolute inset-0"
                  style={{ backgroundColor: decoration.color.tint }}
                />
              ))}
              {selectionDecorations.map((decoration) => (
                <span
                  key={`${decoration.profileId}-selection-${index}`}
                  className="pointer-events-none absolute inset-[2px] rounded-[2px] border-2"
                  style={{ borderColor: decoration.color.ring }}
                />
              ))}
              {value !== 0 ? (
                <span className="relative z-10" style={{ color: fixed ? undefined : valueColor }}>
                  {value}
                </span>
              ) : (
                <span className="relative z-10 grid h-full w-full grid-cols-3 place-items-center px-[1px] py-[2px] font-mono text-[10px] leading-none text-muted-foreground sm:text-xs">
                  {DIGIT_OPTIONS.map((digit) => {
                    const markedNote =
                      noteMarks?.[index]?.find((note) => note.digit === digit) ?? null
                    const hasNote = markedNote !== null || (notes?.[index]?.includes(digit) ?? false)
                    const noteColor = getCellColor(markedNote?.profileId, paletteByProfile)

                    return (
                      <span
                        key={digit}
                        className={hasNote ? "opacity-100" : "opacity-0"}
                        style={{ color: noteColor }}
                      >
                        {digit}
                      </span>
                    )
                  })}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
