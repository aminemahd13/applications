"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  Award,
  Calendar,
  Download,
  FileText,
  MapPin,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CertificateTemplateElement } from "@/lib/certificates";
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";
import { apiClient } from "@/lib/api";
import {
  computeCanvasScale,
  parseCertificateLayout,
  parseCertificatePayloadMap,
} from "@/lib/certificate-viewer";

interface CertificatePayload {
  certificateId: string;
  credentialId: string;
  status: "ISSUED" | "REVOKED";
  issuedAt: string;
  checkedInAt?: string;
  revokedAt?: string | null;
  issuer: string;
  certificateUrl: string;
  verifiableCredentialUrl: string;
  qrVerificationUrl?: string;
  pdfUrl?: string | null;
  renderStatus?: string | null;
  event: {
    id: string;
    title: string;
    slug: string;
    startAt?: string;
    endAt?: string;
    location?: string;
  };
  recipient: {
    name: string;
  };
  payload?: unknown;
  layout?: unknown;
  template?: {
    text?: {
      title?: string;
      subtitle?: string;
      completionText?: string;
      footerText?: string;
    };
    style?: {
      primaryColor?: string;
      secondaryColor?: string;
      backgroundColor?: string;
      textColor?: string;
      borderColor?: string;
    };
  };
}

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

function resolveAssetUrl(storageKey?: string | null): string {
  const raw = (storageKey ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return `/credentials/assets?key=${encodeURIComponent(raw)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB");
}

function getStyleNumber(
  style: unknown,
  key: string,
  fallback: number,
): number {
  const record = style && typeof style === "object" ? (style as Record<string, unknown>) : null;
  const raw = record?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getStyleString(
  style: unknown,
  key: string,
  fallback: string,
): string {
  const record = style && typeof style === "object" ? (style as Record<string, unknown>) : null;
  const raw = record?.[key];
  if (typeof raw === "string" && raw.trim().length > 0) return raw;
  return fallback;
}

function buildElementLabel(element: CertificateTemplateElement): string {
  if (element.type === "dynamic_text") {
    return `Dynamic (${element.token ?? "token"})`;
  }
  if (element.type === "text") {
    return `Text (${(element.content ?? "text").slice(0, 20)})`;
  }
  if (element.type === "image") {
    return "Image";
  }
  if (element.type === "signature") {
    return "Signature";
  }
  return "QR";
}

export default function CertificatePage() {
  const params = useParams();
  const certificateId = params.certificateId as string;
  const [certificate, setCertificate] = useState<CertificatePayload | null>(null);
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
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/credentials/certificate/${certificateId}`,
        );
        const raw =
          res && typeof res === "object" && "data" in res ? (res as { data: Record<string, unknown> }).data : res;
        if (raw) {
          setCertificate({
            certificateId: String(raw.certificateId ?? ""),
            credentialId: String(raw.credentialId ?? ""),
            status: raw.status === "REVOKED" ? "REVOKED" : "ISSUED",
            issuedAt: String(raw.issuedAt ?? ""),
            checkedInAt: typeof raw.checkedInAt === "string" ? raw.checkedInAt : undefined,
            revokedAt: typeof raw.revokedAt === "string" ? raw.revokedAt : null,
            issuer: typeof raw.issuer === "string" ? raw.issuer : "Math&Maroc Event Platform",
            certificateUrl: String(raw.certificateUrl ?? ""),
            verifiableCredentialUrl: String(raw.verifiableCredentialUrl ?? ""),
            qrVerificationUrl: typeof raw.qrVerificationUrl === "string" ? raw.qrVerificationUrl : undefined,
            pdfUrl: typeof raw.pdfUrl === "string" ? raw.pdfUrl : null,
            renderStatus: typeof raw.renderStatus === "string" ? raw.renderStatus : null,
            event: {
              id: String((raw.event as Record<string, unknown> | undefined)?.id ?? ""),
              title: String((raw.event as Record<string, unknown> | undefined)?.title ?? "Event"),
              slug: String((raw.event as Record<string, unknown> | undefined)?.slug ?? ""),
              startAt:
                typeof (raw.event as Record<string, unknown> | undefined)?.startAt === "string"
                  ? String((raw.event as Record<string, unknown> | undefined)?.startAt)
                  : undefined,
              endAt:
                typeof (raw.event as Record<string, unknown> | undefined)?.endAt === "string"
                  ? String((raw.event as Record<string, unknown> | undefined)?.endAt)
                  : undefined,
              location:
                typeof (raw.event as Record<string, unknown> | undefined)?.location === "string"
                  ? String((raw.event as Record<string, unknown> | undefined)?.location)
                  : undefined,
            },
            recipient: {
              name:
                typeof (raw.recipient as Record<string, unknown> | undefined)?.name === "string"
                  ? String((raw.recipient as Record<string, unknown> | undefined)?.name)
                  : "Attendee",
            },
            payload: (raw as Record<string, unknown>).payload,
            layout: (raw as Record<string, unknown>).layout,
            template:
              typeof (raw as Record<string, unknown>).template === "object"
                ? ((raw as Record<string, unknown>).template as CertificatePayload["template"])
                : undefined,
          });
        } else {
          setCertificate(null);
        }
      } catch {
        setCertificate(null);
      } finally {
        setIsLoading(false);
      }
    })();
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

  const tokenValues = useMemo<Record<string, string>>(() => {
    if (!certificate) return {};
    return {
      participantName: certificate.recipient.name,
      eventTitle: certificate.event.title,
      issuedDate: formatDate(certificate.issuedAt),
      issuedAt: certificate.issuedAt,
      certificateId: certificate.certificateId,
      credentialId: certificate.credentialId,
      verificationUrl: certificate.verifiableCredentialUrl,
      certificateUrl: certificate.certificateUrl,
      qrVerificationUrl:
        certificate.qrVerificationUrl ?? certificate.verifiableCredentialUrl ?? certificate.certificateUrl,
      ...payloadTokens,
    };
  }, [certificate, payloadTokens]);

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

  const hasRenderableLayout = Boolean(layout && layout.elements.length > 0);
  const verificationHref =
    sanitizeClientFacingUrl(certificate.verifiableCredentialUrl) ??
    certificate.verifiableCredentialUrl;
  const pdfHref = sanitizeClientFacingUrl(certificate.pdfUrl);

  return (
    <div className="min-h-screen bg-muted/15 print:bg-white">
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-3 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">Completion Certificate</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{certificate.event.title}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
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
                      className="relative overflow-hidden border bg-white shadow-sm print:shadow-none"
                      style={{
                        width: layout.canvas.width,
                        height: layout.canvas.height,
                        transform: `scale(${canvasScale})`,
                        transformOrigin: "top left",
                        backgroundColor: layout.canvas.backgroundColor ?? "#ffffff",
                        backgroundImage: layout.canvas.backgroundAssetKey
                          ? `url(${resolveAssetUrl(layout.canvas.backgroundAssetKey)})`
                          : undefined,
                        backgroundPosition: "center",
                        backgroundSize: "cover",
                      }}
                    >
                      {layout.elements
                        .slice()
                        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                        .map((element) => {
                          const style = element.style ?? {};
                          const fontSize = getStyleNumber(style, "fontSize", 32);
                          const fontWeight = getStyleNumber(style, "fontWeight", 500);
                          const textAlign = getStyleString(style, "textAlign", "left");
                          const color = getStyleString(style, "color", "#0f172a");
                          const tokenKey =
                            element.type === "dynamic_text" || element.type === "qr"
                              ? (element.token ?? "").trim()
                              : "";
                          const tokenValue = tokenKey ? tokenValues[tokenKey] : "";

                          const frameStyle: CSSProperties = {
                            left: element.x,
                            top: element.y,
                            width: element.width,
                            height: element.height,
                            zIndex: element.zIndex ?? 0,
                          };

                          if (element.type === "image") {
                            const assetUrl = resolveAssetUrl(element.assetKey);
                            return (
                              <div key={element.id} className="absolute overflow-hidden" style={frameStyle}>
                                {assetUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={assetUrl}
                                    alt={buildElementLabel(element)}
                                    className="h-full w-full object-contain"
                                  />
                                ) : null}
                              </div>
                            );
                          }

                          if (element.type === "signature") {
                            const signatureSlot = layout.signatureSlots.find(
                              (slot) => slot.key === element.signatureSlotKey,
                            );
                            const signatureUrl = resolveAssetUrl(signatureSlot?.assetKey);
                            return (
                              <div key={element.id} className="absolute overflow-hidden" style={frameStyle}>
                                {signatureUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={signatureUrl}
                                    alt={buildElementLabel(element)}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-end justify-center p-1 text-center text-xs text-slate-500">
                                    {signatureSlot?.signerName ?? signatureSlot?.label ?? "Signature"}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          if (element.type === "qr") {
                            const qrValue =
                              tokenValue ||
                              tokenValues.qrVerificationUrl ||
                              tokenValues.verificationUrl ||
                              certificate.verifiableCredentialUrl;
                            return (
                              <div
                                key={element.id}
                                className="absolute flex items-center justify-center bg-white p-2"
                                style={frameStyle}
                              >
                                <QRCodeSVG value={qrValue} size={Math.max(96, element.width - 12)} />
                              </div>
                            );
                          }

                          const textValue =
                            element.type === "text"
                              ? element.content ?? ""
                              : tokenValue || `{{${tokenKey || "token"}}}`;

                          return (
                            <div
                              key={element.id}
                              className="absolute p-1"
                              style={{
                                ...frameStyle,
                                color,
                                fontSize,
                                fontWeight,
                                textAlign: textAlign as "left" | "center" | "right",
                                display: "flex",
                                alignItems: "center",
                                justifyContent:
                                  textAlign === "center"
                                    ? "center"
                                    : textAlign === "right"
                                      ? "flex-end"
                                      : "flex-start",
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {textValue}
                            </div>
                          );
                        })}
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
                <p className="font-medium">{formatDateTime(certificate.issuedAt)}</p>
              </div>
              {certificate.event.startAt ? (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Event date
                  </p>
                  <p className="font-medium">{formatDate(certificate.event.startAt)}</p>
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
                {certificate.verifiableCredentialUrl}
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
              {certificate.qrVerificationUrl ? (
                <span className="break-all text-xs sm:text-sm">{certificate.qrVerificationUrl}</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
