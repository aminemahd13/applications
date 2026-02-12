import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type LogoItem = NonNullable<Extract<Block, { type: "LOGO_CLOUD" }>["data"]>["logos"][number];
type LogoRenderItem = LogoItem & { imageUrl?: string };
type LogoCloudData = Extract<Block, { type: "LOGO_CLOUD" }>["data"] & {
  heading?: string;
  title?: string;
};

export function LogoCloudBlock({ block }: { block: Extract<Block, { type: 'LOGO_CLOUD' }> }) {
  const data = (block.data || {}) as LogoCloudData;
  const logos = data.logos ?? [];
  const title = data.heading ?? data.title;

  if (logos.length === 0) return null;

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
      {title && (
        <h2 className="mb-10 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--mm-text-muted)]">
          {title}
        </h2>
      )}

      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
        {logos.map((logo: LogoRenderItem, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-center rounded-xl border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4 grayscale transition-all hover:grayscale-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAssetUrl(logo.imageUrl || logo.url || logo.assetKey)}
              alt={logo.name || "Partner logo"}
              className="h-8 md:h-12 w-auto object-contain"
            />
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
