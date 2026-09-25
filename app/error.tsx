"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function RootError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorFallback {...props} />
}
