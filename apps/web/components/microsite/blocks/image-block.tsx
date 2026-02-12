/* eslint-disable @next/next/no-img-element */
import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type ImageBlockData = Extract<Block, { type: "IMAGE" }>["data"] & {
  src?: string;
};

export function ImageBlock({ block }: { block: Extract<Block, { type: "IMAGE" }> }) {
  const data = (block.data || {}) as ImageBlockData;
  const src = resolveAssetUrl(
    (data.src as string) ||
      (data.url as string) ||
      (data.assetKey as string) ||
      ""
  );
  const alt = (data.alt as string) || "";
  const caption = (data.caption as string) || "";

  if (!src) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: "lg",
        width: "normal",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="flex flex-col items-center"
    >
      <figure className="w-full max-w-4xl rounded-[1.8rem] border border-[var(--mm-border)] bg-[var(--mm-surface)] p-4 shadow-[0_22px_56px_rgba(15,23,42,0.1)] md:p-5">
        <img
          src={src}
          alt={alt}
          className="h-auto w-full rounded-xl shadow-sm"
          loading="lazy"
        />
        {caption && (
          <figcaption className="mt-3 text-center text-sm text-[var(--mm-text-muted)]">
            {caption}
          </figcaption>
        )}
      </figure>
    </BlockSection>
  );
}
