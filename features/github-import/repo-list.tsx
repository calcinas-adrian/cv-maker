"use client"

import type { UseQueryResult } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import type { Result } from "@/lib/result"
import type { RepoSummary } from "./octokit"

function RepoSkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-muted/50 h-14 animate-pulse rounded-lg border"
        />
      ))}
    </div>
  )
}

export function RepoList({
  includeForks,
  onIncludeForksChange,
  query,
  onSelect,
}: {
  includeForks: boolean
  onIncludeForksChange: (value: boolean) => void
  query: UseQueryResult<Result<RepoSummary[]>>
  onSelect: (repo: RepoSummary) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-muted-foreground flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeForks}
          onChange={(e) => onIncludeForksChange(e.target.checked)}
          className="accent-primary size-4"
        />
        Incluir forks
      </label>

      {query.isPending ? (
        <RepoSkeletonRows />
      ) : query.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-destructive text-sm">
            No se pudo cargar la lista de repos.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : !query.data.ok ? (
        <div className="flex flex-col gap-2">
          <p className="text-destructive text-sm">{query.data.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : query.data.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No se encontraron repos{includeForks ? "" : " (probá incluir forks)"}.
        </p>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {query.data.data.map((repo) => (
            <button
              key={repo.fullName}
              type="button"
              onClick={() => onSelect(repo)}
              className="hover:bg-muted/50 flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors"
            >
              <span className="text-sm font-medium">
                {repo.fullName}
                {repo.fork ? (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    (fork)
                  </span>
                ) : null}
              </span>
              {repo.description ? (
                <span className="text-muted-foreground line-clamp-1 text-xs">
                  {repo.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
