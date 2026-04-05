import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { AppErrorBoundary } from "@/app/error-layer.tsx"
import { App } from "@/app/App.tsx"
import { AppProviders } from "@/app/providers.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <AppProviders>
          <App />
        </AppProviders>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>
)
