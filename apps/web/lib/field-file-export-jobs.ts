import { apiClient } from "@/lib/api";
import type {
  CreateFieldFileExportJobRequestDto,
  FieldFileExportJobDownloadUrlResponse,
  FieldFileExportJobResponse,
} from "@event-platform/shared";

function unwrapData<T>(payload: unknown): T {
  const response = (payload ?? {}) as { data?: T };
  return (response.data ?? payload) as T;
}

export async function createFieldFileExportJob(
  eventId: string,
  input: CreateFieldFileExportJobRequestDto,
  csrfToken?: string,
): Promise<FieldFileExportJobResponse> {
  const response = await apiClient<unknown>(`/events/${eventId}/files/export-jobs`, {
    method: "POST",
    body: input,
    csrfToken,
  });
  return unwrapData<FieldFileExportJobResponse>(response);
}

export async function getFieldFileExportJob(
  eventId: string,
  jobId: string,
): Promise<FieldFileExportJobResponse> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/files/export-jobs/${jobId}`,
  );
  return unwrapData<FieldFileExportJobResponse>(response);
}

export async function getFieldFileExportJobDownloadUrl(
  eventId: string,
  jobId: string,
): Promise<FieldFileExportJobDownloadUrlResponse> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/files/export-jobs/${jobId}/download-url`,
  );
  return unwrapData<FieldFileExportJobDownloadUrlResponse>(response);
}

export async function pollFieldFileExportJobUntilTerminal(params: {
  eventId: string;
  jobId: string;
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (job: FieldFileExportJobResponse) => void;
  fetchStatus?: (
    eventId: string,
    jobId: string,
  ) => Promise<FieldFileExportJobResponse>;
}): Promise<FieldFileExportJobResponse> {
  const fetchStatus = params.fetchStatus ?? getFieldFileExportJob;
  const intervalMs = Math.max(params.intervalMs ?? 2000, 0);
  const timeoutMs = Math.max(params.timeoutMs ?? 15 * 60 * 1000, 1);
  const startedAt = Date.now();

  while (true) {
    const job = await fetchStatus(params.eventId, params.jobId);
    params.onTick?.(job);

    const status = String(job.status ?? "").toUpperCase();
    if (status === "DONE" || status === "FAILED") {
      return job;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Field file export timed out");
    }

    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } else {
      await Promise.resolve();
    }
  }
}
