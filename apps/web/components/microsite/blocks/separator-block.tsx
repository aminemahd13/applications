import { Block } from "@event-platform/shared";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type SeparatorData = Extract<Block, { type: "SEPARATOR" }>["data"] & {
  label?: string;
  variant?: "line" | "dashed" | "dots" | "gradient";
  thickness?: number;
  width?: "sm" | "md" | "lg" | "full";
};

const WIDTH_CLASS: Record<NonNullable<SeparatorData["width"]>, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  full: "w-full",
};

function resolveThickness(rawValue: unknown): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(8, Math.max(1, Math.round(parsed)));
}

function SeparatorLine({
  variant,
  thickness,
}: {
  variant: NonNullable<SeparatorData["variant"]>;
  thickness: number;
}) {
  if (variant === "dashed") {
    return (
      <div
        className="w-full border-t border-dashed border-[var(--mm-border)]"
        style={{ borderTopWidth: `${thickness}px` }}
      />
    );
  }

  if (variant === "dots") {
    const dotHeight = Math.max(4, thickness * 2);
    const dotWidth = Math.max(12, thickness * 7);
    return (
      <div
        className="w-full"
        style={{
          height: `${dotHeight}px`,
          backgroundImage: "radial-gradient(circle, var(--mm-border) 1.5px, transparent 1.5px)",
          backgroundSize: `${dotWidth}px ${dotHeight}px`,
          backgroundRepeat: "repeat-x",
          backgroundPosition: "center",
        }}
      />
    );
  }

  if (variant === "gradient") {
    return (
      <div
        className="w-full"
        style={{
          height: `${thickness}px`,
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--mm-accent) 62%, var(--mm-border) 38%) 50%, transparent 100%)",
        }}
      />
    );
  }

  return (
    <div
      className="w-full bg-[var(--mm-border)]"
      style={{ height: `${thickness}px` }}
    />
  );
}

export function SeparatorBlock({ block }: { block: Extract<Block, { type: "SEPARATOR" }> }) {
  const data = (block.data || {}) as SeparatorData;
  const label = String(data.label ?? "").trim();
  const variant = data.variant ?? "line";
  const thickness = resolveThickness(data.thickness);
  const width = data.width ?? "full";

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
    >
      <div className={cn("mx-auto", WIDTH_CLASS[width])}>
        {label ? (
          <div className="flex items-center gap-3 md:gap-4">
            <div className="min-w-0 flex-1">
              <SeparatorLine variant={variant} thickness={thickness} />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mm-text-muted)]">
              <MarkdownText content={label} mode="inline" as="span" />
            </span>
            <div className="min-w-0 flex-1">
              <SeparatorLine variant={variant} thickness={thickness} />
            </div>
          </div>
        ) : (
          <SeparatorLine variant={variant} thickness={thickness} />
        )}
      </div>
    </BlockSection>
  );
}
