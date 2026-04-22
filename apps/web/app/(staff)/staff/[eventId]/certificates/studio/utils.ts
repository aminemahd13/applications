import type {
  CertificateLayout,
  CertificateTemplateElement,
  CertificateTextElement,
  CertificateDynamicTextElement,
  CertificateImageElement,
  CertificateQrElement,
  CertificateSignatureElement,
} from "@/lib/certificates";

export type AssetMode = "background" | "image" | "signature";

export type LeftRailView = "templates" | "assets" | "issuance";

export type PreviewData = Record<string, string>;

export const DEFAULT_PREVIEW_DATA: PreviewData = {
  participantName: "Participant Name",
  participantEmail: "participant@example.com",
  eventTitle: "Math&Maroc Event",
  certificateTypeLabel: "Participation",
  issuedDate: "2026-04-22",
  issuedAt: "2026-04-22T12:00:00.000Z",
  certificateId: "00000000-0000-0000-0000-000000000001",
  credentialId: "00000000-0000-0000-0000-000000000002",
  verificationUrl: "https://example.com/credentials/verify/credential-id",
  certificateUrl: "https://example.com/credentials/certificate/certificate-id",
  qrVerificationUrl: "https://example.com/credentials/qr/token",
};

export function slugifyTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function deepCloneLayout(layout: CertificateLayout): CertificateLayout {
  return JSON.parse(JSON.stringify(layout)) as CertificateLayout;
}

export function resolveAssetUrl(storageKey?: string | null): string {
  const raw = (storageKey ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return `/credentials/assets?key=${encodeURIComponent(raw)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB");
}

export function buildElementLabel(element: CertificateTemplateElement): string {
  if (element.type === "dynamic_text") {
    return `Dynamic (${element.token ?? "token"})`;
  }
  if (element.type === "text") {
    return `Text (${(element.content ?? "text").slice(0, 24)})`;
  }
  if (element.type === "image") {
    return `Image (${element.assetKey ? "bound" : "empty"})`;
  }
  if (element.type === "signature") {
    return `Signature (${element.signatureSlotKey ?? "slot"})`;
  }
  return "QR";
}

export function parseApplicationIdsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/g)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function makeElementId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  return `${safePrefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createElementDraft(
  type: CertificateTemplateElement["type"],
  layout: CertificateLayout,
): CertificateTemplateElement {
  const centerX = layout.canvas.width / 2;
  const centerY = layout.canvas.height / 2;
  const maxLayer = Math.max(0, ...layout.elements.map((element) => element.zIndex ?? 0));

  if (type === "text") {
    const element: CertificateTextElement = {
      id: makeElementId("text"),
      type: "text",
      x: centerX - 260,
      y: centerY - 24,
      width: 520,
      height: 64,
      zIndex: maxLayer + 1,
      content: "New text",
      style: {
        fontFamily: "Geist",
        fontSize: 36,
        fontWeight: 600,
        color: "#0f172a",
        textAlign: "center",
      },
    };
    return element;
  }

  if (type === "dynamic_text") {
    const element: CertificateDynamicTextElement = {
      id: makeElementId("token"),
      type: "dynamic_text",
      x: centerX - 260,
      y: centerY - 24,
      width: 520,
      height: 64,
      zIndex: maxLayer + 1,
      token: "participantName",
      style: {
        fontFamily: "Geist",
        fontSize: 34,
        fontWeight: 600,
        color: "#0f172a",
        textAlign: "center",
      },
    };
    return element;
  }

  if (type === "image") {
    const element: CertificateImageElement = {
      id: makeElementId("image"),
      type: "image",
      x: centerX - 180,
      y: centerY - 120,
      width: 360,
      height: 240,
      zIndex: maxLayer + 1,
      style: {
        fit: "contain",
        borderRadius: 0,
      },
    };
    return element;
  }

  if (type === "signature") {
    const defaultSlot = layout.signatureSlots[0]?.key ?? "organizer_primary";
    const element: CertificateSignatureElement = {
      id: makeElementId("signature"),
      type: "signature",
      x: centerX - 190,
      y: layout.canvas.height - 300,
      width: 380,
      height: 120,
      zIndex: maxLayer + 1,
      signatureSlotKey: defaultSlot,
      style: {
        fit: "contain",
        borderRadius: 0,
      },
    };
    return element;
  }

  const element: CertificateQrElement = {
    id: makeElementId("qr"),
    type: "qr",
    x: layout.canvas.width - 260,
    y: layout.canvas.height - 260,
    width: 180,
    height: 180,
    zIndex: maxLayer + 1,
    token: "qrVerificationUrl",
    style: {
      foregroundColor: "#0f172a",
      backgroundColor: "#ffffff",
      showLabel: true,
    },
  };
  return element;
}

export function isInputLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") {
    return true;
  }
  return target.isContentEditable;
}
