import { CertificateRenderSurface } from "@/components/certificates/certificate-render-surface";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CertificateRenderPage({ params }: PageProps) {
  const { token } = await params;

  return <CertificateRenderSurface token={token} />;
}
