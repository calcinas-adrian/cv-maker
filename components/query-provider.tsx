"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * One `QueryClient` per browser tab, created lazily inside `useState`'s
 * initializer so it survives re-renders (and so React's dev-mode double
 * render of the initializer never matters — only the first call's result
 * is ever kept). Mounted once in the root layout alongside `ThemeProvider`.
 *
 * Deliberately scoped to wrap only client-rendered content: server
 * components never call `useQuery`, so this provider has nothing to do
 * for RSC-rendered trees — it only matters to the client components that
 * actually use TanStack Query (currently: the GitHub import dialog's repo
 * list/connection-status queries).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
