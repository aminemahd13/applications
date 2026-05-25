import { z } from 'zod';

export const MicrositePolicy = {
  KEEP_PUBLIC: 'KEEP_PUBLIC',
  UNPUBLISH: 'UNPUBLISH',
  DELETE: 'DELETE',
} as const;
export type MicrositePolicy = (typeof MicrositePolicy)[keyof typeof MicrositePolicy];

export const PurgePolicy = {
  NONE: 'NONE',
  PURGE_FILES_AND_ANSWERS: 'PURGE_FILES_AND_ANSWERS',
} as const;
export type PurgePolicy = (typeof PurgePolicy)[keyof typeof PurgePolicy];

export const ArchivalJobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ArchivalJobStatus = (typeof ArchivalJobStatus)[keyof typeof ArchivalJobStatus];

export const CloseEventBodySchema = z.object({
  archive: z.boolean().default(true),
  micrositePolicy: z.enum([
    MicrositePolicy.KEEP_PUBLIC,
    MicrositePolicy.UNPUBLISH,
    MicrositePolicy.DELETE,
  ]),
  purgePolicy: z.enum([
    PurgePolicy.NONE,
    PurgePolicy.PURGE_FILES_AND_ANSWERS,
  ]),
  confirmSlug: z.string().min(1),
});
export type CloseEventBody = z.infer<typeof CloseEventBodySchema>;

export interface ArchivalJobResponse {
  id: string;
  eventId: string;
  status: ArchivalJobStatus;
  micrositePolicy: MicrositePolicy;
  purgePolicy: PurgePolicy;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  filesTotal: number;
  filesDeleted: number;
  submissionsTotal: number;
  submissionsPurged: number;
  errorMessage: string | null;
}

export interface CloseEventResponse {
  event: { id: string; status: string };
  microsite: { policyApplied: MicrositePolicy; publishedVersion: number | null };
  job: ArchivalJobResponse | null;
}

export interface UserApplicationHistoryItem {
  applicationId: string;
  event: {
    id: string;
    title: string;
    slug: string;
    endAt: string | null;
    status: string;
  };
  submittedAt: string | null;
  decisionStatus: 'NONE' | 'ACCEPTED' | 'WAITLISTED' | 'REJECTED' | string;
  decisionPublishedAt: string | null;
  certificate: {
    credentialId: string;
    status: string;
    releasedAt: string | null;
  } | null;
  dataPurged: boolean;
}

export interface UserApplicationHistoryResponse {
  data: UserApplicationHistoryItem[];
}
