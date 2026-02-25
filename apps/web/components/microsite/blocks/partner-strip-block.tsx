import Link from "next/link";
import type { Block } from "@event-platform/shared";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type PartnerStripData = Extract<Block, { type: "PARTNER_STRIP" }>["data"] & {
  heading?: string;
  items?: Array<{
    label?: string;
    logo?: string;
    assetKey?: string;
    url?: string;
    href?: string;
    size?: "sm" | "md" | "lg";
    alt?: string;
  }>;
};

const SIZE_CLASS = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
} as const;

export function PartnerStripBlock({
  block,
}: {
  block: Extract<Block, { type: "PARTNER_STRIP" }>;
}) {
  const data = (block.data || {}) as PartnerStripData;
  const heading = data.heading;
  const items = (data.items ?? [])
    .map((item) => ({
      label: item.label || "Partner",
      logo: resolveAssetUrl(item.logo || item.assetKey || item.url || ""),
      href: item.href || "",
      size: item.size || "md",
      alt: item.alt || item.label || "Partner logo",
    }))
    .filter((item) => Boolean(item.logo));

  if (items.length === 0) return null;

  const grouped = items.reduce<Array<{ label: string; entries: typeof items }>>((acc, item) => {
    const found = acc.find((entry) => entry.label === item.label);
    if (found) {
      found.entries = [...found.entries, item];
      return acc;
    }
    return [...acc, { label: item.label, entries: [item] }];
  }, []);

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "sm",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="space-y-4"
    >
      {heading && (
        <MarkdownText
          content={heading}
          mode="inline"
          as="p"
          className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mm-text-muted)]"
        />
      )}
      <div className="flex w-full flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
        {grouped.map((group) => (
          <div key={group.label} className="flex items-center space-x-4">
            <MarkdownText
              content={group.label}
              mode="inline"
              as="p"
              className="text-sm text-[var(--mm-text-muted)]"
            />
            <div className="flex items-center space-x-6">
              {group.entries.map((entry, index) => {
                const logo = (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.logo}
                    alt={entry.alt}
                    className={cn(
                      "w-auto object-contain opacity-85 saturate-[0.72] contrast-110 transition-all duration-200 group-hover:opacity-100 group-hover:saturate-125",
                      SIZE_CLASS[entry.size],
                    )}
                  />
                );

                return entry.href ? (
                  <Link
                    key={`${entry.logo}-${index}`}
                    href={entry.href}
                    className="mm-logo-shell group flex h-[3.5rem] items-center px-4"
                  >
                    {logo}
                  </Link>
                ) : (
                  <div
                    key={`${entry.logo}-${index}`}
                    className="mm-logo-shell group flex h-[3.5rem] items-center px-4"
                  >
                    {logo}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
