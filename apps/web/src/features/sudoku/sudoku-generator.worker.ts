/// <reference lib="webworker" />

import {
  createSudokuPuzzle,
  type SudokuDifficulty,
  type SudokuPuzzle,
} from "@workspace/sudoku-engine"

type GenerateSudokuPuzzleRequest = {
  difficulty: SudokuDifficulty
  id: number
  seed: string
}

type GenerateSudokuPuzzleResponse =
  | {
      difficulty: SudokuDifficulty
      id: number
      puzzle: SudokuPuzzle
    }
  | {
      difficulty: SudokuDifficulty
      error: string
      id: number
    }

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.addEventListener(
  "message",
  (event: MessageEvent<GenerateSudokuPuzzleRequest>) => {
    const { difficulty, id, seed } = event.data

    try {
      const puzzle = createSudokuPuzzle(difficulty, seed)
      const response: GenerateSudokuPuzzleResponse = {
        difficulty,
        id,
        puzzle,
      }

      workerScope.postMessage(response)
    } catch (error) {
      const response: GenerateSudokuPuzzleResponse = {
        difficulty,
        error:
          error instanceof Error
            ? error.message
            : "Sudoku puzzle generation failed.",
        id,
      }

      workerScope.postMessage(response)
    }
  }
)

export {}
