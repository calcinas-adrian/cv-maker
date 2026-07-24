/**
 * Reference / documentation module for `react-resizable-panels@4.0.7`
 * usage — deliberately NOT imported by `cv-workspace-shell.tsx` (both
 * import the library directly instead; see below).
 *
 * Design context: this project hand-writes against the REAL v4 API
 * (`Group`/`Panel`/`Separator`) instead of `npx shadcn add resizable`,
 * whose generated code still targets the old v2 API (`PanelGroup`,
 * `autoSaveId`) and fails to build against the installed v4 major (see
 * `sdd/cv-editor-panel/design` Decision 3).
 *
 * ============================================================
 * HISTORY: a `Infinity`/`NaN` flex-grow bug chased the wrong causes for
 * ~30+ build iterations before the REAL root cause was found. Full trail
 * in `sdd/cv-editor-panel/apply-progress`; summary below so nobody
 * repeats the investigation.
 * ============================================================
 *
 * SYMPTOM: every panel's flex-grow CSS custom property computed to the
 * literal invalid tokens `Infinity`/`NaN` instead of a real percentage,
 * collapsing every panel to 0 width.
 *
 * WRONG THEORIES (chased across the original Phase 4 investigation and
 * the first half of this batch, each backed by real repro/fix cycles that
 * FELT conclusive but were actually just correlated with an unrelated,
 * constant CSS bug present in every variant tested):
 *   - "Wrapping `Group`/`Panel`/`Separator` in an intermediate component
 *     breaks it" — this one IS real and stays fixed (see below), but was
 *     not the cause of the Infinity/NaN symptom specifically.
 *   - "The library's own `useDefaultLayout` (`useSyncExternalStore`)
 *     conflicts with zustand's `useSyncExternalStore` in the same Group's
 *     tree" — RE-TESTED and this does NOT reproduce the bug once the real
 *     cause (below) is fixed. `usePersistedPanelLayout` is still kept
 *     (it's a perfectly fine, simpler implementation), but it was never
 *     the fix for the Infinity/NaN bug.
 *   - "Nested `Group`s + zustand anywhere in the tree break it" — RE-
 *     TESTED and does NOT reproduce once the real cause (below) is fixed.
 *     A flat single Group is still this app's shipped topology (design
 *     Decision 4), but for unrelated reasons (matching the spec's 3
 *     independently-resizable-panels requirement), not because nesting
 *     was ever actually broken.
 *
 * REAL ROOT CAUSE (found via a systematic one-variable-at-a-time
 * isolation: bare library usage, `usePersistedPanelLayout` alone,
 * `CvListSidebar` alone, `children`-prop composition, same-file vs.
 * cross-file imports, a `cvs` prop crossing the Server→Client boundary —
 * each tested independently and each rendered CORRECTLY; only removing
 * the className below fixed it):
 *
 * The hand-authored resize-handle className included Tailwind arbitrary-
 * attribute variants meant to flip styling for a "vertical" vs.
 * "horizontal" `Group`:
 *   `aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full
 *    aria-[orientation=vertical]:cursor-row-resize`
 * `react-resizable-panels` sets a separator's `aria-orientation` to
 * describe HOW THE SEPARATOR BAR ITSELF renders (a vertical bar for a
 * `Group orientation="horizontal"` — which is the ONLY orientation this
 * app has ever used). So `aria-orientation="vertical"` is the value on
 * EVERY separator this app renders, meaning that Tailwind variant ALWAYS
 * matched and (per Tailwind's own class ordering) WON over the base
 * `w-px`/`cursor-col-resize` styles — collapsing the separator to
 * `height: 1px; width: 100%`, a full-width sliver instead of a vertical
 * divider. That corrupted the library's internal pixel-based flex-grow
 * computation into `Infinity`/`NaN` for every panel in the Group.
 *
 * FIX: drop those three arbitrary-variant classes entirely. This app only
 * ever renders `orientation="horizontal"` Groups, so the separator only
 * ever needs the vertical-bar styling — no conditional needed at all.
 *
 * ------------------------------------------------------------
 * SEPARATE, CONFIRMED-REAL issue (kept fixed, genuinely unrelated to the
 * above — this one is real, just not the Infinity/NaN cause):
 * ------------------------------------------------------------
 * Wrapping `Group`/`Panel`/`Separator` in an intermediate function
 * component — even a plain `export { Group as Foo }` re-export through a
 * shared "use client" module — reproducibly broke build output under
 * `next build --turbopack` independent of the CSS bug above. Fix:
 * `cv-workspace-shell.tsx` imports `Group`/`Panel`/`Separator` DIRECTLY
 * from `"react-resizable-panels"` (local import alias is fine, e.g.
 * `import { Group as ResizablePanelGroup } from "react-resizable-panels"`),
 * with no wrapping component and no shared custom module imported for the
 * components themselves.
 *
 * Reference shape (matches what the real call site actually renders):
 *
 * ```tsx
 * import {
 *   Group as ResizablePanelGroup,
 *   Panel as ResizablePanel,
 *   Separator as ResizableHandle,
 * } from "react-resizable-panels"
 * import { usePersistedPanelLayout } from "@/hooks/use-persisted-panel-layout"
 *
 * const { defaultLayout, onLayoutChange } = usePersistedPanelLayout("group-id")
 *
 * // NOTE: no `aria-[orientation=vertical]:*` variants — see history above.
 * const HANDLE_CLASSNAME = "bg-border w-px shrink-0 cursor-col-resize"
 *
 * <ResizablePanelGroup id="group-id" orientation="horizontal" className="h-full w-full" defaultLayout={defaultLayout} onLayoutChange={onLayoutChange}>
 *   <ResizablePanel id="left" defaultSize="30%" minSize="220px">...</ResizablePanel>
 *   <ResizableHandle className={HANDLE_CLASSNAME} />
 *   <ResizablePanel id="right" defaultSize="70%" minSize="480px">...</ResizablePanel>
 * </ResizablePanelGroup>
 * ```
 */

export {}
