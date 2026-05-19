import {
  type LucideIcon,
  AlertTriangle,
  FileQuestion,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type EmptyStateTone = "empty" | "error" | "maintenance";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /** Visual tone — sets icon-circle color and default icon. Default `"empty"`. */
  tone?: EmptyStateTone;
  /** Optional extra content (secondary action, hint, etc.) rendered below the action. */
  footer?: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<
  EmptyStateTone,
  { icon: LucideIcon; circle: string; iconColor: string }
> = {
  empty: {
    icon: FileQuestion,
    circle: "bg-muted",
    iconColor: "text-muted-foreground",
  },
  error: {
    icon: AlertTriangle,
    circle: "bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)]",
    iconColor: "text-destructive",
  },
  maintenance: {
    icon: Wrench,
    circle: "bg-[color-mix(in_oklch,var(--warning)_15%,transparent)]",
    iconColor: "text-[var(--warning)]",
  },
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  tone = "empty",
  footer,
  className,
}: EmptyStateProps) {
  const toneStyle = TONE_STYLES[tone];
  const Icon = icon ?? toneStyle.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
      data-tone={tone}
    >
      <div
        className={cn(
          "rounded-full p-4 mb-5 transition-colors",
          toneStyle.circle,
        )}
      >
        <Icon className={cn("h-8 w-8", toneStyle.iconColor)} />
      </div>
      <h3 className="font-display text-xl font-semibold tracking-tight mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && (actionHref || onAction) && (
        <>
          {actionHref ? (
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button onClick={onAction}>{actionLabel}</Button>
          )}
        </>
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
