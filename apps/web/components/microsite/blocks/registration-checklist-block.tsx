import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type ChecklistItem = NonNullable<
  Extract<Block, { type: "REGISTRATION_CHECKLIST" }>["data"]
>["items"][number];

type RegistrationChecklistData = Extract<
  Block,
  { type: "REGISTRATION_CHECKLIST" }
>["data"] & {
  heading?: string;
  description?: string;
  note?: string;
  cta?: { label?: string; href?: string };
  secondaryCta?: { label?: string; href?: string };
  items?: ChecklistItem[];
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function resolveRequiredFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized !== "false" && normalized !== "0" && normalized !== "no";
}

export function RegistrationChecklistBlock({
  block,
}: {
  block: Extract<Block, { type: "REGISTRATION_CHECKLIST" }>;
}) {
  const data = (block.data || {}) as RegistrationChecklistData;
  const items = (data.items ?? []).filter((item) => Boolean(item.title || item.details));
  const hasActions = Boolean(data.cta?.label && data.cta?.href) || Boolean(data.secondaryCta?.label && data.secondaryCta?.href);

  if (!data.heading && !data.description && !data.note && !hasActions && items.length === 0) {
    return null;
  }

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "normal",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="space-y-6"
    >
      {(data.heading || data.description) && (
        <div className="space-y-3">
          {data.heading && (
            <MarkdownText
              content={data.heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {data.description && (
            <MarkdownText
              content={data.description}
              className="max-w-3xl text-base leading-relaxed text-[var(--mm-text-muted)] md:text-lg"
            />
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="microsite-card space-y-3 p-5 md:p-6">
          {items.map((item, index) => {
            const required = resolveRequiredFlag(item.required);
            return (
              <div
                key={`${item.title ?? "item"}-${index}`}
                className="rounded-xl border border-[var(--mm-border)] bg-[var(--mm-soft)]/45 px-3 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--mm-accent)]">
                    {required ? <CheckCircle2 className="h-4.5 w-4.5" /> : <CircleDashed className="h-4.5 w-4.5" />}
                  </span>
                  <div className="space-y-1">
                    <MarkdownText
                      content={item.title}
                      mode="inline"
                      as="p"
                      className="text-sm font-semibold text-[var(--mm-text)] md:text-base"
                    />
                    {item.details && (
                      <MarkdownText
                        content={item.details}
                        className="text-sm leading-relaxed text-[var(--mm-text-muted)]"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasActions && (
        <div className="flex flex-wrap gap-2">
          {data.cta?.label && data.cta?.href && (
            <Link
              href={data.cta.href}
              target={isExternalHref(data.cta.href) ? "_blank" : undefined}
              rel={isExternalHref(data.cta.href) ? "noopener noreferrer" : undefined}
              className="mm-primary-button inline-flex h-10 items-center px-4 text-sm font-semibold"
            >
              <MarkdownText content={data.cta.label} mode="inline" as="span" />
            </Link>
          )}
          {data.secondaryCta?.label && data.secondaryCta?.href && (
            <Link
              href={data.secondaryCta.href}
              target={isExternalHref(data.secondaryCta.href) ? "_blank" : undefined}
              rel={isExternalHref(data.secondaryCta.href) ? "noopener noreferrer" : undefined}
              className="mm-outline-button inline-flex h-10 items-center px-4 text-sm font-semibold"
            >
              <MarkdownText content={data.secondaryCta.label} mode="inline" as="span" />
            </Link>
          )}
        </div>
      )}

      {data.note && (
        <MarkdownText
          content={data.note}
          className="rounded-xl border border-[var(--mm-border)] bg-[var(--mm-soft)]/35 px-3 py-2 text-sm text-[var(--mm-text-muted)]"
        />
      )}
    </BlockSection>
  );
}
