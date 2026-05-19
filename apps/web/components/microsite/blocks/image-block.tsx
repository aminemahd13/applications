/* eslint-disable @next/next/no-img-element */
import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

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
      <figure className="w-full max-w-4xl">
        <div className="overflow-hidden rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-surface)] shadow-editorial">
          <img
            src={src}
            alt={alt}
            className="block h-auto w-full"
            loading="lazy"
          />
        </div>
        {caption && (
          <MarkdownText
            content={caption}
            as="figcaption"
            className="mt-4 text-center text-sm italic leading-relaxed text-[var(--mm-text-muted)] max-w-2xl mx-auto"
          />
        )}
      </figure>
    </BlockSection>
  );
}
