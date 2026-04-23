"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Award,
  Calendar,
  Download,
  FileText,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CertificateArtboard } from "@/components/certificates/certificate-artboard";
import { apiClient } from "@/lib/api";
import {
  buildCertificateTokenValues,
  formatCertificateDate,
  formatCertificateDateTime,
  parseCertificateDocumentResponse,
  parseCertificatePayloadMap,
  type CertificateDocumentData,
} from "@/lib/certificate-document";
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";
import { computeCanvasScale, parseCertificateLayout } from "@/lib/certificate-viewer";

const DEFAULT_CERTIFICATE_TEMPLATE = {
  text: {
    title: "Certificate of Completion",
    subtitle: "This certifies that",
    completionText: "has successfully completed",
    footerText:
      "Verification is available via the secure credential link shown below.",
  },
  style: {
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
    borderColor: "#cbd5e1",
  },
} as const;

export default function CertificatePage() {
  const params = useParams();
  const certificateId = params.certificateId as string;
  const [certificate, setCertificate] = useState<CertificateDocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canvasScale, setCanvasScale] = useState(1);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onBeforePrint = () => setIsPrintMode(true);
    const onAfterPrint = () => setIsPrintMode(false);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/credentials/certificate/${certificateId}`,
        );
        if (cancelled) return;
        const raw =
          res && typeof res === "object" && "data" in res
            ? (res as { data: Record<string, unknown> }).data
            : (res as Record<string, unknown>);
        setCertificate(raw ? parseCertificateDocumentResponse(raw) : null);
      } catch {
        if (!cancelled) {
          setCertificate(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  const layout = useMemo(() => parseCertificateLayout(certificate?.layout), [certificate?.layout]);
  const payloadTokens = useMemo(
    () => parseCertificatePayloadMap(certificate?.payload),
    [certificate?.payload],
  );

  const templateText = useMemo(
    () => ({
      ...DEFAULT_CERTIFICATE_TEMPLATE.text,
      ...(certificate?.template?.text ?? {}),
    }),
    [certificate?.template?.text],
  );
  const templateStyle = useMemo(
    () => ({
      ...DEFAULT_CERTIFICATE_TEMPLATE.style,
      ...(certificate?.template?.style ?? {}),
    }),
    [certificate?.template?.style],
  );

  const tokenValues = useMemo<Record<string, string>>(
    () => (certificate ? buildCertificateTokenValues(certificate, payloadTokens) : {}),
    [certificate, payloadTokens],
  );

  useEffect(() => {
    if (!layout) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const width = Math.max(viewport.clientWidth - 24, 1);
      const height = isPrintMode
        ? Number.POSITIVE_INFINITY
        : Math.max(viewport.clientHeight - 24, 1);
      setCanvasScale(
        computeCanvasScale({
          containerWidth: width,
          containerHeight: height,
          canvasWidth: layout.canvas.width,
          canvasHeight: layout.canvas.height,
          maxScale: 1,
        }),
      );
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isPrintMode, layout]);

  const hasRenderableLayout = Boolean(layout && layout.elements.length > 0);
  const verificationHref =
    sanitizeClientFacingUrl(certificate?.verifiableCredentialUrl) ??
    certificate?.verifiableCredentialUrl ??
    "";
  const pdfHref = sanitizeClientFacingUrl(certificate?.pdfUrl);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="h-10 w-56 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="h-[420px] animate-pulse bg-muted/40" />
        </Card>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Certificate not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The certificate link may be invalid or unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/15 print:bg-white">
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-3 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">Completion Certificate</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{certificate.event.title}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button asChild className="flex-1 sm:flex-none">
              <a href={verificationHref} target="_blank" rel="noreferrer">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Verify
              </a>
            </Button>
            {pdfHref && (
              <Button variant="outline" asChild className="flex-1 sm:flex-none">
                <a href={pdfHref} target="_blank" rel="noreferrer">
                  <Download className="mr-1.5 h-4 w-4" />
                  Open PDF
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-4 sm:px-6 sm:py-6 print:max-w-none print:space-y-2 print:p-0">
        {hasRenderableLayout && layout ? (
          <Card className="overflow-hidden border-2 print:border print:shadow-none">
            <CardContent className="p-3 sm:p-4 print:p-0">
              <div
                ref={canvasViewportRef}
                className="relative h-[clamp(360px,74svh,920px)] overflow-auto rounded-lg border bg-muted/20 p-3 print:h-auto print:overflow-visible print:border-0 print:bg-transparent print:p-0"
              >
                <div className="flex min-h-full min-w-full items-center justify-center print:block">
                  <div
                    className="relative"
                    style={{
                      width: layout.canvas.width * canvasScale,
                      height: layout.canvas.height * canvasScale,
                    }}
                  >
                    <div
                      style={{
                        width: layout.canvas.width,
                        height: layout.canvas.height,
                        transform: `scale(${canvasScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <CertificateArtboard
                        className="border bg-white shadow-sm print:shadow-none"
                        layout={layout}
                        tokenValues={tokenValues}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card
            className="overflow-hidden border-2 print:shadow-none"
            style={{ borderColor: templateStyle.borderColor }}
          >
            <div
              className="p-6 text-center sm:p-8 print:border-b"
              style={{
                background: `linear-gradient(140deg, ${templateStyle.primaryColor} 0%, ${templateStyle.secondaryColor} 100%)`,
                color: templateStyle.backgroundColor,
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.3em] sm:text-xs">{templateText.title}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide opacity-80 sm:text-xs">
                {templateText.subtitle}
              </p>
              <h2 className="mt-4 break-words text-2xl font-semibold sm:text-3xl">
                {certificate.recipient.name}
              </h2>
              <p className="mt-2 text-xs opacity-90 sm:text-sm">{templateText.completionText}</p>
              <p className="mt-1 break-words text-base font-medium sm:text-lg">
                {certificate.event.title}
              </p>
            </div>
          </Card>
        )}

        <Card className="print:border-0 print:shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-6 print:px-0 print:py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={certificate.status === "ISSUED" ? "default" : "destructive"}>
                {certificate.status === "ISSUED" ? "Issued" : "Revoked"}
              </Badge>
              {certificate.renderStatus ? (
                <Badge variant="outline">Render {certificate.renderStatus}</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">ID: {certificate.certificateId}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">Issued by</p>
                <p className="break-words font-medium">{certificate.issuer}</p>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">Issued on</p>
                <p className="font-medium">{formatCertificateDateTime(certificate.issuedAt)}</p>
              </div>
              {certificate.event.startAt ? (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Event date
                  </p>
                  <p className="font-medium">{formatCertificateDate(certificate.event.startAt)}</p>
                </div>
              ) : null}
              {certificate.event.location ? (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </p>
                  <p className="break-words font-medium">{certificate.event.location}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Verification link</p>
              <a
                href={verificationHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-foreground underline"
              >
                {tokenValues.verificationUrl || verificationHref}
              </a>
            </div>

            {pdfHref ? (
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium underline print:hidden"
              >
                <FileText className="h-4 w-4" />
                Open generated PDF
              </a>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">{templateText.footerText}</p>

            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Award className="h-4 w-4" />
                Credential ID {certificate.credentialId}
              </span>
              {tokenValues.qrVerificationUrl ? (
                <span className="break-all text-xs sm:text-sm">{tokenValues.qrVerificationUrl}</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
