interface DevNotFoundFallbackProps {
  resourceLabel: string;
  slug: string;
  pagePath: string;
}

export function DevNotFoundFallback({
  resourceLabel,
  slug,
  pagePath,
}: DevNotFoundFallbackProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-16 text-zinc-900 dark:text-zinc-100">
      <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-6 dark:border-amber-700/70 dark:bg-amber-950/40">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          Missing {resourceLabel} data while running in development mode.
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          slug: <code>{slug}</code> | page: <code>{pagePath}</code>
        </p>
        <p className="mt-4 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          Development fallback is shown instead of <code>notFound()</code> to
          avoid a known Turbopack profiling crash.
        </p>
      </div>
    </main>
  );
}
