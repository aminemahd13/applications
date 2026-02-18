"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Calendar, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

interface VerificationPayload {
  valid: boolean;
  status: "VALID" | "INVALID" | "REVOKED";
  issuer: string;
  issuedAt: string;
  revokedAt?: string | null;
  certificateUrl: string;
  verifiableCredentialUrl: string;
  credential: {
    id: string;
    certificateId: string;
    applicationId: string;
    event: {
      id: string;
      title: string;
      slug: string;
    };
    recipient: {
      name: string;
    };
    checkedInAt?: string;
  };
  verification: {
    algorithm: string;
    signature: string;
    signatureValid: boolean;
  };
}

export default function VerifyCredentialPage() {
  const params = useParams();
  const credentialId = params.credentialId as string;
  const [payload, setPayload] = useState<VerificationPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/credentials/verify/${credentialId}`
        );
        const raw: any =
          res && typeof res === "object" && "data" in res ? (res as any).data : res;
        if (raw) {
          setPayload({
            valid: Boolean(raw.valid),
            status: raw.status ?? "INVALID",
            issuer: raw.issuer ?? "Math&Maroc Event Platform",
            issuedAt: raw.issuedAt,
            revokedAt: raw.revokedAt ?? null,
            certificateUrl: raw.certificateUrl,
            verifiableCredentialUrl: raw.verifiableCredentialUrl,
            credential: {
              id: raw.credential?.id ?? "",
              certificateId: raw.credential?.certificateId ?? "",
              applicationId: raw.credential?.applicationId ?? "",
              event: {
                id: raw.credential?.event?.id ?? "",
                title: raw.credential?.event?.title ?? "Event",
                slug: raw.credential?.event?.slug ?? "",
              },
              recipient: {
                name: raw.credential?.recipient?.name ?? "Attendee",
              },
              checkedInAt: raw.credential?.checkedInAt,
            },
            verification: {
              algorithm: raw.verification?.algorithm ?? "HMAC-SHA256",
              signature: raw.verification?.signature ?? "",
              signatureValid: Boolean(raw.verification?.signatureValid),
            },
          });
        }
      } catch {
        setPayload(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [credentialId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="h-56 animate-pulse bg-muted/40" />
        </Card>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Credential not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The verification link may be invalid or unavailable.
        </p>
      </div>
    );
  }

  const isValid = payload.valid && payload.status === "VALID";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Card className={isValid ? "border-success/50" : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {isValid ? (
              <ShieldCheck className="h-5 w-5 text-success" />
            ) : payload.status === "REVOKED" ? (
              <ShieldAlert className="h-5 w-5 text-warning" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            Credential Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isValid ? "default" : payload.status === "REVOKED" ? "secondary" : "destructive"}>
              {payload.status}
            </Badge>
            <span className="text-xs text-muted-foreground">Issuer: {payload.issuer}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Recipient</p>
              <p className="font-medium">{payload.credential.recipient.name}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Event</p>
              <p className="font-medium">{payload.credential.event.title}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Issued at
              </p>
              <p className="font-medium">{new Date(payload.issuedAt).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Certificate ID</p>
              <p className="font-medium">{payload.credential.certificateId}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Cryptographic check</p>
            <p className="mt-1">
              {payload.verification.algorithm} signature{" "}
              {payload.verification.signatureValid ? "is valid" : "is not valid"}.
            </p>
            <p className="mt-1 break-all">Signature: {payload.verification.signature}</p>
          </div>

          <a
            href={payload.certificateUrl}
            className="inline-flex items-center gap-1 text-sm font-medium underline"
            target="_blank"
            rel="noreferrer"
          >
            <BadgeCheck className="h-4 w-4" />
            Open certificate
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
