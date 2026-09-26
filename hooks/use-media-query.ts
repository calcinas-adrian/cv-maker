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
 * Returns `false` for the server render AND the client's first
 * (pre-hydration) render — the same "matches nothing" value on both sides,
 * so hydration never mismatches — then flips to the real value in the
 * client-only re-render `useSyncExternalStore` triggers right after mount.
 * That means a caller that renders a *narrower* layout by default (e.g.
 * mobile-first below a `min-width` query) briefly shows that narrower
 * layout on desktop until this settles, rather than the reverse: a
 * `min-width` query defaulting to "matches" would instead show the
 * *wider* desktop layout on an actual phone for that same instant, which
 * for a fixed-pixel-`minSize` panel layout means a real, if brief,
 * horizontal-overflow flash. Callers this matters for should keep it
 * behind a fallback that already covers pre-hydration (same tradeoff
 * `usePersistedPanelLayout` documents for its own layout shift).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  )
}
