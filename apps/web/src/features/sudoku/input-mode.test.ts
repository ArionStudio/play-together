import { describe, expect, it } from "vitest"

import { resolveNotesDigitInput } from "@/features/sudoku/input-mode.ts"

describe("resolveNotesDigitInput", () => {
  it("toggles the selected cell immediately in cell-first mode", () => {
    expect(
      resolveNotesDigitInput({
        activeDigit: 4,
        digit: 7,
        notesInput: "cell_first",
        selectedIndex: 12,
      })
    ).toEqual({
      nextActiveDigit: null,
      shouldToggleSelectedCell: true,
    })
  })

  it("arms the digit and updates the selected cell in number-first mode", () => {
    expect(
      resolveNotesDigitInput({
        activeDigit: null,
        digit: 5,
        notesInput: "number_first",
        selectedIndex: 18,
      })
    ).toEqual({
      nextActiveDigit: 5,
      shouldToggleSelectedCell: true,
    })
  })

  it("just arms the digit when nothing is selected in number-first mode", () => {
    expect(
      resolveNotesDigitInput({
        activeDigit: null,
        digit: 3,
        notesInput: "number_first",
        selectedIndex: null,
      })
    ).toEqual({
      nextActiveDigit: 3,
      shouldToggleSelectedCell: false,
    })
  })
})
