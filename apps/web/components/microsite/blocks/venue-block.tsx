import { Block } from "@event-platform/shared";
import type { LucideIcon } from "lucide-react";
import { Bus, CarFront, Clock3, Hotel, MapPin, Plane, Ticket, Train, Wallet } from "lucide-react";
import Link from "next/link";
import { BlockSection } from "./block-section";

type VenueDetail = {
  label?: string;
  value?: string;
  icon?: string;
};

type VenueData = Extract<Block, { type: "VENUE" }>["data"] & {
  heading?: string;
  venueName?: string;
  address?: string;
  mapEmbedUrl?: string;
  mapLink?: string;
  notes?: string;
  details?: VenueDetail[];
  highlights?: string[];
  cta?: { label?: string; href?: string };
};

const DETAIL_ICONS: Record<string, LucideIcon> = {
  map: MapPin,
  clock: Clock3,
  ticket: Ticket,
  wallet: Wallet,
  car: CarFront,
  bus: Bus,
  train: Train,
  plane: Plane,
  hotel: Hotel,
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

export function VenueBlock({
  block,
}: {
  block: Extract<Block, { type: "VENUE" }>;
}) {
  const data = (block.data || {}) as VenueData;
  const heading = typeof data.heading === "string" ? data.heading.trim() : "Venue & Logistics";
  const venueName = data.venueName?.trim();
  const address = data.address?.trim();
  const details = data.details ?? [];
  const highlights = (data.highlights ?? []).filter((item) => item && item.trim().length > 0);
  const notes = data.notes?.trim();

  if (!venueName && !address && !data.mapEmbedUrl && details.length === 0 && highlights.length === 0) {
    return null;
  }

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {heading && (
        <div className="mb-10 text-center">
          <h2 className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">{heading}</h2>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="microsite-card overflow-hidden">
          {data.mapEmbedUrl ? (
            <iframe
              title="Venue map"
              src={data.mapEmbedUrl}
              className="h-full min-h-72 w-full border-0 md:min-h-96"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="flex h-72 items-center justify-center bg-[var(--mm-soft)] text-[var(--mm-text-muted)] md:h-96">
              <p className="text-sm">Add a map embed URL to show the venue map.</p>
            </div>
          )}
        </article>

        <article className="microsite-card space-y-5 p-6">
          <div className="space-y-2">
            {venueName && <h3 className="microsite-display text-2xl font-semibold text-[var(--mm-text)]">{venueName}</h3>}
            {address && <p className="text-sm leading-relaxed text-[var(--mm-text-muted)]">{address}</p>}
          </div>

          {details.length > 0 && (
            <div className="space-y-2">
              {details.map((detail, idx) => {
                const key = (detail.icon ?? "").trim().toLowerCase();
                const Icon = DETAIL_ICONS[key] ?? MapPin;
                return (
                  <div key={idx} className="flex items-start gap-2 rounded-xl border border-[var(--mm-border)] bg-[var(--mm-soft)] px-3 py-2.5">
                    <Icon className="mt-0.5 h-4 w-4 text-[var(--mm-accent)]" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--mm-text-muted)]">{detail.label || "Detail"}</p>
                      <p className="text-sm text-[var(--mm-text)]">{detail.value || "-"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {highlights.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {highlights.map((highlight, idx) => (
                <span key={idx} className="inline-flex rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-1 text-xs text-[var(--mm-text-muted)]">
                  {highlight}
                </span>
              ))}
            </div>
          )}

          {notes && <p className="text-sm leading-relaxed text-[var(--mm-text-muted)]">{notes}</p>}

          <div className="flex flex-wrap gap-2">
            {data.mapLink && (
              <Link
                href={data.mapLink}
                target={isExternalHref(data.mapLink) ? "_blank" : undefined}
                rel={isExternalHref(data.mapLink) ? "noopener noreferrer" : undefined}
                className="mm-outline-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                Open Map
              </Link>
            )}
            {data.cta?.label && data.cta?.href && (
              <Link
                href={data.cta.href}
                target={isExternalHref(data.cta.href) ? "_blank" : undefined}
                rel={isExternalHref(data.cta.href) ? "noopener noreferrer" : undefined}
                className="mm-primary-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                {data.cta.label}
              </Link>
            )}
          </div>
        </article>
      </div>
    </BlockSection>
  );
}
