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
      {/* Left: editorial brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary">
        {/* Calmer gradient — single soft wash, no animated blobs competing
            with the typography. */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/85" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          aria-hidden="true"
        >
          <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-white blur-[120px]" />
          <div className="absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-white blur-[140px]" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-primary-foreground max-w-2xl">
          <div className="flex items-center gap-3 mb-12">
            <div className="font-display flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur font-semibold text-xl tracking-tight">
              M
            </div>
            <span className="font-display text-xl font-semibold tracking-tight">
              Math&Maroc
            </span>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary-foreground/70 mb-5">
            Event platform
          </p>
          <h1 className="text-display-lg text-primary-foreground mb-6">
            Unlocking the scientific potential of Moroccan youth.
          </h1>
          <p className="text-base lg:text-lg text-primary-foreground/80 leading-relaxed max-w-lg">
            Apply to competitions, training camps, and academic programs.
            Track your applications and connect with the community.
          </p>
        </div>
      </div>

      {/* Right: form area */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4">
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="font-display flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold tracking-tight">
              M
            </div>
            <span className="font-display font-semibold tracking-tight">
              Math&Maroc
            </span>
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
