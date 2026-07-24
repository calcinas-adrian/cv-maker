"use client"

import { useCallback, useEffect, useState } from "react"
import type { Layout } from "react-resizable-panels"

function readLayout(storageKey: string): Layout | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as Layout) : undefined
  } catch {
    return undefined
  }
}

function writeLayout(storageKey: string, layout: Layout) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // Storage disabled or full — layout just won't persist; not fatal.
  }
}

/**
 * Persists a `Group`'s panel sizes across reloads, keyed by `groupId`, via
 * `localStorage`.
 *
 * Deliberately implemented with `useState` + `useEffect` instead of
 * `react-resizable-panels`' own `useDefaultLayout` (which is
 * `useSyncExternalStore`-based). Reproduced under `next build --turbopack`
 * (Next 16.2.10): when `useDefaultLayout`'s result feeds a `Group`'s
 * `defaultLayout` prop AND this app's zustand store (`useEditorStore`,
 * itself `useSyncExternalStore`-based) is ALSO read anywhere in that
 * `Group`'s render tree, `Group`'s per-panel flex-grow CSS vars compute to
 * the literal invalid tokens `Infinity`/`NaN` instead of real percentages,
 * collapsing every panel to 0 width — confirmed via an isolated
 * `next build --turbopack` + real-Chromium repro/fix cycle. See
 * `components/ui/resizable.tsx` for the full root-cause writeup.
 *
 * SSR-safe by construction, same guarantee `useDefaultLayout` documents:
 * `defaultLayout` starts `undefined` on both the server render and the
 * client's first (pre-hydration) render — so markup always matches — and
 * only picks up the real persisted value in an effect AFTER mount. This
 * can cause a one-time layout shift right after mount, exactly like
 * `useDefaultLayout`'s own documented tradeoff, not a bug in this hook.
 */
export function usePersistedPanelLayout(groupId: string) {
  const storageKey = `react-resizable-panels:${groupId}`
  const [defaultLayout, setDefaultLayout] = useState<Layout | undefined>(
    undefined,
  )

  useEffect(() => {
    // Reading `localStorage` is only safe post-mount (SSR has no
    // `window`), so this MUST be an effect, not derived during render —
    // the whole reason this hook exists instead of the library's own
    // `useSyncExternalStore`-based `useDefaultLayout` (see this hook's
    // top comment).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultLayout(readLayout(storageKey))
  }, [storageKey])

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      writeLayout(storageKey, layout)
    },
    [storageKey],
  )

  return { defaultLayout, onLayoutChange }
}
