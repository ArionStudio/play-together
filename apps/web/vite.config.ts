import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "./convex/_generated"),
      "@workspace/game-contracts": path.resolve(
        __dirname,
        "../../packages/game-contracts/src/index.ts"
      ),
      "@workspace/game-core": path.resolve(
        __dirname,
        "../../packages/game-core/src/index.ts"
      ),
      "@workspace/minesweeper-engine": path.resolve(
        __dirname,
        "../../packages/minesweeper-engine/src/index.ts"
      ),
      "@workspace/sudoku-engine": path.resolve(
        __dirname,
        "../../packages/sudoku-engine/src/index.ts"
      ),
    },
  },
})
