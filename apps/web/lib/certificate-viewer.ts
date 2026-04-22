import type {
  CertificateLayout,
  CertificateSignatureSlot,
  CertificateTemplateElement,
} from "@/lib/certificates";

const CERTIFICATE_ELEMENT_TYPES = new Set([
  "text",
  "dynamic_text",
  "image",
  "signature",
  "qr",
] as const);

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}

function normalizeElement(value: unknown): CertificateTemplateElement | null {
  const record = toRecord(value);
  if (!record) return null;

  const id =
    typeof record.id === "string" && record.id.trim().length > 0
      ? record.id.trim()
      : "";
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const x = toFiniteNumber(record.x);
  const y = toFiniteNumber(record.y);
  const width = toPositiveNumber(record.width);
  const height = toPositiveNumber(record.height);

  if (
    !id ||
    !CERTIFICATE_ELEMENT_TYPES.has(type as CertificateTemplateElement["type"]) ||
    x === null ||
    y === null ||
    width === null ||
    height === null
  ) {
    return null;
  }

  const element: CertificateTemplateElement = {
    id,
    type: type as CertificateTemplateElement["type"],
    x,
    y,
    width,
    height,
  };

  const zIndex = toFiniteNumber(record.zIndex);
  if (zIndex !== null) {
    element.zIndex = Math.max(0, Math.round(zIndex));
  }

  if (typeof record.content === "string") {
    element.content = record.content;
  }
  if (typeof record.token === "string") {
    element.token = record.token;
  }
  if (typeof record.assetKey === "string") {
    element.assetKey = record.assetKey;
  }
  if (typeof record.signatureSlotKey === "string") {
    element.signatureSlotKey = record.signatureSlotKey;
  }

  const style = toRecord(record.style);
  if (style) {
    element.style = style;
  }

  return element;
}

function normalizeSignatureSlot(value: unknown): CertificateSignatureSlot | null {
  const record = toRecord(value);
  if (!record) return null;

  const key =
    typeof record.key === "string" && record.key.trim().length > 0
      ? record.key.trim()
      : "";
  const label =
    typeof record.label === "string" && record.label.trim().length > 0
      ? record.label.trim()
      : "";
  if (!key || !label) return null;

  const slot: CertificateSignatureSlot = {
    key,
    label,
  };

  if (typeof record.signerName === "string") {
    slot.signerName = record.signerName;
  }
  if (typeof record.signerTitle === "string") {
    slot.signerTitle = record.signerTitle;
  }
  if (typeof record.assetKey === "string") {
    slot.assetKey = record.assetKey;
  }

  return slot;
}

export function parseCertificateLayout(value: unknown): CertificateLayout | null {
  const layoutRecord = toRecord(value);
  if (!layoutRecord) return null;

  const canvasRecord = toRecord(layoutRecord.canvas);
  if (!canvasRecord) return null;

  const canvasWidth = toPositiveNumber(canvasRecord.width);
  const canvasHeight = toPositiveNumber(canvasRecord.height);
  if (canvasWidth === null || canvasHeight === null) return null;

  const rawElements = Array.isArray(layoutRecord.elements) ? layoutRecord.elements : [];
  const elements = rawElements
    .map((element) => normalizeElement(element))
    .filter((element): element is CertificateTemplateElement => element !== null);
  if (elements.length !== rawElements.length) return null;

  const rawSlots = Array.isArray(layoutRecord.signatureSlots)
    ? layoutRecord.signatureSlots
    : [];
  const signatureSlots = rawSlots
    .map((slot) => normalizeSignatureSlot(slot))
    .filter((slot): slot is CertificateSignatureSlot => slot !== null);
  if (signatureSlots.length !== rawSlots.length) return null;

  const versionRaw = toFiniteNumber(layoutRecord.version);
  const backgroundColor =
    typeof canvasRecord.backgroundColor === "string" ? canvasRecord.backgroundColor : undefined;
  const backgroundAssetKey =
    typeof canvasRecord.backgroundAssetKey === "string"
      ? canvasRecord.backgroundAssetKey
      : undefined;

  return {
    version:
      versionRaw === null || versionRaw <= 0 ? 1 : Math.max(1, Math.round(versionRaw)),
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      unit: "px",
      backgroundColor,
      backgroundAssetKey,
    },
    elements,
    signatureSlots,
    metadata: toRecord(layoutRecord.metadata) ?? {},
  };
}

export function parseCertificatePayloadMap(value: unknown): Record<string, string> {
  const record = toRecord(value);
  if (!record) return {};

  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
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

export function computeCanvasScale(input: {
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  maxScale?: number;
}): number {
  const containerWidth = toPositiveNumber(input.containerWidth);
  const canvasWidth = toPositiveNumber(input.canvasWidth);
  const canvasHeight = toPositiveNumber(input.canvasHeight);
  if (containerWidth === null || canvasWidth === null || canvasHeight === null) {
    return 1;
  }

  const maxScale = toPositiveNumber(input.maxScale ?? 1) ?? 1;
  const widthFit = containerWidth / canvasWidth;
  const safeContainerHeight =
    toPositiveNumber(input.containerHeight) ?? Number.POSITIVE_INFINITY;
  const heightFit = safeContainerHeight / canvasHeight;
  const nextScale = Math.min(maxScale, widthFit, heightFit);

  if (!Number.isFinite(nextScale) || nextScale <= 0) return 1;
  return Math.max(nextScale, 0.05);
}

