import Link from "next/link";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-24 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="pointer-events-none absolute -left-20 top-8 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-400/15" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-400/15" />

      <section className="relative z-10 mx-auto max-w-2xl text-center">
        <p className="inline-flex items-center rounded-full border border-blue-200/60 bg-blue-100/70 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          Error 404
        </p>
        <h1 className="mt-6 text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-6xl">
          Page not found
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-lg">
          The page you are looking for does not exist or may have been moved.
          You can go back home or browse currently available events.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 px-6" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go to home
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-11 px-6" asChild>
            <Link href="/events">
              <Search className="mr-2 h-4 w-4" />
              Browse events
            </Link>
          </Button>
        </div>

        <div className="mt-6">
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to platform
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
