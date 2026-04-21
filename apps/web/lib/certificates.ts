import { apiClient } from "@/lib/api";

export type CertificateElementType =
  | "text"
  | "dynamic_text"
  | "image"
  | "signature"
  | "qr";

export interface CertificateTemplateElement {
  id: string;
  type: CertificateElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  content?: string;
  token?: string;
  assetKey?: string;
  signatureSlotKey?: string;
  style?: Record<string, unknown>;
}

export interface CertificateSignatureSlot {
  key: string;
  label: string;
  signerName?: string;
  signerTitle?: string;
  assetKey?: string;
}

export interface CertificateLayout {
  version: number;
  canvas: {
    width: number;
    height: number;
    unit: "px";
    backgroundColor?: string;
    backgroundAssetKey?: string;
  };
  elements: CertificateTemplateElement[];
  signatureSlots: CertificateSignatureSlot[];
  metadata?: Record<string, unknown>;
}

export interface CertificateTemplateSummary {
  id: string;
  eventId: string;
  name: string;
  typeKey: string;
  typeLabel: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
}

export interface CertificateTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  layout: CertificateLayout;
  createdBy: string;
  createdAt: string;
}

export interface IssuedCertificateSummary {
  id: string;
  eventId: string;
  applicationId: string;
  templateId: string | null;
  templateVersionId: string | null;
  templateName: string | null;
  templateVersionNumber: number | null;
  certificateTypeKey: string;
  certificateTypeLabel: string;
  certificateId: string;
  credentialId: string;
  status: "ISSUED" | "REVOKED";
  issuerName: string;
  issuedAt: string;
  revokedAt: string | null;
  certificateUrl: string;
  verifiableCredentialUrl: string;
  qrVerificationUrl: string;
  pdfUrl: string | null;
  pdfStorageKey: string | null;
  pdfGeneratedAt: string | null;
  renderStatus: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  renderError: string | null;
}

export interface CertificateRenderJobSummary {
  id: string;
  eventId: string;
  issuedCertificateId: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateAsset {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  kind: "background" | "signature" | "logo" | "image";
}

function unwrapData<T>(value: unknown): T {
  if (
    value &&
    typeof value === "object" &&
    "data" in (value as Record<string, unknown>)
  ) {
    return ((value as { data?: T }).data ?? null) as T;
  }
  return value as T;
}

export const DEFAULT_CERTIFICATE_LAYOUT: CertificateLayout = {
  version: 1,
  canvas: {
    width: 1600,
    height: 1131,
    unit: "px",
    backgroundColor: "#ffffff",
  },
  elements: [
    {
      id: "title",
      type: "text",
      x: 260,
      y: 120,
      width: 1080,
      height: 90,
      zIndex: 1,
      content: "Certificate of Participation",
      style: {
        fontSize: 58,
        fontWeight: 700,
        color: "#0f172a",
        textAlign: "center",
      },
    },
    {
      id: "subtitle",
      type: "text",
      x: 420,
      y: 260,
      width: 760,
      height: 44,
      zIndex: 1,
      content: "This certifies that",
      style: {
        fontSize: 30,
        color: "#334155",
        textAlign: "center",
      },
    },
    {
      id: "participant_name",
      type: "dynamic_text",
      x: 300,
      y: 330,
      width: 1000,
      height: 90,
      zIndex: 1,
      token: "participantName",
      style: {
        fontSize: 72,
        fontWeight: 700,
        color: "#0f172a",
        textAlign: "center",
      },
    },
    {
      id: "completion",
      type: "text",
      x: 330,
      y: 460,
      width: 940,
      height: 42,
      zIndex: 1,
      content: "has successfully participated in",
      style: {
        fontSize: 30,
        color: "#334155",
        textAlign: "center",
      },
    },
    {
      id: "event_title",
      type: "dynamic_text",
      x: 260,
      y: 520,
      width: 1080,
      height: 72,
      zIndex: 1,
      token: "eventTitle",
      style: {
        fontSize: 52,
        fontWeight: 600,
        color: "#0f172a",
        textAlign: "center",
      },
    },
    {
      id: "issued_date",
      type: "dynamic_text",
      x: 120,
      y: 980,
      width: 420,
      height: 36,
      zIndex: 1,
      token: "issuedDate",
      style: {
        fontSize: 24,
        color: "#334155",
      },
    },
    {
      id: "verification_qr",
      type: "qr",
      x: 1320,
      y: 840,
      width: 200,
      height: 200,
      zIndex: 1,
      token: "qrVerificationUrl",
    },
  ],
  signatureSlots: [
    {
      key: "organizer_primary",
      label: "Primary Organizer",
      signerName: "Organizer Name",
      signerTitle: "Organizer",
    },
  ],
  metadata: {},
};

export const CERTIFICATE_DYNAMIC_TOKENS = [
  "participantName",
  "participantEmail",
  "eventTitle",
  "certificateTypeLabel",
  "issuedDate",
  "issuedAt",
  "certificateId",
  "credentialId",
  "verificationUrl",
  "certificateUrl",
  "qrVerificationUrl",
] as const;

export async function listCertificateTemplates(
  eventId: string,
  options?: { includeArchived?: boolean; typeKey?: string },
): Promise<CertificateTemplateSummary[]> {
  const query = new URLSearchParams();
  if (options?.includeArchived) query.set("includeArchived", "true");
  if (options?.typeKey) query.set("typeKey", options.typeKey);
  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates${suffix}`,
  );
  return unwrapData<CertificateTemplateSummary[]>(response) ?? [];
}

export async function createCertificateTemplate(
  eventId: string,
  input: {
    name: string;
    typeKey: string;
    typeLabel: string;
    description?: string;
    isDefault?: boolean;
    metadata?: Record<string, unknown>;
    layout: CertificateLayout;
  },
  csrfToken?: string,
): Promise<CertificateTemplateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData<CertificateTemplateSummary>(response);
}

export async function updateCertificateTemplate(
  eventId: string,
  templateId: string,
  input: {
    name?: string;
    typeKey?: string;
    typeLabel?: string;
    description?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
    metadata?: Record<string, unknown>;
  },
  csrfToken?: string,
): Promise<CertificateTemplateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}`,
    {
      method: "PATCH",
      body: input,
      csrfToken,
    },
  );
  return unwrapData<CertificateTemplateSummary>(response);
}

export async function listCertificateTemplateVersions(
  eventId: string,
  templateId: string,
): Promise<CertificateTemplateVersion[]> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/versions`,
  );
  return unwrapData<CertificateTemplateVersion[]>(response) ?? [];
}

export async function createCertificateTemplateVersion(
  eventId: string,
  templateId: string,
  layout: CertificateLayout,
  csrfToken?: string,
): Promise<CertificateTemplateVersion> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/versions`,
    {
      method: "POST",
      body: { layout },
      csrfToken,
    },
  );
  return unwrapData<CertificateTemplateVersion>(response);
}

export async function activateCertificateTemplateVersion(
  eventId: string,
  templateId: string,
  versionId: string,
  csrfToken?: string,
): Promise<CertificateTemplateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/activate-version`,
    {
      method: "POST",
      body: { versionId },
      csrfToken,
    },
  );
  return unwrapData<CertificateTemplateSummary>(response);
}

export async function issueCertificatesBulk(
  eventId: string,
  input: {
    templateId: string;
    templateVersionId?: string;
    applicationIds: string[];
    issuerName?: string;
    payloadOverrides?: Record<string, unknown>;
  },
  csrfToken?: string,
): Promise<{
  requested: number;
  issued: number;
  alreadyIssued: number;
  notFound: string[];
  failed: Array<{ applicationId: string; reason: string }>;
  certificates: IssuedCertificateSummary[];
}> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/issue-bulk`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData(response);
}

export async function listIssuedCertificates(
  eventId: string,
  options?: {
    applicationId?: string;
    certificateTypeKey?: string;
    status?: "ISSUED" | "REVOKED";
    limit?: number;
  },
): Promise<IssuedCertificateSummary[]> {
  const query = new URLSearchParams();
  if (options?.applicationId) query.set("applicationId", options.applicationId);
  if (options?.certificateTypeKey) {
    query.set("certificateTypeKey", options.certificateTypeKey);
  }
  if (options?.status) query.set("status", options.status);
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/issued${suffix}`,
  );
  return unwrapData<IssuedCertificateSummary[]>(response) ?? [];
}

export async function revokeIssuedCertificate(
  eventId: string,
  issuedCertificateId: string,
  reason: string | undefined,
  csrfToken?: string,
): Promise<IssuedCertificateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/${issuedCertificateId}/revoke`,
    {
      method: "POST",
      body: reason ? { reason } : {},
      csrfToken,
    },
  );
  return unwrapData<IssuedCertificateSummary>(response);
}

export async function listCertificateRenderJobs(
  eventId: string,
  options?: { status?: "PENDING" | "PROCESSING" | "DONE" | "FAILED"; limit?: number },
): Promise<CertificateRenderJobSummary[]> {
  const query = new URLSearchParams();
  if (options?.status) query.set("status", options.status);
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/render-jobs${suffix}`,
  );
  return unwrapData<CertificateRenderJobSummary[]>(response) ?? [];
}

export async function retryCertificateRenderJob(
  eventId: string,
  jobId: string,
  csrfToken?: string,
): Promise<CertificateRenderJobSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/render-jobs/${jobId}/retry`,
    {
      method: "POST",
      csrfToken,
    },
  );
  return unwrapData<CertificateRenderJobSummary>(response);
}

export async function listCertificateAssets(
  eventId: string,
  kind: "all" | "background" | "signature" | "logo" | "image" = "all",
): Promise<CertificateAsset[]> {
  const response = await apiClient<unknown>(
    `/admin/events/${eventId}/certificates/assets?kind=${kind}`,
  );
  return unwrapData<CertificateAsset[]>(response) ?? [];
}

export async function uploadCertificateAsset(
  eventId: string,
  file: File,
  kind: "background" | "signature" | "logo" | "image",
  csrfToken?: string,
): Promise<CertificateAsset> {
  const upload = await apiClient<unknown>(
    `/admin/events/${eventId}/certificates/assets/uploads`,
    {
      method: "POST",
      body: {
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind,
      },
      csrfToken,
    },
  );
  const uploadData = unwrapData<{
    id: string;
    uploadUrl: string;
    storageKey: string;
  }>(upload);

  const putRes = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status}`);
  }

  await apiClient(`/admin/events/${eventId}/certificates/assets/uploads/${uploadData.id}/commit`, {
    method: "POST",
    csrfToken,
  });

  const assets = await listCertificateAssets(eventId, kind);
  const match = assets.find((asset) => asset.storageKey === uploadData.storageKey);
  if (match) return match;

  return {
    id: uploadData.id,
    storageKey: uploadData.storageKey,
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
    kind,
  };
}

export async function deleteCertificateAsset(
  eventId: string,
  assetId: string,
  csrfToken?: string,
): Promise<void> {
  await apiClient(`/admin/events/${eventId}/certificates/assets/${assetId}`, {
    method: "DELETE",
    csrfToken,
  });
}
