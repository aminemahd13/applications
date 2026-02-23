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
            className="mm-logo-shell group flex h-20 min-w-[9rem] items-center justify-center px-5 py-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAssetUrl(logo.imageUrl || logo.url || logo.assetKey)}
              alt={logo.name || "Partner logo"}
              className="h-8 w-auto max-w-[10rem] object-contain opacity-85 saturate-[0.75] contrast-110 transition-all duration-200 group-hover:opacity-100 group-hover:saturate-125 md:h-11"
            />
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
