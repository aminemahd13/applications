import { getMicrosite, getPage } from "@/lib/api";
import { BlockRenderer } from "@/components/microsite/block-renderer";
import { MicrositeLayout } from "@/components/microsite/layout/microsite-layout";
import { MicrositeCustomCode } from "@/components/microsite/custom-code";
import { DevNotFoundFallback } from "@/components/microsite/dev-not-found-fallback";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { cache } from "react";

interface Props {
  params: Promise<{ slug: string; path?: string[] }>;
}

const getCachedEventPage = cache(
  async (slug: string, pagePath: string) => getPage(slug, pagePath)
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const pagePath = path.join('/') || 'home';
  const page = await getCachedEventPage(slug, pagePath);
  if (!page) return {};

  return {
    title: page.seo.title || page.title,
    description: page.seo.description,
  };
}

export default async function EventPage({ params }: Props) {
  const { slug, path = [] } = await params;
  const pagePath = path.join('/') || 'home';
  
  const [microsite, page] = await Promise.all([
    getMicrosite(slug),
    getCachedEventPage(slug, pagePath)
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
