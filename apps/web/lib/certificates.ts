import { apiClient } from "@/lib/api";

export type CertificateElementType =
  | "text"
  | "dynamic_text"
  | "image"
  | "signature"
  | "qr";

export interface CertificateElementBase {
  id: string;
  type: CertificateElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}

export interface CertificateTextStyle {
  fontFamily?: string;
  fontAssetKey?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

export interface CertificateImageStyle {
  fit?: "contain" | "cover" | "fill";
  borderRadius?: number;
}

export interface CertificateQrStyle {
  foregroundColor?: string;
  backgroundColor?: string;
  showLabel?: boolean;
}

export interface CertificateTextElement extends CertificateElementBase {
  type: "text";
  content: string;
  style?: CertificateTextStyle;
}

export interface CertificateDynamicTextElement extends CertificateElementBase {
  type: "dynamic_text";
  token: string;
  style?: CertificateTextStyle;
}

export interface CertificateImageElement extends CertificateElementBase {
  type: "image";
  assetKey?: string;
  style?: CertificateImageStyle;
}

export interface CertificateSignatureElement extends CertificateElementBase {
  type: "signature";
  signatureSlotKey: string;
  style?: CertificateImageStyle;
}

export interface CertificateQrElement extends CertificateElementBase {
  type: "qr";
  token?: string;
  style?: CertificateQrStyle;
}

export type CertificateTemplateElement =
  | CertificateTextElement
  | CertificateDynamicTextElement
  | CertificateImageElement
  | CertificateSignatureElement
  | CertificateQrElement;

export interface CertificateSignatureSlot {
  key: string;
  label: string;
  signerName?: string;
  signerTitle?: string;
  assetKey?: string;
}

export interface CertificateLayout {
  layoutSchemaVersion: 2;
  canvas: {
    width: number;
    height: number;
    unit: "px";
    backgroundColor?: string;
    backgroundAssetKey?: string;
    gridSize?: number;
    snapEnabled?: boolean;
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
  draftRevision: number;
  draftUpdatedAt: string | null;
  layoutSchemaVersion: number;
}

export interface CertificateTemplateDraft {
  templateId: string;
  revision: number;
  layout: CertificateLayout;
  updatedAt: string | null;
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
  releasedAt: string | null;
  releasedBy: string | null;
  isReleased: boolean;
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

export interface IssuedCertificateDeleteAck {
  id: string;
  deleted: true;
}

export interface CertificateAsset {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  kind: "background" | "signature" | "logo" | "image" | "font";
}

export interface CertificateIssuanceCandidate {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  decisionStatus: string;
  attendanceStatus: string;
  checkedInAt: string | null;
}

export interface CertificatePdfExportJobSummary {
  id: string;
  eventId: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  issuedCertificateIdsCount: number;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  errorMessage: string | null;
  outputFilename: string | null;
  outputSizeBytes: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CertificatePdfExportJobDownloadUrlResponse {
  url: string;
  expiresAt: string;
  filename: string;
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
  layoutSchemaVersion: 2,
  canvas: {
    width: 1600,
    height: 1131,
    unit: "px",
    backgroundColor: "#ffffff",
    gridSize: 8,
    snapEnabled: true,
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
        fontFamily: "Geist",
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
      zIndex: 2,
      content: "This certifies that",
      style: {
        fontFamily: "Geist",
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
      zIndex: 3,
      token: "participantName",
      style: {
        fontFamily: "Geist",
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
      zIndex: 4,
      content: "has successfully participated in",
      style: {
        fontFamily: "Geist",
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
      zIndex: 5,
      token: "eventTitle",
      style: {
        fontFamily: "Geist",
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
      zIndex: 6,
      token: "issuedDate",
      style: {
        fontFamily: "Geist",
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
      zIndex: 7,
      token: "qrVerificationUrl",
      style: {
        foregroundColor: "#0f172a",
        backgroundColor: "#ffffff",
        showLabel: true,
      },
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

export async function deleteCertificateTemplate(
  eventId: string,
  templateId: string,
  csrfToken?: string,
): Promise<void> {
  await apiClient(`/events/${eventId}/certificates/templates/${templateId}`, {
    method: "DELETE",
    csrfToken,
  });
}

export async function getCertificateTemplateDraft(
  eventId: string,
  templateId: string,
): Promise<CertificateTemplateDraft> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/draft`,
  );
  return unwrapData<CertificateTemplateDraft>(response);
}

export async function updateCertificateTemplateDraft(
  eventId: string,
  templateId: string,
  input: { revision: number; layout: CertificateLayout },
  csrfToken?: string,
): Promise<CertificateTemplateDraft> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/draft`,
    {
      method: "PUT",
      body: input,
      csrfToken,
    },
  );
  return unwrapData<CertificateTemplateDraft>(response);
}

export async function publishCertificateTemplate(
  eventId: string,
  templateId: string,
  input: { activate?: boolean } = { activate: true },
  csrfToken?: string,
): Promise<{ template: CertificateTemplateSummary; version: CertificateTemplateVersion }> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/publish`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData<{
    template: CertificateTemplateSummary;
    version: CertificateTemplateVersion;
  }>(response);
}

export async function duplicateCertificateTemplate(
  eventId: string,
  templateId: string,
  input: { name?: string } = {},
  csrfToken?: string,
): Promise<CertificateTemplateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/templates/${templateId}/duplicate`,
    {
      method: "POST",
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

export async function deleteCertificateTemplateVersion(
  eventId: string,
  templateId: string,
  versionId: string,
  csrfToken?: string,
): Promise<void> {
  await apiClient(
    `/events/${eventId}/certificates/templates/${templateId}/versions/${versionId}`,
    {
      method: "DELETE",
      csrfToken,
    },
  );
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
    reissueIfExists?: boolean;
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

export async function issueCertificatesByTags(
  eventId: string,
  input: {
    templateId: string;
    templateVersionId?: string;
    tags: string[];
    issuerName?: string;
    reissueIfExists?: boolean;
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
    `/events/${eventId}/certificates/issue-by-tags`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData(response);
}

export async function searchCertificateIssuanceCandidates(
  eventId: string,
  input: { search: string; limit?: number },
): Promise<CertificateIssuanceCandidate[]> {
  const search = input.search.trim();
  if (!search) return [];

  const query = new URLSearchParams();
  query.set("search", search);
  if (input.limit) query.set("limit", String(input.limit));

  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/issuance-candidates${suffix}`,
  );
  return unwrapData<CertificateIssuanceCandidate[]>(response) ?? [];
}

export async function listCertificateIssuanceTags(
  eventId: string,
  options?: { search?: string; limit?: number },
): Promise<string[]> {
  const query = new URLSearchParams();
  if (options?.search) query.set("search", options.search.trim());
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/issuance-tags${suffix}`,
  );
  return unwrapData<string[]>(response) ?? [];
}

export async function listIssuedCertificates(
  eventId: string,
  options?: {
    applicationId?: string;
    certificateTypeKey?: string;
    status?: "ISSUED" | "REVOKED";
    search?: string;
    limit?: number;
  },
): Promise<IssuedCertificateSummary[]> {
  const query = new URLSearchParams();
  if (options?.applicationId) query.set("applicationId", options.applicationId);
  if (options?.certificateTypeKey) {
    query.set("certificateTypeKey", options.certificateTypeKey);
  }
  if (options?.status) query.set("status", options.status);
  if (options?.search?.trim()) query.set("search", options.search.trim());
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
): Promise<IssuedCertificateDeleteAck> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/${issuedCertificateId}/revoke`,
    {
      method: "POST",
      body: reason ? { reason } : {},
      csrfToken,
    },
  );
  return unwrapData<IssuedCertificateDeleteAck>(response);
}

export async function releaseIssuedCertificate(
  eventId: string,
  issuedCertificateId: string,
  csrfToken?: string,
): Promise<IssuedCertificateSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/${issuedCertificateId}/release`,
    {
      method: "POST",
      body: {},
      csrfToken,
    },
  );
  return unwrapData<IssuedCertificateSummary>(response);
}

export async function releaseCertificatesBulk(
  eventId: string,
  input: { applicationIds: string[] },
  csrfToken?: string,
): Promise<{
  requested: number;
  considered: number;
  released: number;
  alreadyReleased: number;
  skippedNotCheckedIn: number;
  skippedRevoked: number;
}> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/release-bulk`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData(response);
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

export async function createCertificatePdfExportJob(
  eventId: string,
  input: { issuedCertificateIds: string[] },
  csrfToken?: string,
): Promise<CertificatePdfExportJobSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/pdf-export-jobs`,
    {
      method: "POST",
      body: input,
      csrfToken,
    },
  );
  return unwrapData<CertificatePdfExportJobSummary>(response);
}

export async function getCertificatePdfExportJob(
  eventId: string,
  jobId: string,
): Promise<CertificatePdfExportJobSummary> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/pdf-export-jobs/${jobId}`,
  );
  return unwrapData<CertificatePdfExportJobSummary>(response);
}

export async function getCertificatePdfExportJobDownloadUrl(
  eventId: string,
  jobId: string,
): Promise<CertificatePdfExportJobDownloadUrlResponse> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/certificates/pdf-export-jobs/${jobId}/download-url`,
  );
  return unwrapData<CertificatePdfExportJobDownloadUrlResponse>(response);
}

export async function pollCertificatePdfExportJobUntilTerminal(params: {
  eventId: string;
  jobId: string;
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (job: CertificatePdfExportJobSummary) => void;
}): Promise<CertificatePdfExportJobSummary> {
  const intervalMs = Math.max(params.intervalMs ?? 2000, 0);
  const timeoutMs = Math.max(params.timeoutMs ?? 15 * 60 * 1000, 1);
  const startedAt = Date.now();

  while (true) {
    const job = await getCertificatePdfExportJob(params.eventId, params.jobId);
    params.onTick?.(job);
    const status = String(job.status ?? "").toUpperCase();
    if (status === "DONE" || status === "FAILED") {
      return job;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Certificate PDF export timed out");
    }
    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } else {
      await Promise.resolve();
    }
  }
}

function resolveUploadMimeType(
  file: File,
  kind: "background" | "signature" | "logo" | "image" | "font",
): string {
  const rawType = String(file.type ?? "").trim().toLowerCase();
  if (rawType && rawType !== "application/octet-stream") {
    return rawType;
  }

  const fileName = String(file.name ?? "").toLowerCase();
  if (kind === "font") {
    if (fileName.endsWith(".ttf")) return "font/ttf";
    if (fileName.endsWith(".otf")) return "font/otf";
    if (fileName.endsWith(".woff2")) return "font/woff2";
  }

  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".gif")) return "image/gif";
  if (fileName.endsWith(".svg")) return "image/svg+xml";

  return rawType || "application/octet-stream";
}

export async function listCertificateAssets(
  eventId: string,
  kind: "all" | "background" | "signature" | "logo" | "image" | "font" = "all",
): Promise<CertificateAsset[]> {
  const response = await apiClient<unknown>(
    `/admin/events/${eventId}/certificates/assets?kind=${kind}`,
  );
  return unwrapData<CertificateAsset[]>(response) ?? [];
}

export async function uploadCertificateAsset(
  eventId: string,
  file: File,
  kind: "background" | "signature" | "logo" | "image" | "font",
  csrfToken?: string,
): Promise<CertificateAsset> {
  const normalizedMimeType = resolveUploadMimeType(file, kind);

  const upload = await apiClient<unknown>(
    `/admin/events/${eventId}/certificates/assets/uploads`,
    {
      method: "POST",
      body: {
        originalFilename: file.name,
        mimeType: normalizedMimeType,
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
      "Content-Type": normalizedMimeType,
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
    mimeType: normalizedMimeType,
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
