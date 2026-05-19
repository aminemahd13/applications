import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-24">
      {/* Soft token-based backdrop — replaces the previous hardcoded
          blue/violet blobs. The primary tint stays subtle so the content
          (icon, title, action) is what reads first. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-background to-primary/[0.06]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-32 -top-16 h-[28rem] w-[28rem] rounded-full bg-primary/[0.06] blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 -bottom-16 h-[32rem] w-[32rem] rounded-full bg-primary/[0.05] blur-[140px]"
        aria-hidden="true"
      />

      <section className="relative z-10 w-full max-w-2xl">
        <EmptyState
          tone="empty"
          title="Page not found"
          description="The page you are looking for does not exist or may have been moved. You can go back home or browse currently available events."
          actionLabel="Go to home"
          actionHref="/"
          footer={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button variant="outline" asChild>
                <Link href="/events">
                  <Search className="mr-2 h-4 w-4" />
                  Browse events
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to platform
                </Link>
              </Button>
            </div>
          }
        />
      </section>
    </main>
  );
}
