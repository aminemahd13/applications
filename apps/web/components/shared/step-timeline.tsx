import { cn } from "@/lib/utils";
import {
  Lock,
  Pencil,
  Send,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";

type StepStatus =
  | "LOCKED"
  | "UNLOCKED"
  | "UNLOCKED_DRAFT"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED_FINAL"
  | "REJECTED_RESUBMITTABLE";

const statusConfig: Record<
  StepStatus,
  { icon: LucideIcon; color: string; lineColor: string }
> = {
  LOCKED: { icon: Lock, color: "text-muted-foreground bg-muted", lineColor: "bg-muted" },
  UNLOCKED: { icon: Pencil, color: "text-info bg-info/10", lineColor: "bg-info/30" },
  UNLOCKED_DRAFT: { icon: Pencil, color: "text-info bg-info/10", lineColor: "bg-info/30" },
  READY_TO_SUBMIT: { icon: Send, color: "text-info bg-info/10", lineColor: "bg-info/30" },
  SUBMITTED: { icon: Clock, color: "text-primary bg-primary/10", lineColor: "bg-primary/30" },
  NEEDS_REVISION: {
    icon: AlertCircle,
    color: "text-warning bg-warning/10",
    lineColor: "bg-warning/30",
  },
  APPROVED: {
    icon: CheckCircle2,
    color: "text-success bg-success/10",
    lineColor: "bg-success/30",
  },
  REJECTED_FINAL: {
    icon: XCircle,
    color: "text-destructive bg-destructive/10",
    lineColor: "bg-destructive/30",
  },
  REJECTED_RESUBMITTABLE: {
    icon: AlertCircle,
    color: "text-warning bg-warning/10",
    lineColor: "bg-warning/30",
  },
};

interface Step {
  id: string;
  title: string;
  status: string;
  deadline?: string;
}

interface StepTimelineProps {
  steps: Step[];
  activeStepId?: string;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

export function StepTimeline({
  steps,
  activeStepId,
  onStepClick,
  className,
}: StepTimelineProps) {
  function normalizeStepStatus(status: string): StepStatus {
    const raw = String(status ?? "LOCKED").toUpperCase() as StepStatus | string;
    if (raw in statusConfig) return raw as StepStatus;
    if (raw.startsWith("REVISION_REQUIRED")) return "NEEDS_REVISION";
    if (raw.startsWith("WAITING_FOR_REVIEW")) return "SUBMITTED";
    if (raw.startsWith("WAITING_FOR_APPLICANT")) return "UNLOCKED";
    if (raw === "BLOCKED_REJECTED") return "REJECTED_FINAL";
    return "LOCKED";
  }

  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, index) => {
        const status = normalizeStepStatus(step.status);
        const config = statusConfig[status] ?? statusConfig.LOCKED;
        const Icon = config.icon;
        const isLast = index === steps.length - 1;
        const isActive = step.id === activeStepId;

        return (
          <div
            key={step.id}
            className={cn(
              "relative flex gap-3 pb-6",
              onStepClick && "cursor-pointer group"
            )}
            onClick={() => onStepClick?.(step.id)}
          >
            {/* Timeline line */}
            {!isLast && (
              <div
                className={cn(
                  "absolute left-[17px] top-10 w-0.5 h-[calc(100%-24px)]",
                  config.lineColor
                )}
              />
            )}

            {/* Icon */}
            <div
              className={cn(
                "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                config.color,
                isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium truncate",
                    isActive && "text-primary",
                    status === "LOCKED" && "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
                <StatusBadge status={status} />
              </div>
              {step.deadline && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Due {new Date(step.deadline).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
