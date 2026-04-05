import type { SudokuInputPreference } from "@/lib/app-preferences.ts"

export function resolveNotesDigitInput(args: {
  activeDigit: number | null
  digit: number
  notesInput: SudokuInputPreference
  selectedIndex: number | null
}) {
  if (args.notesInput === "cell_first") {
    return {
      nextActiveDigit: null,
      shouldToggleSelectedCell: args.selectedIndex !== null,
    }
  }

  return {
    nextActiveDigit: args.activeDigit === args.digit ? null : args.digit,
    shouldToggleSelectedCell: args.selectedIndex !== null,
  }
}
