import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  /** Optional uppercase label rendered above the title — e.g. "Event · Math&Maroc 2026". */
  eyebrow?: string;
  description?: string;
  actions?: Array<{
    label: string;
    icon?: LucideIcon;
    onClick?: () => void;
    href?: string;
    variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  }>;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-display-md text-foreground break-words">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mm-measure">
            {description}
          </p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:shrink-0">
          {actions?.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                variant={action.variant ?? "default"}
                onClick={action.onClick}
                size="sm"
              >
                {Icon && <Icon className="mr-2 h-4 w-4" />}
                {action.label}
              </Button>
            );
          })}
          {children}
        </div>
      )}
    </div>
  );
}
