import { apiClient } from "@/lib/api";
import { optimizeMicrositeImageForUpload } from "@/lib/microsite-image-optimizer";

export type MicrositeMediaItem = {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export async function listMicrositeMedia(
  eventId: string,
  kind: "all" | "image" | "video" = "all",
): Promise<MicrositeMediaItem[]> {
  return apiClient<MicrositeMediaItem[]>(
    `/admin/events/${eventId}/microsite/media?kind=${kind}`,
  );
}

export async function uploadMicrositeAsset(
  eventId: string,
  file: File,
  csrfToken?: string,
): Promise<string> {
  const uploadFile = await optimizeMicrositeImageForUpload(file);

  const upload = await apiClient<{
    id: string;
    uploadUrl: string;
    storageKey: string;
  }>(`/admin/events/${eventId}/microsite/media/uploads`, {
    method: "POST",
    body: {
      originalFilename: uploadFile.name,
      mimeType: uploadFile.type || "application/octet-stream",
      sizeBytes: uploadFile.size,
    },
    csrfToken,
  });

  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": uploadFile.type || "application/octet-stream",
    },
    body: uploadFile,
  });

  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status}`);
  }

  await apiClient(`/admin/events/${eventId}/microsite/media/uploads/${upload.id}/commit`, {
    method: "POST",
    csrfToken,
  });

  return upload.storageKey;
}

export async function deleteMicrositeAsset(
  eventId: string,
  assetId: string,
  csrfToken?: string,
): Promise<void> {
  await apiClient(`/admin/events/${eventId}/microsite/media/${assetId}`, {
    method: "DELETE",
    csrfToken,
  });
}
