import { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/microsite/block-renderer";
import { MicrositeCustomCode } from "@/components/microsite/custom-code";
import { DevNotFoundFallback } from "@/components/microsite/dev-not-found-fallback";
import { MicrositeLayout } from "@/components/microsite/layout/microsite-layout";
import { getMicrosite, getPage } from "@/lib/api";

interface Props {
  params: Promise<{ slug: string; path?: string[] }>;
}

const PUBLIC_MICROSITE_REVALIDATE_SECONDS = Math.max(
  Number(process.env.PUBLIC_CONTENT_REVALIDATE_SECONDS ?? "60"),
  1,
);

const getCachedMicrosite = unstable_cache(
  async (slug: string) => getMicrosite(slug),
  ["public-microsite-by-slug"],
  { revalidate: PUBLIC_MICROSITE_REVALIDATE_SECONDS },
);

const getCachedEventPage = unstable_cache(
  async (slug: string, pagePath: string) => getPage(slug, pagePath),
  ["public-microsite-page-by-path"],
  { revalidate: PUBLIC_MICROSITE_REVALIDATE_SECONDS },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const pagePath = path.join("/") || "home";
  const page = await getCachedEventPage(slug, pagePath);
  if (!page) return {};

  return {
    title: page.seo.title || page.title,
    description: page.seo.description,
  };
}

export default async function EventPage({ params }: Props) {
  const { slug, path = [] } = await params;
  const pagePath = path.join("/") || "home";

  const [microsite, page] = await Promise.all([
    getCachedMicrosite(slug),
    getCachedEventPage(slug, pagePath),
  ]);

  if (!microsite || !page) {
    if (process.env.NODE_ENV === "development") {
      return (
        <DevNotFoundFallback
          resourceLabel="event microsite"
          slug={slug}
          pagePath={pagePath}
        />
      );
    }
    notFound();
  }

  const customCode = (page.seo?.customCode ?? {}) as {
    htmlTop?: string;
    htmlBottom?: string;
    css?: string;
    js?: string;
  };
  const basePath = `/events/${slug}`;

  return (
    <MicrositeLayout settings={microsite.settings} basePath={basePath}>
      <MicrositeCustomCode html={customCode.htmlTop} css={customCode.css} />
      <BlockRenderer
        blocks={page.blocks}
        eventSlug={slug}
        siteLogoAssetKey={microsite.settings.navigation?.logoAssetKey}
      />
      <MicrositeCustomCode html={customCode.htmlBottom} />
    </MicrositeLayout>
  );
}
