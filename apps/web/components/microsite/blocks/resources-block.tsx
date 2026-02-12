import type { Block } from "@event-platform/shared";
import type { LucideIcon } from "lucide-react";
import { Download, FileText, FolderArchive, MapPinned, Presentation, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type ResourceKind = "brochure" | "map" | "policy" | "deck" | "document" | "other";

type ResourceItem = NonNullable<Extract<Block, { type: "RESOURCES" }>["data"]>["resources"][number];
type ResourcesData = Extract<Block, { type: "RESOURCES" }>["data"] & {
  heading?: string;
  description?: string;
  columns?: number;
  resources?: ResourceItem[];
};

type ResourceRenderItem = ResourceItem & {
  title: string;
  description: string;
  href: string;
  kind: ResourceKind;
  fileType: string;
  sizeLabel: string;
};

const KIND_META: Record<ResourceKind, { label: string; Icon: LucideIcon }> = {
  brochure: { label: "Brochure", Icon: FolderArchive },
  map: { label: "Map", Icon: MapPinned },
  policy: { label: "Policy", Icon: ShieldCheck },
  deck: { label: "Slide Deck", Icon: Presentation },
  document: { label: "Document", Icon: FileText },
  other: { label: "Resource", Icon: FileText },
};

function inferKind(item: ResourceItem): ResourceKind {
  const explicit = String(item.kind ?? "").trim().toLowerCase();
  if (explicit === "brochure" || explicit === "map" || explicit === "policy" || explicit === "deck" || explicit === "document" || explicit === "other") {
    return explicit;
  }

  const fileType = String(item.fileType ?? "").trim().toLowerCase();
  const href = String(item.href ?? item.assetKey ?? "").trim().toLowerCase();
  const lookup = `${fileType} ${href}`;
  if (lookup.includes("policy")) return "policy";
  if (lookup.includes("map")) return "map";
  if (lookup.includes("deck") || lookup.includes(".ppt") || lookup.includes(".pptx")) return "deck";
  if (lookup.includes("brochure")) return "brochure";
  if (lookup.includes(".pdf") || lookup.includes(".doc") || lookup.includes(".docx")) return "document";
  return "other";
}

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function ResourcesBlock({
  block,
}: {
  block: Extract<Block, { type: "RESOURCES" }>;
}) {
  const data = (block.data || {}) as ResourcesData;
  const columnsRaw = Number(data.columns ?? 2);
  const columns = Number.isFinite(columnsRaw) ? Math.max(1, Math.min(3, columnsRaw)) : 2;

  const resources: ResourceRenderItem[] = (data.resources ?? [])
    .map((item) => {
      const href = resolveAssetUrl(item.href || item.assetKey || "");
      return {
        ...item,
        title: String(item.title ?? "").trim(),
        description: String(item.description ?? "").trim(),
        href,
        kind: inferKind(item),
        fileType: String(item.fileType ?? "").trim(),
        sizeLabel: String(item.sizeLabel ?? "").trim(),
      };
    })
    .filter((item) => Boolean(item.title || item.href));

  if (resources.length === 0) return null;

  const columnsClass =
    columns === 1
      ? "md:grid-cols-1"
      : columns === 3
        ? "md:grid-cols-2 xl:grid-cols-3"
        : "md:grid-cols-2";

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
      {(data.heading || data.description) && (
        <div className="mb-8 max-w-3xl">
          {data.heading && (
            <h2 className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
              {data.heading}
            </h2>
          )}
          {data.description && (
            <p className="mt-3 text-sm leading-relaxed text-[var(--mm-text-muted)] md:text-base">
              {data.description}
            </p>
          )}
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-4 md:gap-5", columnsClass)}>
        {resources.map((resource, index) => {
          const { Icon, label } = KIND_META[resource.kind];
          const hasHref = Boolean(resource.href);

          return (
            <article
              key={`${resource.title}-${index}`}
              className="microsite-card flex h-full flex-col justify-between p-5"
            >
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--mm-soft)] text-[var(--mm-accent)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                    {label}
                  </span>
                </div>
                <h3 className="microsite-display text-xl font-semibold text-[var(--mm-text)]">
                  {resource.title || "Untitled Resource"}
                </h3>
                {resource.description && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--mm-text-muted)]">
                    {resource.description}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--mm-text-muted)]">
                  {[resource.fileType, resource.sizeLabel].filter(Boolean).join(" | ") || "File"}
                </p>
                {hasHref ? (
                  <Link
                    href={resource.href}
                    target={isExternalHref(resource.href) ? "_blank" : undefined}
                    rel={isExternalHref(resource.href) ? "noopener noreferrer" : undefined}
                    className="mm-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Link>
                ) : (
                  <span className="inline-flex h-9 items-center rounded-[var(--mm-button-radius)] bg-[var(--mm-soft)] px-3 text-xs font-semibold text-[var(--mm-text-muted)]">
                    Link missing
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </BlockSection>
  );
}
