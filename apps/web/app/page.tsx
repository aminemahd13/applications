import Link from "next/link";
import {
  Calendar,
  ClipboardCheck,
  Users,
  ArrowRight,
  Search,
  FileText,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Calendar,
    title: "Discover Events",
    description:
      "Browse competitions, camps, and programs. Filter by date, location, and format to find your perfect match.",
  },
  {
    icon: ClipboardCheck,
    title: "Apply Seamlessly",
    description:
      "Multi-step application forms with auto-save drafts. Upload documents, track progress, and submit with confidence.",
  },
  {
    icon: BarChart3,
    title: "Track Everything",
    description:
      "Real-time status updates on every application. View decisions, revision requests, and deadlines in one dashboard.",
  },
  {
    icon: Users,
    title: "Collaborative Reviews",
    description:
      "Organizers assign reviewers, set rubrics, and collect structured feedback. Fair and transparent evaluations.",
  },
  {
    icon: FileText,
    title: "Custom Workflows",
    description:
      "Multi-stage workflows with forms, reviews, and approval gates. Fully configurable to match any process.",
  },
  {
    icon: Sparkles,
    title: "Beautiful Microsites",
    description:
      "Build event landing pages with a drag-and-drop block editor. Publish instantly with custom domains.",
  },
];

const steps = [
  {
    step: "01",
    title: "Browse",
    description: "Explore open events and find opportunities that match your interests.",
  },
  {
    step: "02",
    title: "Apply",
    description: "Complete application forms at your own pace with auto-saved drafts.",
  },
  {
    step: "03",
    title: "Track",
    description: "Monitor your application status and respond to revision requests instantly.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-zinc-950">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Math&Maroc
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/events">
                <Search className="mr-1.5 h-4 w-4" />
                Browse Events
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-sm font-medium mb-8 border border-blue-100 dark:border-blue-900">
            <Sparkles className="h-3.5 w-3.5" />
            The platform for math competitions in Morocco
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1] max-w-4xl mx-auto">
            Your gateway to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400">
              mathematical excellence
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Discover competitions, apply to programs, and track your journey. The complete platform for students, organizers, and reviewers.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/events">
                Browse Events
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/signup">Create an account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Everything you need
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              A complete platform for managing events, applications, and reviews — from start to finish.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors bg-white dark:bg-zinc-900"
              >
                <CardContent className="p-6">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mb-4">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              How it works
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Get started in three simple steps.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {steps.map((s) => (
              <div key={s.step} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white text-xl font-bold mb-6 shadow-lg shadow-blue-600/20">
                  {s.step}
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                  {s.title}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-600 to-violet-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to get started?
          </h2>
          <p className="text-lg text-blue-100 mb-10 leading-relaxed">
            Join students and organizers across Morocco. Create your account today and discover upcoming events.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              variant="secondary"
              className="h-12 px-8 text-base bg-white text-blue-700 hover:bg-blue-50"
              asChild
            >
              <Link href="/signup">
                Create an account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base border-white/30 text-white hover:bg-white/10"
              asChild
            >
              <Link href="/events">Browse events</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 dark:border-zinc-800 py-8 px-6 bg-white dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">Math&Maroc</span>
          <div className="flex items-center gap-6">
            <Link href="/events" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Events
            </Link>
            <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
