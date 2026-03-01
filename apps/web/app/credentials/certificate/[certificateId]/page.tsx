"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Award, Calendar, MapPin, Printer, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

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
      "Verification available via the secure credential link below.",
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
  const [certificate, setCertificate] = useState<CertificatePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/credentials/certificate/${certificateId}`
        );
        const raw: any =
          res && typeof res === "object" && "data" in res ? (res as any).data : res;
        if (raw) {
          setCertificate({
            certificateId: raw.certificateId,
            credentialId: raw.credentialId,
            status: raw.status ?? "ISSUED",
            issuedAt: raw.issuedAt,
            checkedInAt: raw.checkedInAt,
            revokedAt: raw.revokedAt ?? null,
            issuer: raw.issuer ?? "Math&Maroc Event Platform",
            certificateUrl: raw.certificateUrl,
            verifiableCredentialUrl: raw.verifiableCredentialUrl,
            event: {
              id: raw.event?.id ?? "",
              title: raw.event?.title ?? "Event",
              slug: raw.event?.slug ?? "",
              startAt: raw.event?.startAt,
              endAt: raw.event?.endAt,
              location: raw.event?.location,
            },
            recipient: {
              name: raw.recipient?.name ?? "Attendee",
            },
            template: raw.template,
          });
        }
      } catch {
        setCertificate(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [certificateId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="h-96 animate-pulse bg-muted/40" />
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

  const templateText = {
    ...DEFAULT_CERTIFICATE_TEMPLATE.text,
    ...(certificate.template?.text ?? {}),
  };
  const templateStyle = {
    ...DEFAULT_CERTIFICATE_TEMPLATE.style,
    ...(certificate.template?.style ?? {}),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold">Completion Certificate</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
          <Button asChild>
            <a href={certificate.verifiableCredentialUrl} target="_blank" rel="noreferrer">
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Verify
            </a>
          </Button>
        </div>
      </div>

      <Card
        className="overflow-hidden border-2 print:shadow-none"
        style={{ borderColor: templateStyle.borderColor }}
      >
        <div
          className="p-10 text-center print:border-b"
          style={{
            background: `linear-gradient(140deg, ${templateStyle.primaryColor} 0%, ${templateStyle.secondaryColor} 100%)`,
            color: templateStyle.backgroundColor,
          }}
        >
          <p className="text-xs uppercase tracking-[0.35em]">{templateText.title}</p>
          <p className="mt-2 text-xs uppercase tracking-wide opacity-80">{templateText.subtitle}</p>
          <h2 className="mt-4 text-3xl font-semibold">{certificate.recipient.name}</h2>
          <p className="mt-2 text-sm opacity-90">{templateText.completionText}</p>
          <p className="mt-1 text-lg font-medium">{certificate.event.title}</p>
        </div>
        <CardContent
          className="space-y-6 p-8"
          style={{
            backgroundColor: templateStyle.backgroundColor,
            color: templateStyle.textColor,
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {certificate.status === "ISSUED" ? (
              <Badge>Issued</Badge>
            ) : (
              <Badge variant="destructive">Revoked</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              ID: {certificate.certificateId}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Issued by</p>
              <p className="font-medium">{certificate.issuer}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Issued on</p>
              <p className="font-medium">{new Date(certificate.issuedAt).toLocaleString("en-GB")}</p>
            </div>
            {certificate.event.startAt && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Event date
                </p>
                <p className="font-medium">
                  {new Date(certificate.event.startAt).toLocaleDateString("en-GB")}
                </p>
              </div>
            )}
            {certificate.event.location && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </p>
                <p className="font-medium">{certificate.event.location}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            Verification link:{" "}
            <a
              href={certificate.verifiableCredentialUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline"
            >
              {certificate.verifiableCredentialUrl}
            </a>
          </div>

          <p className="text-center text-xs text-muted-foreground">{templateText.footerText}</p>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Award className="h-4 w-4" />
            Credential ID {certificate.credentialId}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
