export default function Loading() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
              <div>
                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse mt-1 hidden sm:block" />
              </div>
            </div>
            <div className="h-8 w-24 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-1">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-5 w-12 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Filter skeleton */}
        <div className="flex justify-between">
          <div className="h-9 w-48 bg-muted rounded-lg animate-pulse" />
          <div className="flex gap-3">
            <div className="h-9 w-40 bg-muted rounded-lg animate-pulse" />
            <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Table skeleton */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <div className="h-4 w-full bg-muted/50 rounded animate-pulse" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border/50 px-4 py-3"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="h-7 w-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-72 bg-muted rounded animate-pulse" />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                <div className="h-4 w-12 bg-muted rounded animate-pulse hidden sm:block" />
                <div className="h-4 w-12 bg-muted rounded animate-pulse hidden md:block" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
