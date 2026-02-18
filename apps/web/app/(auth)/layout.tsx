import { ThemeToggle } from "@/components/shared/theme-toggle";

export const metadata = {
  title: "Auth | Math&Maroc",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left: Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-white/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-1/3 right-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl animate-pulse [animation-delay:1s]" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur font-bold text-xl">
              M&M
            </div>
            <span className="text-2xl font-bold">Math&Maroc</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Unlocking the scientific <br/> 
            potential of Moroccan youth
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Apply to competitions, training camps, and academic programs.
            Track your applications and connect with the community.
          </p>
        </div>
      </div>

      {/* Right: Form area */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4">
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              M&M
            </div>
            <span className="font-semibold">Math&Maroc</span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
