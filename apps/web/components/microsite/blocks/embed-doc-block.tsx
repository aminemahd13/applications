import { Block } from "@event-platform/shared";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type EmbedDocData = Extract<Block, { type: "EMBED_DOC" }>["data"] & {
  title?: string;
  url?: string;
  caption?: string;
  height?: number;
};

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isOfficeDoc(url: string): boolean {
  return /\.(doc|docx|ppt|pptx|xls|xlsx)(\?.*)?$/i.test(url);
}

function buildEmbedUrl(url: string): string {
  if (isOfficeDoc(url) && isHttpUrl(url)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

export function EmbedDocBlock({ block }: { block: Extract<Block, { type: "EMBED_DOC" }> }) {
  const data = (block.data || {}) as EmbedDocData;
  const sourceUrl = resolveAssetUrl(String(data.url ?? "").trim());
  if (!sourceUrl) return null;
  if (/^javascript:/i.test(sourceUrl)) return null;

  const heightRaw = Number(data.height ?? 720);
  const height = Number.isFinite(heightRaw) ? Math.max(320, Math.min(1400, Math.round(heightRaw))) : 720;
  const embedUrl = buildEmbedUrl(sourceUrl);
  const external = isHttpUrl(sourceUrl);

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {(data.title || data.caption) && (
        <div className="mb-6 max-w-3xl">
          {data.title && (
            <h2 className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
              {data.title}
            </h2>
          )}
          {data.caption && (
            <p className="mt-3 text-sm leading-relaxed text-[var(--mm-text-muted)] md:text-base">
              {data.caption}
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-[1.4rem] border border-[var(--mm-border)] bg-[var(--mm-surface)] shadow-[0_16px_48px_rgba(15,23,42,0.12)]">
        <iframe
          src={embedUrl}
          title={data.title || "Embedded document"}
          className="w-full"
          style={{ height: `${height}px` }}
          loading="lazy"
        />
      </div>

      <div className="mt-3">
        <Link
          href={sourceUrl}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="mm-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open document
        </Link>
      </div>
    </BlockSection>
  );
}
