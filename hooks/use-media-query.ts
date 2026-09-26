"use client"

import { useSyncExternalStore } from "react"

function subscribe(query: string, onChange: () => void) {
  const mediaQueryList = window.matchMedia(query)
  mediaQueryList.addEventListener("change", onChange)
  return () => mediaQueryList.removeEventListener("change", onChange)
}

/**
 * SSR-safe `window.matchMedia` subscription, `useSyncExternalStore`-based.
 *
 * Returns `null` for the server render and the hydration render (the
 * viewport is unknown there, and both sides must agree), then the real
 * value in the re-render `useSyncExternalStore` triggers right after
 * hydration. Client-side navigations get the real value immediately.
 *
 * Callers should render a neutral fallback while it is `null` instead of
 * guessing: guessing "mobile" mounts the mobile tree on desktop and then
 * swaps it (a remount), guessing "desktop" briefly overflows on phones.
 */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore<boolean | null>(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
    () => null,
  )
}
