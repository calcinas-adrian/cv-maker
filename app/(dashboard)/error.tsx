"use client"

import { ErrorFallback } from "@/components/error-fallback"

// Lives inside the (dashboard) group so the navigation stays visible when a
// page fails, instead of the root boundary replacing the whole layout.
export default function DashboardError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorFallback {...props} />
}
