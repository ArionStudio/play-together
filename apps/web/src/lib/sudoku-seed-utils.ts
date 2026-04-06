import type { SudokuDifficulty } from "@workspace/sudoku-engine"

export type SudokuPuzzleHashInput = {
  difficulty: SudokuDifficulty
  givens: number[]
}

type CryptoLike = Pick<Crypto, "randomUUID" | "subtle">

function getBrowserCrypto() {
  return typeof globalThis === "undefined" ? undefined : globalThis.crypto
}

export function hasSudokuCatalogCryptoSupport(cryptoOverride?: CryptoLike) {
  const crypto = cryptoOverride ?? getBrowserCrypto()

  return Boolean(
    crypto &&
      typeof crypto.randomUUID === "function" &&
      crypto.subtle &&
      typeof crypto.subtle.digest === "function" &&
      typeof TextEncoder !== "undefined"
  )
}

export function createSudokuCatalogSeed(cryptoOverride?: CryptoLike) {
  const crypto = cryptoOverride ?? getBrowserCrypto()

  if (!hasSudokuCatalogCryptoSupport(crypto)) {
    throw new Error("This browser does not support the required Web Crypto APIs.")
  }

  return crypto!.randomUUID()
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  return Array.from(view, (value) => value.toString(16).padStart(2, "0")).join("")
}

export async function computeSudokuPuzzleHash(
  args: SudokuPuzzleHashInput,
  cryptoOverride?: CryptoLike
) {
  const crypto = cryptoOverride ?? getBrowserCrypto()

  if (!hasSudokuCatalogCryptoSupport(crypto)) {
    throw new Error("This browser does not support the required Web Crypto APIs.")
  }

  const stablePayload = JSON.stringify({
    difficulty: args.difficulty,
    givens: args.givens,
  })
  const encoded = new TextEncoder().encode(stablePayload)
  const digest = await crypto!.subtle.digest("SHA-256", encoded)

  return bytesToHex(digest)
}
