"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import {
  buildCertificateTokenValues,
  parseCertificateDocumentResponse,
  parseCertificatePayloadMap,
  type CertificateDocumentData,
} from "@/lib/certificate-document";
import { parseCertificateLayout } from "@/lib/certificate-viewer";
import { CertificateArtboard } from "@/components/certificates/certificate-artboard";

interface CertificateRenderSurfaceProps {
  token: string;
}

export function CertificateRenderSurface({
  token,
}: CertificateRenderSurfaceProps) {
  const [certificate, setCertificate] = useState<CertificateDocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await apiClient<
          Record<string, unknown> | { data: Record<string, unknown> }
        >(`/credentials/render/${token}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        const raw =
          response && typeof response === "object" && "data" in response
            ? (response as { data: Record<string, unknown> }).data
            : (response as Record<string, unknown>);
        setCertificate(raw ? parseCertificateDocumentResponse(raw) : null);
      } catch {
        if (cancelled) return;
        setCertificate(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const layout = useMemo(() => parseCertificateLayout(certificate?.layout), [certificate?.layout]);
  const payloadTokens = useMemo(
    () => parseCertificatePayloadMap(certificate?.payload),
    [certificate?.payload],
  );
  const tokenValues = useMemo(
    () => (certificate ? buildCertificateTokenValues(certificate, payloadTokens) : {}),
    [certificate, payloadTokens],
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <div className="h-16 w-16 animate-pulse rounded-full bg-slate-100" />
      </main>
    );
  }

  if (!certificate || !layout) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500">Certificate render unavailable.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-0">
      <CertificateArtboard layout={layout} tokenValues={tokenValues} />
    </main>
  );
}
