import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";
import { resolveAssetUrl } from "../asset-url";
import { MarkdownText } from "../markdown-text";

function toEmbedUrl(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) return "";

  if (url.includes("youtube.com/embed/") || url.includes("player.vimeo.com/video/")) {
    return url;
  }

  const youtubeIdMatch =
    url.match(/[?&]v=([^&]+)/)?.[1] ||
    url.match(/youtu\.be\/([^?&/]+)/)?.[1];
  if (youtubeIdMatch) {
    return `https://www.youtube.com/embed/${youtubeIdMatch}`;
  }

  const vimeoIdMatch = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeoIdMatch) {
    return `https://player.vimeo.com/video/${vimeoIdMatch}`;
  }

  return url;
}

function isDirectVideoSource(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  if (url.startsWith("blob:")) return true;
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

export function VideoEmbedBlock({ block }: { block: Extract<Block, { type: "VIDEO_EMBED" }> }) {
  const data = (block.data || {}) as {
    title?: string;
    url?: string;
    caption?: string;
    autoplay?: boolean;
  };
  const rawUrl = data.url ?? "";
  const resolvedUrl = resolveAssetUrl(rawUrl);
  const isDirect = isDirectVideoSource(resolvedUrl);
  const url = isDirect ? resolvedUrl : toEmbedUrl(resolvedUrl);
  if (!url) return null;

  const params = new URLSearchParams();
  if (data.autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }
  const embedUrl = params.size > 0 ? `${url}${url.includes("?") ? "&" : "?"}${params.toString()}` : url;

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
    >
      {data.title && (
        <MarkdownText
          content={data.title}
          mode="inline"
          as="h2"
          className="microsite-display mb-8 text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
        />
      )}
      <div className="aspect-video w-full overflow-hidden rounded-[1.6rem] border border-[var(--mm-border)] bg-black shadow-xl">
        {isDirect ? (
          <video
            src={url}
            className="h-full w-full"
            controls
            autoPlay={!!data.autoplay}
            muted={!!data.autoplay}
            playsInline
          />
        ) : (
          <iframe
            src={embedUrl}
            title={data.title || "Embedded video"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
      </div>
      {data.caption && (
        <MarkdownText content={data.caption} className="mt-4 text-sm text-[var(--mm-text-muted)]" />
      )}
    </BlockSection>
  );
}
