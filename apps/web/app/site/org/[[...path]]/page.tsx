import { getMicrosite, getPage } from "@/lib/api";
import { BlockRenderer } from "@/components/microsite/block-renderer";
import { MicrositeLayout } from "@/components/microsite/layout/microsite-layout";
import { MicrositeCustomCode } from "@/components/microsite/custom-code";
import { DevNotFoundFallback } from "@/components/microsite/dev-not-found-fallback";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { cache } from "react";

interface Props {
  params: Promise<{ path?: string[] }>;
}

const getCachedOrgPage = cache(async (pagePath: string) =>
  getPage('org', pagePath)
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path = [] } = await params;
  const pagePath = path.join('/') || 'home';
  const page = await getCachedOrgPage(pagePath);
  if (!page) return {};

  return {
    title: page.seo.title || page.title,
    description: page.seo.description,
  };
}

export default async function OrgPage({ params }: Props) {
  const { path = [] } = await params;
  const pagePath = path.join('/') || 'home';
  
  // Parallel fetch
  const [microsite, page] = await Promise.all([
    getMicrosite('org'),
    getCachedOrgPage(pagePath)
  ]);

  if (!microsite || !page) {
    if (process.env.NODE_ENV === "development") {
      return (
        <DevNotFoundFallback
          resourceLabel="organization microsite"
          slug="org"
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

  return (
    <MicrositeLayout settings={microsite.settings}>
      <MicrositeCustomCode html={customCode.htmlTop} css={customCode.css} />
      <BlockRenderer
        blocks={page.blocks}
        siteLogoAssetKey={microsite.settings.navigation?.logoAssetKey}
      />
      <MicrositeCustomCode html={customCode.htmlBottom} />
    </MicrositeLayout>
  );
}
