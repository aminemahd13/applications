import Link from "next/link";
import type { Block } from "@event-platform/shared";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

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
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mm-text-muted)]">
          {heading}
        </p>
      )}
      <div className="flex w-full flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
        {grouped.map((group) => (
          <div key={group.label} className="flex items-center space-x-4">
            <p className="text-sm text-[var(--mm-text-muted)]">{group.label}</p>
            <div className="flex items-center space-x-6">
              {group.entries.map((entry, index) => {
                const logo = (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.logo}
                    alt={entry.alt}
                    className={cn(
                      "w-auto filter grayscale brightness-75 contrast-125 hover:grayscale-0 hover:brightness-100 hover:contrast-100",
                      SIZE_CLASS[entry.size],
                    )}
                  />
                );

                return entry.href ? (
                  <Link
                    key={`${entry.logo}-${index}`}
                    href={entry.href}
                    className="flex h-[3.5rem] items-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[var(--mm-accent)]/[.15] via-transparent to-transparent"
                  >
                    {logo}
                  </Link>
                ) : (
                  <div
                    key={`${entry.logo}-${index}`}
                    className="flex h-[3.5rem] items-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[var(--mm-accent)]/[.15] via-transparent to-transparent"
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
