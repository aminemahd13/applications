import type { CertificateLayout, CertificateTemplateElement } from "@/lib/certificates";
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";

export interface CertificateDocumentData {
  certificateId: string;
  issuedCertificateId?: string;
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

function getNestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const nested = record[key];
  if (!nested || typeof nested !== "object") return undefined;
  return nested as Record<string, unknown>;
}

export function parseCertificateDocumentResponse(
  raw: Record<string, unknown>,
): CertificateDocumentData {
  const event = getNestedRecord(raw, "event");
  const recipient = getNestedRecord(raw, "recipient");

  return {
    certificateId: String(raw.certificateId ?? ""),
    issuedCertificateId:
      typeof raw.issuedCertificateId === "string" ? raw.issuedCertificateId : undefined,
    credentialId: String(raw.credentialId ?? ""),
    status: raw.status === "REVOKED" ? "REVOKED" : "ISSUED",
    issuedAt: String(raw.issuedAt ?? ""),
    checkedInAt: typeof raw.checkedInAt === "string" ? raw.checkedInAt : undefined,
    revokedAt: typeof raw.revokedAt === "string" ? raw.revokedAt : null,
    issuer:
      typeof raw.issuer === "string" ? raw.issuer : "Math&Maroc Event Platform",
    certificateUrl: String(raw.certificateUrl ?? ""),
    verifiableCredentialUrl: String(raw.verifiableCredentialUrl ?? ""),
    qrVerificationUrl:
      typeof raw.qrVerificationUrl === "string" ? raw.qrVerificationUrl : undefined,
    pdfUrl: typeof raw.pdfUrl === "string" ? raw.pdfUrl : null,
    renderStatus: typeof raw.renderStatus === "string" ? raw.renderStatus : null,
    event: {
      id: String(event?.id ?? ""),
      title: String(event?.title ?? "Event"),
      slug: String(event?.slug ?? ""),
      startAt: typeof event?.startAt === "string" ? event.startAt : undefined,
      endAt: typeof event?.endAt === "string" ? event.endAt : undefined,
      location: typeof event?.location === "string" ? event.location : undefined,
    },
    recipient: {
      name: typeof recipient?.name === "string" ? recipient.name : "Attendee",
    },
    payload: raw.payload,
    layout: raw.layout,
    template:
      typeof raw.template === "object" && raw.template
        ? (raw.template as CertificateDocumentData["template"])
        : undefined,
  };
}

export function resolveCertificateAssetUrl(storageKey?: string | null): string {
  const raw = String(storageKey ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return `/credentials/assets?key=${encodeURIComponent(raw)}`;
}

export function formatCertificateDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB");
}

export function formatCertificateDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB");
}

export function parseCertificatePayloadMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      output[key] = entry;
      continue;
    }
    if (typeof entry === "number" || typeof entry === "boolean" || typeof entry === "bigint") {
      output[key] = String(entry);
    }
  }
  return output;
}

function toClientAbsoluteUrl(rawValue: string | null | undefined): string {
  const normalized = sanitizeClientFacingUrl(rawValue) ?? String(rawValue ?? "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("/")) {
    if (typeof window === "undefined" || !window.location?.origin) {
      return normalized;
    }
    return `${window.location.origin}${normalized}`;
  }
  return normalized;
}

export function buildCertificateTokenValues(
  certificate: CertificateDocumentData,
  payloadTokens: Record<string, string>,
): Record<string, string> {
  const verificationUrl = toClientAbsoluteUrl(certificate.verifiableCredentialUrl);
  const certificateUrl = toClientAbsoluteUrl(certificate.certificateUrl);
  const qrVerificationUrl = toClientAbsoluteUrl(
    certificate.qrVerificationUrl ??
      certificate.verifiableCredentialUrl ??
      certificate.certificateUrl,
  );

  const tokens: Record<string, string> = {
    participantName: certificate.recipient.name,
    eventTitle: certificate.event.title,
    issuedDate: formatCertificateDate(certificate.issuedAt),
    issuedAt: certificate.issuedAt,
    certificateId: certificate.certificateId,
    credentialId: certificate.credentialId,
    ...payloadTokens,
  };

  tokens.verificationUrl = verificationUrl || tokens.verificationUrl || "";
  tokens.verifiableCredentialUrl =
    verificationUrl || tokens.verifiableCredentialUrl || tokens.verificationUrl;
  tokens.certificateUrl = certificateUrl || tokens.certificateUrl || "";
  tokens.qrVerificationUrl =
    qrVerificationUrl ||
    tokens.qrVerificationUrl ||
    tokens.verificationUrl ||
    tokens.verifiableCredentialUrl ||
    tokens.certificateUrl;

  if (!tokens.qrVerificationUrl) {
    tokens.qrVerificationUrl =
      tokens.verificationUrl || tokens.verifiableCredentialUrl || tokens.certificateUrl || "";
  }

  return tokens;
}

export function buildCertificateElementLabel(element: CertificateTemplateElement): string {
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

export function buildUploadedFontFamilyName(storageKey: string): string {
  let hash = 2166136261;
  for (let index = 0; index < storageKey.length; index += 1) {
    hash ^= storageKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `CertificateUploadedFont_${hex}`;
}

export function collectCertificateFontAssetKeys(layout: CertificateLayout): string[] {
  const keys = new Set<string>();
  for (const element of layout.elements) {
    if (element.type !== "text" && element.type !== "dynamic_text") {
      continue;
    }
    const fontAssetKey =
      typeof element.style?.fontAssetKey === "string" ? element.style.fontAssetKey.trim() : "";
    if (fontAssetKey) {
      keys.add(fontAssetKey);
    }
  }
  return Array.from(keys);
}

export function collectCertificateAssetUrls(layout: CertificateLayout): string[] {
  const urls = new Set<string>();
  if (layout.canvas.backgroundAssetKey) {
    const backgroundUrl = resolveCertificateAssetUrl(layout.canvas.backgroundAssetKey);
    if (backgroundUrl) {
      urls.add(backgroundUrl);
    }
  }

  for (const element of layout.elements) {
    if (element.type === "image" && element.assetKey) {
      const imageUrl = resolveCertificateAssetUrl(element.assetKey);
      if (imageUrl) {
        urls.add(imageUrl);
      }
      continue;
    }

    if (element.type !== "signature") {
      continue;
    }

    const signatureSlot = layout.signatureSlots.find((slot) => slot.key === element.signatureSlotKey);
    const signatureUrl = resolveCertificateAssetUrl(signatureSlot?.assetKey);
    if (signatureUrl) {
      urls.add(signatureUrl);
    }
  }

  return Array.from(urls);
}
